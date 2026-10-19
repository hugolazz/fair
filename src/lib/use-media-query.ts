import { useSyncExternalStore } from 'react'

const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/**
 * `true` quand la requête média correspond (ex. « (min-width: 768px) » pour desktop, « (pointer: coarse) » pour un
 * écran tactile). Toujours `false` là où `matchMedia` n'existe pas (tests jsdom, rendu serveur).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (!hasMatchMedia()) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', notify)
      return () => mql.removeEventListener('change', notify)
    },
    () => hasMatchMedia() && window.matchMedia(query).matches,
    () => false,
  )
}
