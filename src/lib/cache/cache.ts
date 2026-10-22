import { isRetryableError } from '@/lib/network-error'
import { createCacheStore, type CacheEntry, type CacheStore } from './store'

// Lectures avec copie locale. Les lectures vont d'abord au réseau (données à jour) ; si le réseau est coupé, ou trop lent
// pour être utile, on se rabat sur la dernière copie enregistrée et on le signale (`staleStatus`, affiché dans la bannière).

let store: CacheStore | null = null

/** Choisit la copie locale de cet utilisateur (une base par utilisateur) ; `null` = aucune (déconnecté). */
export function configureCache(scope: string | null, override?: CacheStore): void {
  store = scope === null ? null : (override ?? createCacheStore(`fair-cache:${scope}`))
  setStale(null)
}

/** Efface la copie locale (déconnexion : rien ne reste sur l'appareil). */
export async function clearCache(): Promise<void> {
  try {
    await store?.clear()
  } catch {
    // Stockage indisponible : rien à effacer.
  }
  setStale(null)
}

export async function readCached<T>(key: string): Promise<CacheEntry<T> | undefined> {
  try {
    return await store?.get<T>(key)
  } catch {
    return undefined
  }
}

export async function writeManyCached(
  entries: readonly { key: string; value: unknown }[],
): Promise<void> {
  try {
    await store?.setMany(entries)
  } catch {
    // Copie locale indisponible (navigation privée, quota…) : l'appli marche sans.
  }
}

export const writeCached = (key: string, value: unknown) => writeManyCached([{ key, value }])

/** Modifie une entrée déjà enregistrée (ou la crée) : sert à répercuter une écriture locale dans la copie. */
export async function patchCached<T>(
  key: string,
  change: (prev: T | undefined) => T,
): Promise<void> {
  const prev = await readCached<T>(key)
  await writeCached(key, change(prev?.value))
}

// --- Données anciennes : une lecture vient d'être servie par la copie locale -----------------------------------------

let staleSince: number | null = null
const listeners = new Set<() => void>()

function setStale(next: number | null): void {
  if (staleSince === next) return
  staleSince = next
  for (const l of listeners) l()
}

/** Date de la copie locale servie à la place du réseau, `null` quand les données sont à jour. */
export const staleStatus = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: (): number | null => staleSince,
}

export const markStale = (savedAt: number): void =>
  setStale(Math.min(savedAt, staleSince ?? savedAt))
export const markFresh = (): void => setStale(null)

class SlowNetwork extends Error {
  constructor() {
    super('network timeout')
  }
}

type ReadOptions = {
  /** Au-delà, on sert la copie locale si on en a une (la requête continue et met la copie à jour à son arrivée). */
  timeoutMs?: number
}

/**
 * Lit `fetcher()` ; la valeur reçue est enregistrée. Réseau coupé ou trop lent et une copie existe : on la sert. Sans
 * copie, on attend le réseau. Une erreur qui n'est pas passagère (accès refusé…) n'est jamais masquée par la copie.
 */
export async function cachedRead<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: ReadOptions = {},
): Promise<T> {
  const network = fetcher().then(async (value) => {
    markFresh()
    await writeCached(key, value)
    return value
  })
  network.catch(() => {}) // si la copie a été servie avant, une erreur tardive n'est plus un problème
  const cached = await readCached<T>(key)
  if (!cached) return network
  // Déjà hors ligne (une lecture vient d'échouer) : on n'attend presque plus, la copie est servie tout de suite.
  const wait = staleSince !== null ? 800 : (opts.timeoutMs ?? 3_000)
  try {
    return await Promise.race([
      network,
      new Promise<never>((_, reject) => setTimeout(() => reject(new SlowNetwork()), wait)),
    ])
  } catch (e) {
    if (e instanceof SlowNetwork || isRetryableError(e)) {
      markStale(cached.savedAt)
      return cached.value
    }
    throw e
  }
}
