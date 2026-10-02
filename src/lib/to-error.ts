/**
 * Convertit n'importe quelle valeur levée en `Error` avec un vrai message.
 * Les erreurs de Supabase (PostgREST) sont des objets simples `{ message, code, details }`, pas des `Error` :
 * `String(e)` donnerait « [object Object] ».
 */
export function toError(e: unknown): Error {
  if (e instanceof Error) return e
  if (typeof e === 'object' && e !== null) {
    const { message, code } = e as { message?: unknown; code?: unknown }
    if (typeof message === 'string' && message)
      return new Error(typeof code === 'string' ? `${message} (${code})` : message)
  }
  return new Error(typeof e === 'string' ? e : 'Erreur inconnue')
}
