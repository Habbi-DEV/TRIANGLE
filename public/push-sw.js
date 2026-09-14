// Custom push-notification handlers, imported into the auto-generated
// Workbox service worker via vite.config.ts's `workbox.importScripts`.
//
// SECURITY FIX: url allowlist — push payload comes from the server; a
// compromised payload must not navigate the user to a phishing origin.

function safePushUrl(u) {
  if (typeof u !== 'string' || !u) return '/';
  // Same-origin paths only, limited to known app routes.
  if (!u.startsWith('/')) return '/';
  if (u.startsWith('//') || u.includes('\\') || /[\s<>"']/.test(u)) return '/';
  const ok = /^\/(admin|driver)?(\/|$|\?|#)/.test(u);
  return ok ? u.slice(0, 300) : '/';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = typeof data.title === 'string' ? data.title.slice(0, 100) : 'TRIANGLE';
  const options = {
    body: typeof data.body === 'string' ? data.body.slice(0, 300) : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 100) : 'order-update',
    data: { url: safePushUrl(data.url) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePushUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              const target = new URL(url, self.location.origin);
              if (target.origin !== self.location.origin) return client.focus();
              await client.navigate(target.pathname + target.search + target.hash);
            } catch (_) {}
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })()
  );
});
