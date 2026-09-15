// Tiny pub/sub so the axios interceptor (outside the React tree) can hand
// server/network error messages to the <ErrorModalHost/> mounted once near
// the root. Kept dependency-free on purpose — this is the whole "event bus".
// Mirrors apps/admin/src/lib/errorBus.js exactly.
let listeners = [];

export function emitError(message, opts = {}) {
  listeners.forEach((l) => l(message, opts));
}

export function onError(cb) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
