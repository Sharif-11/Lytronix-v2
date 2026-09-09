import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Package, ChevronRight, LogIn, Zap, Loader2 } from 'lucide-react';
import { getGuestOrders, initiateBkashCheckout } from '../api/client';
import { getGuestPhone } from '../lib/guestOrders';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { formatMoney, formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import Loader from '../components/Loader';

// Guest-facing order history. The device only remembers the shopper's phone
// number; this looks that number's orders up on the server. Signed-in
// shoppers are sent to their real account history instead.
export default function GuestOrders() {
  const { isAuthed, loading: authLoading } = useCustomerAuth();
  const [phone] = useState(() => getGuestPhone());
  const [orders, setOrders] = useState(null);
  const [payingId, setPayingId] = useState('');
  const [payErr, setPayErr] = useState('');

  useEffect(() => {
    if (isAuthed || !phone) {
      setOrders([]);
      return;
    }
    let alive = true;
    getGuestOrders(phone)
      .then((d) => alive && setOrders(d.orders || []))
      .catch(() => alive && setOrders([]));
    return () => {
      alive = false;
    };
  }, [isAuthed, phone]);

  const payNow = async (order) => {
    setPayErr('');
    setPayingId(order._id);
    try {
      const { redirectURL } = await initiateBkashCheckout(order._id);
      window.location.href = redirectURL;
    } catch (err) {
      setPayingId('');
      setPayErr(err.response?.data?.message || 'বিকাশ পেমেন্ট শুরু করা যায়নি। কিছুক্ষণ পর চেষ্টা করুন।');
    }
  };

  if (authLoading) return <Loader />;
  if (isAuthed) return <Navigate to="/shop/account/orders" replace />;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl text-ui-brand mb-1">আমার অর্ডার</h1>
        <p className="text-sm text-ui-muted">
          {phone ? `${phone} নম্বরে করা অর্ডার। ` : ''}অন্য ডিভাইসেও দেখতে{' '}
          <Link to="/shop/login" className="text-ui-brand underline">
            লগইন করুন
          </Link>
          ।
        </p>
      </div>

      {payErr && (
        <div className="mb-4 border border-ui-rust/40 bg-ui-rust/10 text-ui-rust text-sm px-4 py-3 rounded-xl">
          {payErr}
        </div>
      )}

      {orders === null ? (
        <Loader />
      ) : !phone || orders.length === 0 ? (
        <div className="card p-10 text-center">
          <Package size={30} className="mx-auto text-ui-faint mb-3" />
          <p className="text-ui-muted mb-4">
            {phone ? 'এই নম্বরে কোনো অর্ডার পাওয়া যায়নি।' : 'এই ডিভাইসে এখনো কোনো অর্ডার নেই।'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/shop" className="btn-primary inline-flex">
              কেনাকাটা শুরু করুন
            </Link>
            <Link to="/shop/login" className="btn-secondary inline-flex">
              <LogIn size={15} /> আগের অ্যাকাউন্টে লগইন
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.trackingId} className="card p-4">
              <Link to={`/track/${o.trackingId}`} className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-xl bg-ui-brand/10 text-ui-brand flex items-center justify-center shrink-0">
                  <Package size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium text-ui-ink">{o.orderNumber || o.trackingId}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-ui-muted mt-0.5 truncate">
                    {o.items?.length ? o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ') : '—'}
                  </div>
                  <div className="text-xs text-ui-faint mt-0.5">
                    {formatDate(o.createdAt)}
                    {o.pricing?.grandTotal != null && ` · ${formatMoney(o.pricing.grandTotal)}`}
                    {o.pricing?.deliveryCharge != null && ` (ডেলিভারি চার্জ ${formatMoney(o.pricing.deliveryCharge)} সহ)`}
                  </div>
                </div>
                <ChevronRight size={16} className="text-ui-faint shrink-0 group-hover:text-ui-brand" />
              </Link>

              {o.canPayOnline && (
                <>
                  {o.pricing?.cashOnAmount > 0 && (
                    <p className="text-xs text-ui-muted mt-2">
                      অনলাইনে {formatMoney(o.onlinePayAmount)} · বাকি {formatMoney(o.pricing.cashOnAmount)} (ডেলিভারি চার্জ{' '}
                      {formatMoney(o.pricing.deliveryCharge)} সহ) ডেলিভারিতে ক্যাশে।
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => payNow(o)}
                    disabled={Boolean(payingId)}
                    className="btn-primary w-full mt-2 py-2.5 gap-2 bg-bkash hover:bg-bkash-dark"
                  >
                    {payingId === o._id ? (
                      <>
                        <Loader2 size={15} className="animate-spin" /> বিকাশে নিয়ে যাওয়া হচ্ছে…
                      </>
                    ) : (
                      <>
                        <Zap size={15} /> পেমেন্ট করুন · {formatMoney(o.onlinePayAmount ?? o.pricing?.due ?? o.pricing?.grandTotal)}
                      </>
                    )}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
