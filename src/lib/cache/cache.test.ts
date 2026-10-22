import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cachedRead,
  clearCache,
  configureCache,
  markFresh,
  patchCached,
  readCached,
  staleStatus,
  writeCached,
} from './cache'
import { MemoryCacheStore } from './store'

const NETWORK = new Error('Failed to fetch')

beforeEach(() => {
  vi.useFakeTimers()
  configureCache('u1', new MemoryCacheStore())
})
afterEach(() => {
  configureCache(null)
  vi.useRealTimers()
})

describe('copie locale', () => {
  it('écrit et relit une valeur, horodatée ; patchCached la modifie', async () => {
    await writeCached('a', { n: 1 })
    expect((await readCached<{ n: number }>('a'))?.value).toEqual({ n: 1 })
    expect((await readCached('a'))?.savedAt).toBeTypeOf('number')
    await patchCached<{ n: number }>('a', (prev) => ({ n: (prev?.n ?? 0) + 1 }))
    expect((await readCached<{ n: number }>('a'))?.value).toEqual({ n: 2 })
    await patchCached<number[]>('b', (prev) => [...(prev ?? []), 7]) // crée l'entrée absente
    expect((await readCached<number[]>('b'))?.value).toEqual([7])
  })

  it('clearCache efface tout', async () => {
    await writeCached('a', 1)
    await clearCache()
    expect(await readCached('a')).toBeUndefined()
  })

  it('sans copie configurée (déconnecté), lire et écrire ne font rien', async () => {
    configureCache(null)
    await writeCached('a', 1)
    expect(await readCached('a')).toBeUndefined()
  })
})

describe('cachedRead', () => {
  it('réseau disponible : rend la valeur à jour et l’enregistre', async () => {
    const value = await cachedRead('k', async () => 'frais')
    expect(value).toBe('frais')
    expect((await readCached('k'))?.value).toBe('frais')
    expect(staleStatus.getSnapshot()).toBeNull()
  })

  it('réseau coupé avec une copie : sert la copie et signale des données anciennes', async () => {
    await writeCached('k', 'ancien')
    const value = await cachedRead('k', async () => {
      throw NETWORK
    })
    expect(value).toBe('ancien')
    expect(staleStatus.getSnapshot()).not.toBeNull()
    markFresh()
    expect(staleStatus.getSnapshot()).toBeNull()
  })

  it('réseau coupé sans copie : l’erreur remonte', async () => {
    await expect(
      cachedRead('rien', async () => {
        throw NETWORK
      }),
    ).rejects.toBe(NETWORK)
  })

  it('une erreur qui n’est pas passagère (accès refusé) n’est pas masquée par la copie', async () => {
    await writeCached('k', 'ancien')
    const refused = new Error('permission denied')
    await expect(
      cachedRead('k', async () => {
        throw refused
      }),
    ).rejects.toBe(refused)
    expect(staleStatus.getSnapshot()).toBeNull()
  })

  it('réseau trop lent avec une copie : sert la copie au bout du délai, puis la met à jour à l’arrivée', async () => {
    await writeCached('k', 'ancien')
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('tardif'), 10_000))
    const result = cachedRead('k', () => slow, { timeoutMs: 3_000 })
    await vi.advanceTimersByTimeAsync(3_000)
    expect(await result).toBe('ancien')
    expect(staleStatus.getSnapshot()).not.toBeNull()

    await vi.advanceTimersByTimeAsync(7_000) // la réponse arrive enfin : la copie est mise à jour
    expect((await readCached('k'))?.value).toBe('tardif')
    expect(staleStatus.getSnapshot()).toBeNull()
  })

  it('sans copie, attend le réseau même s’il est lent', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('long'), 20_000))
    const result = cachedRead('neuf', () => slow, { timeoutMs: 3_000 })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await result).toBe('long')
  })

  it('déjà hors ligne, les lectures suivantes n’attendent presque plus', async () => {
    await writeCached('k1', 'a1')
    await writeCached('k2', 'a2')
    await cachedRead('k1', async () => {
      throw NETWORK
    }) // signale « hors ligne »
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('x'), 10_000))
    const second = cachedRead('k2', () => slow, { timeoutMs: 3_000 })
    await vi.advanceTimersByTimeAsync(800) // bien avant les 3 s habituelles
    expect(await second).toBe('a2')
  })
})
