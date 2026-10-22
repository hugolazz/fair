import type { OutboxEntry, OutboxStorage } from './outbox'

/** Stockage en mémoire : tests, et repli quand IndexedDB n'est pas disponible. */
export class MemoryStorage<P> implements OutboxStorage<P> {
  private entries: OutboxEntry<P>[] = []

  load(): Promise<OutboxEntry<P>[]> {
    return Promise.resolve(this.entries.map((e) => ({ ...e })))
  }

  save(entries: OutboxEntry<P>[]): Promise<void> {
    this.entries = entries.map((e) => ({ ...e }))
    return Promise.resolve()
  }
}

type Stored<P> = OutboxEntry<P> & { order: number }

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('entries', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

/**
 * File d'attente persistée dans IndexedDB : elle survit à la fermeture de l'appli et au rechargement de la page (iOS
 * recharge souvent une web app qu'on quitte un instant). Une base par utilisateur : jamais l'écriture d'un autre.
 */
export class IndexedDbStorage<P> implements OutboxStorage<P> {
  private db: Promise<IDBDatabase> | undefined

  constructor(private readonly name: string) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= openDb(this.name)
    return this.db
  }

  async load(): Promise<OutboxEntry<P>[]> {
    const db = await this.open()
    const tx = db.transaction('entries', 'readonly')
    const request = tx.objectStore('entries').getAll()
    await done(tx)
    return (request.result as Stored<P>[])
      .sort((a, b) => a.order - b.order)
      .map((row) => {
        const entry: Partial<Stored<P>> = { ...row }
        delete entry.order
        return entry as OutboxEntry<P>
      })
  }

  async save(entries: OutboxEntry<P>[]): Promise<void> {
    const db = await this.open()
    const tx = db.transaction('entries', 'readwrite')
    const store = tx.objectStore('entries')
    store.clear()
    entries.forEach((entry, order) => store.put({ ...entry, order }))
    await done(tx)
  }
}

/** IndexedDB si le navigateur l'offre, sinon la mémoire. */
export function createStorage<P>(name: string): OutboxStorage<P> {
  return typeof indexedDB === 'undefined' ? new MemoryStorage<P>() : new IndexedDbStorage<P>(name)
}

/** Efface la file d'attente d'un utilisateur de l'appareil (suppression du compte). */
export function deleteOutbox(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve()
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}
