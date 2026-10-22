// File d'attente d'écritures (« outbox ») : une modification est d'abord gardée sur l'appareil, puis envoyée dans l'ordre
// dès que le réseau le permet. Le noyau ne connaît ni Supabase ni React : il reçoit une fonction `execute`, un stockage
// et un critère « cette erreur est-elle passagère ? », ce qui le rend testable seul.

export type OutboxEntry<P> = {
  id: string
  /** Deux entrées de même clé pas encore envoyées se fondent en une (le dernier texte d'une note, par exemple). */
  key?: string
  payload: P
  attempts: number
  /** Refus définitif du serveur : l'entrée bloque la file jusqu'à `retryFailed()` ou `discardFailed()`. */
  failed?: string
}

export interface OutboxStorage<P> {
  load(): Promise<OutboxEntry<P>[]>
  save(entries: OutboxEntry<P>[]): Promise<void>
}

export type OutboxStatus = 'idle' | 'syncing' | 'offline' | 'failed'

export type OutboxSnapshot = {
  status: OutboxStatus
  /** Modifications pas encore envoyées (celles qui sont bloquées comprises). */
  pending: number
  /** Modifications refusées par le serveur : elles attendent une décision. */
  failed: number
  /** Clés des entrées en attente (sert à dire « cette note n'est pas encore partie »). */
  keys: ReadonlySet<string>
  /** Dernière fois que la file s'est vidée après un envoi (horodatage), `null` tant que rien n'a été envoyé. */
  lastSyncedAt: number | null
  lastError: string | null
}

type Options<P> = {
  storage: OutboxStorage<P>
  /** Envoie une modification ; lève une erreur si elle échoue. */
  execute: (payload: P) => Promise<void>
  /** Erreur passagère (réseau coupé, serveur indisponible, jeton à renouveler) : on réessaiera plus tard. */
  isRetryable: (error: unknown) => boolean
  /** Délais entre deux tentatives (le dernier se répète). */
  backoffMs?: readonly number[]
  newId?: () => string
}

const DEFAULT_BACKOFF = [2_000, 5_000, 10_000, 20_000, 30_000] as const

export class Outbox<P> {
  private entries: OutboxEntry<P>[] = []
  private inFlight: string | undefined
  private flushing: Promise<void> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private saving: Promise<void> = Promise.resolve()
  private listeners = new Set<() => void>()
  private status: OutboxStatus = 'idle'
  private lastSyncedAt: number | null = null
  private lastError: string | null = null
  private snapshot: OutboxSnapshot
  private seq = 0
  private loaded = false // tant que la file enregistrée n'est pas relue, on n'écrase pas le stockage

  constructor(private readonly o: Options<P>) {
    this.snapshot = this.build()
  }

  /** Reprend ce qui était resté en attente (fermeture de l'appli, rechargement) puis tente un envoi. */
  async start(): Promise<void> {
    let loaded: OutboxEntry<P>[] = []
    try {
      loaded = await this.o.storage.load()
    } catch {
      // Stockage indisponible (navigation privée…) : la file vit alors seulement en mémoire.
    }
    // Ce qui a été ajouté pendant le chargement passe après ce qui était déjà en attente.
    this.entries = [...loaded, ...this.entries]
    this.loaded = true
    this.persist()
    this.emit()
    if (this.entries.length > 0) void this.flush()
  }

  /**
   * Ajoute une modification. Avec `key`, une entrée déjà en attente (et pas en cours d'envoi) de même clé est remplacée
   * sur place : `merge` décide comment fondre l'ancienne et la nouvelle (par défaut, la nouvelle l'emporte).
   */
  enqueue(payload: P, opts: { key?: string; merge?: (prev: P, next: P) => P } = {}): void {
    const { key, merge } = opts
    const existing =
      key === undefined
        ? undefined
        : this.entries.find((e) => e.key === key && e.id !== this.inFlight && !e.failed)
    if (existing) {
      existing.payload = merge ? merge(existing.payload, payload) : payload
    } else {
      this.entries.push({ id: this.nextId(), key, payload, attempts: 0 })
    }
    this.persist()
    this.emit()
    // Déjà hors ligne : inutile de retenter à chaque ajout (la relance planifiée, le retour du réseau ou `flush()` s'en
    // chargent), et une entrée qui n'est pas en cours d'envoi peut encore être retirée.
    if (this.status !== 'offline') void this.flush()
  }

