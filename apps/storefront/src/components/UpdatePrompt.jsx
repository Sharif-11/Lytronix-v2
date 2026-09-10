import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

// The version this tab booted with (injected by vite.config.js versionStamp).
const BOOT =
  typeof document !== 'undefined'
    ? document.querySelector('meta[name="app-version"]')?.content || ''
    : '';
const CHECK_MS = 5 * 60 * 1000;

// Watches /version.json + the service worker for a newer deploy and offers a
// one-tap reload. Silent in dev (no version stamped).
export default function UpdatePrompt() {
  const [stale, setStale] = useState(false);
  const dismissed = useRef(false);

  useEffect(() => {
    if (!BOOT || stale) return undefined;
    let alive = true;

    const check = async () => {
      if (dismissed.current) return;
      try {
        const r = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const { version } = await r.json();
        if (alive && version && version !== BOOT) setStale(true);
      } catch {
        /* offline / mid-deploy — try again later */
      }
    };

    check();
    const poll = setInterval(check, CHECK_MS);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', check);

    let swPoll;
    navigator.serviceWorker?.getRegistration().then((r) => {
      if (!r || !alive) return;
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller && alive) setStale(true);
        });
      });
      swPoll = setInterval(() => r.update().catch(() => {}), CHECK_MS);
    });

    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(swPoll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', check);
    };
  }, [stale]);

  if (!stale) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 sm:bottom-4 z-[60] sm:inset-x-auto sm:right-4 sm:w-80">
      <div className="flex items-center gap-2.5 rounded-xl bg-ui-brand text-white shadow-floating px-4 py-3">
        <RefreshCw size={16} className="shrink-0" />
        <span className="text-sm flex-1 font-bangla">অ্যাপের নতুন সংস্করণ এসেছে।</span>
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1 font-bangla"
        >
          রিফ্রেশ
        </button>
        <button
          onClick={() => {
            dismissed.current = true;
            setStale(false);
          }}
          aria-label="পরে"
          className="text-white/70 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
