import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { getSteadfastWebhookLogs } from '../api/client';
import { formatDate } from '../utils/format';
import Loader from '../components/Loader';
import { useLanguage } from '../context/LanguageContext';
import usePageTitle from '../lib/usePageTitle';

const OUTCOME_STYLES = {
  processed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unknown_order: 'bg-amber-50 text-amber-700 border-amber-200',
  invalid: 'bg-amber-50 text-amber-700 border-amber-200',
  unauthorized: 'bg-red-50 text-ui-rust border-red-200',
  error: 'bg-red-50 text-ui-rust border-red-200',
  received: 'bg-slate-100 text-slate-600 border-slate-200',
};

const OUTCOMES = ['', 'processed', 'unknown_order', 'invalid', 'unauthorized', 'error'];

// Every callback Steadfast has sent us — raw payload plus what we did with it.
export default function CourierLogs() {
  const { t } = useLanguage();
  usePageTitle(t('nav.courierLogs'));
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outcome, setOutcome] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getSteadfastWebhookLogs({ outcome: outcome || undefined, limit: 200 })
      .then((d) => setLogs(d.logs))
      .catch(() => {}) // surfaced globally via the ErrorModal
      .finally(() => setLoading(false));
  }, [outcome]);

  useEffect(load, [load]);

  const q = search.trim().toLowerCase();
  const shown = q
    ? logs.filter((l) =>
        [l.invoice, l.consignmentId, l.orderNumber, l.status, l.notificationType]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    : logs;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search invoice / consignment / order…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[11rem]" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o ? o.replace('_', ' ') : 'All outcomes'}
            </option>
          ))}
        </select>
        <button onClick={load} className="btn-secondary inline-flex items-center gap-1.5" type="button">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <Loader inline className="justify-center mt-8" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-ui-muted text-center mt-10">No courier callbacks logged yet.</p>
      ) : (
        <div className="card divide-y divide-ui-line">
          {shown.map((l) => {
            const open = openId === l._id;
            return (
              <div key={l._id} className="p-3">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : l._id)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          OUTCOME_STYLES[l.outcome] || OUTCOME_STYLES.received
                        }`}
                      >
                        {l.outcome.replace('_', ' ')}
                      </span>
                      <span className="text-sm font-medium text-ui-ink">
                        {l.notificationType || 'unknown type'}
                        {l.status ? ` · ${l.status}` : ''}
                      </span>
                    </div>
                    <div className="text-xs text-ui-muted flex flex-wrap gap-x-3">
                      <span>{formatDate(l.createdAt)}</span>
                      {l.orderNumber && l.order ? (
                        <Link to={`/orders/${l.order}`} onClick={(e) => e.stopPropagation()} className="text-ui-brand underline">
                          {l.orderNumber}
                        </Link>
                      ) : (
                        l.invoice && <span>invoice {l.invoice}</span>
                      )}
                      {l.consignmentId && <span>consignment {l.consignmentId}</span>}
                      {l.previousStatus && l.newStatus && l.previousStatus !== l.newStatus && (
                        <span>
                          {l.previousStatus} → {l.newStatus}
                        </span>
                      )}
                    </div>
                    {l.note && <div className="text-xs text-ui-rust">{l.note}</div>}
                  </div>
                  {open ? <ChevronUp size={16} className="text-ui-muted" /> : <ChevronDown size={16} className="text-ui-muted" />}
                </button>
                {open && (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase text-ui-faint mb-1">Payload received</div>
                      <pre className="text-xs bg-slate-50 border border-ui-line rounded-lg p-2 overflow-x-auto">
                        {JSON.stringify(l.payload, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-ui-faint mb-1">Headers · IP {l.ip || '—'}</div>
                      <pre className="text-xs bg-slate-50 border border-ui-line rounded-lg p-2 overflow-x-auto">
                        {JSON.stringify(l.headers, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
