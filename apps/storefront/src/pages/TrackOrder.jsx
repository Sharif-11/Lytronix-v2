import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Package } from 'lucide-react';
import { trackOrder } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { formatMoney, formatTime, mergeTrackingTimeline, groupTimelineByDate } from '../utils/format';

export default function TrackOrder() {
  const { trackingId } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    trackOrder(trackingId)
      .then(setOrder)
      .catch(() => setError('এই ট্র্যাকিং আইডি দিয়ে কোনো অর্ডার খুঁজে পাওয়া যায়নি।'));
  }, [trackingId]);

  return (
    <div className="min-h-screen flex items-start justify-center px-4 sm:px-5 py-10 sm:py-16">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-[0.2em] text-ui-muted">আপনার অর্ডার ট্র্যাক করুন</div>
          <div className="font-mono text-sm text-ui-muted mt-1">{trackingId}</div>
        </div>

        {error && (
          <div className="border border-ui-rust/40 bg-ui-rust/10 text-ui-rust text-sm px-4 py-3 rounded-xl text-center">
            {error}
          </div>
        )}

        {order && (
          <div className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-display text-xl text-ui-brand">{order.orderNumber}</div>
              <StatusBadge status={order.status} />
            </div>

            {order.courier?.trackingCode && (
              <div className="mb-4 text-xs font-mono text-ui-muted">
                কুরিয়ার ট্র্যাকিং কোড: <span className="text-ui-ink">{order.courier.trackingCode}</span>
              </div>
            )}

            <h3 className="text-xs uppercase tracking-wide text-ui-muted mb-3">পার্সেলটি এখন কোথায়</h3>
            <div className="mb-6 space-y-4">
              {groupTimelineByDate(mergeTrackingTimeline(order)).map((group) => (
                <div key={group.dateLabel}>
                  <div className="text-xs font-semibold text-ui-ink mb-2">{group.dateLabel}</div>
                  <ul className="space-y-2.5">
                    {group.entries.map((entry, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="text-xs font-mono text-ui-faint w-16 shrink-0 pt-px">{formatTime(entry.at)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-ui-ink">
                            {entry.kind === 'status' ? (
                              <Package size={13} className="text-ui-brand shrink-0" />
                            ) : (
                              <MapPin size={13} className="text-ui-muted shrink-0" />
                            )}
                            {entry.label}
                          </span>
                          {entry.note && <span className="block text-xs text-ui-muted mt-0.5">{entry.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-ui-line pt-4">
              <h3 className="text-xs uppercase tracking-wide text-ui-muted mb-2">পণ্যসমূহ</h3>
              <ul className="text-sm space-y-1 mb-3">
                {order.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{it.name} × {it.quantity}</span>
                    <span className="font-mono">{formatMoney(it.totalPrice)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-sm font-semibold text-ui-brand border-t border-ui-line pt-2">
                <span>সর্বমোট</span>
                <span className="font-mono">{formatMoney(order.pricing?.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-ui-muted">
                <span>বাকি</span>
                <span className="font-mono">{formatMoney(order.pricing?.due)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
