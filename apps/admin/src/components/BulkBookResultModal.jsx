import { CheckCircle2, XCircle, X } from 'lucide-react';

// What happened to each order in a bulk Steadfast booking. Steadfast answers
// "200 OK" even when some orders are refused, so every order is listed with
// its own outcome; failed ones were left untouched and can be fixed and re-sent.
export default function BulkBookResultModal({ data, onClose }) {
  if (!data) return null;
  const failed = data.results.filter((r) => !r.ok);
  const ok = data.results.filter((r) => r.ok);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-xl max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-floating">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-ui-line">
          <div>
            <h3 className="font-display text-lg text-ui-ink">Steadfast bulk booking</h3>
            <p className="text-sm text-ui-muted mt-0.5">
              <span className="text-emerald-700 font-medium">{data.booked} booked</span>
              {data.failed > 0 && <span className="text-ui-rust font-medium"> · {data.failed} not booked</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-ui-faint hover:text-ui-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
          {failed.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wide text-ui-muted mb-2">Not booked — fix and try again</h4>
              <ul className="space-y-2">
                {failed.map((r) => (
                  <li key={r.orderId} className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-sm">
                    <XCircle size={16} className="text-ui-rust mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-mono text-ui-ink">{r.orderNumber || r.orderId}</div>
                      <div className="text-xs text-ui-muted break-words">{r.message}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ok.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wide text-ui-muted mb-2">Booked</h4>
              <ul className="space-y-1.5">
                {ok.map((r) => (
                  <li key={r.orderId} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span className="font-mono text-ui-ink">{r.orderNumber}</span>
                    <span className="text-xs text-ui-muted truncate">
                      {r.trackingCode ? `tracking ${r.trackingCode}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="p-4 sm:p-5 border-t border-ui-line flex justify-end">
          <button onClick={onClose} className="btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
