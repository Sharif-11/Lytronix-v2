/* Lytronix Admin — service worker for background push notifications.
   No offline caching on purpose: the admin must always run the latest build. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Lytronix', body: event.data && event.data.text ? event.data.text() : '' };
  }

  const title = data.title || 'Lytronix Admin';
  const options = {
    body: data.body || '',
    icon: '/lytronix-mark.png',
    badge: '/lytronix-mark.png',
    tag: data.tag || 'lytronix',
    renotify: true,
    vibrate: [90, 40, 90],
    timestamp: data.at || Date.now(),
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if (url && url !== '/' && 'navigate' in client) client.navigate(url).catch(() => {});
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
