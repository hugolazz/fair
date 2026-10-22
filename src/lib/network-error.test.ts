import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRetryableError } from './network-error'

afterEach(() => vi.unstubAllGlobals())

describe('isRetryableError', () => {
  it('reconnaît une coupure réseau, sous toutes ses formes', () => {
    for (const message of [
      'TypeError: Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed', // Safari
      'Network request failed',
      'request timed out',
      'net::ERR_INTERNET_DISCONNECTED',
    ])
      expect(isRetryableError({ message, code: '' }), message).toBe(true)
    expect(isRetryableError(new Error('Failed to fetch'))).toBe(true)
  })

  it('reconnaît un jeton à renouveler et un serveur indisponible', () => {
    expect(isRetryableError({ message: 'JWT expired', code: 'PGRST301' })).toBe(true)
    expect(isRetryableError({ code: 'PGRST301' })).toBe(true)
    expect(isRetryableError({ status: 503 })).toBe(true)
    expect(isRetryableError({ status: 429 })).toBe(true)
  })

  it('un refus du serveur n’est pas passager', () => {
    expect(isRetryableError({ message: 'permission denied for table notes', code: '42501' })).toBe(
      false,
    )
    expect(isRetryableError({ message: 'duplicate key value', code: '23505' })).toBe(false)
    expect(isRetryableError({ status: 403 })).toBe(false)
    expect(isRetryableError(new Error('not allowed or not found'))).toBe(false)
    expect(isRetryableError('texte')).toBe(false)
    expect(isRetryableError(null)).toBe(false)
  })

  it('appareil déclaré hors ligne par le navigateur : toute erreur est passagère', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(isRetryableError({ message: 'permission denied' })).toBe(true)
  })
})
