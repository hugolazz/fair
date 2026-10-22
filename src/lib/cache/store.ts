// Copie locale des données lues (IndexedDB) : une base par utilisateur, des paires clé → valeur horodatées.

export type CacheEntry<T = unknown> = { key: string; value: T; savedAt: number }

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>
  setMany(entries: readonly { key: string; value: unknown }[]): Promise<void>
  clear(): Promise<void>
}

/** En mémoire : tests, et repli quand IndexedDB n'est pas disponible. */
export class MemoryCacheStore implements CacheStore {
  private entries = new Map<string, CacheEntry>()

  get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = this.entries.get(key)
    return Promise.resolve(entry ? (structuredClone(entry) as CacheEntry<T>) : undefined)
  }

  setMany(entries: readonly { key: string; value: unknown }[]): Promise<void> {
    const savedAt = Date.now()
    for (const e of entries)
      this.entries.set(e.key, { key: e.key, value: structuredClone(e.value), savedAt })
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.entries.clear()
    return Promise.resolve()
  }
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('entries', { keyPath: 'key' })
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

export class IndexedDbCacheStore implements CacheStore {
  private db: Promise<IDBDatabase> | undefined

  constructor(private readonly name: string) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= openDb(this.name)
    return this.db
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const db = await this.open()
    const tx = db.transaction('entries', 'readonly')
    const request = tx.objectStore('entries').get(key)
    await done(tx)
    return request.result as CacheEntry<T> | undefined
  }

  async setMany(entries: readonly { key: string; value: unknown }[]): Promise<void> {
    if (entries.length === 0) return
    const db = await this.open()
    const tx = db.transaction('entries', 'readwrite')
    const store = tx.objectStore('entries')
    const savedAt = Date.now()
    for (const e of entries) store.put({ key: e.key, value: e.value, savedAt })
    await done(tx)
  }

  async clear(): Promise<void> {
    const db = await this.open()
    const tx = db.transaction('entries', 'readwrite')
    tx.objectStore('entries').clear()
    await done(tx)
  }
}

export function createCacheStore(name: string): CacheStore {
  return typeof indexedDB === 'undefined' ? new MemoryCacheStore() : new IndexedDbCacheStore(name)
}
