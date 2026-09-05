import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getOrder,
  updateOrder,
  updateOrderStatus,
  addPayment,
  deletePayment,
  deleteOrder,
  getSuggestedStatuses,
  bookSteadfastParcel,
  syncSteadfastStatus,
  getSmsLogs,
  sendOrderMessage,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';
import CourierTracker from '../components/CourierTracker';
import SuggestInput from '../components/SuggestInput';
import { useConfirm } from '../context/ConfirmContext';
import { emitError } from '../lib/errorBus';
import { formatMoney, formatDate } from '../utils/format';
import { Printer, Pencil, Trash2, Copy, ExternalLink, MessageSquare, Send, Loader2 } from 'lucide-react';

const SMS_PURPOSE_LABELS = {
  admin_new_order: 'New order alert (to admin)',
  customer_consignment_booked: 'Shipment notice (to customer)',
  customer_delivered: 'Delivery confirmation (to customer)',
  admin_manual: 'Message from admin',
  other: 'Notification',
};

const SMS_MESSAGE_MAX_LEN = 640;

const emptyPayment = { walletName: '', walletPhoneNo: '', transactionId: '', amount: '', note: '' };

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [order, setOrder] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [courierLink, setCourierLink] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [payment, setPayment] = useState(emptyPayment);
  const [busy, setBusy] = useState(false);
  const [steadfastBusy, setSteadfastBusy] = useState(false);
  const [smsLogs, setSmsLogs] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  const load = () => getOrder(id).then((o) => { setOrder(o); setNewStatus(o.status); setCourierLink(o.courierTrackingLink || ''); });

  useEffect(() => {
    load();
    getSuggestedStatuses().then(setStatuses).catch(() => setStatuses(['unverified', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'returned']));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const refreshSmsLogs = () => {
    if (!order?._id) return;
    getSmsLogs(order._id).then((d) => setSmsLogs(d.logs)).catch(() => {});
  };

  useEffect(() => {
    refreshSmsLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?._id, order?.courier?.consignmentId, order?.status]);

  // Already booked with Steadfast? Pull the latest status from them as soon
  // as the page opens instead of waiting for the admin to hit "Sync" — this
  // only fires once per order load (order._id doesn't change when the sync
  // below updates the order in place), and stays silent on failure since
  // it's a background refresh, not something the admin explicitly asked for.
  useEffect(() => {
    if (!order?._id || !order.courier?.consignmentId) return;
    if (['delivered', 'cancelled', 'returned', 'completed', 'refunded'].includes(order.status)) return;
    handleSyncSteadfast({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?._id]);

  if (!order) return <div className="max-w-5xl mx-auto px-5 py-10 text-ui-muted">Loading…</div>;

  const trackingUrl = `${window.location.origin}/track/${order.trackingId}`;

  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await updateOrderStatus(id, { status: newStatus, note: statusNote, courierTrackingLink: courierLink });
      setOrder(updated);
      setStatusNote('');
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCourierLink = async (e) => {
    e.preventDefault();
    setSavingLink(true);
    try {
      const updated = await updateOrder(id, { courierTrackingLink: courierLink });
      setOrder(updated);
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSavingLink(false);
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!payment.amount) {
      emitError('Payment amount is required.');
      return;
    }
    setBusy(true);
    try {
      const updated = await addPayment(id, { ...payment, amount: Number(payment.amount) });
      setOrder(updated);
      setPayment(emptyPayment);
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!(await confirm('Remove this payment entry?', { danger: true, confirmLabel: 'Remove' }))) return;
    const updated = await deletePayment(id, paymentId);
    setOrder(updated);
  };

  const handleDeleteOrder = async () => {
    if (!(await confirm(`Delete order ${order.orderNumber}? This cannot be undone.`, { danger: true, confirmLabel: 'Delete' }))) return;
    await deleteOrder(id);
    navigate('/orders');
  };

  const copyTrackingLink = () => {
    navigator.clipboard?.writeText(trackingUrl);
  };

  const handleBookSteadfast = async () => {
    setSteadfastBusy(true);
    try {
      const updated = await bookSteadfastParcel(id);
      setOrder(updated);
      setCourierLink(updated.courierTrackingLink || '');
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSteadfastBusy(false);
    }
  };

  const handleSyncSteadfast = async ({ silent } = {}) => {
    setSteadfastBusy(true);
    try {
      const updated = await syncSteadfastStatus(id, silent ? { skipErrorModal: true } : undefined);
      setOrder(updated);
      setNewStatus(updated.status);
    } catch {
      // A silent (auto, on-page-load) sync failing quietly is fine — the
      // admin can still hit "Sync" manually, which does show the modal.
    } finally {
      setSteadfastBusy(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    setSendingMessage(true);
    setMessageSent(false);
    try {
      await sendOrderMessage(id, messageText.trim());
      setMessageText('');
      setMessageSent(true);
      refreshSmsLogs();
      setTimeout(() => setMessageSent(false), 3000);
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ui-brand break-all">{order.orderNumber}</h1>
          <p className="text-xs font-mono text-ui-muted mt-1">Logged {formatDate(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <a href={`/orders/${id}/print`} target="_blank" rel="noreferrer" className="btn-secondary flex-1 sm:flex-none justify-center gap-1.5">
          <Printer size={15} /> Print slip
        </a>
        <Link to={`/orders/${id}/edit`} className="btn-secondary flex-1 sm:flex-none justify-center gap-1.5">
          <Pencil size={15} /> Edit
        </Link>
        <button onClick={handleDeleteOrder} className="btn-secondary flex-1 sm:flex-none justify-center gap-1.5 text-ui-rust">
          <Trash2 size={15} /> Delete
        </button>
      </div>

      {/* Tracking link */}
      <section className="bg-ui-brand text-white rounded-xl shadow-card p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-white/70">Public tracking link</div>
          <div className="font-mono text-sm break-all">{trackingUrl}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={copyTrackingLink} className="bg-white/15 hover:bg-white/25 transition-colors rounded-xl px-3 py-1.5 text-xs flex items-center gap-1.5">
            <Copy size={13} /> Copy link
          </button>
          <a href={`/track/${order.trackingId}`} target="_blank" rel="noreferrer" className="bg-white/15 hover:bg-white/25 transition-colors rounded-xl px-3 py-1.5 text-xs flex items-center gap-1.5">
            <ExternalLink size={13} /> Open
          </a>
        </div>
      </section>

      <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
        <div className="md:col-span-2 space-y-5 sm:space-y-6">
          {/* Customer */}
          <section className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
            <h2 className="font-display text-lg text-ui-ink mb-3">Customer</h2>
            <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label="Name" value={order.customer.name} />
              <Row label="Phone" value={order.customer.phone} mono />
              <Row label="Zilla" value={order.customer.zilla || '—'} />
              <Row label="Thana" value={order.customer.thana || '—'} />
              <Row label="Address" value={order.customer.address || '—'} full />
              <Row label="Comments" value={order.customer.comments || '—'} full />
            </dl>
          </section>

          {/* Items */}
          <section className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
            <h2 className="font-display text-lg text-ui-ink mb-3">Products</h2>

            {/* Mobile: stacked cards */}
            <div className="sm:hidden space-y-3">
              {order.items.map((it, idx) => (
                <div key={idx} className="border border-ui-line rounded-xl p-3 text-sm">
                  <div className="font-medium mb-1">{it.name}</div>
                  <div className="flex justify-between text-ui-muted"><span>{it.quantity} × {formatMoney(it.unitPrice)}</span><span className="font-mono">{formatMoney(it.totalPrice)}</span></div>
                  {it.discount > 0 && <div className="flex justify-between text-ui-muted"><span>Discount</span><span className="font-mono">-{formatMoney(it.discount)}</span></div>}
                </div>
              ))}
            </div>

            {/* Tablet+: table */}
            <table className="hidden sm:table w-full text-sm">
              <thead>
                <tr className="text-left text-ui-muted border-b border-ui-line">
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 font-medium text-right">Unit price</th>
                  <th className="py-2 font-medium text-right">Qty</th>
                  <th className="py-2 font-medium text-right">Discount</th>
                  <th className="py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, idx) => (
                  <tr key={idx} className="border-b border-ui-line/60">
                    <td className="py-2">{it.name}</td>
                    <td className="py-2 text-right font-mono">{formatMoney(it.unitPrice)}</td>
                    <td className="py-2 text-right font-mono">{it.quantity}</td>
                    <td className="py-2 text-right font-mono">{formatMoney(it.discount)}</td>
                    <td className="py-2 text-right font-mono">{formatMoney(it.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 sm:ml-auto max-w-xs space-y-1 text-sm font-mono">
              <SummaryRow label="Subtotal" value={order.pricing.subtotal} />
              <SummaryRow label="Discount" value={-order.pricing.discount} />
              <SummaryRow label="Delivery" value={order.pricing.deliveryCharge} />
              <SummaryRow label="Grand total" value={order.pricing.grandTotal} strong />
              <SummaryRow label="Advance paid" value={-order.pricing.advancePaid} />
              <SummaryRow label="Cash on amount" value={order.pricing.cashOnAmount} />
              <SummaryRow label="Due" value={order.pricing.due} strong />
            </div>
          </section>

          {/* Payments */}
          <section className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
            <h2 className="font-display text-lg text-ui-ink mb-3">Payments</h2>
            {order.payments.length === 0 ? (
              <p className="text-sm text-ui-muted italic mb-4">No payments logged yet.</p>
            ) : (
              <>
                {/* Mobile: stacked cards */}
                <div className="sm:hidden space-y-3 mb-4">
                  {order.payments.map((p) => (
                    <div key={p._id} className="border border-ui-line rounded-xl p-3 text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium">{p.walletName || 'Payment'}</span>
                        <span className="font-mono">{formatMoney(p.amount)}</span>
                      </div>
                      {p.walletPhoneNo && <div className="text-ui-muted font-mono text-xs">{p.walletPhoneNo}</div>}
                      {p.transactionId && <div className="text-ui-muted font-mono text-xs">TXN: {p.transactionId}</div>}
                      <div className="text-ui-muted text-xs mt-1">{formatDate(p.time)}</div>
                      <button onClick={() => handleDeletePayment(p._id)} className="text-ui-rust text-xs hover:underline mt-1">Remove</button>
                    </div>
                  ))}
                </div>

                {/* Tablet+: table */}
                <table className="hidden sm:table w-full text-sm mb-4">
                  <thead>
                    <tr className="text-left text-ui-muted border-b border-ui-line">
                      <th className="py-2 font-medium">Wallet</th>
                      <th className="py-2 font-medium">Wallet phone</th>
                      <th className="py-2 font-medium">Transaction ID</th>
                      <th className="py-2 font-medium text-right">Amount</th>
                      <th className="py-2 font-medium">Time</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.payments.map((p) => (
                      <tr key={p._id} className="border-b border-ui-line/60">
                        <td className="py-2">{p.walletName || '—'}</td>
                        <td className="py-2 font-mono">{p.walletPhoneNo || '—'}</td>
                        <td className="py-2 font-mono">{p.transactionId || '—'}</td>
                        <td className="py-2 text-right font-mono">{formatMoney(p.amount)}</td>
                        <td className="py-2 text-ui-muted">{formatDate(p.time)}</td>
                        <td className="py-2"><button onClick={() => handleDeletePayment(p._id)} className="text-ui-rust text-xs hover:underline">Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <form onSubmit={handleAddPayment} className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              <input className="input" placeholder="Wallet name (bKash, Nagad…)" value={payment.walletName} onChange={(e) => setPayment({ ...payment, walletName: e.target.value })} />
              <input className="input" placeholder="Wallet phone no." value={payment.walletPhoneNo} onChange={(e) => setPayment({ ...payment, walletPhoneNo: e.target.value })} />
              <input className="input" placeholder="Transaction ID" value={payment.transactionId} onChange={(e) => setPayment({ ...payment, transactionId: e.target.value })} />
              <input type="number" min="0" className="input" placeholder="Amount" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
              <input className="input md:col-span-2" placeholder="Note (optional)" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} />
              <button disabled={busy} className="btn-primary sm:col-span-2 md:col-span-3">Log payment</button>
            </form>
          </section>
        </div>

        <div className="space-y-5 sm:space-y-6">
          {/* Status update */}
          <section className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
            <h2 className="font-display text-lg text-ui-ink mb-3">Update status</h2>
            <form onSubmit={handleStatusUpdate} className="space-y-3">
              <SuggestInput value={newStatus} onChange={setNewStatus} suggestions={statuses} placeholder="e.g. pending" />
              <textarea className="input" rows={2} placeholder="Note (optional)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
              {newStatus.trim().toLowerCase() === 'shipped' && !courierLink && (
                <p className="text-xs text-ui-rust">
                  Add a courier tracking link below before you can mark this as shipped.
                </p>
              )}
              <button disabled={busy} className="btn-primary w-full">Update status</button>
            </form>
          </section>

          {/* Courier tracker */}
          <CourierTracker order={order} onBook={handleBookSteadfast} onSync={handleSyncSteadfast} busy={steadfastBusy} />

          {/* SMS notifications */}
          <section className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
            <h2 className="font-display text-lg text-ui-ink mb-1 flex items-center gap-2">
              <MessageSquare size={18} className="text-ui-brand" /> SMS notifications
            </h2>

            <form onSubmit={handleSendMessage} className="mt-2 mb-3 pb-3 border-b border-dashed border-ui-line space-y-2">
              <textarea
                className="input text-sm"
                rows={2}
                maxLength={SMS_MESSAGE_MAX_LEN}
                placeholder={`Message ${order.customer?.phone || 'the customer'} directly…`}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-ui-faint font-mono">{messageText.length}/{SMS_MESSAGE_MAX_LEN}</span>
                <div className="flex items-center gap-2">
                  {messageSent && <span className="text-xs text-ui-brand">Sent ✓</span>}
                  <button
                    disabled={sendingMessage || !messageText.trim()}
                    className="btn-secondary text-xs gap-1.5 py-1.5"
                  >
                    {sendingMessage ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Send SMS
                  </button>
                </div>
              </div>
            </form>

            {smsLogs.length === 0 ? (
              <p className="text-xs text-ui-muted mt-2">No SMS sent for this order yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {smsLogs.map((log) => (
                  <li key={log._id} className="text-sm border-b border-dashed border-ui-line last:border-b-0 pb-2.5 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ui-ink">{SMS_PURPOSE_LABELS[log.purpose] || log.purpose}</span>
                      <span
                        className={`chip text-[11px] ${
                          log.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-ui-rust border-red-200'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <p className="text-xs text-ui-muted mt-0.5">To {log.to} · {formatDate(log.createdAt)}</p>
                    {log.status === 'failed' && log.error && (
                      <p className="text-xs text-ui-rust mt-0.5">{log.error}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Courier tracking link */}
          <section className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
            <h2 className="font-display text-lg text-ui-ink mb-1">Courier tracking link</h2>
            <p className="text-xs text-ui-muted mb-3">The consignment link from the courier company, once you've booked the parcel. Required before shipping.</p>
            <form onSubmit={handleSaveCourierLink} className="space-y-2">
              <input
                className="input"
                placeholder="https://courier.example.com/track/..."
                value={courierLink}
                onChange={(e) => setCourierLink(e.target.value)}
              />
              <button disabled={savingLink} className="btn-secondary w-full">{savingLink ? 'Saving…' : 'Save tracking link'}</button>
            </form>
            {order.courierTrackingLink && (
              <a href={order.courierTrackingLink} target="_blank" rel="noreferrer" className="block mt-2 text-xs text-ui-brand underline underline-offset-4 break-all">
                {order.courierTrackingLink}
              </a>
            )}
          </section>

          {/* History */}
          <section className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
            <h2 className="font-display text-lg text-ui-ink mb-3">Status history</h2>
            <ol className="space-y-3">
              {[...order.statusHistory].reverse().map((h, idx) => (
                <li key={idx} className="border-l-2 border-ui-brand/40 pl-3">
                  <div className="text-sm font-medium capitalize">{h.status}</div>
                  {h.note && <div className="text-xs text-ui-muted">{h.note}</div>}
                  <div className="text-xs font-mono text-ui-muted">{formatDate(h.at)}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, full, mono }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs uppercase tracking-wide text-ui-muted">{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value}</dd>
    </div>
  );
}

function SummaryRow({ label, value, strong }) {
  return (
    <div className={`flex justify-between ${strong ? 'text-ui-brand font-semibold text-base pt-1 border-t border-ui-line' : 'text-ui-ink'}`}>
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}
