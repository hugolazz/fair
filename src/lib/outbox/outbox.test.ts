import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Outbox, type OutboxStorage } from './outbox'
import { MemoryStorage } from './storage'

type Op = { name: string; value?: number }

const NETWORK = new Error('Failed to fetch')
const REFUSED = new Error('not allowed')

function setup(
  options: {
    execute?: (op: Op) => Promise<void>
    storage?: OutboxStorage<Op>
  } = {},
) {
  const sent: Op[] = []
  const storage = options.storage ?? new MemoryStorage<Op>()
  const execute = vi.fn(
    options.execute ??
      (async (op: Op) => {
        sent.push(op)
      }),
  )
  const outbox = new Outbox<Op>({
    storage,
    execute,
    isRetryable: (e) => e === NETWORK,
    backoffMs: [1000, 2000],
  })
  return { outbox, sent, storage, execute }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const settle = () => vi.advanceTimersByTimeAsync(0)

describe('Outbox', () => {
  it('envoie dans l’ordre d’ajout et se vide', async () => {
    const { outbox, sent } = setup()
    await outbox.start()
    outbox.enqueue({ name: 'a' })
    outbox.enqueue({ name: 'b' })
    outbox.enqueue({ name: 'c' })
    await settle()
    expect(sent.map((o) => o.name)).toEqual(['a', 'b', 'c'])
    expect(outbox.getSnapshot()).toMatchObject({ status: 'idle', pending: 0, failed: 0 })
    expect(outbox.getSnapshot().lastSyncedAt).not.toBeNull()
  })

  it('fond deux entrées de même clé qui n’ont pas encore été envoyées, à la place de la première', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const sent: Op[] = []
    const { outbox } = setup({
      execute: async (op) => {
        if (op.name === 'first') await gate // bloque la file : les suivantes restent en attente
        sent.push(op)
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'first' })
    outbox.enqueue({ name: 'note', value: 1 }, { key: 'note:1' })
    outbox.enqueue({ name: 'other' })
    outbox.enqueue({ name: 'note', value: 2 }, { key: 'note:1' }) // remplace la précédente, au même rang
    outbox.enqueue({ name: 'note', value: 3 }, { key: 'note:1' })
    release()
    await settle()
    expect(sent).toEqual([{ name: 'first' }, { name: 'note', value: 3 }, { name: 'other' }])
  })

  it('une entrée en cours d’envoi n’est pas remplacée : la nouvelle passe après', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const sent: Op[] = []
    const { outbox } = setup({
      execute: async (op) => {
        if (op.value === 1) await gate
        sent.push(op)
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'note', value: 1 }, { key: 'note:1' })
    await settle() // l'entrée est partie, pas encore terminée
    outbox.enqueue({ name: 'note', value: 2 }, { key: 'note:1' })
    release()
    await settle()
    expect(sent.map((o) => o.value)).toEqual([1, 2])
  })

  it('merge décide comment fondre l’ancienne et la nouvelle entrée', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const sent: Op[] = []
    const { outbox } = setup({
      execute: async (op) => {
        if (op.name === 'first') await gate
        sent.push(op)
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'first' })
    const merge = (prev: Op, next: Op): Op => ({
      name: 'sum',
      value: (prev.value ?? 0) + (next.value ?? 0),
    })
    outbox.enqueue({ name: 'n', value: 1 }, { key: 'k', merge })
    outbox.enqueue({ name: 'n', value: 2 }, { key: 'k', merge })
    release()
    await settle()
    expect(sent[1]).toEqual({ name: 'sum', value: 3 })
  })

  it('réseau coupé : l’entrée reste, la file passe « hors ligne », puis reprend toute seule', async () => {
    let online = false
    const sent: Op[] = []
    const { outbox } = setup({
      execute: async (op) => {
        if (!online) throw NETWORK
        sent.push(op)
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'a' })
    outbox.enqueue({ name: 'b' })
    await settle()
    expect(outbox.getSnapshot()).toMatchObject({ status: 'offline', pending: 2 })
    expect(sent).toEqual([])

    online = true
    await vi.advanceTimersByTimeAsync(1000) // première relance
    expect(sent.map((o) => o.name)).toEqual(['a', 'b'])
    expect(outbox.getSnapshot()).toMatchObject({ status: 'idle', pending: 0 })
  })

  it('flush() réessaie tout de suite (retour du réseau) sans attendre la relance', async () => {
    let online = false
    const sent: Op[] = []
    const { outbox } = setup({
      execute: async (op) => {
        if (!online) throw NETWORK
        sent.push(op)
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'a' })
    await settle()
    online = true
    await outbox.flush()
    expect(sent).toEqual([{ name: 'a' }])
  })

  it('un refus définitif bloque la file : ce qui suit n’est pas envoyé, jusqu’à une décision', async () => {
    const sent: Op[] = []
    const { outbox } = setup({
      execute: async (op) => {
        if (op.name === 'bad') throw REFUSED
        sent.push(op)
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'ok1' })
    outbox.enqueue({ name: 'bad' })
    outbox.enqueue({ name: 'after' })
    await settle()
    expect(sent.map((o) => o.name)).toEqual(['ok1'])
    expect(outbox.getSnapshot()).toMatchObject({ status: 'failed', pending: 2, failed: 1 })
    expect(outbox.getSnapshot().lastError).toBe('not allowed')

    // Abandonner l'entrée refusée libère la suite.
    outbox.discardFailed()
    await settle()
    expect(sent.map((o) => o.name)).toEqual(['ok1', 'after'])
    expect(outbox.getSnapshot()).toMatchObject({ status: 'idle', pending: 0, failed: 0 })
  })

  it('retryFailed redonne sa chance à l’entrée refusée', async () => {
    let refuse = true
    const sent: Op[] = []
    const { outbox } = setup({
      execute: async (op) => {
        if (refuse) throw REFUSED
        sent.push(op)
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'a' })
    await settle()
    expect(outbox.getSnapshot().status).toBe('failed')
    refuse = false
    outbox.retryFailed()
    await settle()
    expect(sent).toEqual([{ name: 'a' }])
  })

  it('survit à la fermeture : une nouvelle file relit le stockage et envoie', async () => {
    const storage = new MemoryStorage<Op>()
    const first = setup({
      storage,
      execute: async () => {
        throw NETWORK
      },
    })
    await first.outbox.start()
    first.outbox.enqueue({ name: 'a' })
    first.outbox.enqueue({ name: 'b' }, { key: 'k' })
    await settle()
    first.outbox.stop()

    // Rechargement de la page : nouvelle instance, même stockage, réseau revenu.
    const second = setup({ storage })
    await second.outbox.start()
    await settle()
    expect(second.sent.map((o) => o.name)).toEqual(['a', 'b'])
    expect(second.outbox.getSnapshot().pending).toBe(0)
    expect((await storage.load()).length).toBe(0)
  })

  it('ce qui est ajouté avant la fin du chargement n’écrase pas la file enregistrée', async () => {
    const storage = new MemoryStorage<Op>()
    await storage.save([{ id: 'old', payload: { name: 'old' }, attempts: 0 }])
    const { outbox, sent } = setup({ storage })
    outbox.enqueue({ name: 'new' }) // avant start()
    await outbox.start()
    await settle()
    expect(sent.map((o) => o.name)).toEqual(['old', 'new'])
  })

  it('removeWhere retire les entrées en attente, jamais celle qui part', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const sent: Op[] = []
    const { outbox } = setup({
      execute: async (op) => {
        if (op.name === 'first') await gate
        sent.push(op)
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'first' })
    outbox.enqueue({ name: 'x1' })
    outbox.enqueue({ name: 'x2' })
    await settle()
    expect(outbox.hasUnsent((e) => e.payload.name === 'first')).toBe(false) // en cours d'envoi
    expect(
      outbox.removeWhere((e) => e.payload.name.startsWith('x') || e.payload.name === 'first'),
    ).toBe(2)
    release()
    await settle()
    expect(sent.map((o) => o.name)).toEqual(['first'])
  })

  it('expose les clés des entrées en attente', async () => {
    const { outbox } = setup({
      execute: async () => {
        throw NETWORK
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'a' }, { key: 'note:1' })
    await settle()
    expect(outbox.getSnapshot().keys.has('note:1')).toBe(true)
    expect(outbox.getSnapshot().keys.has('note:2')).toBe(false)
  })

  it('notifie les abonnés à chaque changement d’état', async () => {
    const { outbox } = setup()
    const listener = vi.fn()
    outbox.subscribe(listener)
    await outbox.start()
    outbox.enqueue({ name: 'a' })
    await settle()
    expect(listener).toHaveBeenCalled()
  })

  it('déjà hors ligne : un nouvel ajout ne relance pas un envoi (la relance planifiée s’en charge)', async () => {
    const { outbox, execute } = setup({
      execute: async () => {
        throw NETWORK
      },
    })
    await outbox.start()
    outbox.enqueue({ name: 'a' })
    await settle()
    expect(execute).toHaveBeenCalledTimes(1)
    outbox.enqueue({ name: 'b' })
    outbox.enqueue({ name: 'c' })
    await settle()
    expect(execute).toHaveBeenCalledTimes(1) // pas d'essai de plus à chaque ajout
    expect(outbox.getSnapshot()).toMatchObject({ status: 'offline', pending: 3 })

    // Et une entrée en attente (pas en cours d'envoi) peut encore être retirée.
    expect(outbox.removeWhere((e) => e.payload.name !== 'a')).toBe(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(execute).toHaveBeenCalledTimes(2) // la relance planifiée repart
  })
})
