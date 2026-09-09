import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { User, Package, Wallet, Truck, ArrowLeft } from 'lucide-react';
import { getProducts, getOrder, createOrder, updateOrder, getSuggestedStatuses, getPoliceStations } from '../api/client';
import { formatMoney } from '../utils/format';
import { usePhoneticField } from '../lib/phonetic';
import { usePhonetic } from '../context/PhoneticContext';
import AiOrderAssist from '../components/AiOrderAssist';
import BookCourierModal from '../components/BookCourierModal';
import SearchableSelect from '../components/SearchableSelect';
import SuggestInput from '../components/SuggestInput';
import Loader from '../components/Loader';
import useFormDraft from '../lib/useFormDraft';
import { emitError } from '../lib/errorBus';

const emptyCustomer = { name: '', phone: '', zilla: '', thana: '', address: '', comments: '' };

const blankDraftItem = { productId: '', name: '', description: '', unitPrice: 0, quantity: 1, discount: 0, deliveryCharge: 0 };

export default function OrderForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(blankDraftItem);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [deliveryChargeOverride, setDeliveryChargeOverride] = useState('');
  const [advancePaid, setAdvancePaid] = useState(0);
  const [cashOnAmount, setCashOnAmount] = useState(0);
  const [weightKg, setWeightKg] = useState('0.5');
  const [status, setStatus] = useState('pending');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null); // set once, right after a successful create — drives the "book courier?" modal
  const { phoneticOn } = usePhonetic(); // universal — set once from the navbar, applies here too

  // Autosave a new-order form so navigating away mid-entry doesn't lose it.
  // Create-mode only — never restore over a loaded order.
  const orderFormDraft = useMemo(
    () => ({ customer, items, orderDiscount, deliveryChargeOverride, advancePaid, cashOnAmount, weightKg, status, source }),
    [customer, items, orderDiscount, deliveryChargeOverride, advancePaid, cashOnAmount, weightKg, status, source]
  );
  const { clearDraft } = useFormDraft(
    'admin-order-new',
    orderFormDraft,
    (d) => {
      if (d.customer) setCustomer((c) => ({ ...c, ...d.customer }));
      if (Array.isArray(d.items)) setItems(d.items);
      if (d.orderDiscount !== undefined) setOrderDiscount(d.orderDiscount);
      if (d.deliveryChargeOverride !== undefined) setDeliveryChargeOverride(d.deliveryChargeOverride);
      if (d.advancePaid !== undefined) setAdvancePaid(d.advancePaid);
      if (d.cashOnAmount !== undefined) setCashOnAmount(d.cashOnAmount);
      if (d.weightKg) setWeightKg(d.weightKg);
      if (d.status) setStatus(d.status);
      if (d.source !== undefined) setSource(d.source);
    },
    { enabled: !isEdit }
  );

  useEffect(() => {
    getProducts({ active: 'true' }).then(setProducts).catch(() => {});
    getSuggestedStatuses().then(setStatuses).catch(() => setStatuses(['unverified', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'returned']));
    // Cached on the backend (and again in the frontend module), so this is
    // cheap — the upstream Packzy API is only ever hit on a cache miss.
    getPoliceStations().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  const districtOptions = useMemo(() => districts.map((d) => ({ value: d.name, label: d.name })), [districts]);
  const thanaOptions = useMemo(() => {
    const d = districts.find((d) => d.name === customer.zilla);
    return (d ? d.policestations : []).map((ps) => ({ value: ps.name, label: ps.name }));
  }, [districts, customer.zilla]);

  const namePhonetic = usePhoneticField({
    enabled: phoneticOn,
    value: customer.name,
    onChangeValue: (v) => setCustomer((c) => ({ ...c, name: v })),
  });
  const addressPhonetic = usePhoneticField({
    enabled: phoneticOn,
    value: customer.address,
    onChangeValue: (v) => setCustomer((c) => ({ ...c, address: v })),
  });
  const commentsPhonetic = usePhoneticField({
    enabled: phoneticOn,
    value: customer.comments,
    onChangeValue: (v) => setCustomer((c) => ({ ...c, comments: v })),
  });
  const draftNamePhonetic = usePhoneticField({
    enabled: phoneticOn,
    value: draft.name,
    onChangeValue: (v) => setDraft((d) => ({ ...d, name: v })),
  });

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    getOrder(id)
      .then((o) => {
        setCustomer(o.customer);
        setItems(
          o.items.map((it) => ({
            productId: it.product?._id || it.product || '',
            name: it.name,
            description: it.description || '',
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            discount: it.discount || 0,
            deliveryCharge: it.deliveryCharge || 0,
          }))
        );
        setOrderDiscount(o.pricing?.discount || 0);
        setDeliveryChargeOverride(String(o.pricing?.deliveryCharge ?? ''));
        setAdvancePaid(o.pricing?.advancePaid || 0);
        setCashOnAmount(o.pricing?.cashOnAmount || 0);
        setWeightKg(String(o.weightKg ?? 0.5));
        setStatus(o.status);
        setSource(o.source || '');
      })
      .catch(() => {
        // Surfaced globally via the ErrorModal (see api/client.js interceptor).
      })
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // Prefill the form from an AI-extracted draft. Only fills blanks / appends
  // items — it never clobbers something the admin already typed.
  const applyDraft = (d) => {
    const dc = d.customer || {};
    setCustomer((c) => ({
      name: c.name || dc.name || '',
      phone: c.phone || dc.phone || '',
      zilla: c.zilla || dc.zilla || '',
      thana: c.thana || dc.thana || '',
      address: c.address || dc.address || '',
      comments: d.notes ? (c.comments ? `${c.comments}\n${d.notes}` : d.notes) : c.comments,
    }));
    if (Array.isArray(d.items) && d.items.length) {
      setItems((prev) => [
        ...prev,
        ...d.items.map((it) => ({
          productId: '',
          name: it.name || '',
          description: '',
          unitPrice: Number(it.unitPrice) || 0,
          quantity: Number(it.quantity) || 1,
          discount: 0,
          deliveryCharge: 0,
        })),
      ]);
    }
    if (d.deliveryCharge > 0) setDeliveryChargeOverride(String(d.deliveryCharge));
    if (d.advancePaid > 0) setAdvancePaid(d.advancePaid);
    if (d.codAmount > 0) setCashOnAmount(d.codAmount);
    if (!source) setSource('AI import');
  };

  const handleProductSelect = (productId) => {
    const p = products.find((pr) => pr._id === productId);
    if (!p) {
      setDraft(blankDraftItem);
      return;
    }
    setDraft({
      productId: p._id,
      name: p.name,
      description: p.description || '',
      unitPrice: p.price,
      quantity: 1,
      discount: 0,
      deliveryCharge: p.deliveryCharge || 0,
    });
  };

  const addItem = () => {
    if (!draft.name || !draft.unitPrice) {
      emitError('Pick a product or fill in name and unit price before adding.');
      return;
    }
    setItems((prev) => [...prev, draft]);
    setDraft(blankDraftItem);
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const updateItemField = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const itemsWithTotals = useMemo(
    () =>
      items.map((it) => ({
        ...it,
        totalPrice: Math.max(0, it.unitPrice * it.quantity - (Number(it.discount) || 0)),
      })),
    [items]
  );

  const subtotal = useMemo(() => itemsWithTotals.reduce((s, it) => s + it.totalPrice, 0), [itemsWithTotals]);
  const itemsDeliverySum = useMemo(() => items.reduce((s, it) => s + (Number(it.deliveryCharge) || 0), 0), [items]);
  const effectiveDelivery = deliveryChargeOverride !== '' ? Number(deliveryChargeOverride) : itemsDeliverySum;
  const grandTotal = Math.max(0, subtotal - (Number(orderDiscount) || 0) + (Number(effectiveDelivery) || 0));
  const due = grandTotal - (Number(advancePaid) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!customer.name || !customer.phone) {
      emitError('Customer name and phone are required.');
      return;
    }
    if (items.length === 0) {
      emitError('Add at least one product to the order.');
      return;
    }

    const payload = {
      customer,
      items: items.map((it) => ({
        product: it.productId || null,
        name: it.name,
        description: it.description,
        unitPrice: Number(it.unitPrice),
        quantity: Number(it.quantity),
        discount: Number(it.discount) || 0,
        deliveryCharge: Number(it.deliveryCharge) || 0,
      })),
      pricing: {
        discount: Number(orderDiscount) || 0,
        deliveryCharge: deliveryChargeOverride !== '' ? Number(deliveryChargeOverride) : itemsDeliverySum,
        advancePaid: Number(advancePaid) || 0,
        cashOnAmount: Number(cashOnAmount) || 0,
      },
      weightKg: Number(weightKg) || 0.5,
      status,
      source,
      createdVia: 'admin',
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateOrder(id, payload);
        navigate(`/orders/${id}`);
      } else {
        const created = await createOrder(payload);
        clearDraft();
        // Give the admin a chance to book the courier right away — see the
        // modal below — instead of always landing on the order page first.
        setCreatedOrder(created);
      }
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  if (createdOrder) {
    return (
      <BookCourierModal
        order={createdOrder}
        onDone={(finalOrder) => navigate(`/orders/${(finalOrder || createdOrder)._id}`)}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-5 py-4 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 sm:gap-3 mb-4 sm:mb-6">
        <h1 className="font-display text-xl sm:text-3xl text-ui-brand">{isEdit ? 'Edit order' : 'New order'}</h1>
        <Link
          to="/orders"
          className="inline-flex items-center gap-1 text-xs sm:text-sm text-ui-muted hover:text-ui-brand"
        >
          <ArrowLeft size={13} /> Back to orders
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {!isEdit && <AiOrderAssist onApply={applyDraft} />}

        {/* Customer */}
        <section className="bg-ui-panel border border-ui-line rounded-2xl shadow-card p-3.5 sm:p-5">
          <SectionHeader icon={User} title="Customer" />
          <p className="text-[11px] sm:text-xs text-ui-muted -mt-2 mb-3.5 sm:mb-4">
            Phonetic typing &amp; Bangla keyboard: toggle from the navbar above
          </p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Field label="Name" required mobileFull>
              <input
                className="input font-bangla"
                dir="auto"
                lang="bn"
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                onKeyDown={namePhonetic.onKeyDown}
                onClick={namePhonetic.onClick}
                onBlur={namePhonetic.onBlur}
              />
            </Field>
            <Field label="Phone number" required mobileFull>
              <input className="input" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
            </Field>

            {/* Custom, searchable pickers — not the OS-native <select>, which
                is cramped and inconsistent on mobile for a 60+ item list. */}
            <Field label="Zilla (district)">
              <SearchableSelect
                placeholder={districts.length ? 'Select district…' : 'Loading districts…'}
                loading={!districts.length}
                value={customer.zilla}
                onChange={(v) => setCustomer({ ...customer, zilla: v, thana: '' })}
                options={districtOptions}
              />
            </Field>
            <Field label="Thana">
              <SearchableSelect
                placeholder="Select thana…"
                disabledHint="Pick a district first"
                disabled={!customer.zilla}
                value={customer.thana}
                onChange={(v) => setCustomer({ ...customer, thana: v })}
                options={thanaOptions}
              />
            </Field>

            <Field label="Address" full>
              <textarea
                className="input font-bangla"
                dir="auto"
                lang="bn"
                rows={2}
                value={customer.address}
                onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                onKeyDown={addressPhonetic.onKeyDown}
                onClick={addressPhonetic.onClick}
                onBlur={addressPhonetic.onBlur}
              />
            </Field>
            <Field label="কমেন্টস" full>
              <textarea
                className="input font-bangla"
                dir="auto"
                lang="bn"
                rows={2}
                placeholder="আপনার কোনো কিছু বলার থাকলে বলুন"
                value={customer.comments}
                onChange={(e) => setCustomer({ ...customer, comments: e.target.value })}
                onKeyDown={commentsPhonetic.onKeyDown}
                onClick={commentsPhonetic.onClick}
                onBlur={commentsPhonetic.onBlur}
              />
            </Field>
          </div>
        </section>

        {/* Items */}
        <section className="bg-ui-panel border border-ui-line rounded-2xl shadow-card p-3.5 sm:p-5">
          <SectionHeader icon={Package} title="Products" />

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_repeat(4,1fr)_auto] gap-2.5 sm:gap-3 items-end mb-3.5 sm:mb-4 border-b border-dashed border-ui-line pb-3.5 sm:pb-4">
            <Field label="Select from catalogue" mobileFull>
              <SearchableSelect
                placeholder="— custom item —"
                value={draft.productId}
                onChange={handleProductSelect}
                options={[
                  { value: '', label: '— custom item —' },
                  ...products.map((p) => ({ value: p._id, label: `${p.name} (${formatMoney(p.price)})` })),
                ]}
                clearable={false}
              />
            </Field>
            <Field label="Name" mobileFull>
              <input
                className="input font-bangla"
                dir="auto"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={draftNamePhonetic.onKeyDown}
                onClick={draftNamePhonetic.onClick}
                onBlur={draftNamePhonetic.onBlur}
              />
            </Field>
            <Field label="Unit price">
              <input type="number" min="0" step="0.01" className="input" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} />
            </Field>
            <Field label="Qty">
              <input type="number" min="1" className="input" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
            </Field>
            <Field label="Discount">
              <input type="number" min="0" step="0.01" className="input" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value })} />
            </Field>
            <button type="button" onClick={addItem} className="btn-secondary h-10 text-sm">Add</button>
          </div>

          {itemsWithTotals.length === 0 ? (
            <p className="text-xs sm:text-sm text-ui-muted italic">No products added yet.</p>
          ) : (
            <>
              {/* Mobile: stacked editable cards */}
              <div className="sm:hidden space-y-2.5">
                {itemsWithTotals.map((it, idx) => (
                  <div key={idx} className="border border-ui-line rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input className="input-plain font-medium flex-1 text-sm" value={it.name} onChange={(e) => updateItemField(idx, 'name', e.target.value)} />
                      <button type="button" onClick={() => removeItem(idx)} className="text-ui-rust text-[11px] hover:underline shrink-0">Remove</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <MiniField label="Unit price">
                        <input type="number" className="input-plain text-xs" value={it.unitPrice} onChange={(e) => updateItemField(idx, 'unitPrice', Number(e.target.value))} />
                      </MiniField>
                      <MiniField label="Qty">
                        <input type="number" min="1" className="input-plain text-xs" value={it.quantity} onChange={(e) => updateItemField(idx, 'quantity', Number(e.target.value))} />
                      </MiniField>
                      <MiniField label="Discount">
                        <input type="number" min="0" className="input-plain text-xs" value={it.discount} onChange={(e) => updateItemField(idx, 'discount', Number(e.target.value))} />
                      </MiniField>
                      <MiniField label="Delivery">
                        <input type="number" min="0" className="input-plain text-xs" value={it.deliveryCharge} onChange={(e) => updateItemField(idx, 'deliveryCharge', Number(e.target.value))} />
                      </MiniField>
                    </div>
                    <div className="flex justify-between text-xs font-mono border-t border-dashed border-ui-line pt-2">
                      <span className="text-ui-muted">Line total</span>
                      <span>{formatMoney(it.totalPrice)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tablet+: editable table */}
              <table className="hidden sm:table w-full text-sm">
                <thead>
                  <tr className="text-left text-ui-muted border-b border-ui-line">
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium">Unit price</th>
                    <th className="py-2 font-medium">Qty</th>
                    <th className="py-2 font-medium">Discount</th>
                    <th className="py-2 font-medium">Delivery</th>
                    <th className="py-2 font-medium text-right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {itemsWithTotals.map((it, idx) => (
                    <tr key={idx} className="border-b border-ui-line/60">
                      <td className="py-2 pr-2">
                        <input className="input-plain" value={it.name} onChange={(e) => updateItemField(idx, 'name', e.target.value)} />
                      </td>
                      <td className="py-2 pr-2 w-28">
                        <input type="number" className="input-plain" value={it.unitPrice} onChange={(e) => updateItemField(idx, 'unitPrice', Number(e.target.value))} />
                      </td>
                      <td className="py-2 pr-2 w-20">
                        <input type="number" min="1" className="input-plain" value={it.quantity} onChange={(e) => updateItemField(idx, 'quantity', Number(e.target.value))} />
                      </td>
                      <td className="py-2 pr-2 w-24">
                        <input type="number" min="0" className="input-plain" value={it.discount} onChange={(e) => updateItemField(idx, 'discount', Number(e.target.value))} />
                      </td>
                      <td className="py-2 pr-2 w-24">
                        <input type="number" min="0" className="input-plain" value={it.deliveryCharge} onChange={(e) => updateItemField(idx, 'deliveryCharge', Number(e.target.value))} />
                      </td>
                      <td className="py-2 text-right font-mono">{formatMoney(it.totalPrice)}</td>
                      <td className="py-2 pl-2">
                        <button type="button" onClick={() => removeItem(idx)} className="text-ui-rust text-xs hover:underline">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {/* Pricing */}
        <section className="bg-ui-panel border border-ui-line rounded-2xl shadow-card p-3.5 sm:p-5">
          <SectionHeader icon={Wallet} title="Pricing & payment" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <Field label="Order-level discount">
              <input type="number" min="0" className="input" value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} />
            </Field>
            <Field label="Delivery charge (override)">
              <input type="number" min="0" className="input" placeholder={String(itemsDeliverySum)} value={deliveryChargeOverride} onChange={(e) => setDeliveryChargeOverride(e.target.value)} />
            </Field>
            <Field label="Advance paid">
              <input type="number" min="0" className="input" value={advancePaid} onChange={(e) => setAdvancePaid(e.target.value)} />
            </Field>
            <Field label="Cash on delivery amount">
              <input type="number" min="0" className="input" value={cashOnAmount} onChange={(e) => setCashOnAmount(e.target.value)} />
            </Field>
          </div>

          <div className="mt-4 sm:mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 font-mono text-xs sm:text-sm border-t border-dashed border-ui-line pt-3.5 sm:pt-4">
            <Summary label="Subtotal" value={subtotal} />
            <Summary label="Delivery" value={effectiveDelivery} />
            <Summary label="Grand total" value={grandTotal} strong />
            <Summary label="Due" value={due} />
          </div>
        </section>

        {/* Status & source */}
        <section className="bg-ui-panel border border-ui-line rounded-2xl shadow-card p-3.5 sm:p-5">
          <SectionHeader icon={Truck} title="Status & parcel" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <Field label="Order status">
              <SuggestInput value={status} onChange={setStatus} suggestions={statuses} placeholder="e.g. pending" />
            </Field>
            <Field label="Source (optional)">
              <input className="input" placeholder="Facebook, Website, Phone…" value={source} onChange={(e) => setSource(e.target.value)} />
            </Field>
            <Field label="Parcel weight (KG)" full>
              <input
                type="number"
                min="0"
                step="0.1"
                className="input"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 pb-2">
          <Link to="/orders" className="btn-secondary text-center text-sm">Cancel</Link>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create order'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <h2 className="font-display text-base sm:text-lg text-ui-ink mb-3.5 sm:mb-4 flex items-center gap-2">
      <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-ui-brand/10 text-ui-brand flex items-center justify-center shrink-0">
        <Icon size={15} />
      </span>
      {title}
    </h2>
  );
}

function Field({ label, required, full, mobileFull, children }) {
  const spanClass = full ? 'col-span-2 sm:col-span-2' : mobileFull ? 'col-span-2 sm:col-span-1' : '';
  return (
    <label className={`block ${spanClass}`}>
      <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-ui-muted mb-1">
        {label} {required && <span className="text-ui-rust">*</span>}
      </span>
      {children}
    </label>
  );
}

function MiniField({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-ui-muted mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function Summary({ label, value, strong }) {
  return (
    <div>
      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-ui-muted">{label}</div>
      <div className={strong ? 'text-sm sm:text-lg text-ui-brand font-semibold' : 'text-ui-ink'}>{formatMoney(value)}</div>
    </div>
  );
}
