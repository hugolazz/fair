const NETWORK_MESSAGE =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|network error|timed? ?out|econn|err_internet|err_network|err_connection|aborted/i

/**
 * Une erreur passagère : réseau coupé, serveur indisponible, jeton à renouveler. On réessaiera plus tard (file d'attente)
 * ou on se rabat sur la copie locale (lectures) au lieu de déclarer un échec.
 */
export function isRetryableError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (typeof e !== 'object' || e === null) return false
  const { message, code, status } = e as { message?: unknown; code?: unknown; status?: unknown }
  if (typeof message === 'string' && NETWORK_MESSAGE.test(message)) return true
  if (typeof message === 'string' && /jwt expired/i.test(message)) return true
  if (code === 'PGRST301') return true
  return typeof status === 'number' && (status >= 500 || status === 429 || status === 408)
}
