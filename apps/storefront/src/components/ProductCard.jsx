import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Check, Heart, ImageOff } from 'lucide-react';
import { formatMoney } from '../utils/format';
import { describeProductPolicy } from '../utils/paymentPolicy';
import { useCart } from '../context/CartContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';

const POLICY_TONE_CLASSES = {
  rust: 'bg-red-50 text-ui-rust',
  gold: 'bg-amber-50 text-ui-gold',
  brand: 'bg-ui-brand/10 text-ui-brand',
};

const PLACEHOLDER_GRADIENTS = [
  'from-[#0A0B08] to-[#16180F]',
  'from-[#3A6216] to-[#0A0B08]',
  'from-[#4A7D1E] to-[#16180F]',
  'from-[#1F2937] to-[#0A0B08]',
  'from-[#4A7D1E] to-[#3A6216]',
];
function gradientFor(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_GRADIENTS[hash % PLACEHOLDER_GRADIENTS.length];
}

export default function ProductCard({ product }) {
  const { addItem, isSaved, toggleSaved } = useCart();
  const { isAuthed } = useCustomerAuth();
  const navigate = useNavigate();
  const [justAdded, setJustAdded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const outOfStock = product.trackInventory && product.stock <= 0;
  const lowStock =
    product.trackInventory && product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 5);
  const saved = isSaved(product._id);
  const to = `/shop/p/${product.slug || product._id}`;
  const policy = product.paymentPolicy;
  const isDefaultPolicy =
    !policy || (policy.codAllowed !== false && (!policy.advanceType || policy.advanceType === 'none'));
  const policyBadge = isDefaultPolicy ? null : describeProductPolicy(policy, product.price);

  const handleAdd = () => {
    addItem(product, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1300);
  };

  const handleSave = async () => {
    // Guests can save too — it's kept in localStorage and merged on sign-in.
    await toggleSaved(product._id);
  };

  return (
    <div
      className={`group rounded-2xl border border-ui-line bg-ui-panel overflow-hidden shadow-card hover:shadow-raised hover:-translate-y-1 hover:border-ui-brand/30 transition-all duration-200 flex flex-col ${
        outOfStock ? 'opacity-70' : ''
      }`}
    >
      <div className="relative">
        <Link
          to={to}
          className={`block relative h-40 sm:h-44 bg-gradient-to-br ${gradientFor(
            product._id
          )} flex items-center justify-center overflow-hidden`}
        >
          {product.imageUrl && !imgFailed ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="font-display text-4xl text-white/85 select-none">
              {product.name?.[0]?.toUpperCase() || <ImageOff size={28} />}
            </span>
          )}
          {outOfStock && (
            <span className="absolute top-2.5 left-2.5 inline-flex items-center rounded-full bg-black/70 text-white text-xs font-medium px-2.5 py-1">
              স্টক নেই
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={handleSave}
          aria-label={saved ? 'পছন্দের তালিকা থেকে রিমুভ' : 'পরে কেনার জন্য সেভ করুন'}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center shadow hover:scale-105 transition-transform"
        >
          <Heart size={15} className={saved ? 'fill-ui-rust text-ui-rust' : 'text-ui-muted'} />
        </button>
      </div>

      <div className="p-4 flex flex-col flex-1">
        {product.category?.name && (
          <span className="text-[11px] uppercase tracking-wide text-ui-faint mb-1">
            {product.category.name}
          </span>
        )}
        <Link
          to={to}
          className="font-display text-[15px] sm:text-base text-ui-ink leading-snug line-clamp-2 hover:text-ui-brand"
        >
          {product.name}
        </Link>

        <div className="mt-2 flex items-baseline justify-between">
          <span className="font-mono text-ui-brand font-semibold text-base">
            {formatMoney(product.price)}
          </span>
          {product.deliveryCharge > 0 && (
            <span className="text-xs text-ui-muted">+{formatMoney(product.deliveryCharge)} ডেলিভারি</span>
          )}
        </div>

        {lowStock && <p className="text-xs text-ui-gold mt-1">মাত্র {product.stock}টি বাকি</p>}

        {policyBadge && (
          <span
            className={`mt-1.5 inline-block w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${POLICY_TONE_CLASSES[policyBadge.tone]}`}
          >
            {policyBadge.text}
          </span>
        )}

        <div className="mt-auto pt-3 border-t border-dashed border-ui-line">
          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock}
            className="btn-primary w-full gap-1.5 disabled:opacity-50"
          >
            {justAdded ? <Check size={15} /> : <Plus size={15} />}
            {outOfStock ? 'স্টক নেই' : justAdded ? 'যোগ হয়েছে' : 'কার্টে যোগ করুন'}
          </button>
        </div>
      </div>
    </div>
  );
}
