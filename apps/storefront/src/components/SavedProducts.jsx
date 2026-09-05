import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { getWishlist, getProducts } from '../api/client';
import { useCart } from '../context/CartContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { formatMoney } from '../utils/format';

// Works for both a signed-in customer (server wishlist) and a guest
// (product ids from localStorage via CartContext).
export default function SavedProducts({ heading = 'পছন্দের প্রোডাক্ট' }) {
  const { isAuthed } = useCustomerAuth();
  const { savedIds, addItem, toggleSaved, reloadWishlist } = useCart();
  const [products, setProducts] = useState(null);

  useEffect(() => {
    let alive = true;
    const done = (list) => alive && setProducts(list);
    if (isAuthed) {
      getWishlist().then((d) => done(d.products || [])).catch(() => done([]));
    } else if (savedIds.length) {
      getProducts({ ids: savedIds.join(','), active: 'true', limit: 100 })
        .then((d) => done(d.products || []))
        .catch(() => done([]));
    } else {
      done([]);
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, savedIds.join(',')]);

  const remove = async (id) => {
    await toggleSaved(id);
    setProducts((prev) => (prev || []).filter((p) => p._id !== id));
    if (isAuthed) reloadWishlist();
  };

  const moveToCart = async (p) => {
    await addItem(p, 1);
    await remove(p._id);
  };

  if (products === null) return <p className="text-sm text-ui-muted">লোড হচ্ছে…</p>;

  if (products.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Heart size={30} className="mx-auto text-ui-faint mb-3" />
        <p className="text-ui-muted mb-4">আপনি এখনো কোনো প্রোডাক্ট সেভ করেননি।</p>
        <Link to="/shop/products" className="btn-primary inline-flex">
          প্রোডাক্ট দেখুন
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {heading && <h2 className="font-display text-lg text-ui-ink">{heading}</h2>}
      {!isAuthed && (
        <p className="text-xs text-ui-muted">
          এই তালিকা এই ডিভাইসে সেভ করা। লগইন করলে সব ডিভাইসে সিঙ্ক হবে।
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {products.map((p) => {
          const outOfStock = p.trackInventory && p.stock <= 0;
          return (
            <div key={p._id} className="card p-4 flex gap-3">
              <Link
                to={`/shop/p/${p.slug || p._id}`}
                className="w-16 h-16 rounded-xl bg-ui-surfaceAlt overflow-hidden border border-ui-line shrink-0"
              >
                {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/shop/p/${p.slug || p._id}`}
                  className="text-sm font-medium text-ui-ink hover:text-ui-brand line-clamp-2"
                >
                  {p.name}
                </Link>
                <div className="font-mono text-sm text-ui-brand mt-0.5">{formatMoney(p.price)}</div>
                <div className="flex gap-3 mt-2 text-xs">
                  <button
                    onClick={() => moveToCart(p)}
                    disabled={outOfStock}
                    className="text-ui-brand hover:underline inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    <ShoppingBag size={12} /> {outOfStock ? 'স্টক নেই' : 'কার্টে নিন'}
                  </button>
                  <button
                    onClick={() => remove(p._id)}
                    className="text-ui-rust hover:underline inline-flex items-center gap-1 ml-auto"
                  >
                    <Trash2 size={12} /> রিমুভ
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
