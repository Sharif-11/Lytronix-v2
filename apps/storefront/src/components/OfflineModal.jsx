import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Mounted once near the app root. Blocks the UI behind a modal for as long
 * as the browser reports itself offline (navigator.onLine + the online/
 * offline events) and disappears the instant connectivity returns — no
 * dismiss button, since there's nothing useful to do until it's back.
 * Mirrors apps/admin's OfflineModal.jsx; z-[10000] sits above the storefront's
 * own ErrorModal (z-[9999]) so this always wins if both would otherwise fire.
 */
export default function OfflineModalHost() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-floating border border-ui-line max-w-sm w-full p-5 sm:p-6 text-center font-bangla" dir="auto">
        <div className="w-11 h-11 rounded-full bg-ui-rust/10 text-ui-rust flex items-center justify-center mb-3 mx-auto">
          <WifiOff size={20} />
        </div>
        <h3 className="font-display text-lg text-ui-ink mb-1">আপনি অফলাইনে আছেন</h3>
        <p className="text-sm text-ui-faint leading-relaxed">
          ইন্টারনেট কানেকশন চেক করুন — সংযোগ ফিরলে এটি নিজে থেকেই বন্ধ হয়ে যাবে।
        </p>
      </div>
    </div>
  );
}
