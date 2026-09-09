import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Copy, Check, Truck, Smartphone, Zap, ImagePlus, Loader2, Plus, MapPin, Clock,
} from 'lucide-react';
import {
  createOrder, getPoliceStations, uploadPaymentProof, getPaymentMeta, initiateBkashCheckout,
} from '../api/client';
import { formatMoney } from '../utils/format';
import { computeCartAdvance } from '../utils/paymentPolicy';
import { useCart } from '../context/CartContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import SearchableSelect from '../components/SearchableSelect';
import { getSessionId, track } from '../lib/analytics';
import { copyText } from '../lib/clipboard';
import { recordGuestCheckout, getReorderPrefill } from '../lib/guestOrders';
import useFormDraft from '../lib/useFormDraft';
import { BKASH_MERCHANT_NUMBER } from '../utils/company';

const emptyAddress = { name: '', phone: '', zilla: '', thana: '', address: '', comments: '' };
const emptyBkash = { senderNumber: '', transactionId: '', proofFile: null, proofPreview: '' };

export default function Checkout() {
  const navigate = useNavigate();
  const { items, subtotal, deliveryTotal, clearCart } = useCart();
  const { customer, isAuthed, loading: authLoading, refresh } = useCustomerAuth();

  const [districts, setDistricts] = useState([]);
  const [selectedAddrId, setSelectedAddrId] = useState('new');
  // Returning guest → prefill name / phone / last delivery address.
  const [form, setForm] = useState(() => ({ ...emptyAddress, ...getReorderPrefill() }));
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [bkash, setBkash] = useState(emptyBkash);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [redirectingBkash, setRedirectingBkash] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);
  const [bkashAutoOn, setBkashAutoOn] = useState(false);

  const grandTotal = subtotal + deliveryTotal;

  // Autosave the in-progress checkout for guests so a reload / accidental
  // back-navigation doesn't wipe a half-filled form. Restored silently.
  const draft = useMemo(
    () => ({
      form,
      paymentMethod,
      bkash: { senderNumber: bkash.senderNumber, transactionId: bkash.transactionId },
    }),
    [form, paymentMethod, bkash.senderNumber, bkash.transactionId]
  );
  const { clearDraft } = useFormDraft('checkout', draft, (d) => {
    if (d.form) setForm((f) => ({ ...f, ...d.form }));
    if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
    if (d.bkash) setBkash((b) => ({ ...b, ...d.bkash }));
  }, { enabled: !authLoading && !isAuthed });

  // Some products require full or partial advance payment (set per-product by
  // the admin) — this mirrors the server's own calculation just to drive the
  // checkout UI; the server recomputes it from the database and is what
  // actually enforces it (see server/utils/paymentPolicy.js).
  const advanceInfo = useMemo(() => computeCartAdvance(items, deliveryTotal), [items, deliveryTotal]);
  const advanceRequired = advanceInfo.requiredAdvance > 0;

  useEffect(() => {
    getPoliceStations().then(setDistricts).catch(() => setDistricts([]));
    getPaymentMeta().then((m) => setBkashAutoOn(Boolean(m.bkashAutomated)));
  }, []);

  // Whenever the cart contains a product that isn't fully COD-eligible, bKash
  // (manual) is the only way to collect the required advance — steer the
  // selection there automatically instead of letting the customer pick COD
  // and hit a rejection at submit time.
  useEffect(() => {
    if (advanceRequired && paymentMethod === 'cod') setPaymentMethod('bkash_manual');
  }, [advanceRequired, paymentMethod]);

  useEffect(() => {
    track('checkout_started');
  }, []);

  // Preselect the customer's default address.
  useEffect(() => {
    if (isAuthed && customer?.addresses?.length) {
      const def = customer.addresses.find((a) => a.isDefault) || customer.addresses[0];
      setSelectedAddrId(def._id);
    } else {
      setSelectedAddrId('new');
    }
    if (isAuthed && customer?.name) setForm((f) => ({ ...f, name: f.name || customer.name }));
  }, [isAuthed, customer]);

  const thanaOptions = useMemo(() => {
    const d = districts.find((x) => x.name === form.zilla);
    return d ? d.policestations : [];
  }, [districts, form.zilla]);

  // The address actually used for the order — either a saved one or the form.
  const resolvedAddress = useMemo(() => {
    if (isAuthed && selectedAddrId !== 'new') {
      const a = customer?.addresses?.find((x) => x._id === selectedAddrId);
      if (a) {
        return {
          name: a.name || customer.name || '',
          phone: a.phone || customer.phone || '',
          zilla: a.zilla,
          thana: a.policeStation,
          address: a.address,
          comments: form.comments,
        };
      }
    }
    return {
      name: form.name || (isAuthed ? customer?.name : '') || '',
      phone: form.phone || (isAuthed ? customer?.phone : '') || '',
      zilla: form.zilla,
      thana: form.thana,
      address: form.address,
      comments: form.comments,
    };
  }, [isAuthed, selectedAddrId, customer, form]);

  const handleProofChange = (file) => {
    if (!file) return setBkash((b) => ({ ...b, proofFile: null, proofPreview: '' }));
    if (!file.type.startsWith('image/')) return setError('পেমেন্ট প্রমাণ অবশ্যই একটি ছবি হতে হবে।');
    if (file.size > 5 * 1024 * 1024) return setError('স্ক্রিনশটটি 5MB এর বেশি — ছোট আকারের ছবি ব্যবহার করুন।');
    setError('');
    setBkash((b) => ({ ...b, proofFile: file, proofPreview: URL.createObjectURL(file) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (items.length === 0) {
      setError('আপনার কার্ট খালি।');
      return;
    }
    const a = resolvedAddress;
    if (!a.name?.trim() || !a.phone?.trim()) {
      setError('আপনার নাম ও ফোন নম্বর দিন যাতে আমরা যোগাযোগ করতে পারি।');
      return;
    }
    if (!a.address?.trim() || !a.zilla?.trim()) {
      setError('ডেলিভারি অ্যাড্রেস ও জেলা দিন।');
      return;
    }
    if (paymentMethod === 'bkash_manual' && (!bkash.senderNumber.trim() || !bkash.transactionId.trim())) {
      setError('যে বিকাশ নম্বর থেকে পাঠিয়েছেন এবং ট্রানজেকশন আইডি দিন।');
      return;
    }

    setSubmitting(true);

    let proofImageUrl = '';
    try {
      if (paymentMethod === 'bkash_manual' && bkash.proofFile) {
        setUploadingProof(true);
        proofImageUrl = (await uploadPaymentProof(bkash.proofFile)).url;
      }
    } catch (err) {
      setSubmitting(false);
      setUploadingProof(false);
      setError(err.response?.data?.message || 'পেমেন্টের স্ক্রিনশট আপলোড করা যায়নি।');
      return;
    }
    setUploadingProof(false);

    const payload = {
      customer: {
        name: a.name,
        phone: a.phone,
        zilla: a.zilla,
        thana: a.thana,
        address: a.address,
        comments: a.comments || '',
      },
      items: items.map((it) => ({
        product: it.productId || null,
        name: it.name,
        description: it.description,
        unitPrice: Number(it.unitPrice),
        quantity: Number(it.quantity),
        deliveryCharge: Number(it.deliveryCharge) || 0,
      })),
      pricing: { deliveryCharge: deliveryTotal },
      status: 'pending',
      source: 'Website',
      sessionId: getSessionId(),
      paymentMethod,
      paymentDetails:
        paymentMethod === 'bkash_manual'
          ? { senderNumber: bkash.senderNumber, transactionId: bkash.transactionId, proofImageUrl }
          : undefined,
    };

    try {
      const created = await createOrder(payload);

      // Remember this order + address on the device so a guest can find it
      // again from "My orders" and reorder without re-typing.
      if (!isAuthed) recordGuestCheckout(created);
      clearDraft();

      if (paymentMethod === 'bkash_automated') {
        // Order is created as "unverified"; hand off to bKash's hosted page.
        setRedirectingBkash(true);
        try {
          const { redirectURL } = await initiateBkashCheckout(created._id);
          clearCart();
          window.location.href = redirectURL;
          return;
        } catch {
          // Couldn't start bKash — the order still exists; send them to the
          // confirmation/tracking screen where a "retry bKash payment" button
          // is shown.
          setRedirectingBkash(false);
          clearCart();
          if (isAuthed) refresh();
          setConfirmed(created);
          return;
        }
      }

      clearCart();
      if (isAuthed) refresh();
      setConfirmed(created);
    } catch (err) {
      setError(err.response?.data?.message || 'অর্ডার করার সময় সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmed) {
    return <Confirmation order={confirmed} paymentMethod={paymentMethod} isAuthed={isAuthed} advanceInfo={advanceInfo} />;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-ui-muted mb-4">আপনার কার্ট খালি।</p>
        <Link to="/shop" className="btn-primary inline-flex">
          ক্যাটালগ দেখুন
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/shop/cart" className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-brand mb-6">
        <ArrowLeft size={15} /> কার্টে ফিরে যান
      </Link>

      <h1 className="font-display text-2xl sm:text-3xl text-ui-brand mb-1">চেকআউট</h1>
      <p className="text-sm text-ui-muted mb-6">
        {isAuthed
          ? 'ডেলিভারি অ্যাড্রেস ও পেমেন্ট পদ্ধতি কনফার্ম করুন।'
          : 'গেস্ট হিসেবে অর্ডার করুন, অথবা '}
        {!isAuthed && (
          <Link to={`/shop/login?next=${encodeURIComponent('/shop/checkout')}`} className="text-ui-brand underline">
            ফোন নম্বর দিয়ে লগইন করুন
          </Link>
        )}
        {!isAuthed && ' — অর্ডার ট্র্যাক করতে ও তথ্য সেভ করতে।'}
      </p>

      {error && (
        <div className="mb-5 border border-ui-rust/40 bg-ui-rust/10 text-ui-rust text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Items summary */}
        <section className="card p-4 sm:p-5">
          <h2 className="font-display text-lg text-ui-ink mb-3">অর্ডার সারাংশ</h2>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.productId} className="flex justify-between text-sm">
                <span className="text-ui-ink">
                  {it.name} <span className="text-ui-faint">× {it.quantity}</span>
                </span>
                <span className="font-mono">{formatMoney(it.unitPrice * it.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-ui-line space-y-1 font-mono text-sm">
            <div className="flex justify-between text-ui-muted">
              <span>সাবটোটাল</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-ui-muted">
              <span>ডেলিভারি চার্জ</span>
              <span>{formatMoney(deliveryTotal)}</span>
            </div>
            <div className="flex justify-between text-ui-brand font-semibold text-base pt-1">
              <span>গ্র্যান্ড টোটাল</span>
              <span>{formatMoney(grandTotal)}</span>
            </div>
          </div>
        </section>

        {/* Delivery details */}
        <section className="card p-4 sm:p-5">
          <h2 className="font-display text-lg text-ui-ink mb-4">ডেলিভারি তথ্য</h2>

          {isAuthed && customer?.addresses?.length > 0 && (
            <div className="space-y-2 mb-4">
              {customer.addresses.map((a) => (
                <label
                  key={a._id}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${
                    selectedAddrId === a._id ? 'border-ui-brand bg-ui-brand/5' : 'border-ui-line'
                  }`}
                >
                  <input
                    type="radio"
                    name="addr"
                    className="mt-1"
                    checked={selectedAddrId === a._id}
                    onChange={() => setSelectedAddrId(a._id)}
                  />
                  <div className="text-sm">
                    <div className="font-medium text-ui-ink flex items-center gap-1.5">
                      <MapPin size={13} /> {a.label}
                      {a.isDefault && <span className="text-[10px] text-ui-brand">ডিফল্ট</span>}
                    </div>
                    <div className="text-ui-muted font-bangla" dir="auto">
                      {a.address}, {a.policeStation}, {a.zilla}
                    </div>
                  </div>
                </label>
              ))}
              <label
                className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${
                  selectedAddrId === 'new' ? 'border-ui-brand bg-ui-brand/5' : 'border-ui-line'
                }`}
              >
                <input
                  type="radio"
                  name="addr"
                  checked={selectedAddrId === 'new'}
                  onChange={() => setSelectedAddrId('new')}
                />
                <span className="text-sm font-medium text-ui-ink inline-flex items-center gap-1.5">
                  <Plus size={14} /> নতুন অ্যাড্রেস ব্যবহার করুন
                </span>
              </label>
            </div>
          )}

          {(!isAuthed || selectedAddrId === 'new') && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="পূর্ণ নাম" required>
                <input
                  className="input font-bangla"
                  dir="auto"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="আপনার নাম"
                />
              </Field>
              <Field label="ফোন নম্বর" required>
                <input
                  className="input"
                  value={form.phone || (isAuthed ? customer?.phone : '')}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  disabled={isAuthed}
                />
              </Field>
              <Field label="জেলা" required>
                <SearchableSelect
                  placeholder={districts.length ? 'জেলা সিলেক্ট করুন…' : 'লোড হচ্ছে…'}
                  loading={!districts.length}
                  value={form.zilla}
                  onChange={(v) => setForm({ ...form, zilla: v, thana: '' })}
                  options={districts.map((d) => ({ value: d.name, label: d.name }))}
                />
              </Field>
              <Field label="থানা">
                <SearchableSelect
                  placeholder="থানা সিলেক্ট করুন…"
                  disabledHint="প্রথমে জেলা বেছে নিন"
                  disabled={!form.zilla}
                  value={form.thana}
                  onChange={(v) => setForm({ ...form, thana: v })}
                  options={thanaOptions.map((ps) => ({ value: ps.name, label: ps.name }))}
                />
              </Field>
              <Field label="ডেলিভারি অ্যাড্রেস" full>
                <textarea
                  className="input font-bangla"
                  dir="auto"
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="বাসা, রোড, এলাকা…"
                />
              </Field>
            </div>
          )}

          <Field label="কমেন্টস" full className="mt-4">
            <textarea
              className="input font-bangla"
              dir="auto"
              rows={2}
              value={form.comments}
              onChange={(e) => setForm({ ...form, comments: e.target.value })}
              placeholder="আপনার কোনো কিছু বলার থাকলে বলুন"
            />
          </Field>
        </section>

        {/* Payment method */}
        <section className="card p-4 sm:p-5">
          <h2 className="font-display text-lg text-ui-ink mb-4">পেমেন্ট পদ্ধতি</h2>

          {advanceRequired && (
            <p className="mb-4 rounded-xl border border-ui-gold/40 bg-amber-50 text-ui-gold text-sm px-4 py-3">
              আপনার কার্টে এমন প্রোডাক্ট আছে যাতে অগ্রিম পেমেন্ট প্রয়োজন, তাই শুধুমাত্র ক্যাশ অন ডেলিভারিতে অর্ডারটি
              সম্পন্ন করা যাচ্ছে না — বিকাশের মাধ্যমে{' '}
              <span className="font-mono font-medium">{formatMoney(advanceInfo.requiredAdvance)}</span> অগ্রিম
              পাঠাতে হবে।
              {advanceInfo.codRemainder > 0 && (
                <>
                  {' '}
                  বাকি{' '}
                  <span className="font-mono font-medium">{formatMoney(advanceInfo.codRemainder)}</span> ডেলিভারিতে
                  ক্যাশে পরিশোধ করতে পারবেন।
                </>
              )}
            </p>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            <PaymentOption
              icon={Truck}
              label="ক্যাশ অন ডেলিভারি"
              sub="প্রোডাক্ট হাতে পেয়ে পেমেন্ট"
              active={paymentMethod === 'cod'}
              onClick={() => setPaymentMethod('cod')}
              disabled={advanceRequired}
              badge={advanceRequired ? 'অগ্রিম প্রয়োজন' : undefined}
            />
            <PaymentOption
              icon={Smartphone}
              label="বিকাশ — সেন্ড মানি"
              sub="ম্যানুয়াল ট্রান্সফার"
              active={paymentMethod === 'bkash_manual'}
              onClick={() => setPaymentMethod('bkash_manual')}
              accent="bkash"
            />
            <PaymentOption
              icon={Zap}
              label="বিকাশ চেকআউট"
              sub={bkashAutoOn ? 'অনলাইন পেমেন্ট' : 'অনলাইন পেমেন্ট'}
              active={paymentMethod === 'bkash_automated'}
              onClick={() => setPaymentMethod('bkash_automated')}
              disabled={!bkashAutoOn}
              badge={bkashAutoOn ? undefined : 'শীঘ্রই আসছে'}
              accent="bkash"
            />
          </div>

          {paymentMethod === 'bkash_manual' && (
            <BkashPanel grandTotal={grandTotal} advanceInfo={advanceInfo} bkash={bkash} setBkash={setBkash} onProofChange={handleProofChange} />
          )}

          {paymentMethod === 'bkash_automated' && (
            <div className="mt-4 rounded-xl border border-bkash/30 bg-bkash/[0.04] px-4 py-3 text-sm text-ui-ink">
              <span className="font-display italic font-extrabold text-bkash">bKash</span> পেজে গিয়ে{' '}
              <span className="font-mono font-medium">{formatMoney(grandTotal)}</span> পেমেন্ট সম্পন্ন করুন। সফল হলে
              আপনার অর্ডার স্বয়ংক্রিয়ভাবে কনফার্ম হবে।
            </div>
          )}

          {paymentMethod === 'cod' && !advanceRequired && (
            <p className="mt-4 pt-4 border-t border-dashed border-ui-line text-sm text-ui-muted">
              প্রোডাক্ট হাতে পেয়ে ক্যাশে পেমেন্ট করুন। ডেলিভারিতে পরিশোধযোগ্য মোট টাকা:{' '}
              <span className="font-mono font-medium text-ui-ink">{formatMoney(grandTotal)}</span>।
            </p>
          )}
        </section>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base gap-2">
          {uploadingProof ? (
            <>
              <Loader2 size={16} className="animate-spin" /> স্ক্রিনশট আপলোড হচ্ছে…
            </>
          ) : redirectingBkash ? (
            <>
              <Loader2 size={16} className="animate-spin" /> বিকাশে নিয়ে যাওয়া হচ্ছে…
            </>
          ) : submitting ? (
            'অর্ডার হচ্ছে…'
          ) : paymentMethod === 'bkash_automated' ? (
            `বিকাশে পেমেন্ট করুন · ${formatMoney(grandTotal)}`
          ) : (
            `অর্ডার করুন · ${formatMoney(grandTotal)}`
          )}
        </button>
      </form>
    </div>
  );
}

// A copy-to-clipboard button that briefly shows a checkmark + "কপি হয়েছে".
// `valueRef` is the element holding the visible text — used as a fallback
// (select it) when the clipboard API is blocked (http on a phone).
function CopyChip({ value, valueRef }) {
  const [state, setState] = useState('idle'); // 'idle' | 'copied' | 'select'
  const handleCopy = async () => {
    const ok = await copyText(value, valueRef?.current);
    setState(ok ? 'copied' : 'select');
    setTimeout(() => setState('idle'), ok ? 1500 : 2500);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/90 hover:bg-white text-bkash px-2.5 py-1.5 text-xs font-semibold transition-colors"
    >
      {state === 'copied' ? <Check size={13} /> : <Copy size={13} />}
      {state === 'copied' ? 'কপি হয়েছে' : state === 'select' ? 'সিলেক্ট হয়েছে — কপি করুন' : 'কপি করুন'}
    </button>
  );
}

// The bKash manual-transfer instructions, styled in bKash's own brand pink so
// it visually reads as "this section belongs to bKash", separate from the
// site's own green brand.
function BkashPanel({ grandTotal, advanceInfo, bkash, setBkash, onProofChange }) {
  const amountToSend = advanceInfo?.requiredAdvance > 0 ? advanceInfo.requiredAdvance : grandTotal;
  const numRef = useRef(null);
  const amtRef = useRef(null);
  return (
    <div className="mt-4 rounded-2xl overflow-hidden border border-bkash/30">
      <div className="bg-bkash px-4 py-3 flex items-center justify-between">
        <span className="font-display italic font-extrabold text-white text-lg tracking-tight">bKash</span>
        <span className="text-white/90 text-xs font-medium bg-white/15 rounded-full px-2.5 py-1">Send Money</span>
      </div>

      <div className="p-4 sm:p-5 bg-bkash/[0.04] space-y-4">
        <ol className="text-sm text-ui-ink space-y-1.5 list-decimal list-inside">
          <li>আপনার বিকাশ অ্যাপ থেকে <b>Send Money</b> অপশনে যান</li>
          <li>নিচের নম্বরে সঠিক টাকার কোয়ান্টিটি পাঠান</li>
          <li>কনফার্মেশন এসএমএস থেকে ট্রানজেকশন আইডি নিচে লিখুন</li>
        </ol>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-bkash text-white p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-white/70">এই নম্বরে পাঠান</div>
              <div ref={numRef} className="font-mono font-bold text-lg truncate select-all">{BKASH_MERCHANT_NUMBER}</div>
            </div>
            <CopyChip value={BKASH_MERCHANT_NUMBER} valueRef={numRef} />
          </div>
          <div className="rounded-xl bg-bkash-dark text-white p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-white/70">
                {advanceInfo?.requiredAdvance > 0 ? 'অগ্রিম পাঠাতে হবে' : 'টাকার কোয়ান্টিটি'}
              </div>
              <div ref={amtRef} className="font-mono font-bold text-lg truncate select-all">{formatMoney(amountToSend)}</div>
            </div>
            <CopyChip value={String(amountToSend)} valueRef={amtRef} />
          </div>
        </div>

        {advanceInfo?.requiredAdvance > 0 && (
          <p className="text-xs text-ui-muted -mt-1">
            {advanceInfo.codRemainder > 0
              ? `বাকি ${formatMoney(advanceInfo.codRemainder)} ডেলিভারির সময় ক্যাশে পরিশোধ করতে পারবেন।`
              : 'এই অর্ডারের পুরো টাকা অগ্রিম হিসেবে পাঠাতে হবে, ডেলিভারিতে কোনো ক্যাশ নেওয়া হবে না।'}
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="আপনার বিকাশ নম্বর" required>
            <input
              className="input"
              placeholder="01XXXXXXXXX"
              value={bkash.senderNumber}
              onChange={(e) => setBkash({ ...bkash, senderNumber: e.target.value })}
            />
          </Field>
          <Field label="ট্রানজেকশন আইডি" required>
            <input
              className="input font-mono"
              placeholder="যেমন: 8N7A6B5C4D"
              value={bkash.transactionId}
              onChange={(e) => setBkash({ ...bkash, transactionId: e.target.value })}
            />
          </Field>
        </div>

        <div>
          <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">
            পেমেন্টের স্ক্রিনশট (ঐচ্ছিক)
          </span>
          {bkash.proofPreview ? (
            <div className="relative w-24 h-24">
              <img src={bkash.proofPreview} alt="পেমেন্ট প্রমাণ" className="w-full h-full object-cover rounded-xl border border-ui-line" />
              <button type="button" onClick={() => onProofChange(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-ui-line text-ui-rust flex items-center justify-center text-xs shadow-card">
                ✕
              </button>
            </div>
          ) : (
            <label className="w-24 h-24 rounded-xl border-2 border-dashed border-ui-line hover:border-bkash text-ui-faint hover:text-bkash flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors">
              <ImagePlus size={18} />
              <span className="text-[10px]">আপলোড</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onProofChange(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

function Confirmation({ order, paymentMethod, isAuthed, advanceInfo }) {
  const [copied, setCopied] = useState(false);
  const trackingUrl = `${window.location.origin}/track/${order.trackingId}`;

  // The order-done screen replaces the form in place (no route change), so
  // glide back to the top instead of leaving the viewer mid-page.
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, []);

  const urlRef = useRef(null);
  const handleCopy = async () => {
    const ok = await copyText(trackingUrl, urlRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), ok ? 1500 : 2500);
  };

  let paymentSummary = {
    cod: 'ক্যাশ অন ডেলিভারি — প্রোডাক্ট হাতে পেয়ে পেমেন্ট করুন।',
    bkash_manual: 'বিকাশ পেমেন্ট গ্রহণ করা হয়েছে — শীঘ্রই ভেরিফাই করা হবে।',
    bkash_automated: 'বিকাশ পেমেন্ট এখনও সম্পন্ন হয়নি — নিচের ট্র্যাকিং লিংকে গিয়ে "আবার বিকাশে পেমেন্ট করুন" বাটনে চাপ দিন।',
  }[paymentMethod];

  if (paymentMethod === 'bkash_manual' && advanceInfo?.requiredAdvance > 0) {
    paymentSummary =
      advanceInfo.codRemainder > 0
        ? `বিকাশে ${formatMoney(advanceInfo.requiredAdvance)} অগ্রিম পাঠানো হয়েছে, ভেরিফাইয়ের অপেক্ষায় — বাকি ${formatMoney(advanceInfo.codRemainder)} ডেলিভারিতে ক্যাশে দিতে হবে।`
        : `বিকাশে সম্পূর্ণ ${formatMoney(advanceInfo.requiredAdvance)} অগ্রিম পাঠানো হয়েছে, ভেরিফাইয়ের অপেক্ষায় — ডেলিভারিতে আর কোনো টাকা লাগবে না।`;
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ui-brand/10 text-ui-brand mb-5">
          <CheckCircle2 size={30} />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl text-ui-brand mb-2">অর্ডার সম্পন্ন হয়েছে!</h1>
        <p className="text-sm text-ui-muted mb-4">
          ধন্যবাদ, {order.customer?.name?.split(' ')[0] || 'প্রিয় কাস্টমার'} — আপনার অর্ডার পেয়েছি এবং
          কনফার্ম করতে <span className="font-medium text-ui-ink">{order.customer?.phone}</span> নম্বরে
          যোগাযোগ করা হবে।
        </p>
        {!isAuthed && (
          <p className="text-xs bg-ui-brand/10 border border-ui-brand/30 text-ui-brand rounded-lg px-3 py-2 mb-6 font-bangla">
            আপনার জন্য একটি অ্যাকাউন্ট তৈরি করা হয়েছে — লগইন পাসওয়ার্ড{' '}
            <span className="font-medium">{order.customer?.phone}</span> নম্বরে এসএমএসে পাঠানো হয়েছে।
            ফোন ও পাসওয়ার্ড দিয়ে লগইন করে অর্ডার ট্র্যাক করুন।
          </p>
        )}

        <div className="card p-5 text-left mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ui-muted">অর্ডার নম্বর</span>
            <span className="font-mono font-medium">{order.orderNumber}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ui-muted">গ্র্যান্ড টোটাল</span>
            <span className="font-mono font-medium">{formatMoney(order.pricing?.grandTotal)}</span>
          </div>
          {paymentSummary && (
            <div className="flex justify-between text-sm mb-3">
              <span className="text-ui-muted">পেমেন্ট</span>
              <span className="font-medium text-right">{paymentSummary}</span>
            </div>
          )}
          <div className="border-t border-dashed border-ui-line pt-3">
            <div className="text-xs uppercase tracking-wide text-ui-muted mb-1.5">এই অর্ডার ট্র্যাক করুন</div>
            <div className="flex items-center gap-2">
              <code
                ref={urlRef}
                className="flex-1 text-xs font-mono bg-ui-surfaceAlt border border-ui-line rounded-lg px-2.5 py-2 truncate select-all"
              >
                {trackingUrl}
              </code>
              <button type="button" onClick={handleCopy} className="btn-secondary px-2.5 py-2 shrink-0" aria-label="কপি করুন">
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isAuthed ? (
            <Link to="/shop/account/orders" className="btn-primary">
              আমার অর্ডার
            </Link>
          ) : (
            <>
              <Link to={`/track/${order.trackingId}`} className="btn-primary">
                স্ট্যাটাস দেখুন
              </Link>
              <Link to="/shop/my-orders" className="btn-secondary">
                আমার সব অর্ডার
              </Link>
            </>
          )}
          <Link to="/shop" className="btn-secondary">
            কেনাকাটা চালিয়ে যান
          </Link>
        </div>
      </div>
    </div>
  );
}

function PaymentOption({ icon: Icon, label, sub, active, onClick, disabled, badge, accent }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center text-center gap-1.5 rounded-xl border px-3 py-4 transition-colors ${
        disabled
          ? 'border-ui-line opacity-60 cursor-not-allowed'
          : active
          ? accent === 'bkash'
            ? 'border-bkash bg-bkash/5'
            : 'border-ui-brand bg-ui-brand/5'
          : 'border-ui-line hover:border-ui-faint/60'
      }`}
    >
      {badge && (
        <span className="absolute -top-2 right-2 text-[10px] font-medium bg-ui-gold text-white rounded-full px-2 py-0.5 flex items-center gap-1">
          <Clock size={10} /> {badge}
        </span>
      )}
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center ${
          active ? (accent === 'bkash' ? 'bg-bkash text-white' : 'bg-ui-brand text-white') : 'bg-ui-surfaceAlt text-ui-muted'
        }`}
      >
        <Icon size={16} />
      </div>
      <span className="text-sm font-medium text-ui-ink">{label}</span>
      <span className="text-xs text-ui-muted">{sub}</span>
    </button>
  );
}

function Field({ label, required, full, className = '', children }) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''} ${className}`}>
      <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">
        {label} {required && <span className="text-ui-rust">*</span>}
      </span>
      {children}
    </label>
  );
}
