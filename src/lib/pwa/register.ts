import { useSyncExternalStore } from 'react'

// Service worker (public/… → sw.js, émis au build par scripts/offline-shell-plugin.ts). Mise à jour : une nouvelle version
// s'installe en attente ; on ne l'active que quand rien n'est à perdre (au démarrage de la page, ou page en arrière-plan
// avec la file d'écritures vide), puis la page se recharge pour repartir de la nouvelle version.

export const offlineAppEnabled = import.meta.env.VITE_OFFLINE_APP === '1'

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()
const setWaiting = (worker: ServiceWorker | null) => {
  waiting = worker
  for (const l of listeners) l()
}
export const updateStatus = {
  subscribe: (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getSnapshot: () => waiting !== null,
}
export const useUpdateWaiting = () =>
  useSyncExternalStore(updateStatus.subscribe, updateStatus.getSnapshot)

/** Active la version en attente ; la page se recharge quand elle prend la main. */
export function applyUpdate(): void {
  waiting?.postMessage('SKIP_WAITING')
}

const STARTUP_WINDOW_MS = 10_000
const RELOAD_GUARD = 'fair-sw-reload-at'

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  const container = navigator.serviceWorker
  if (!offlineAppEnabled) {
    // Option désactivée : on retire un service worker et des copies laissés par une version précédente.
    void container.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()))
    void globalThis.caches?.keys().then((ks) => ks.forEach((k) => void caches.delete(k)))
    return
  }
  const startedAt = Date.now()
  const hadController = container.controller !== null
  let reloading = false
  container.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return // première installation : rien à remplacer
    try {
      const last = Number(sessionStorage.getItem(RELOAD_GUARD) ?? 0)
      if (Date.now() - last < 5_000) return // garde-fou contre une boucle de rechargements
      sessionStorage.setItem(RELOAD_GUARD, String(Date.now()))
    } catch {
      // sessionStorage indisponible : on recharge quand même une fois (`reloading`)
    }
    reloading = true
    location.reload()
  })

  const onWaiting = (worker: ServiceWorker) => {
    setWaiting(worker)
    if (Date.now() - startedAt < STARTUP_WINDOW_MS) applyUpdate() // page toute neuve : rien à perdre
  }
  void container
    .register('/sw.js')
    .then((reg) => {
      if (reg.waiting && hadController) onWaiting(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && container.controller) onWaiting(installing)
        })
      })
      // Une page restée ouverte longtemps (iPad en veille) cherche une nouvelle version à chaque retour.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void reg.update().catch(() => {})
      })
    })
    .catch(() => {}) // navigateur sans service worker (navigation privée…) : l'appli marche, mais pas hors ligne
}
