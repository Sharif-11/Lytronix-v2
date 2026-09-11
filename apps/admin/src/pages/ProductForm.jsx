import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  getProduct, createProduct, updateProduct, uploadProductImage, uploadProductVideo,
  deleteCloudinaryAsset, getCategories,
} from '../api/client';
import { usePhoneticField } from '../lib/phonetic';
import { usePhonetic } from '../context/PhoneticContext';
import { ImagePlus, VideoIcon, X, Star, Loader2, Play } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import RichTextEditor from '../components/RichTextEditor';
import Loader from '../components/Loader';
import useFormDraft from '../lib/useFormDraft';
import { emitError } from '../lib/errorBus';
import { useConfirm } from '../context/ConfirmContext';
import usePageTitle from '../lib/usePageTitle';

const empty = {
  name: '',
  price: '',
  description: '',
  deliveryCharge: '',
  sku: '',
  category: '',
  images: [],
  videos: [],
  stock: '0',
  trackInventory: true,
  lowStockThreshold: '5',
  isActive: true,
  paymentPolicy: { codAllowed: true, advanceType: 'none', advanceAmount: '', advancePercent: '' },
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB — server resizes + re-encodes to WebP
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  usePageTitle(isEdit ? form.name || 'Edit product' : 'New product');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState(''); // "Uploading 2 of 4…" style progress
  const [categories, setCategories] = useState([]);
  const [preview, setPreview] = useState(null); // { type: 'image'|'video', url }
  const fileInputRef = useRef(null);
  const { phoneticOn } = usePhonetic();
  const confirm = useConfirm();

  // Autosave a new-product form (minus uploaded media) so navigating away
  // doesn't lose typed input. Restored silently on the next visit.
  const draftForm = useMemo(() => {
    const { images, videos, ...rest } = form;
    return rest;
  }, [form]);
  const { clearDraft } = useFormDraft(
    'admin-product-new',
    draftForm,
    (d) => setForm((f) => ({ ...f, ...d, paymentPolicy: { ...f.paymentPolicy, ...(d.paymentPolicy || {}) } })),
    { enabled: !isEdit }
  );

  useEffect(() => {
    getCategories({ includeInactive: 'true' })
      .then((d) => setCategories(d.flat || []))
      .catch(() => setCategories([]));
  }, []);

  const namePhonetic = usePhoneticField({
    enabled: phoneticOn,
    value: form.name,
    onChangeValue: (v) => setForm((f) => ({ ...f, name: v })),
  });

  useEffect(() => {
    if (!isEdit) return;
    getProduct(id)
      .then((p) =>
        setForm({
          ...empty,
          ...p,
          category: p.category?._id || p.category || '',
          stock: String(p.stock ?? 0),
          lowStockThreshold: String(p.lowStockThreshold ?? 5),
          images: p.images || [],
          videos: p.videos || [],
          paymentPolicy: {
            codAllowed: p.paymentPolicy?.codAllowed !== false,
            advanceType: p.paymentPolicy?.advanceType || 'none',
            advanceAmount: p.paymentPolicy?.advanceAmount || '',
            advancePercent: p.paymentPolicy?.advancePercent || '',
          },
        })
      )
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // Accepts a mixed batch of images and videos selected/dropped at once,
  // uploads each to the right endpoint under its own size cap, and appends
  // to the form as they land — one bad/oversized file doesn't stop the rest.
  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (files.length === 0) return;

    setUploading(true);
    let ok = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = file.type.startsWith('video/');
        setUploadNote(`Uploading ${i + 1} of ${files.length}…`);

        if (isVideo && file.size > MAX_VIDEO_BYTES) {
          emitError(`"${file.name}" is over 50MB — please use a smaller video.`);
          continue;
        }
        if (!isVideo && file.size > MAX_IMAGE_BYTES) {
          emitError(`"${file.name}" is over 15MB — please use a smaller image.`);
          continue;
        }

        try {
          if (isVideo) {
            const { url } = await uploadProductVideo(file, { skipErrorModal: true });
            setForm((f) => ({ ...f, videos: [...f.videos, url] }));
          } else {
            const { url } = await uploadProductImage(file, { skipErrorModal: true });
            setForm((f) => ({ ...f, images: [...f.images, url] }));
          }
          ok += 1;
        } catch (err) {
          emitError(`"${file.name}": ${err.response?.data?.message || 'upload failed.'}`);
        }
      }
    } finally {
      setUploading(false);
      setUploadNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    return ok;
  }

  async function removeImage(url) {
    if (!(await confirm('Remove this photo from the product?', { danger: true, confirmLabel: 'Remove' }))) return;
    setForm((f) => ({ ...f, images: f.images.filter((i) => i !== url) }));
    deleteCloudinaryAsset(url).catch(() => {}); // best-effort, mirrors the backend's own cleanup
  }

  async function removeVideo(url) {
    if (!(await confirm('Remove this video from the product?', { danger: true, confirmLabel: 'Remove' }))) return;
    setForm((f) => ({ ...f, videos: f.videos.filter((v) => v !== url) }));
    deleteCloudinaryAsset(url).catch(() => {});
  }

  function makeCover(url) {
    setForm((f) => ({ ...f, images: [url, ...f.images.filter((i) => i !== url)] }));
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || form.price === '') {
      emitError('Name and price are required.');
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      price: Number(form.price),
      deliveryCharge: Number(form.deliveryCharge) || 0,
      stock: Number(form.stock) || 0,
      lowStockThreshold: Number(form.lowStockThreshold) || 0,
      paymentPolicy: {
        codAllowed: form.paymentPolicy.codAllowed,
        advanceType: form.paymentPolicy.codAllowed ? form.paymentPolicy.advanceType : 'none',
        advanceAmount: Number(form.paymentPolicy.advanceAmount) || 0,
        advancePercent: Number(form.paymentPolicy.advancePercent) || 0,
      },
    };
    try {
      if (isEdit) await updateProduct(id, payload);
      else {
        await createProduct(payload);
        clearDraft();
      }
      navigate('/products');
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5 sm:mb-6">
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-ui-ink">{isEdit ? 'Edit product' : 'New product'}</h1>
        <Link to="/products" className="text-sm text-ui-muted hover:text-ui-brand underline underline-offset-4">Back to catalogue</Link>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-5">
        {/* Media: photos + videos */}
        <div>
          <span className="label">Media</span>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
            {form.images.map((url, idx) => (
              <div
                key={url}
                className="relative aspect-square rounded-xl overflow-hidden border border-ui-line group bg-ui-surfaceAlt"
              >
                {/* Tapping the photo body previews it — never deletes. */}
                <button
                  type="button"
                  onClick={() => setPreview({ type: 'image', url })}
                  className="absolute inset-0"
                  aria-label="Preview image"
                >
                  <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>

                {idx === 0 && (
                  <span className="absolute bottom-0 inset-x-0 bg-ui-brand text-white text-[9px] sm:text-[10px] text-center py-0.5 pointer-events-none">
                    Cover
                  </span>
                )}

                {/* Actions live in the corners, clear of the tap-to-preview area. */}
                {idx !== 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      makeCover(url);
                    }}
                    title="Set as cover"
                    aria-label="Set as cover"
                    className="absolute top-1 left-1 w-7 h-7 rounded-full bg-white/95 shadow-sm border border-black/5 flex items-center justify-center text-ui-ink"
                  >
                    <Star size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(url);
                  }}
                  title="Remove"
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-white/95 shadow-sm border border-black/5 flex items-center justify-center text-ui-rust"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            {form.videos.map((url) => (
              <div
                key={url}
                className="relative aspect-square rounded-xl overflow-hidden border border-ui-line group bg-ui-dark"
              >
                <button
                  type="button"
                  onClick={() => setPreview({ type: 'video', url })}
                  className="absolute inset-0 flex items-center justify-center text-white/90"
                  aria-label="Preview video"
                >
                  <Play size={22} fill="currentColor" />
                </button>
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] sm:text-[10px] text-center py-0.5 pointer-events-none">
                  Video
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeVideo(url);
                  }}
                  title="Remove"
                  aria-label="Remove video"
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-white/95 shadow-sm border border-black/5 flex items-center justify-center text-ui-rust"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-ui-line hover:border-ui-brand text-ui-faint hover:text-ui-brand flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <span className="flex items-center gap-1">
                  <ImagePlus size={16} />
                  <VideoIcon size={16} />
                </span>
              )}
              <span className="text-[9px] sm:text-[10px] text-center px-1">
                {uploading ? uploadNote || 'Uploading…' : 'Add photos / videos'}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
          <p className="text-xs text-ui-muted mt-1.5">
            First photo is the cover shown in the catalogue. Select multiple photos and videos at once — upload photos
            straight from your phone (up to 15MB, auto-optimized), videos up to 50MB each. Tap a thumbnail to preview.
          </p>
        </div>

        <Field label="Name" required>
          <input
            className="input font-bangla"
            dir="auto"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={namePhonetic.onKeyDown}
            onClick={namePhonetic.onClick}
            onBlur={namePhonetic.onBlur}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Price" required>
            <input type="number" min="0" step="0.01" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          <Field label="Delivery charge">
            <input type="number" min="0" step="0.01" className="input" value={form.deliveryCharge} onChange={(e) => setForm({ ...form, deliveryCharge: e.target.value })} />
          </Field>
        </div>

        <Field label="Description">
          <RichTextEditor
            value={form.description}
            onChange={(html) => setForm((f) => ({ ...f, description: html }))}
            placeholder="Product details, specs, what's in the box…"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="SKU (optional)">
            <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </Field>
          <Field label="Category">
            <SearchableSelect
              placeholder="— uncategorised —"
              value={form.category || ''}
              onChange={(v) => setForm({ ...form, category: v })}
              options={categories.map((c) => ({ value: c._id, label: `${c.parent ? '— ' : ''}${c.name}` }))}
            />
          </Field>
        </div>

        {/* Inventory */}
        <div className="border-t border-ui-line pt-4">
          <span className="label mb-2">Inventory</span>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={form.trackInventory} onChange={(e) => setForm({ ...form, trackInventory: e.target.checked })} />
            Track stock for this product (unchecked = always available, e.g. made-to-order items)
          </label>
          {form.trackInventory && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Stock on hand">
                <input type="number" min="0" className="input" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </Field>
              <Field label="Low-stock alert threshold">
                <input type="number" min="0" className="input" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
              </Field>
            </div>
          )}
        </div>

        {/* Payment policy */}
        <div className="border-t border-ui-line pt-4">
          <span className="label mb-2">Payment policy</span>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={form.paymentPolicy.codAllowed}
              onChange={(e) =>
                setForm({ ...form, paymentPolicy: { ...form.paymentPolicy, codAllowed: e.target.checked } })
              }
            />
            Cash on Delivery allowed for this product
          </label>

          {!form.paymentPolicy.codAllowed && (
            <p className="text-xs text-ui-muted bg-ui-surfaceAlt border border-ui-line rounded-lg px-3 py-2 mb-1">
              Customers must pay the full price in advance via bKash — COD won't be offered at checkout for this
              product.
            </p>
          )}

          {form.paymentPolicy.codAllowed && (
            <div className="space-y-3">
              <Field label="Advance requirement">
                <SearchableSelect
                  value={form.paymentPolicy.advanceType}
                  onChange={(v) =>
                    setForm({ ...form, paymentPolicy: { ...form.paymentPolicy, advanceType: v } })
                  }
                  options={[
                    { value: 'none', label: 'None — full Cash on Delivery' },
                    { value: 'fixed', label: 'Fixed amount per unit' },
                    { value: 'percent', label: 'Percentage of price' },
                  ]}
                  clearable={false}
                />
              </Field>
              {form.paymentPolicy.advanceType === 'fixed' && (
                <Field label="Advance amount (৳ per unit)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={form.paymentPolicy.advanceAmount}
                    onChange={(e) =>
                      setForm({ ...form, paymentPolicy: { ...form.paymentPolicy, advanceAmount: e.target.value } })
                    }
                  />
                </Field>
              )}
              {form.paymentPolicy.advanceType === 'percent' && (
                <Field label="Advance percentage (%)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="input"
                    value={form.paymentPolicy.advancePercent}
                    onChange={(e) =>
                      setForm({ ...form, paymentPolicy: { ...form.paymentPolicy, advancePercent: e.target.value } })
                    }
                  />
                </Field>
              )}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Active (visible in the storefront and order form)
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Link to="/products" className="btn-secondary">Cancel</Link>
          <button disabled={saving || uploading} className="btn-primary">{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}</button>
        </div>
      </form>

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 sm:p-8"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
          {preview.type === 'image' ? (
            <img
              src={preview.url}
              alt=""
              className="max-w-full max-h-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              src={preview.url}
              controls
              autoPlay
              playsInline
              className="max-w-full max-h-full rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="label">
        {label} {required && <span className="text-ui-rust">*</span>}
      </span>
      {children}
    </label>
  );
}
