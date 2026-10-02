import { useSyncExternalStore } from 'react'

export type ThemeMode = 'auto' | 'light' | 'sun' | 'dark'
export type EffectiveTheme = 'light' | 'sun' | 'dark'

const STORAGE_KEY = 'fair.theme'
const META_COLORS: Record<EffectiveTheme, string> = {
  light: '#0f766e',
  sun: '#ffffff',
  dark: '#020617',
}

export const THEME_MODES: ThemeMode[] = ['auto', 'light', 'sun', 'dark']

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'sun' || v === 'dark' || v === 'auto' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function effectiveTheme(mode: ThemeMode, prefersDark: boolean): EffectiveTheme {
  return mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
}

let mode: ThemeMode = read()
const subscribers = new Set<() => void>()

/** Applique le thème au document : `data-theme` pilote les variables de couleur (voir index.css). */
export function applyTheme() {
  const eff = effectiveTheme(mode, window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = eff
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', META_COLORS[eff])
}

/** À appeler une fois au démarrage (avant le premier rendu) pour éviter un flash de mauvais thème. */
export function initTheme() {
  applyTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
}

export function setThemeMode(next: ThemeMode) {
  mode = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* stockage indisponible : le thème reste valable pour cette session */
  }
  applyTheme()
  subscribers.forEach((fn) => fn())
}

export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const current = useSyncExternalStore(
    (fn) => {
      subscribers.add(fn)
      return () => void subscribers.delete(fn)
    },
    () => mode,
    () => 'auto' as ThemeMode,
  )
  return [current, setThemeMode]
}
