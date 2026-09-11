import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ShieldCheck, Truck, Timer, CheckCircle2, Copy, Check, Minus, Plus,
  Smartphone, ImagePlus, Loader2, ArrowLeft, Zap, ShoppingBag,
} from 'lucide-react';
import {
  getProduct, getPoliceStations, createOrder, uploadPaymentProof, recordProductView,
  getPaymentMeta, initiateBkashCheckout,
} from '../api/client';
import { formatMoney } from '../utils/format';
import { computeCartAdvance } from '../utils/paymentPolicy';
import SearchableSelect from '../components/SearchableSelect';
import ProductGallery from '../components/ProductGallery';
import ChatWidget from '../components/ChatWidget';
import RichText from '../components/RichText';
import Loader from '../components/Loader';
import { recordGuestCheckout, getReorderPrefill } from '../lib/guestOrders';
import useFormDraft from '../lib/useFormDraft';
import { getSessionId, track } from '../lib/analytics';
import { copyText } from '../lib/clipboard';
import { COMPANY_NAME, COMPANY_PHONE, COMPANY_EMAIL, BKASH_MERCHANT_NUMBER } from '../utils/company';
import logoMark from '../assets/lytronix-logo.png';
import usePageTitle from '../lib/usePageTitle';

const emptyForm = { name: '', phone: '', zilla: '', thana: '', address: '', comments: '' };
const emptyBkash = { senderNumber: '', transactionId: '', proofFile: null, proofPreview: '' };

// Absolute base for shareable links (tracking URL on the confirmation screen).
// Set VITE_PUBLIC_URL to a LAN/public address so the link works off this
// machine; otherwise mirror whatever origin the page was opened on.
const PUBLIC_BASE = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '');

