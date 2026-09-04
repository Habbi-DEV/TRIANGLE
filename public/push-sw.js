// Custom push-notification handlers, imported into the auto-generated
// Workbox service worker via vite.config.ts's `workbox.importScripts`
// (see that file for why: vite-plugin-pwa's default `generateSW` strategy
// doesn't let us hand-write the main SW file, but it does let us bolt extra
// listeners like these onto the one it builds).
//
// This only ever fires for customers who tapped "enable alerts" in
// MenuPage (see src/lib/push.ts) — the subscription that makes push
// possible at all is created there, never automatically.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'TRIANGLE';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Re-using the tag means a second status change while the first
    // notification is still sitting unread REPLACES it instead of stacking
    // — the customer only ever needs to see the latest status.
    tag: data.tag || 'order-update',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an already-open tab instead of opening a duplicate one.
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })()
  );
});
