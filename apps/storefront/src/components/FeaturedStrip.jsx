import { useEffect, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { getProducts } from '../api/client';
import ProductCard from './ProductCard';

/**
 * A horizontally-scrolling "জনপ্রিয় এখন" strip on the shop home — the first
 * thing that pulls a visitor toward actual products before they scroll the
 * full catalogue. Gently auto-advances; any touch/mouse interaction pauses
 * it for a while so it never fights the user.
 */
export default function FeaturedStrip({
  title = 'জনপ্রিয় এখন',
  sort = 'popular',
  limit = 12,
}) {
  const [products, setProducts] = useState([]);
  const scrollerRef = useRef(null);
  const pausedUntil = useRef(0);

  useEffect(() => {
    getProducts({ sort, inStock: 'true', limit })
      .then((d) => setProducts(d.products || []))
      .catch(() => setProducts([]));
  }, [sort, limit]);

  useEffect(() => {
    if (products.length < 3) return undefined;
    const el = scrollerRef.current;
    if (!el) return undefined;

    const tick = () => {
      if (Date.now() < pausedUntil.current) return;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      el.scrollTo({
        left: atEnd ? 0 : el.scrollLeft + el.clientWidth * 0.8,
        behavior: 'smooth',
      });
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [products.length]);

  const pause = () => {
    pausedUntil.current = Date.now() + 8000;
  };

  if (products.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <span className="w-7 h-7 rounded-lg bg-ui-brand/10 text-ui-brand flex items-center justify-center shrink-0">
          <Flame size={16} />
        </span>
        <h2 className="font-display text-lg sm:text-xl text-ui-ink">{title}</h2>
      </div>

      <div
        ref={scrollerRef}
        onPointerDown={pause}
        onTouchStart={pause}
        onWheel={pause}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p) => (
          <div key={p._id} className="shrink-0 w-40 sm:w-52 snap-start">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
