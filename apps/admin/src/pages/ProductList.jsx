import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProducts, deleteProduct, getCategories } from '../api/client';
import { formatMoney } from '../utils/format';
import { PackageX, ImageOff, Loader2, Link2, Check, Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import SearchableSelect from '../components/SearchableSelect';
import { useConfirm } from '../context/ConfirmContext';
import { productLandingUrl, copyToClipboard } from '../lib/publicLinks';
import usePageTitle from '../lib/usePageTitle';

// Compact, evenly-split card action. Icon-only on phones (where a product
// card is only ~half the viewport wide); icon + label from `sm` up.
const cardActionClass =
  'btn-secondary flex-1 min-w-0 justify-center px-1.5 sm:px-2.5 py-1.5 sm:py-2 text-[11px] sm:text-xs';

function ShareLinkButton({ slug, label }) {
  const [copied, setCopied] = useState(false);
  if (!slug) return null;
  const onClick = async () => {
    const ok = await copyToClipboard(productLandingUrl(slug));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  return (
    <button onClick={onClick} title={productLandingUrl(slug)} className={cardActionClass} aria-label={label}>
      {copied ? (
        <>
          <Check size={13} className="text-ui-brand" />
          <span className="hidden sm:inline text-ui-brand">Copied</span>
        </>
      ) : (
        <>
          <Link2 size={13} />
          <span className="hidden sm:inline">Link</span>
        </>
      )}
    </button>
  );
}

export default function ProductList() {
  const { t } = useLanguage();
  usePageTitle(t('products.title'));
  const confirm = useConfirm();
  const SORTS = [
    { value: 'newest', label: t('products.sortNewest') },
    { value: 'popular', label: t('products.sortPopular') },
    { value: 'price_asc', label: t('products.sortPriceAsc') },
    { value: 'price_desc', label: t('products.sortPriceDesc') },
    { value: 'name_asc', label: t('products.sortNameAsc') },
  ];
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false); // subsequent pages via scroll
  const sentinelRef = useRef(null);

  useEffect(() => {
    getCategories({ includeInactive: 'true' }).then((d) => setCategories(d.flat || [])).catch(() => {});
  }, []);

  // Filters/search/sort changing resets to page 1 and replaces the list.
  useEffect(() => {
    setLoading(true);
    listProducts({ search: search || undefined, category: category || undefined, sort, page: 1, limit: 24 })
      .then((d) => {
        setProducts(d.products);
        setTotal(d.total);
        setPages(d.pages);
        setPage(1);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sort]);

  // Scrolling near the bottom loads the next page and appends to the list —
  // "auto scrolling effect" instead of manual Prev/Next.
  const loadMore = useCallback(() => {
    if (loadingMore || loading || page >= pages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    listProducts({ search: search || undefined, category: category || undefined, sort, page: nextPage, limit: 24 })
      .then((d) => {
        setProducts((prev) => [...prev, ...d.products]);
        setPage(nextPage);
        setPages(d.pages);
        setTotal(d.total);
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, loading, page, pages, search, category, sort]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '600px' } // start fetching well before the sentinel is actually visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    listProducts({ search: search || undefined, category: category || undefined, sort, page: 1, limit: 24 })
      .then((d) => {
        setProducts(d.products);
        setTotal(d.total);
        setPages(d.pages);
        setPage(1);
      })
      .finally(() => setLoading(false));
  };

  const handleDelete = async (id, name) => {
    if (
      !(await confirm(`Delete "${name}" from the catalogue? Existing orders keep their own copy of this item.`, {
        danger: true,
        confirmLabel: 'Delete',
      }))
    )
      return;
    await deleteProduct(id);
    setProducts((prev) => prev.filter((p) => p._id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 py-4 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 sm:gap-3 mb-4 sm:mb-5">
        <div>
          <h1 className="font-display font-bold text-xl sm:text-3xl text-ui-ink">{t('products.title')}</h1>
          <p className="text-xs sm:text-sm text-ui-muted mt-0.5 sm:mt-1">{t('products.count', { n: total })}</p>
        </div>
        <Link to="/products/new" className="btn-primary text-sm">
          {t('products.newProduct')}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 sm:mb-5">
        <form onSubmit={onSearchSubmit} className="flex gap-2 flex-1 min-w-[10rem]">
          <input
            className="input text-sm"
            placeholder={t('products.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-secondary text-sm shrink-0" type="submit">
            {t('common.search')}
          </button>
        </form>
        <SearchableSelect
          className="w-[9.5rem] sm:w-[13rem] shrink-0"
          placeholder={t('products.allCategories')}
          value={category}
          onChange={setCategory}
          options={categories.map((c) => ({ value: c._id, label: `${c.parent ? '— ' : ''}${c.name}` }))}
        />
        <SearchableSelect
          className="w-[8.5rem] sm:w-[11rem] shrink-0"
          value={sort}
          onChange={setSort}
          options={SORTS}
          clearable={false}
        />
      </div>

      {/* At least 2 up even on the smallest phones; more as the viewport grows. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card overflow-hidden animate-pulse">
              <div className="aspect-square bg-ui-surfaceAlt" />
              <div className="p-2.5 sm:p-4 space-y-1.5">
                <div className="h-3 bg-ui-surfaceAlt rounded w-3/4" />
                <div className="h-3 bg-ui-surfaceAlt rounded w-1/2" />
              </div>
            </div>
          ))}
        {!loading && products.length === 0 && (
          <p className="col-span-full text-ui-muted italic text-sm py-8 text-center">{t('products.noneMatch')}</p>
        )}
        {!loading &&
          products.map((p) => {
            const outOfStock = p.trackInventory && p.stock <= 0;
            const lowStock = p.trackInventory && p.stock > 0 && p.stock <= p.lowStockThreshold;
            const policy = p.paymentPolicy;
            const policyBadge =
              policy?.codAllowed === false
                ? t('products.noCod')
                : policy?.advanceType === 'fixed' && policy.advanceAmount > 0
                ? t('products.advanceFixed', { amount: policy.advanceAmount })
                : policy?.advanceType === 'percent' && policy.advancePercent > 0
                ? t('products.advancePercent', { percent: policy.advancePercent })
                : null;
            return (
              <div key={p._id} className="card overflow-hidden flex flex-col group">
                <Link to={`/products/${p._id}`} className="aspect-square bg-ui-surfaceAlt relative overflow-hidden block">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-ui-faint">
                      <ImageOff size={22} className="sm:w-7 sm:h-7" />
                    </div>
                  )}
                  {!p.isActive && (
                    <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 text-[8px] sm:text-[10px] uppercase font-medium bg-white/90 text-ui-muted border border-ui-line rounded-full px-1.5 sm:px-2 py-0.5">
                      {t('products.inactive')}
                    </span>
                  )}
                  {outOfStock && (
                    <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 text-[8px] sm:text-[10px] uppercase font-medium bg-red-50 text-ui-rust border border-red-200 rounded-full px-1.5 sm:px-2 py-0.5">
                      {t('products.outOfStock')}
                    </span>
                  )}
                  {lowStock && !outOfStock && (
                    <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 text-[8px] sm:text-[10px] uppercase font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 sm:px-2 py-0.5">
                      {t('products.lowStock')}
                    </span>
                  )}
                </Link>

                <div className="p-2.5 sm:p-4 flex flex-col flex-1">
                  <Link
                    to={`/products/${p._id}`}
                    className="font-display font-bold text-ui-ink text-xs sm:text-base leading-snug line-clamp-2 hover:text-ui-brand"
                  >
                    {p.name}
                  </Link>
                  <p className="text-[10px] sm:text-xs text-ui-faint mt-0.5 truncate">
                    {p.category?.name || t('products.uncategorised')}
                    {p.viewCount ? ` · ${t('products.views', { n: p.viewCount })}` : ''}
                  </p>
                  {policyBadge && (
                    <span
                      className={`mt-1 sm:mt-1.5 inline-flex w-fit items-center rounded-full px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[10px] font-medium uppercase ${
                        policy?.codAllowed === false
                          ? 'bg-red-50 text-ui-rust border border-red-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {policyBadge}
                    </span>
                  )}

                  <div className="mt-2 sm:mt-3 flex items-center justify-between font-mono text-xs sm:text-sm">
                    <span className="text-ui-brand font-semibold">{formatMoney(p.price)}</span>
                    <span className="hidden sm:inline text-ui-muted">
                      +{formatMoney(p.deliveryCharge)} {t('products.deliveryShort')}
                    </span>
                  </div>

                  {p.trackInventory && (
                    <p
                      className={`text-[10px] sm:text-xs mt-1 sm:mt-1.5 flex items-center gap-1 ${
                        outOfStock ? 'text-ui-rust' : lowStock ? 'text-amber-600' : 'text-ui-muted'
                      }`}
                    >
                      {outOfStock && <PackageX size={11} />} {t('products.inStock', { n: p.stock })}
                    </p>
                  )}

                  <div className="mt-2 sm:mt-4 flex gap-1.5 sm:gap-2 pt-2 sm:pt-3 border-t border-dashed border-ui-line">
                    <Link
                      to={`/products/${p._id}/edit`}
                      className={cardActionClass}
                      aria-label={t('common.edit')}
                    >
                      <Pencil size={13} />
                      <span className="hidden sm:inline">{t('common.edit')}</span>
                    </Link>
                    <ShareLinkButton slug={p.slug} label={t('products.shareLink')} />
                    <button
                      onClick={() => handleDelete(p._id, p.name)}
                      className={`${cardActionClass} text-ui-rust`}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 size={13} />
                      <span className="hidden sm:inline">{t('common.delete')}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Infinite-scroll sentinel + fallback control */}
      {!loading && page < pages && (
        <div ref={sentinelRef} className="flex items-center justify-center py-8">
          {loadingMore ? (
            <span className="inline-flex items-center gap-2 text-sm text-ui-muted">
              <Loader2 size={16} className="animate-spin" /> {t('common.loading')}
            </span>
          ) : (
            <button onClick={loadMore} className="btn-secondary text-sm">
              {t('common.next')}
            </button>
          )}
        </div>
      )}
      {!loading && page >= pages && products.length > 0 && (
        <p className="text-center text-xs text-ui-faint py-6">
          {t('products.count', { n: total })}
        </p>
      )}
    </div>
  );
}
