import * as api from '../api/client';

const SW_URL = '/sw.js';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// Register the SW early (safe to call on every app load).
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch {
    return null;
  }
}

export async function getPushState() {
  if (!pushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    subscribed = Boolean(reg && (await reg.pushManager.getSubscription()));
  } catch {
    /* ignore */
  }
  return { supported: true, permission: Notification.permission, subscribed };
}

// Ask permission, subscribe, and hand the subscription to the API.
export async function enablePush() {
  if (!pushSupported()) throw new Error('unsupported');

  const cfg = await api.getPushConfig();
  if (!cfg.enabled || !cfg.publicKey) throw new Error('server-not-configured');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
    });
  }
  await api.savePushSubscription(sub.toJSON());
  return true;
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await api.deletePushSubscription(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