  /** Retire les entrées en attente qui répondent au critère ; celle qui part en ce moment ne peut plus être retirée. */
  removeWhere(match: (e: OutboxEntry<P>) => boolean): number {
    const before = this.entries.length
    this.entries = this.entries.filter((e) => e.id === this.inFlight || !match(e))
    const removed = before - this.entries.length
    if (removed > 0) {
      this.persist()
      this.emit()
    }
    return removed
  }

  /** Les modifications pas encore envoyées, dans l'ordre (pour les rejouer à l'écran sur des données relues). */
  pendingPayloads(): P[] {
    return this.entries.map((e) => e.payload)
  }

  /** Une entrée en attente (pas en cours d'envoi) répond-elle au critère ? */
  hasUnsent(match: (e: OutboxEntry<P>) => boolean): boolean {
    return this.entries.some((e) => e.id !== this.inFlight && match(e))
  }

  /** Tente d'envoyer maintenant (retour du réseau, retour sur l'appli…). Sans effet si la file est vide ou bloquée. */
  flush(): Promise<void> {
    if (!this.loaded) return Promise.resolve() // `start()` s'en charge une fois la file enregistrée relue
    if (this.flushing) return this.flushing
    clearTimer(this.timer)
    this.timer = undefined
    this.flushing = this.run().finally(() => {
      this.flushing = undefined
    })
    return this.flushing
  }

  /** Redonne sa chance à l'entrée refusée (par exemple après avoir corrigé la cause). */
  retryFailed(): void {
    for (const e of this.entries) if (e.failed) delete e.failed
    this.persist()
    this.emit()
    void this.flush()
  }

  /** Abandonne les entrées refusées : elles ne seront jamais envoyées. */
  discardFailed(): void {
    this.entries = this.entries.filter((e) => !e.failed)
    this.persist()
    this.emit()
    void this.flush()
  }

  /** Arrête les relances (démontage). Les entrées restent sur l'appareil. */
  stop(): void {
    clearTimer(this.timer)
    this.timer = undefined
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): OutboxSnapshot => this.snapshot

  private async run(): Promise<void> {
    let sent = 0
    for (;;) {
      const entry = this.entries[0]
      if (!entry) {
        this.status = 'idle'
        if (sent > 0) this.lastSyncedAt = Date.now()
        this.emit()
        return
      }
      if (entry.failed) {
        this.status = 'failed'
        this.emit()
        return
      }
      this.inFlight = entry.id
      this.status = 'syncing'
      this.emit()
      try {
        await this.o.execute(entry.payload)
        this.entries = this.entries.filter((e) => e.id !== entry.id)
        this.inFlight = undefined
        this.lastError = null
        sent++
        this.persist()
      } catch (e) {
        this.inFlight = undefined
        this.lastError = e instanceof Error ? e.message : String(e)
        if (this.o.isRetryable(e)) {
          entry.attempts++
          this.status = 'offline'
          this.persist()
          this.emit()
          this.scheduleRetry(entry.attempts)
        } else {
          entry.failed = this.lastError
          this.status = 'failed'
          this.persist()
          this.emit()
        }
        return
      }
    }
  }

  private scheduleRetry(attempts: number): void {
    const delays = this.o.backoffMs ?? DEFAULT_BACKOFF
    const delay = delays[Math.min(attempts - 1, delays.length - 1)] ?? 30_000
    clearTimer(this.timer)
    this.timer = setTimeout(() => void this.flush(), delay)
  }

  private persist(): void {
    if (!this.loaded) return
    const copy = this.entries.map((e) => ({ ...e }))
    this.saving = this.saving
      .then(() => this.o.storage.save(copy))
      .catch(() => {
        // Stockage indisponible : on continue en mémoire.
      })
  }

  private nextId(): string {
    return this.o.newId ? this.o.newId() : `${Date.now().toString(36)}-${(this.seq++).toString(36)}`
  }

  private build(): OutboxSnapshot {
    const failed = this.entries.filter((e) => e.failed).length
    return {
      status: this.status,
      pending: this.entries.length,
      failed,
      keys: new Set(this.entries.flatMap((e) => (e.key ? [e.key] : []))),
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    }
  }

  private emit(): void {
    this.snapshot = this.build()
    for (const l of this.listeners) l()
  }
}

function clearTimer(t: ReturnType<typeof setTimeout> | undefined): void {
  if (t !== undefined) clearTimeout(t)
}
