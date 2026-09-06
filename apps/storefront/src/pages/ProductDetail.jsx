import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ChevronRight, Home, Minus, Plus, Heart, ShoppingBag, Check, ArrowLeft,
  ShieldCheck, Truck, Banknote,
} from 'lucide-react';
import { getProduct, getProducts, recordProductView } from '../api/client';
import { formatMoney } from '../utils/format';
import { describeProductPolicy } from '../utils/paymentPolicy';
import { useCart } from '../context/CartContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { getSessionId, shouldLogProductView, track } from '../lib/analytics';
import ProductCard from '../components/ProductCard';
import ProductGallery from '../components/ProductGallery';
import RichText from '../components/RichText';

const POLICY_TONE_CLASSES = {
  rust: 'bg-red-50 text-ui-rust border-red-100',
  gold: 'bg-amber-50 text-ui-gold border-amber-100',
  brand: 'bg-ui-brand/10 text-ui-brand border-ui-brand/20',
};

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem, isSaved, toggleSaved } = useCart();
  const { isAuthed } = useCustomerAuth();

  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [related, setRelated] = useState([]);

  useEffect(() => {
    setProduct(null);
    setError('');
    setQty(1);
    getProduct(slug)
      .then((p) => {
        setProduct(p);
        if (shouldLogProductView(p._id)) {
          recordProductView(p._id, { sessionId: getSessionId(), path: window.location.pathname });
        }
        const catId = p.category?._id || p.category;
        if (catId) {
          getProducts({ active: 'true', category: catId, limit: 8, sort: 'popular' })
            .then((d) => setRelated((d.products || []).filter((x) => x._id !== p._id).slice(0, 4)))
            .catch(() => {});
        }
      })
      .catch(() => setError('এই প্রোডাক্টটি খুঁজে পাওয়া যায়নি।'));
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center text-ui-muted">
        {error}
        <div className="mt-4">
          <Link to="/shop" className="btn-secondary">
            <ArrowLeft size={15} /> শপে ফিরে যান
          </Link>
        </div>
      </div>
    );
  }

  if (!product) {
    return <div className="max-w-5xl mx-auto px-4 py-24 text-center text-ui-muted text-sm">লোড হচ্ছে…</div>;
  }

  const outOfStock = product.trackInventory && product.stock <= 0;
  const lowStock =
    product.trackInventory && product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 5);
  const max = product.trackInventory ? product.stock : 99;
  const saved = isSaved(product._id);
  const images = product.images && product.images.length ? product.images : [];
  const policyBadge = describeProductPolicy(product.paymentPolicy, product.price);
  const codAllowed = product.paymentPolicy?.codAllowed !== false;

  const handleAdd = () => {
    addItem(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  const handleSave = async () => {
    // Guests can save too — kept in localStorage, merged on sign-in.
    await toggleSaved(product._id);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <nav className="flex items-center gap-1.5 text-xs text-ui-muted flex-wrap mb-5">
        <Link to="/shop" className="hover:text-ui-brand inline-flex items-center gap-1">
          <Home size={12} /> শপ
        </Link>
        {(product.breadcrumb || []).map((c) => (
          <span key={c._id} className="inline-flex items-center gap-1.5">
            <ChevronRight size={12} />
            <Link to={`/shop/c/${c.slug}`} className="hover:text-ui-brand">
              {c.name}
            </Link>
          </span>
        ))}
      </nav>

      <div className="grid md:grid-cols-2 gap-5 sm:gap-8 md:gap-10">
        {/* Gallery */}
        <div className="md:sticky md:top-6 self-start min-w-0">
          <ProductGallery images={images} videos={product.videos} name={product.name} />
        </div>

        {/* Info */}
        <div className="min-w-0">
          {product.category?.name && (
            <Link
              to={`/shop/c/${product.category.slug}`}
              className="text-xs uppercase tracking-wide text-ui-faint hover:text-ui-brand"
            >
              {product.category.name}
            </Link>
          )}
          <h1 className="font-display text-xl sm:text-2xl md:text-3xl text-ui-ink mt-1 break-words">{product.name}</h1>

          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-mono text-2xl text-ui-brand font-semibold">
              {formatMoney(product.price)}
            </span>
            {product.deliveryCharge > 0 && (
              <span className="text-sm text-ui-muted">+ {formatMoney(product.deliveryCharge)} ডেলিভারি চার্জ</span>
            )}
          </div>

          <div className="mt-2 text-sm">
            {outOfStock ? (
              <span className="text-ui-rust font-medium">স্টক নেই</span>
            ) : lowStock ? (
              <span className="text-ui-gold">মাত্র {product.stock}টি বাকি</span>
            ) : (
              <span className="text-ui-brand inline-flex items-center gap-1">
                <Check size={14} /> স্টকে আছে
              </span>
            )}
            {product.sku && <span className="text-ui-faint ml-3">SKU: {product.sku}</span>}
          </div>

          <div
            className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${POLICY_TONE_CLASSES[policyBadge.tone]}`}
          >
            <Banknote size={14} />
            {policyBadge.text}
          </div>

          <RichText html={product.description} className="mt-4" />

          {!outOfStock && (
            <div className="mt-6 flex items-center gap-3">
              <div className="flex items-center border border-ui-line rounded-xl overflow-hidden">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="px-3 py-2.5 text-ui-muted hover:bg-ui-surfaceAlt"
                  aria-label="কমান"
                >
                  <Minus size={15} />
                </button>
                <span className="w-10 text-center text-sm font-mono">{qty}</span>
                <button
                  onClick={() => setQty((q) => Math.min(max, q + 1))}
                  disabled={qty >= max}
                  className="px-3 py-2.5 text-ui-muted hover:bg-ui-surfaceAlt disabled:opacity-40"
                  aria-label="বাড়ান"
                >
                  <Plus size={15} />
                </button>
              </div>
              <button onClick={handleAdd} className="btn-primary flex-1 py-3 gap-2">
                {added ? <Check size={16} /> : <ShoppingBag size={16} />}
                {added ? 'কার্টে যোগ হয়েছে' : 'কার্টে যোগ করুন'}
              </button>
            </div>
          )}

          <button
            onClick={handleSave}
            className="mt-3 inline-flex items-center gap-2 text-sm text-ui-muted hover:text-ui-rust"
          >
            <Heart size={16} className={saved ? 'fill-ui-rust text-ui-rust' : ''} />
            {saved ? 'পছন্দের তালিকায় আছে' : 'পরে কেনার জন্য সেভ করুন'}
          </button>

          <div className="mt-6 pt-5 border-t border-dashed border-ui-line grid grid-cols-3 gap-2 text-center">
            <TrustItem icon={ShieldCheck} label="আসল প্রোডাক্ট" />
            <TrustItem icon={Truck} label="দ্রুত ডেলিভারি" />
            <TrustItem icon={Banknote} label={codAllowed ? 'ক্যাশ অন ডেলিভারি' : 'নিরাপদ অগ্রিম পেমেন্ট'} />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-xl text-ui-ink mb-4">এই ক্যাটাগরিতে আরও প্রোডাক্ট</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {related.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TrustItem({ icon: Icon, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-9 h-9 rounded-xl bg-ui-brand/10 text-ui-brand flex items-center justify-center">
        <Icon size={16} />
      </div>
      <span className="text-[11px] text-ui-muted leading-tight">{label}</span>
    </div>
  );
}
