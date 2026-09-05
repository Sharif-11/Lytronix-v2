import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getOrder, getSteadfastMeta } from '../api/client';
import LabelSlip, { LABEL_SIZES, DEFAULT_LABEL_SIZE, labelPageCss } from '../components/LabelSlip';

const LS_LAST_SIZE = 'lytronix:lastLabelSize';

export default function PrintParcel() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [merchantId, setMerchantId] = useState('');
  const [sizeKey, setSizeKey] = useState(() => localStorage.getItem(LS_LAST_SIZE) || DEFAULT_LABEL_SIZE);

  useEffect(() => {
    getOrder(id).then(setOrder);
    getSteadfastMeta().then((m) => setMerchantId(m.merchantId || '')).catch(() => {});
  }, [id]);

  useEffect(() => {
    document.title = order ? `Parcel — ${order.orderNumber}` : 'Parcel slip';
  }, [order]);

  useEffect(() => {
    localStorage.setItem(LS_LAST_SIZE, sizeKey);
  }, [sizeKey]);

  if (!order) return <div className="p-8 font-mono text-sm text-ui-muted">Loading…</div>;

  return (
    <div className="min-h-screen bg-ui-bg no-ruled">
      <style>{`@media print { ${labelPageCss(sizeKey)} }`}</style>

      <div className="no-print sticky top-0 z-10 bg-ui-brand text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">Courier label — {order.orderNumber}</span>
        <div className="flex items-center gap-3">
          <Link
            to={`/orders/print-labels?ids=${order._id}&size=${sizeKey}`}
            className="text-xs underline underline-offset-4 text-white/80 hover:text-white"
          >
            Bulk print instead
          </Link>
          <button onClick={() => window.print()} className="bg-white/15 hover:bg-white/25 transition-colors rounded-sm px-4 py-1.5 text-sm">
            Print
          </button>
        </div>
      </div>

      <div className="no-print max-w-md mx-auto bg-white border border-ui-line rounded-xl shadow-card mt-4 p-4">
        <div className="text-sm font-medium text-ui-ink mb-2">Label size</div>
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
          Make sure your thermal POS printer's paper/label size in the print dialog matches what you pick here.
        </p>
      </div>

      <div className="my-6">
        <LabelSlip order={order} sizeKey={sizeKey} merchantId={merchantId} />
      </div>
    </div>
  );
}
