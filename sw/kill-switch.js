// Remplace le service worker quand l'option hors ligne est désactivée (VITE_OFFLINE_APP absent au build) :
// efface les copies, se désinscrit et recharge les pages ouvertes pour qu'elles repartent du réseau.
self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key)
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' }))
        void client.navigate(client.url)
    })(),
  )
})
