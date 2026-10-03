const CACHE = 'marcelo-meister-v1'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/marcelo.png', '/manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) return

  event.respondWith(
    caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then(cached => {
      const fetched = fetch(request)
        .then(response => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then(cache => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached || (request.mode === 'navigate' ? caches.match('/') : undefined))
      return cached || fetched
    })
  )
})
