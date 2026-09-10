/* Lytronix Admin — service worker: background push, app-icon badge, and
   subscription auto-renewal. No offline caching (always run the latest build).
   Bump this string whenever sw.js changes so the browser installs the update. */
const SW_VERSION = 'v3';
const CFG_CACHE = 'lx-cfg';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ---- helpers -------------------------------------------------------------
function b64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const s = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
async function saveApiBase(url) {
  const c = await caches.open(CFG_CACHE);
  await c.put('api-base', new Response(url));
}
async function getApiBase() {
  try {
    const c = await caches.open(CFG_CACHE);
    const r = await c.match('api-base');
    return r ? (await r.text()) : '';
  } catch {
    return '';
  }
}
function setBadge(n) {
  try {
    if (!('setAppBadge' in self.navigator)) return;
    if (typeof n === 'number' && n > 0) self.navigator.setAppBadge(n);
    else self.navigator.clearAppBadge();
  } catch {
    /* badging unsupported / not installed */
  }
}

// The window tells us the absolute API origin (needed for background renewal
// since the SW may run cross-origin from the API).
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'CONFIG' && d.apiBase) event.waitUntil(saveApiBase(d.apiBase));
  if (d.type === 'BADGE') setBadge(d.count);
});

// ---- push --------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Lytronix Admin', body: event.data && event.data.text ? event.data.text() : '' };
  }

  const title = data.title || 'Lytronix Admin';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'lytronix',
    renotify: true,
    requireInteraction: true,
    vibrate: [120, 60, 120],
    timestamp: data.at || Date.now(),
    data: { url: data.url || '/' },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if (typeof data.badge === 'number') setBadge(data.badge);
    })()
  );
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

// ---- subscription auto-renewal ---------------------------------------------
// Browsers silently rotate push subscriptions; without this the old endpoint
// goes stale and notifications stop arriving.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const apiBase = await getApiBase();
      if (!apiBase) return;
      try {
        const cfg = await fetch(`${apiBase}/api/push/config`).then((r) => r.json());
        if (!cfg || !cfg.publicKey) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToUint8(cfg.publicKey),
        });
        const oldEndpoint =
          (event.oldSubscription && event.oldSubscription.endpoint) ||
          (await self.registration.pushManager.getSubscription().then((s) => s && s.endpoint).catch(() => null));
        await fetch(`${apiBase}/api/push/rotate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldEndpoint, subscription: sub.toJSON() }),
        });
      } catch {
        /* try again on the next event */
      }
    })()
  );
});
