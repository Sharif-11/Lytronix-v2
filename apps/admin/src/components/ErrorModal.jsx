import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { onError } from '../lib/errorBus';

/**
 * Mounted once near the app root. Every server error response (wired in via
 * the axios interceptor in api/client.js emitting onto errorBus) surfaces
 * here as a proper modal instead of a bare inline red box — queued one at a
 * time so a burst of failed requests doesn't stack overlapping popups.
 */
export default function ErrorModalHost() {
  const [queue, setQueue] = useState([]);

  useEffect(() => onError((message, opts) => {
    setQueue((q) => [...q, { message, title: opts.title, id: Math.random() }]);
  }), []);

  if (queue.length === 0) return null;
  const current = queue[0];
  const dismiss = () => setQueue((q) => q.slice(1));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={dismiss} />
      <div className="relative bg-white rounded-2xl shadow-floating border border-ui-line max-w-sm w-full p-5 sm:p-6">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-ui-faint hover:text-ui-ink"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
        <div className="w-11 h-11 rounded-full bg-ui-rust/10 text-ui-rust flex items-center justify-center mb-3">
          <AlertTriangle size={20} />
        </div>
        <h3 className="font-display text-lg text-ui-rust mb-1">{current.title || 'Something went wrong'}</h3>
        <p className="text-sm text-ui-rust/90 leading-relaxed">{current.message}</p>
        {queue.length > 1 && (
          <p className="text-xs text-ui-faint mt-2">+{queue.length - 1} more</p>
        )}
        <button
          onClick={dismiss}
          className="w-full mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-ui-rust px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-red-700 active:scale-[0.98] transition-all"
        >
          Okay
        </button>
      </div>
    </div>
  );
}
