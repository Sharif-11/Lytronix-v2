import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatMoney } from '../utils/format';

export default function Cart() {
  const { items, setQuantity, removeItem, subtotal, deliveryTotal } = useCart();
  const grandTotal = subtotal + deliveryTotal;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-brand mb-6">
        <ArrowLeft size={15} /> কেনাকাটা চালিয়ে যান
      </Link>

      <h1 className="font-display text-2xl sm:text-3xl text-ui-brand mb-6">আপনার কার্ট</h1>

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <ShoppingBag size={32} className="mx-auto text-ui-faint mb-3" />
          <p className="text-ui-muted mb-4">আপনার কার্ট খালি।</p>
          <Link to="/shop" className="btn-primary inline-flex">
            ক্যাটালগ দেখুন
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="card p-4 sm:p-5">
            <div className="space-y-3">
              {items.map((it) => {
                const overStock =
                  it.trackInventory && it.stock != null && it.quantity > it.stock;
                return (
                  <div
                    key={it.productId}
                    className="flex items-center gap-3 border-b border-dashed border-ui-line pb-3 last:border-0 last:pb-0"
                  >
                    <Link
                      to={`/shop/p/${it.slug || it.productId}`}
                      className="w-14 h-14 rounded-xl bg-ui-surfaceAlt overflow-hidden shrink-0 border border-ui-line"
                    >
                      {it.imageUrl && (
                        <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover" />
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/shop/p/${it.slug || it.productId}`}
                        className="text-sm font-medium text-ui-ink hover:text-ui-brand line-clamp-1"
                      >
                        {it.name}
                      </Link>
                      <div className="text-xs font-mono text-ui-muted">{formatMoney(it.unitPrice)} প্রতিটি</div>
                      {overStock && (
                        <div className="text-xs text-ui-rust mt-0.5">স্টকে আছে মাত্র {it.stock}টি</div>
                      )}
                    </div>
                    <div className="flex items-center border border-ui-line rounded-lg overflow-hidden shrink-0">
                      <button
                        onClick={() => setQuantity(it.productId, it.quantity - 1)}
                        className="px-2 py-1.5 text-ui-muted hover:bg-ui-surfaceAlt"
                        aria-label="কমান"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-8 text-center text-sm font-mono">{it.quantity}</span>
                      <button
                        onClick={() => setQuantity(it.productId, it.quantity + 1)}
                        className="px-2 py-1.5 text-ui-muted hover:bg-ui-surfaceAlt"
                        aria-label="বাড়ান"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <div className="w-20 text-right font-mono text-sm shrink-0">
                      {formatMoney(it.unitPrice * it.quantity)}
                    </div>
                    <button
                      onClick={() => removeItem(it.productId)}
                      className="text-ui-rust hover:opacity-70 shrink-0"
                      aria-label="সরান"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-ui-line space-y-1 font-mono text-sm">
              <Row label="সাবটোটাল" value={formatMoney(subtotal)} muted />
              <Row label="ডেলিভারি চার্জ" value={formatMoney(deliveryTotal)} muted />
              <Row label="সর্বমোট" value={formatMoney(grandTotal)} strong />
            </div>
          </section>

          <Link to="/shop/checkout" className="btn-primary w-full py-3 text-base">
            চেকআউটে যান
          </Link>
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
