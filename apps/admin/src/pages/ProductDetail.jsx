import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Pencil, Trash2, Link2, Check, ArrowLeft, ChevronLeft, ChevronRight, X,
  ImageOff, Play, ExternalLink,
} from 'lucide-react';
import { getProduct, deleteProduct } from '../api/client';
import { formatMoney } from '../utils/format';
import { useConfirm } from '../context/ConfirmContext';
import { productLandingUrl, copyToClipboard } from '../lib/publicLinks';
import RichText from '../components/RichText';
import Loader from '../components/Loader';
import usePageTitle from '../lib/usePageTitle';

function policyText(p) {
  if (!p) return 'Full Cash on Delivery';
  if (p.codAllowed === false) return 'Full advance payment required (no COD)';
  if (p.advanceType === 'fixed' && p.advanceAmount > 0) return `৳${p.advanceAmount} advance per unit, rest on delivery`;
  if (p.advanceType === 'percent' && p.advancePercent > 0) return `${p.advancePercent}% advance, rest on delivery`;
  return 'Full Cash on Delivery';
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [product, setProduct] = useState(null);
  usePageTitle(product?.name || 'Product');
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getProduct(id)
      .then((p) => {
        if (!alive) return;
        setProduct(p);
        setStatus('ok');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [id]);

  const handleDelete = async () => {
    if (!(await confirm(`Delete "${product.name}" from the catalogue? Existing orders keep their own copy of this item.`, {
      danger: true,
      confirmLabel: 'Delete',
    }))) return;
    await deleteProduct(product._id);
    navigate('/products');
  };

  const copyLink = async () => {
    if (await copyToClipboard(productLandingUrl(product.slug))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  if (status === 'loading') {
    return <Loader />;
  }
  if (status === 'error' || !product) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-5 py-16 text-center">
        <p className="text-ui-muted mb-4">Product not found.</p>
        <Link to="/products" className="btn-secondary inline-flex"><ArrowLeft size={15} /> Back to catalogue</Link>
      </div>
    );
  }

  const outOfStock = product.trackInventory && product.stock <= 0;
  const lowStock = product.trackInventory && product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 5);
  const landing = productLandingUrl(product.slug);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-5 py-5 sm:py-8">
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <button onClick={copyLink} className="btn-secondary text-xs flex-1 sm:flex-none" title={landing}>
            {copied ? <Check size={13} className="text-ui-brand" /> : <Link2 size={13} />}
            {copied ? 'Copied' : 'Public link'}
          </button>
          <Link to={`/products/${product._id}/edit`} className="btn-secondary text-xs flex-1 sm:flex-none">
            <Pencil size={13} /> Edit
          </Link>
          <button onClick={handleDelete} className="btn-secondary text-xs text-ui-rust flex-1 sm:flex-none">
            <Trash2 size={13} /> Delete
          </button>
        </div>
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-brand self-start"
        >
          <ArrowLeft size={15} /> Catalogue
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
        <div className="min-w-0">
          <Gallery images={product.images} videos={product.videos} name={product.name} />
        </div>

        <div className="min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h1 className="font-display font-bold text-xl sm:text-2xl text-ui-ink flex-1 min-w-0">{product.name}</h1>
            <span
              className={`chip ${product.isActive ? 'bg-ui-brand/10 text-ui-brand border-ui-brand/20' : 'bg-ui-surfaceAlt text-ui-muted border-ui-line'}`}
            >
              {product.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div className="mt-3 font-mono text-2xl text-ui-brand font-semibold">{formatMoney(product.price)}</div>

          <dl className="mt-5 space-y-3 sm:space-y-2.5 text-sm">
            <Row k="Delivery charge" v={formatMoney(product.deliveryCharge || 0)} />
            <Row
              k="Category"
              v={
                (product.breadcrumb && product.breadcrumb.length
                  ? product.breadcrumb.map((c) => c.name).join(' / ')
                  : product.category?.name) || <span className="text-ui-faint">Uncategorised</span>
              }
            />
            <Row k="SKU" v={product.sku || <span className="text-ui-faint">—</span>} />
            <Row k="Slug" v={<span className="font-mono text-xs">{product.slug}</span>} />
            <Row
              k="Stock"
              v={
                !product.trackInventory ? (
                  <span className="text-ui-muted">Not tracked (unlimited)</span>
                ) : (
                  <span className={outOfStock ? 'text-ui-rust' : lowStock ? 'text-amber-600' : ''}>
                    {product.stock} in stock{lowStock ? ` · low (≤ ${product.lowStockThreshold})` : ''}
                    {outOfStock ? ' · out of stock' : ''}
                  </span>
                )
              }
            />
            <Row k="Payment policy" v={policyText(product.paymentPolicy)} />
            <Row k="Views" v={product.viewCount || 0} />
            <Row k="Units ordered" v={product.orderCount || 0} />
            <Row k="Created" v={fmtDate(product.createdAt)} />
            <Row k="Updated" v={fmtDate(product.updatedAt)} />
          </dl>

          <a
            href={landing}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-ui-brand hover:underline break-all"
          >
            <ExternalLink size={12} className="shrink-0" /> {landing}
          </a>
        </div>
      </div>

      {product.description && (
        <div className="mt-8">
          <h2 className="label mb-2">Description</h2>
          <RichText html={product.description} />
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <dt className="sm:w-32 shrink-0 text-ui-faint sm:text-ui-muted text-xs sm:text-sm">{k}</dt>
      <dd className="text-ui-ink min-w-0 break-words">{v}</dd>
    </div>
  );
}

/* Compact read-only gallery: contain-fit main view, arrows, thumbs, click to
   open a full-screen overlay. */
function Gallery({ images = [], videos = [], name = '' }) {
  const media = [
    ...(images || []).filter(Boolean).map((url) => ({ type: 'image', url })),
    ...(videos || []).filter(Boolean).map((url) => ({ type: 'video', url })),
  ];
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const at = (n) => setIdx((media.length + n) % media.length);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setZoom(false);
      if (e.key === 'ArrowRight') at(idx + 1);
      if (e.key === 'ArrowLeft') at(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, idx, media.length]);

  if (!media.length) {
    return (
      <div className="aspect-square rounded-xl border border-ui-line bg-ui-surfaceAlt flex flex-col items-center justify-center text-ui-faint">
        <ImageOff size={36} />
        <span className="text-xs mt-2">No media</span>
      </div>
    );
  }
  const cur = media[idx];

  return (
    <>
      <div className="relative group rounded-xl border border-ui-line bg-white overflow-hidden aspect-square flex items-center justify-center">
        {cur.type === 'video' ? (
          <video src={cur.url} controls className="w-full h-full object-contain bg-black" />
        ) : (
          <button type="button" onClick={() => setZoom(true)} className="w-full h-full">
            <img src={cur.url} alt={name} className="w-full h-full object-contain cursor-zoom-in" />
          </button>
        )}
        {media.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => at(idx - 1)}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              aria-label="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => at(idx + 1)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              aria-label="Next"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>

      {media.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <button
              key={m.url}
              type="button"
              onClick={() => setIdx(i)}
              className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 bg-white ${
                i === idx ? 'border-ui-brand' : 'border-ui-line'
              }`}
            >
              {m.type === 'video' ? (
                <span className="w-full h-full flex items-center justify-center bg-ui-ink/5 text-ui-muted">
                  <Play size={14} />
                </span>
              ) : (
                <img src={m.url} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col"
          onClick={() => setZoom(false)}
        >
          <div className="flex items-center justify-between px-4 h-14 text-white/90">
            <span className="text-sm font-mono">{idx + 1} / {media.length}</span>
            <button onClick={() => setZoom(false)} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-6" onClick={(e) => e.stopPropagation()}>
            {cur.type === 'video' ? (
              <video src={cur.url} controls autoPlay className="max-h-full max-w-full rounded-lg" />
            ) : (
              <img src={cur.url} alt={name} className="max-h-full max-w-full object-contain rounded-lg" />
            )}
          </div>
          {media.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); at(idx - 1); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                aria-label="Previous"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); at(idx + 1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                aria-label="Next"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
