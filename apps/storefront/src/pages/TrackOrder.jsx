import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MapPin, Package, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { trackOrder, initiateBkashCheckout } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import Loader from '../components/Loader';
import { formatMoney, formatTime, mergeTrackingTimeline, groupTimelineByDate } from '../utils/format';
import usePageTitle from '../lib/usePageTitle';

const BKASH_RESULT = {
  success: { ok: true, text: 'বিকাশ পেমেন্ট সফল হয়েছে — আপনার অর্ডার কনফার্ম হয়েছে।' },
  failed: { ok: false, text: 'বিকাশ পেমেন্ট সম্পন্ন হয়নি। আবার চেষ্টা করুন অথবা ক্যাশ অন ডেলিভারিতে অর্ডারটি রাখুন।' },
  cancelled: { ok: false, text: 'বিকাশ পেমেন্ট বাতিল করা হয়েছে। অর্ডারটি এখনও পেমেন্টের অপেক্ষায় আছে।' },
  error: { ok: false, text: 'বিকাশ পেমেন্ট যাচাই করা যায়নি। কিছুক্ষণ পর স্ট্যাটাস দেখুন বা আমাদের সাথে যোগাযোগ করুন।' },
};

export default function TrackOrder() {
  const { trackingId } = useParams();
  const [params] = useSearchParams();
  const bkash = BKASH_RESULT[params.get('bkash')];
  const [order, setOrder] = useState(null);
  usePageTitle(order?.orderNumber ? `অর্ডার ${order.orderNumber}` : 'অর্ডার ট্র্যাক করুন');
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState('');

  useEffect(() => {
    trackOrder(trackingId)
      .then(setOrder)
      .catch(() => setError('এই ট্র্যাকিং আইডি দিয়ে কোনো অর্ডার খুঁজে পাওয়া যায়নি।'));
  }, [trackingId]);

  const payNow = async () => {
    if (!order?._id) return;
    setPaying(true);
    setPayErr('');
    try {
      const { redirectURL } = await initiateBkashCheckout(order._id);
      window.location.href = redirectURL;
    } catch (err) {
      setPaying(false);
      setPayErr(err.response?.data?.message || 'বিকাশ পেমেন্ট শুরু করা যায়নি। কিছুক্ষণ পর চেষ্টা করুন।');
    }
  };

  return (
    <div className="min-h-[70vh] flex items-start justify-center px-4 sm:px-5 py-8 sm:py-14">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-[0.2em] text-ui-muted">আপনার অর্ডার ট্র্যাক করুন</div>
          <div className="font-mono text-sm text-ui-muted mt-1">{trackingId}</div>
        </div>

        {bkash && (
          <div
            className={`flex items-start gap-2.5 border text-sm px-4 py-3 rounded-xl mb-5 ${
              bkash.ok
                ? 'border-ui-brand/30 bg-ui-brand/10 text-ui-brand'
                : 'border-ui-gold/40 bg-amber-50 text-ui-gold'
            }`}
          >
            {bkash.ok ? (
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            ) : (
              <XCircle size={16} className="shrink-0 mt-0.5" />
            )}
            <span className="leading-snug">{bkash.text}</span>
          </div>
        )}

        {error && (
          <div className="border border-ui-rust/40 bg-ui-rust/10 text-ui-rust text-sm px-4 py-3 rounded-xl text-center">
            {error}
          </div>
        )}

        {!order && !error && <Loader />}

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
              <h3 className="text-xs uppercase tracking-wide text-ui-muted mb-2">প্রোডাক্টসমূহ</h3>
              <ul className="text-sm space-y-1 mb-3">
                {order.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{it.name} × {it.quantity}</span>
                    <span className="font-mono">{formatMoney(it.totalPrice)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-sm text-ui-muted">
                <span>ডেলিভারি চার্জ</span>
                <span className="font-mono">{formatMoney(order.pricing?.deliveryCharge)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-ui-brand border-t border-ui-line pt-2">
                <span>গ্র্যান্ড টোটাল (ডেলিভারি চার্জ সহ)</span>
                <span className="font-mono">{formatMoney(order.pricing?.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-ui-muted">
                <span>বাকি</span>
                <span className="font-mono">{formatMoney(order.pricing?.due)}</span>
              </div>
            </div>

            {order.canPayOnline && (
              <div className="mt-4 rounded-xl border border-bkash/30 bg-bkash/[0.04] p-4">
                <p className="text-sm text-ui-ink leading-snug">
                  অনলাইনে <span className="font-mono font-medium">{formatMoney(order.onlinePayAmount)}</span> পেমেন্ট বাকি —{' '}
                  <span className="font-display italic font-extrabold text-bkash">bKash</span>-এ সম্পন্ন করুন।
                </p>
                {order.pricing?.cashOnAmount > 0 && (
                  <p className="text-xs text-ui-muted mt-1">
                    বাকি <span className="font-mono">{formatMoney(order.pricing.cashOnAmount)}</span> (ডেলিভারি চার্জ{' '}
                    <span className="font-mono">{formatMoney(order.pricing.deliveryCharge)}</span> সহ) ডেলিভারিতে ক্যাশে দিতে হবে।
                  </p>
                )}
                {payErr && <p className="text-xs text-ui-rust mt-2">{payErr}</p>}
                <button
                  type="button"
                  onClick={payNow}
                  disabled={paying}
                  className="btn-primary w-full mt-3 py-2.5 gap-2 bg-bkash hover:bg-bkash-dark"
                >
                  {paying ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> বিকাশে নিয়ে যাওয়া হচ্ছে…
                    </>
                  ) : (
                    <>
                      <Zap size={15} /> বিকাশে পেমেন্ট করুন · {formatMoney(order.onlinePayAmount ?? order.pricing?.due ?? order.pricing?.grandTotal)}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