export default function ProductLanding() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | notfound

  const [districts, setDistricts] = useState([]);
  const [qty, setQty] = useState(1);
  // Returning guest → prefill name / phone / last delivery address.
  const [form, setForm] = useState(() => ({ ...emptyForm, ...getReorderPrefill() }));
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [bkashAutoOn, setBkashAutoOn] = useState(false);
  const [redirectingBkash, setRedirectingBkash] = useState(false);
  const [bkash, setBkash] = useState(emptyBkash);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);
  usePageTitle(confirmed ? 'অর্ডার সম্পন্ন হয়েছে' : product?.name || 'প্রোডাক্ট');
  const formRef = useRef(null);
  const nameInputRef = useRef(null);
  const submitBtnRef = useRef(null);
  // A Facebook ad click usually lands on mobile, where the order form sits
  // well below the fold (gallery, then title/price, then the description,
  // then this). A sticky bottom bar keeps "order now" reachable at all
  // times, and hides itself once the real submit button is already visible
  // so it never sits redundantly on top of it.
  const [showFloatingCta, setShowFloatingCta] = useState(true);

  // Autosave the in-progress order form (guest-only page) so a reload doesn't
  // wipe a half-filled form. Restored silently. Address is shared across
  // products, so the draft key isn't per-slug.
  const draft = useMemo(
    () => ({
      form,
      paymentMethod,
      bkash: { senderNumber: bkash.senderNumber, transactionId: bkash.transactionId },
    }),
    [form, paymentMethod, bkash.senderNumber, bkash.transactionId]
  );
  const { clearDraft } = useFormDraft('p-order', draft, (d) => {
    if (d.form) setForm((f) => ({ ...f, ...d.form }));
    if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
    if (d.bkash) setBkash((b) => ({ ...b, ...d.bkash }));
  });

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getProduct(slug)
      .then((p) => {
        if (!alive) return;
        if (!p || p.isActive === false) {
          setStatus('notfound');
          return;
        }
        setProduct(p);
        setStatus('ok');
        recordProductView(p._id, { sessionId: getSessionId() });
      })
      .catch(() => alive && setStatus('notfound'));
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    getPoliceStations().then(setDistricts).catch(() => setDistricts([]));
    getPaymentMeta().then((m) => setBkashAutoOn(Boolean(m.bkashAutomated)));
  }, []);

  // Hide the floating "order now" bar once the real submit button scrolls
  // into view — no need for a duplicate CTA once the actual one is visible.
  useEffect(() => {
    if (status !== 'ok' || !submitBtnRef.current) return undefined;
    const obs = new IntersectionObserver(([entry]) => setShowFloatingCta(!entry.isIntersecting), {
      rootMargin: '0px 0px -10% 0px',
    });
    obs.observe(submitBtnRef.current);
    return () => obs.disconnect();
  }, [status]);

  const scrollToOrderForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => nameInputRef.current?.focus(), 450);
  };

  const unitPrice = product?.price || 0;
  const perUnitDelivery = product?.deliveryCharge || 0;
  const stockCapped = product?.trackInventory ? Math.max(0, product.stock || 0) : Infinity;
  const outOfStock = product ? product.trackInventory && (product.stock || 0) <= 0 : false;

  const itemsForPolicy = useMemo(
    () => [{ unitPrice, quantity: qty, paymentPolicy: product?.paymentPolicy }],
    [unitPrice, qty, product]
  );
  const deliveryTotal = perUnitDelivery * qty;
  const advanceInfo = useMemo(
    () => computeCartAdvance(itemsForPolicy, deliveryTotal),
    [itemsForPolicy, deliveryTotal]
  );
  const advanceRequired = advanceInfo.requiredAdvance > 0;
  const grandTotal = unitPrice * qty + deliveryTotal;

  useEffect(() => {
    if (advanceRequired && paymentMethod === 'cod') setPaymentMethod('bkash_manual');
  }, [advanceRequired, paymentMethod]);

  const thanaOptions = useMemo(() => {
    const d = districts.find((x) => x.name === form.zilla);
    return d ? d.policestations : [];
  }, [districts, form.zilla]);

  const setQtySafe = (n) => setQty(Math.max(1, Math.min(stockCapped, n)));

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

    if (outOfStock) return setError('দুঃখিত, প্রোডাক্টটি এখন স্টকে নেই।');
    if (!form.name.trim() || !form.phone.trim()) {
      return setError('আপনার নাম ও ফোন নম্বর দিন যাতে আমরা যোগাযোগ করতে পারি।');
    }
    if (!/^01\d{9}$/.test(form.phone.replace(/\D/g, ''))) {
      return setError('সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)।');
    }
    if (!form.address.trim() || !form.zilla.trim()) {
      return setError('ডেলিভারি অ্যাড্রেস ও জেলা দিন।');
    }
    if (paymentMethod === 'bkash_manual' && (!bkash.senderNumber.trim() || !bkash.transactionId.trim())) {
      return setError('যে বিকাশ নম্বর থেকে পাঠিয়েছেন এবং ট্রানজেকশন আইডি দিন।');
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
        name: form.name,
        phone: form.phone,
        zilla: form.zilla,
        thana: form.thana,
        address: form.address,
        comments: form.comments || '',
      },
      items: [
        {
          product: product._id,
          name: product.name,
          description: product.description || '',
          unitPrice,
          quantity: qty,
          deliveryCharge: perUnitDelivery,
        },
      ],
      pricing: { deliveryCharge: deliveryTotal },
      status: 'pending',
      source: 'Product Link',
      sessionId: getSessionId(),
      paymentMethod,
      paymentDetails:
        paymentMethod === 'bkash_manual'
          ? { senderNumber: bkash.senderNumber, transactionId: bkash.transactionId, proofImageUrl }
          : undefined,
    };

    try {
      track('checkout_started', { via: 'product_link', productId: product._id });
      const created = await createOrder(payload);

      // Device-side memory so a returning guest finds this order + reuses the address.
      recordGuestCheckout(created);
      clearDraft();

      if (paymentMethod === 'bkash_automated') {
        setRedirectingBkash(true);
        try {
          const { redirectURL } = await initiateBkashCheckout(created._id);
          window.location.href = redirectURL;
          return;
        } catch {
          // bKash didn't start — fall through to the confirmation screen; the
          // tracking page has a "retry bKash payment" button.
          setRedirectingBkash(false);
        }
      }

      setConfirmed(created);
    } catch (err) {
      setError(err.response?.data?.message || 'অর্ডার করার সময় সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <Shell>
        <Loader className="py-32" />
      </Shell>
    );
  }

  if (status === 'notfound') {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-24 px-4">
          <p className="text-ui-muted mb-4">প্রোডাক্টটি খুঁজে পাওয়া যায়নি বা এখন আর অ্যাভেইলেবল নেই।</p>
          <Link to="/shop" className="btn-primary inline-flex">সব প্রোডাক্ট দেখুন</Link>
        </div>
      </Shell>
    );
  }

  if (confirmed) {
    return (
      <Shell>
        <Confirmation order={confirmed} paymentMethod={paymentMethod} advanceInfo={advanceInfo} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-10 pb-24 sm:pb-10 overflow-x-clip">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
          {/* Gallery */}
          <div className="md:sticky md:top-6 self-start min-w-0">
            <ProductGallery images={product.images} videos={product.videos} name={product.name} />
          </div>

          {/* Details + order */}
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl md:text-3xl text-ui-brand leading-tight">{product.name}</h1>

            <div className="mt-3 flex items-baseline gap-2.5 flex-wrap">
              <span className="font-mono text-2xl sm:text-3xl font-semibold text-ui-ink">
                {formatMoney(unitPrice)}
              </span>
              {perUnitDelivery > 0 ? (
                <span className="text-sm text-ui-muted">+ {formatMoney(perUnitDelivery)} ডেলিভারি চার্জ</span>
              ) : (
                <span className="text-sm text-ui-brand font-medium">ফ্রি ডেলিভারি</span>
              )}
            </div>

            {outOfStock ? (
              <p className="mt-3 inline-flex rounded-full bg-ui-rust/10 text-ui-rust text-xs font-medium px-3 py-1">
                স্টকে নেই
              </p>
            ) : product.trackInventory && product.stock <= (product.lowStockThreshold || 5) ? (
              <p className="mt-3 inline-flex rounded-full bg-ui-gold/15 text-ui-gold text-xs font-medium px-3 py-1">
                মাত্র {product.stock}টি বাকি
              </p>
            ) : null}

            <RichText html={product.description} className="mt-4 text-sm" />

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <Trust icon={ShieldCheck} label="অরিজিনাল প্রোডাক্ট" />
              <Trust icon={Truck} label="ক্যাশ অন ডেলিভারি" />
              <Trust icon={Timer} label="দ্রুত ডেলিভারি" />
            </div>

            {/* Order form */}
            <form ref={formRef} onSubmit={handleSubmit} className="mt-7 card p-4 sm:p-5 space-y-5">
              <h2 className="font-display text-lg text-ui-ink">অর্ডার করুন</h2>

              {error && (
                <div className="border border-ui-rust/40 bg-ui-rust/10 text-ui-rust text-sm px-3.5 py-3 rounded-xl">
                  {error}
                </div>
              )}

              {/* Quantity */}
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-ui-muted">কোয়ান্টিটি</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQtySafe(qty - 1)}
                    disabled={qty <= 1}
                    className="w-9 h-9 rounded-lg border border-ui-line flex items-center justify-center disabled:opacity-40"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="w-10 text-center font-mono text-lg">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQtySafe(qty + 1)}
                    disabled={qty >= stockCapped}
                    className="w-9 h-9 rounded-lg border border-ui-line flex items-center justify-center disabled:opacity-40"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="পূর্ণ নাম" required>
                  <input
                    ref={nameInputRef}
                    className="input font-bangla" dir="auto" placeholder="আপনার নাম"
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="ফোন নম্বর" required>
                  <input
                    className="input" inputMode="numeric" placeholder="01XXXXXXXXX"
                    value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                    className="input font-bangla" dir="auto" rows={2} placeholder="বাসা, রোড, এলাকা…"
                    value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Field>
                <Field label="কমেন্টস" full>
                  <textarea
                    className="input font-bangla" dir="auto" rows={2}
                    placeholder="আপনার কোনো কিছু বলার থাকলে বলুন"
                    value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })}
                  />
                </Field>
              </div>

              {/* Payment */}
              <div>
                <span className="block text-xs uppercase tracking-wide text-ui-muted mb-2">পেমেন্ট পদ্ধতি</span>
                {advanceRequired && (
                  <p className="mb-3 rounded-xl border border-ui-gold/40 bg-amber-50 text-ui-gold text-xs px-3 py-2.5 leading-relaxed">
                    এই প্রোডাক্টে <span className="font-mono font-medium">{formatMoney(advanceInfo.requiredAdvance)}</span> অগ্রিম
                    পেমেন্ট প্রয়োজন — বিকাশে পাঠাতে হবে।
                    {advanceInfo.codRemainder > 0 ? (
                      <> বাকি <span className="font-mono font-medium">{formatMoney(advanceInfo.codRemainder)}</span> (ডেলিভারি চার্জ <span className="font-mono font-medium">{formatMoney(deliveryTotal)}</span> সহ) ডেলিভারিতে ক্যাশে দিতে পারবেন।</>
                    ) : (
                      <> এই অগ্রিমের মধ্যে ডেলিভারি চার্জ <span className="font-mono font-medium">{formatMoney(deliveryTotal)}</span> অন্তর্ভুক্ত।</>
                    )}
                  </p>
                )}
                <div className={`grid gap-2.5 ${bkashAutoOn ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <PayOption
                    icon={Truck} label="ক্যাশ অন ডেলিভারি" active={paymentMethod === 'cod'}
                    onClick={() => setPaymentMethod('cod')} disabled={advanceRequired}
                  />
                  <PayOption
                    icon={Smartphone} label="বিকাশ — সেন্ড মানি" accent active={paymentMethod === 'bkash_manual'}
                    onClick={() => setPaymentMethod('bkash_manual')}
                  />
                  {bkashAutoOn && (
                    <PayOption
                      icon={Zap} label="বিকাশ চেকআউট" accent active={paymentMethod === 'bkash_automated'}
                      onClick={() => setPaymentMethod('bkash_automated')}
                    />
                  )}
                </div>
                {paymentMethod === 'bkash_manual' && (
                  <BkashPanel
                    amountToSend={advanceRequired ? advanceInfo.requiredAdvance : grandTotal}
                    advanceInfo={advanceInfo}
                    bkash={bkash} setBkash={setBkash} onProofChange={handleProofChange}
                  />
                )}
                {paymentMethod === 'bkash_automated' && (
                  <div className="mt-3 rounded-xl border border-bkash/30 bg-bkash/[0.04] px-3.5 py-2.5 text-xs text-ui-ink leading-relaxed space-y-1">
                    {advanceRequired ? (
                      <>
                        <p>
                          <span className="font-display italic font-extrabold text-bkash">bKash</span> পেজে গিয়ে অগ্রিম{' '}
                          <span className="font-mono font-medium">{formatMoney(advanceInfo.requiredAdvance)}</span> পেমেন্ট করুন।
                        </p>
                        {advanceInfo.codRemainder > 0 ? (
                          <p className="text-ui-muted">
                            বাকি <span className="font-mono">{formatMoney(advanceInfo.codRemainder)}</span> (ডেলিভারি চার্জ{' '}
                            <span className="font-mono">{formatMoney(deliveryTotal)}</span> সহ) ডেলিভারিতে ক্যাশে দিতে হবে।
                          </p>
                        ) : (
                          <p className="text-ui-muted">
                            এই অগ্রিমের মধ্যে ডেলিভারি চার্জ <span className="font-mono">{formatMoney(deliveryTotal)}</span> অন্তর্ভুক্ত।
                          </p>
                        )}
                      </>
                    ) : (
                      <p>
                        <span className="font-display italic font-extrabold text-bkash">bKash</span> পেজে গিয়ে{' '}
                        <span className="font-mono font-medium">{formatMoney(grandTotal)}</span> (ডেলিভারি চার্জ{' '}
                        <span className="font-mono">{formatMoney(deliveryTotal)}</span> সহ) পেমেন্ট করুন। সফল হলে অর্ডার কনফার্ম হবে।
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Price summary */}
              <div className="rounded-xl bg-ui-surfaceAlt border border-ui-line p-3.5 font-mono text-sm space-y-1">
                <Row k={`${formatMoney(unitPrice)} × ${qty}`} v={formatMoney(unitPrice * qty)} />
                <Row k="ডেলিভারি চার্জ" v={formatMoney(deliveryTotal)} />
                <div className="flex justify-between pt-1.5 mt-1 border-t border-ui-line text-ui-brand font-semibold text-base">
                  <span>মোট (ডেলিভারি চার্জ সহ)</span><span>{formatMoney(grandTotal)}</span>
                </div>
              </div>

              <button
                ref={submitBtnRef}
                type="submit"
                disabled={submitting || outOfStock}
                className="btn-primary w-full min-w-0 py-3 text-sm sm:text-base gap-2 text-center leading-tight"
              >
                {uploadingProof ? (
                  <><Loader2 size={16} className="animate-spin" /> স্ক্রিনশট আপলোড হচ্ছে…</>
                ) : redirectingBkash ? (
                  <><Loader2 size={16} className="animate-spin" /> বিকাশে নিয়ে যাওয়া হচ্ছে…</>
                ) : submitting ? (
                  'অর্ডার হচ্ছে…'
                ) : outOfStock ? (
                  'স্টকে নেই'
                ) : paymentMethod === 'bkash_automated' ? (
                  `বিকাশে পেমেন্ট করুন · ${formatMoney(advanceRequired ? advanceInfo.requiredAdvance : grandTotal)}`
                ) : (
                  `অর্ডার কনফার্ম করুন · ${formatMoney(grandTotal)}`
                )}
              </button>

              <p className="text-[11px] text-ui-faint text-center">
                অর্ডার করতে কোনো অ্যাকাউন্ট লাগবে না। কনফার্ম করার জন্য আমরা ফোনে যোগাযোগ করব।
              </p>
            </form>
          </div>
        </div>
      </div>

      {/* Mobile-only floating "order now" bar — an ad click usually lands
          here well above the actual form, so this keeps the order button
          reachable at all times and jumps straight to the form on tap.
          Hides itself once the real submit button is already on screen. */}
      {showFloatingCta && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t border-ui-line shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-ui-muted uppercase tracking-wide leading-none">মোট</div>
            <div className="font-mono font-semibold text-ui-ink leading-tight truncate">{formatMoney(grandTotal)}</div>
          </div>
          <button
            type="button"
            onClick={scrollToOrderForm}
            disabled={outOfStock}
            className="btn-primary flex-1 min-w-0 py-2.5 gap-1.5 disabled:opacity-50"
          >
            <ShoppingBag size={16} />
            {outOfStock ? 'স্টকে নেই' : 'অর্ডার করুন'}
          </button>
        </div>
      )}
    </Shell>
  );
}

/* ---------- layout shell (own minimal chrome, not the full shop nav) ---------- */
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ui-bg flex flex-col">
      <header className="border-b border-ui-line bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/shop" className="flex items-center gap-2">
            <img src={logoMark} alt={COMPANY_NAME} className="h-7 w-auto" />
          </Link>
          <a href={`tel:${COMPANY_PHONE}`} className="text-sm text-ui-muted hover:text-ui-brand">
            {COMPANY_PHONE}
          </a>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-ui-line bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-xs text-ui-muted flex flex-col sm:flex-row gap-2 sm:justify-between">
          <span>© {new Date().getFullYear()} {COMPANY_NAME}। সর্বস্বত্ব সংরক্ষিত।</span>
          <span>{COMPANY_PHONE} · {COMPANY_EMAIL}</span>
        </div>
      </footer>
      <ChatWidget hint="প্রোডাক্ট সম্পর্কে প্রশ্ন থাকলে জিজ্ঞেস করুন" />
    </div>
  );
}

function Trust({ icon: Icon, label }) {
  return (
    <div className="rounded-xl border border-ui-line bg-white px-2 py-3 flex flex-col items-center gap-1.5">
      <Icon size={18} className="text-ui-brand" />
      <span className="text-[11px] text-ui-muted leading-tight">{label}</span>
    </div>
  );
}

function Field({ label, required, full, children }) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">
        {label} {required && <span className="text-ui-rust">*</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between text-ui-muted">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function PayOption({ icon: Icon, label, active, onClick, disabled, accent }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`flex flex-col items-center text-center gap-1.5 rounded-xl border px-2 py-3 min-w-0 transition-colors ${
        disabled
          ? 'border-ui-line opacity-50 cursor-not-allowed'
          : active
          ? accent
            ? 'border-bkash bg-bkash/5'
            : 'border-ui-brand bg-ui-brand/5'
          : 'border-ui-line hover:border-ui-faint/60'
      }`}
    >
      <span
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          active ? (accent ? 'bg-bkash text-white' : 'bg-ui-brand text-white') : 'bg-ui-surfaceAlt text-ui-muted'
        }`}
      >
        <Icon size={15} />
      </span>
      <span className="text-xs sm:text-sm font-medium text-ui-ink leading-tight break-words min-w-0">{label}</span>
    </button>
  );
}

