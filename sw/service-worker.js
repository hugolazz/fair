// Service worker de fair : l'appli (HTML, scripts, styles, polices, icônes) est gardée sur l'appareil pour s'ouvrir sans
// réseau. Les données, elles, ne passent jamais par ici (Supabase est une autre origine ; copie locale : src/lib/cache).
// Les marqueurs __…__ sont remplacés au build (vite.config.ts).
const PREFIX = 'fair-shell-'
const CACHE = PREFIX + '__VERSION__'
const PRECACHE = /* __PRECACHE__ */ []

self.addEventListener('install', (event) => {
  // Pas de skipWaiting ici : la nouvelle version attend que la page décide de l'activer (file d'écritures vide).
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    // Toujours la page de la version installée : ses scripts sont, eux, dans la même copie.
    event.respondWith(
      caches.match('/index.html', { cacheName: CACHE }).then((hit) => hit ?? fetch(request)),
    )
    return
  }
  if (
    url.pathname === '/sw.js' ||
    (!PRECACHE.includes(url.pathname) && !url.pathname.startsWith('/assets/'))
  )
    return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request)
      if (hit) return hit
      const response = await fetch(request)
      if (response.ok) void cache.put(request, response.clone())
      return response
    }),
  )
})
