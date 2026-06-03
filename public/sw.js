/* ATEC WMS 서비스워커 — 푸시 알림 수신/클릭 처리 */

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || 'ATEC WMS'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/dashboard' },
    tag: data.tag || undefined,        // 같은 tag면 알림 묶임
    renotify: !!data.tag,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(target); return w.focus() }
      }
      return self.clients.openWindow(target)
    })
  )
})

// 새 SW 즉시 활성화
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
