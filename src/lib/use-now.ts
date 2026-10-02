import { useEffect, useState } from 'react'

/** Heure courante (ms), rafraîchie périodiquement : pour afficher « il y a 3 min » sans appeler Date.now() au rendu. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
