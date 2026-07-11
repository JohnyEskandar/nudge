// Nudge service worker.
//
// Its whole job is to be alive when the app isn't: the push service wakes this
// worker up and delivers the message even with the tab closed and the phone locked.

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for the old worker to be released.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Nudge', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Nudge'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: payload.tag || 'nudge-daily',
    renotify: true,
    data: { url: payload.url || '/' },
  }

  // waitUntil keeps the worker alive until the notification is actually shown.
  // iOS requires a visible notification for every push (userVisibleOnly).
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Reuse an already-open Nudge window if there is one.
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
