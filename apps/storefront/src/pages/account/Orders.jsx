import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Package, MapPin } from 'lucide-react';
import { getMyOrders, getMyOrder } from '../../api/client';
import {
  formatMoney, formatDate, formatTime, statusStyle, statusLabel, paymentMethodLabel, paymentStatusLabel,
  mergeTrackingTimeline, groupTimelineByDate,
} from '../../utils/format';

export default function Orders() {
  const { id } = useParams();
  return id ? <OrderDetail id={id} /> : <OrderList />;
}

function OrderList() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    getMyOrders().then((d) => setOrders(d.orders)).catch(() => setOrders([]));
  }, []);

  if (orders === null) return <p className="text-sm text-ui-muted">লোড হচ্ছে…</p>;

  if (orders.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Package size={30} className="mx-auto text-ui-faint mb-3" />
        <p className="text-ui-muted mb-4">আপনি এখনো কোনো অর্ডার করেননি।</p>
        <Link to="/shop" className="btn-primary inline-flex">
          কেনাকাটা শুরু করুন
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-ui-ink">আপনার অর্ডার</h2>
      {orders.map((o) => (
        <Link
          key={o._id}
          to={`/shop/account/orders/${o._id}`}
          className="card p-4 flex items-center justify-between gap-3 hover:shadow-raised transition-shadow"
        >
          <div className="min-w-0">
            <div className="font-mono text-sm font-medium text-ui-ink">{o.orderNumber}</div>
            <div className="text-xs text-ui-muted">
              {formatDate(o.createdAt)} · {o.items.length}টি প্রোডাক্ট
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-medium">{formatMoney(o.pricing?.grandTotal)}</div>
            <span className={`chip mt-1 ${statusStyle(o.status)}`}>{statusLabel(o.status)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function OrderDetail({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyOrder(id)
      .then(setData)
      .catch(() => setError('অর্ডারটি খুঁজে পাওয়া যায়নি।'));
  }, [id]);

  if (error) {
    return (
      <div>
        <BackLink />
        <p className="text-sm text-ui-muted mt-4">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-ui-muted">লোড হচ্ছে…</p>;

  const { order, payments } = data;

  return (
    <div className="space-y-5">
      <BackLink />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-ui-ink">{order.orderNumber}</h2>
        <span className={`chip ${statusStyle(order.status)}`}>{statusLabel(order.status)}</span>
      </div>

      <div className="card p-4 sm:p-5">
        <h3 className="text-xs uppercase tracking-wide text-ui-muted mb-2">প্রোডাক্টসমূহ</h3>
        <ul className="text-sm space-y-1">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between">
              <span>
                {it.name} <span className="text-ui-faint">× {it.quantity}</span>
              </span>
              <span className="font-mono">{formatMoney(it.totalPrice)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-ui-line space-y-1 font-mono text-sm">
          <div className="flex justify-between text-ui-muted">
            <span>সাবটোটাল</span>
            <span>{formatMoney(order.pricing?.subtotal)}</span>
          </div>
          <div className="flex justify-between text-ui-muted">
            <span>ডেলিভারি চার্জ</span>
            <span>{formatMoney(order.pricing?.deliveryCharge)}</span>
          </div>
          {order.pricing?.discount > 0 && (
            <div className="flex justify-between text-ui-muted">
              <span>ডিসকাউন্ট</span>
              <span>−{formatMoney(order.pricing.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-ui-brand font-semibold pt-1">
            <span>গ্র্যান্ড টোটাল</span>
            <span>{formatMoney(order.pricing?.grandTotal)}</span>
          </div>
          <div className="flex justify-between text-ui-muted">
            <span>বাকি</span>
            <span>{formatMoney(order.pricing?.due)}</span>
          </div>
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <h3 className="text-xs uppercase tracking-wide text-ui-muted mb-3">পার্সেলটি এখন কোথায়</h3>
        {order.courier?.trackingCode && (
          <p className="text-xs font-mono text-ui-muted mb-3">
            কুরিয়ার ট্র্যাকিং কোড: <span className="text-ui-ink">{order.courier.trackingCode}</span>
          </p>
        )}
        <div className="space-y-4">
          {groupTimelineByDate(mergeTrackingTimeline(order)).map((group) => (
            <div key={group.dateLabel}>
              <div className="text-xs font-semibold text-ui-ink mb-2">{group.dateLabel}</div>
              <ul className="space-y-2.5">
                {group.entries.map((entry, i) => (
                  <li key={i} className="flex gap-3">
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
        {order.courierTrackingLink && (
          <a
            href={order.courierTrackingLink}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary mt-4 py-2"
          >
            কুরিয়ারে ট্র্যাক করুন
          </a>
        )}
      </div>

      {payments.length > 0 && (
        <div className="card p-4 sm:p-5">
          <h3 className="text-xs uppercase tracking-wide text-ui-muted mb-3">পেমেন্ট</h3>
          <ul className="text-sm space-y-2">
            {payments.map((p) => (
              <li key={p._id} className="flex justify-between items-center">
                <span>{paymentMethodLabel(p.method)}</span>
                <span className="font-mono">{formatMoney(p.amount)}</span>
                <span className={`chip ${statusStyle(p.status)}`}>{paymentStatusLabel(p.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/shop/account/orders"
      className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-brand"
    >
      <ArrowLeft size={15} /> সব অর্ডার
    </Link>
  );
}
