// Tiny pub/sub so the axios interceptor (outside the React tree) can hand
// server error messages to the <ErrorModalHost/> mounted once near the root.
// Kept dependency-free on purpose — this is the whole "event bus".
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
