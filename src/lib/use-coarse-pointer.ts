import { useSyncExternalStore } from 'react'

const QUERY = '(pointer: coarse)'
const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/** `true` sur un écran tactile : on y garde les sélecteurs natifs du système (le meilleur choix au doigt). */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (!hasMatchMedia()) return () => {}
      const mql = window.matchMedia(QUERY)
      mql.addEventListener('change', notify)
      return () => mql.removeEventListener('change', notify)
    },
    () => hasMatchMedia() && window.matchMedia(QUERY).matches,
    () => false,
  )
}
