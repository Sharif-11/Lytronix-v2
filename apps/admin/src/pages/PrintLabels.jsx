import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getOrder, getSteadfastMeta } from '../api/client';
import LabelSlip, { LABEL_SIZES, DEFAULT_LABEL_SIZE, MERCHANT_ID, labelPageCss } from '../components/LabelSlip';

const LS_LAST_SIZE = 'lytronix:lastLabelSize';
const validSize = (k) => (LABEL_SIZES[k] ? k : null);

/**
 * Bulk courier-label printing. Fetches each selected order and renders one
 * <LabelSlip> per page (page-break-after between each). A single
 * window.print() call then hands the whole multi-page job to the thermal
 * POS printer's driver, which prints them one by one in sequence — exactly
 * the same as printing them individually, just queued together instead of
 * requiring a separate "Print" click per order.
 */
export default function PrintLabels() {
  const [searchParams] = useSearchParams();
  const ids = (searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const [sizeKey, setSizeKey] = useState(
    () => validSize(searchParams.get('size')) || validSize(localStorage.getItem(LS_LAST_SIZE)) || DEFAULT_LABEL_SIZE
  );
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState([]);
  const [merchantId, setMerchantId] = useState(MERCHANT_ID);

  useEffect(() => {
    getSteadfastMeta().then((m) => setMerchantId(m.merchantId || MERCHANT_ID)).catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `Bulk labels (${ids.length})`;
  }, [ids.length]);

  useEffect(() => {
    setLoading(true);
    setFailed([]);
    Promise.allSettled(ids.map((id) => getOrder(id))).then((results) => {
      const ok = [];
      const bad = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok.push(r.value);
        else bad.push(ids[i]);
      });
      setOrders(ok);
      setFailed(bad);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  useEffect(() => {
    localStorage.setItem(LS_LAST_SIZE, sizeKey);
  }, [sizeKey]);

  return (
    <div className="min-h-screen bg-ui-bg no-ruled">
      <style>{`
        @media print {
          ${labelPageCss(sizeKey)}
          .label-page { page-break-after: always; }
          .label-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-ui-brand text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          Bulk courier labels — {orders.length} of {ids.length} loaded
          {failed.length > 0 && ` (${failed.length} failed to load)`}
        </span>
        <button
          onClick={() => window.print()}
          disabled={loading || orders.length === 0}
          className="bg-white/15 hover:bg-white/25 disabled:opacity-40 transition-colors rounded-sm px-4 py-1.5 text-sm"
        >
          Print all {orders.length ? `(${orders.length})` : ''}
        </button>
      </div>

      <div className="no-print max-w-md mx-auto bg-white border border-ui-line rounded-xl shadow-card mt-4 p-4">
        <div className="text-sm font-medium text-ui-ink mb-2">Label size (applies to all)</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(LABEL_SIZES).map(([key, s]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSizeKey(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                sizeKey === key
                  ? 'border-ui-brand bg-ui-brand text-white'
                  : 'border-ui-line bg-white text-ui-ink hover:bg-ui-line/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ui-muted mt-2">
          Your thermal POS printer prints these one after another, in the order shown below — same as printing each
          label separately, just queued in a single job.
        </p>
      </div>

      {loading && <p className="text-ui-muted text-sm py-10 text-center">Loading orders…</p>}
      {!loading && ids.length === 0 && (
        <p className="text-ui-muted text-sm py-10 text-center">No orders selected. Go back and pick some to print.</p>
      )}
      {!loading && failed.length > 0 && (
        <p className="no-print max-w-md mx-auto text-xs text-ui-rust text-center mt-3">
          Couldn't load {failed.length} order{failed.length === 1 ? '' : 's'} — they were skipped.
        </p>
      )}

      <div className="my-6 space-y-4">
        {orders.map((o) => (
          <div key={o._id} className="label-page">
            <LabelSlip order={o} sizeKey={sizeKey} merchantId={merchantId} />
          </div>
        ))}
      </div>
    </div>
  );
}
