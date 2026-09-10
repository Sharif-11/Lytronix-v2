import * as api from '../api/client';

const SW_URL = '/sw.js';

// Absolute API origin (the SW may run cross-origin from the API on the
// deployed static host). Falls back to same-origin in dev (vite proxy).
const API_BASE = (import.meta.env.VITE_API_URL || '')
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');

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

async function tellSW(message) {
  try {
    const reg = await navigator.serviceWorker.ready;
    (reg.active || navigator.serviceWorker.controller)?.postMessage(message);
  } catch {
    /* ignore */
  }
}

// Register the SW early (safe to call on every app load). Also hands it the
// API origin it needs for background subscription renewal.
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    navigator.serviceWorker.ready.then(() => tellSW({ type: 'CONFIG', apiBase: API_BASE }));
    return reg;
  } catch {
    return null;
  }
}

// Mirror the unread count onto the installed-app icon badge (window side;
// the SW does the same from a push while the app is closed).
export function syncBadge(count) {
  try {
    if (!('setAppBadge' in navigator)) return;
    if (count > 0) navigator.setAppBadge(count);
    else navigator.clearAppBadge();
  } catch {
    /* ignore */
  }
  tellSW({ type: 'BADGE', count });
}

export async function getPushState() {
  if (!pushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  let subscribed = false;
  let swReady = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    swReady = Boolean(reg);
    subscribed = Boolean(reg && (await reg.pushManager.getSubscription()));
  } catch {
    /* ignore */
  }
  let serverEnabled = null;
  try {
    serverEnabled = Boolean((await api.getPushConfig()).enabled);
  } catch {
    serverEnabled = null;
  }
  return { supported: true, permission: Notification.permission, subscribed, swReady, serverEnabled };
}

// Ask permission, subscribe, hand the subscription to the API.
export async function enablePush() {
  if (!pushSupported()) throw new Error('unsupported');

  const cfg = await api.getPushConfig();
  if (!cfg.enabled || !cfg.publicKey) throw new Error('server-not-configured');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
  if (!reg) throw new Error('sw-failed');
  await navigator.serviceWorker.ready;
  tellSW({ type: 'CONFIG', apiBase: API_BASE });

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

// If permission is already granted but we lost the server subscription
// (SW updated, DB reset, …), quietly re-subscribe. Safe to call on load.
export async function ensureSubscribed() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    const cfg = await api.getPushConfig();
    if (!cfg.enabled || !cfg.publicKey) return false;
    const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
    if (!reg) return false;
    await navigator.serviceWorker.ready;
    tellSW({ type: 'CONFIG', apiBase: API_BASE });
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
      });
    }
    await api.savePushSubscription(sub.toJSON());
    return true;
  } catch {
    return false;
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await api.deletePushSubscription(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    syncBadge(0);
  } catch {
    /* ignore */
  }
}

export const sendTestPush = () => api.sendTestPush();
