import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { getMyPayments } from '../../api/client';
import { formatMoney, formatDate, statusStyle, paymentMethodLabel, paymentStatusLabel } from '../../utils/format';

export default function Payments() {
  const [payments, setPayments] = useState(null);

  useEffect(() => {
    getMyPayments().then((d) => setPayments(d.payments)).catch(() => setPayments([]));
  }, []);

  if (payments === null) return <p className="text-sm text-ui-muted">লোড হচ্ছে…</p>;

  if (payments.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Wallet size={30} className="mx-auto text-ui-faint mb-3" />
        <p className="text-ui-muted">এখনো কোনো পেমেন্টের রেকর্ড নেই।</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-ui-ink">পেমেন্ট</h2>
      <div className="card divide-y divide-ui-line">
        {payments.map((p) => (
          <div key={p._id} className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ui-ink">{paymentMethodLabel(p.method)}</div>
              <div className="text-xs text-ui-muted">
                {formatDate(p.createdAt)}
                {p.orderNumber && (
                  <>
                    {' · '}
                    <span className="font-mono">{p.orderNumber}</span>
                  </>
                )}
              </div>
              {p.transactionId && (
                <div className="text-xs font-mono text-ui-faint">ট্রানজেকশন আইডি: {p.transactionId}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-sm font-medium">{formatMoney(p.amount)}</div>
              <span className={`chip mt-1 ${statusStyle(p.status)}`}>{paymentStatusLabel(p.status)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
