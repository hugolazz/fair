import { useCallback, useState } from 'react'
import { DEFAULT_PREFS, normalizePrefs, type ColumnPrefs } from './lib/columns'

// Réglage du tableau : propre à la personne, mémorisé sur cet appareil (rien n'est envoyé à l'équipe).
const STORAGE_KEY = 'fair-prepare-columns'

function load(): ColumnPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizePrefs(JSON.parse(raw)) : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS // stockage indisponible ou contenu altéré : réglage d'origine
  }
}

export function useColumnPrefs(): [ColumnPrefs, (next: ColumnPrefs) => void] {
  const [prefs, setPrefs] = useState<ColumnPrefs>(load)
  const update = useCallback((next: ColumnPrefs) => {
    setPrefs(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Non mémorisé : le réglage ne vaut que pour cette session.
    }
  }, [])
  return [prefs, update]
}
