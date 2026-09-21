import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, ArrowRight } from 'lucide-react';
import { getSteadfastWebhookLogs } from '../api/client';
import { formatDate } from '../utils/format';

const OUTCOME_STYLES = {
  processed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unknown_order: 'bg-amber-50 text-amber-700 border-amber-200',
  invalid: 'bg-amber-50 text-amber-700 border-amber-200',
  unauthorized: 'bg-red-50 text-ui-rust border-red-200',
  error: 'bg-red-50 text-ui-rust border-red-200',
  received: 'bg-slate-100 text-slate-600 border-slate-200',
  noted: 'bg-sky-50 text-sky-700 border-sky-200',
  duplicate: 'bg-slate-100 text-slate-500 border-slate-200',
};

// Low-key section at the very bottom of the dashboard: the latest few
// Steadfast callbacks, with a link to the full log page.
export default function CourierCallbacksPanel() {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    getSteadfastWebhookLogs({ limit: 8 })
      .then((d) => setLogs(d.logs))
      .catch(() => setLogs([])); // passive panel — a failure shows nothing rather than a popup
  }, []);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display font-bold text-ui-ink flex items-center gap-2">
          <Truck size={16} className="text-ui-brand" /> Courier callbacks
        </h2>
        <Link to="/courier-logs" className="text-xs text-ui-brand inline-flex items-center gap-1 hover:underline">
          View all <ArrowRight size={12} />
        </Link>
      </div>

      {logs === null ? (
        <p className="text-xs text-ui-muted">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-ui-muted">No callbacks from Steadfast yet.</p>
      ) : (
        <ul className="divide-y divide-ui-line">
          {logs.map((l) => (
            <li key={l._id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full border font-medium ${OUTCOME_STYLES[l.outcome] || OUTCOME_STYLES.received}`}
              >
                {l.outcome.replace('_', ' ')}
              </span>
              <span className="text-ui-ink">
                {l.notificationType || 'unknown'}
                {l.status ? ` · ${l.status}` : ''}
              </span>
              {l.orderNumber && l.order ? (
                <Link to={`/orders/${l.order}`} className="text-ui-brand underline">
                  {l.orderNumber}
                </Link>
              ) : (
                l.invoice && <span className="text-ui-muted">invoice {l.invoice}</span>
              )}
              <span className="text-ui-muted sm:ml-auto">{formatDate(l.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
