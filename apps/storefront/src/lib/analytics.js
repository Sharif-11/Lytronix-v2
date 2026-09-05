import { trackEvent } from '../api/client';

const SID_KEY = 'lytronix_sid';
const VISIT_FLAG = 'lytronix_visit_sent';
// product ids whose view we've already logged this browser-session
const VIEWED_KEY = 'lytronix_viewed';

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'sid-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getSessionId() {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = uuid();
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return 'anon';
  }
}

export function track(type, payload = {}) {
  return trackEvent({
    type,
    sessionId: getSessionId(),
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    ...payload,
  });
}

// Fire exactly one site_visit per browser tab-session.
export function trackVisitOnce() {
  try {
    if (sessionStorage.getItem(VISIT_FLAG)) return;
    sessionStorage.setItem(VISIT_FLAG, '1');
  } catch {
    /* ignore */
  }
  track('site_visit');
}

// De-dupe product views within a tab-session so a refresh isn't a new "view".
export function shouldLogProductView(productId) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(VIEWED_KEY) || '[]');
    if (seen.includes(productId)) return false;
    seen.push(productId);
    sessionStorage.setItem(VIEWED_KEY, JSON.stringify(seen.slice(-100)));
    return true;
  } catch {
    return true;
  }
}