function CopyChip({ value, valueRef }) {
  const [state, setState] = useState('idle');
  const handleCopy = async () => {
    const ok = await copyText(value, valueRef?.current);
    setState(ok ? 'copied' : 'select');
    setTimeout(() => setState('idle'), ok ? 1500 : 2500);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/95 hover:bg-white text-bkash px-2.5 py-2 text-xs font-semibold"
    >
      {state === 'copied' ? <Check size={14} /> : <Copy size={14} />}
      {state === 'copied' ? 'কপি হয়েছে' : state === 'select' ? 'সিলেক্ট' : 'কপি'}
    </button>
  );
}

function BkashPanel({ amountToSend, advanceInfo, bkash, setBkash, onProofChange }) {
  const numRef = useRef(null);
  const amtRef = useRef(null);
  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-bkash/30">
      <div className="bg-bkash px-4 py-2.5 flex items-center justify-between">
        <span className="font-display italic font-extrabold text-white text-base tracking-tight">bKash</span>
        <span className="text-white/90 text-[11px] font-medium bg-white/15 rounded-full px-2 py-0.5">Send Money</span>
      </div>
      <div className="p-4 bg-bkash/[0.04] space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-bkash text-white p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-white/70">এই নম্বরে পাঠান</div>
              <div
                ref={numRef}
                className="font-mono font-bold text-lg sm:text-base leading-tight whitespace-nowrap select-all"
              >
                {BKASH_MERCHANT_NUMBER}
              </div>
            </div>
            <CopyChip value={BKASH_MERCHANT_NUMBER} valueRef={numRef} />
          </div>
          <div className="rounded-xl bg-bkash-dark text-white p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-white/70">
                {advanceInfo?.requiredAdvance > 0 ? 'অগ্রিম পাঠাতে হবে' : 'পরিমাণ'}
              </div>
              <div
                ref={amtRef}
                className="font-mono font-bold text-lg sm:text-base leading-tight whitespace-nowrap select-all"
              >
                {formatMoney(amountToSend)}
              </div>
            </div>
            <CopyChip value={String(amountToSend)} valueRef={amtRef} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="আপনার বিকাশ নম্বর" required>
            <input
              className="input" placeholder="01XXXXXXXXX"
              value={bkash.senderNumber} onChange={(e) => setBkash({ ...bkash, senderNumber: e.target.value })}
            />
          </Field>
          <Field label="ট্রানজেকশন আইডি" required>
            <input
              className="input font-mono" placeholder="যেমন: 8N7A6B5C4D"
              value={bkash.transactionId} onChange={(e) => setBkash({ ...bkash, transactionId: e.target.value })}
            />
          </Field>
        </div>

        <div>
          <span className="block text-[11px] uppercase tracking-wide text-ui-muted mb-1">স্ক্রিনশট (ঐচ্ছিক)</span>
          {bkash.proofPreview ? (
            <div className="relative w-20 h-20">
              <img src={bkash.proofPreview} alt="" className="w-full h-full object-cover rounded-xl border border-ui-line" />
              <button
                type="button" onClick={() => onProofChange(null)}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-ui-line text-ui-rust flex items-center justify-center text-xs shadow-card"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="w-20 h-20 rounded-xl border-2 border-dashed border-ui-line hover:border-bkash text-ui-faint hover:text-bkash flex flex-col items-center justify-center gap-1 cursor-pointer">
              <ImagePlus size={16} />
              <span className="text-[10px]">আপলোড</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onProofChange(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

function Confirmation({ order, paymentMethod, advanceInfo }) {
  const [copied, setCopied] = useState(false);
  const urlRef = useRef(null);
  const trackingUrl = `${PUBLIC_BASE}/track/${order.trackingId}`;

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, []);

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
  const deliveryCharge = order.pricing?.deliveryCharge || 0;
  if (paymentMethod === 'bkash_manual' && advanceInfo?.requiredAdvance > 0) {
    paymentSummary =
      advanceInfo.codRemainder > 0
        ? `বিকাশে ${formatMoney(advanceInfo.requiredAdvance)} অগ্রিম পাঠানো হয়েছে — বাকি ${formatMoney(advanceInfo.codRemainder)} (ডেলিভারি চার্জ ${formatMoney(deliveryCharge)} সহ) ডেলিভারিতে ক্যাশে।`
        : `বিকাশে সম্পূর্ণ ${formatMoney(advanceInfo.requiredAdvance)} অগ্রিম (ডেলিভারি চার্জ ${formatMoney(deliveryCharge)} সহ) পাঠানো হয়েছে।`;
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ui-brand/10 text-ui-brand mb-5">
          <CheckCircle2 size={30} />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl text-ui-brand mb-2">অর্ডার সম্পন্ন হয়েছে!</h1>
        <p className="text-sm text-ui-muted mb-5">
          ধন্যবাদ, {order.customer?.name?.split(' ')[0] || 'প্রিয় কাস্টমার'} — আপনার অর্ডার পেয়েছি,
          কনফার্ম করতে <span className="font-medium text-ui-ink">{order.customer?.phone}</span> নম্বরে যোগাযোগ করা হবে।
        </p>

        <div className="card p-5 text-left mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ui-muted">অর্ডার নম্বর</span>
            <span className="font-mono font-medium">{order.orderNumber}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ui-muted">ডেলিভারি চার্জ</span>
            <span className="font-mono">{formatMoney(deliveryCharge)}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ui-muted">মোট (ডেলিভারি চার্জ সহ)</span>
            <span className="font-mono font-medium">{formatMoney(order.pricing?.grandTotal)}</span>
          </div>
          {paymentSummary && (
            <div className="flex justify-between text-sm mb-3 gap-4">
              <span className="text-ui-muted shrink-0">পেমেন্ট</span>
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
          <Link to={`/track/${order.trackingId}`} className="btn-primary">স্ট্যাটাস দেখুন</Link>
          <Link to="/shop/my-orders" className="btn-secondary">আমার অর্ডার</Link>
          <Link to="/shop" className="btn-secondary inline-flex items-center gap-1.5">
            <ArrowLeft size={15} /> স্টোরে যান
          </Link>
        </div>
      </div>
    </div>
  );
}
