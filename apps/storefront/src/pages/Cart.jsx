import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatMoney } from '../utils/format';
import usePageTitle from '../lib/usePageTitle';

function QtyStepper({ quantity, onChange }) {
  return (
    <div className="flex items-center border border-ui-line rounded-lg overflow-hidden shrink-0">
      <button
        onClick={() => onChange(quantity - 1)}
        className="px-2.5 py-2 text-ui-muted active:bg-ui-surfaceAlt"
        aria-label="কমান"
      >
        <Minus size={14} />
      </button>
      <span className="w-9 text-center text-sm font-mono tabular-nums">{quantity}</span>
      <button
        onClick={() => onChange(quantity + 1)}
        className="px-2.5 py-2 text-ui-muted active:bg-ui-surfaceAlt"
        aria-label="বাড়ান"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function Cart() {
  usePageTitle('আপনার কার্ট');
  const { items, setQuantity, removeItem, subtotal, deliveryTotal } = useCart();
  const grandTotal = subtotal + deliveryTotal;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-brand mb-4 sm:mb-6">
        <ArrowLeft size={15} /> কেনাকাটা চালিয়ে যান
      </Link>

      <h1 className="font-display text-xl sm:text-3xl text-ui-brand mb-4 sm:mb-6">আপনার কার্ট</h1>

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <ShoppingBag size={32} className="mx-auto text-ui-faint mb-3" />
          <p className="text-ui-muted mb-4">আপনার কার্ট খালি।</p>
          <Link to="/shop/products" className="btn-primary inline-flex">
            প্রোডাক্ট দেখুন
          </Link>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <section className="card p-3.5 sm:p-5">
            <div className="divide-y divide-dashed divide-ui-line">
              {items.map((it) => {
                const overStock =
                  it.trackInventory && it.stock != null && it.quantity > it.stock;
                return (
                  <div key={it.productId} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <Link
                      to={`/shop/p/${it.slug || it.productId}`}
                      className="w-16 h-16 rounded-xl bg-ui-surfaceAlt overflow-hidden shrink-0 border border-ui-line"
                    >
                      {it.imageUrl && (
                        <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover" />
                      )}
                    </Link>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/shop/p/${it.slug || it.productId}`}
                          className="text-sm font-medium text-ui-ink hover:text-ui-brand line-clamp-2"
                        >
                          {it.name}
                        </Link>
                        <button
                          onClick={() => removeItem(it.productId)}
                          className="text-ui-rust active:opacity-60 shrink-0 -mt-0.5 p-1"
                          aria-label="রিমুভ"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="text-xs font-mono text-ui-muted mt-0.5">{formatMoney(it.unitPrice)} প্রতিটি</div>
                      {overStock && (
                        <div className="text-xs text-ui-rust mt-0.5">স্টকে আছে মাত্র {it.stock}টি</div>
                      )}

                      <div className="flex items-center justify-between gap-2 mt-2">
                        <QtyStepper
                          quantity={it.quantity}
                          onChange={(q) => setQuantity(it.productId, q)}
                        />
                        <span className="font-mono text-sm font-medium text-ui-ink">
                          {formatMoney(it.unitPrice * it.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-ui-line space-y-1 font-mono text-sm">
              <Row label="সাবটোটাল" value={formatMoney(subtotal)} muted />
              <Row label="ডেলিভারি চার্জ" value={formatMoney(deliveryTotal)} muted />
              <Row label="গ্র্যান্ড টোটাল" value={formatMoney(grandTotal)} strong />
            </div>
          </section>

          {/* Sticky on mobile so "checkout" is always reachable above the tab bar */}
          <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] sm:static z-10">
            <Link
              to="/shop/checkout"
              className="btn-primary w-full py-3 text-base shadow-floating sm:shadow-none"
            >
              চেকআউটে যান · {formatMoney(grandTotal)}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted, strong }) {
  return (
    <div
      className={`flex justify-between ${strong ? 'text-ui-brand font-semibold text-base pt-1' : muted ? 'text-ui-muted' : ''}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
