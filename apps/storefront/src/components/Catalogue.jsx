import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, ChevronRight, ChevronDown } from 'lucide-react';
import { getProducts, getCategories } from '../api/client';
import ProductCard from './ProductCard';
import SearchableSelect from './SearchableSelect';

const SORT_OPTIONS = [
  { value: 'newest', label: 'নতুন পণ্য' },
  { value: 'popular', label: 'জনপ্রিয়তা' },
  { value: 'price_asc', label: 'দাম: কম থেকে বেশি' },
  { value: 'price_desc', label: 'দাম: বেশি থেকে কম' },
  { value: 'name_asc', label: 'নাম: A–Z' },
];

// `lockedCategorySlug` pins the catalogue to one category (used by the
// /shop/c/:slug page); otherwise the category comes from the URL.
export default function Catalogue({ lockedCategorySlug = null }) {
  const [params, setParams] = useSearchParams();
  const [tree, setTree] = useState([]);
  const [data, setData] = useState({ products: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = params.get('q') || '';
  const sort = params.get('sort') || 'newest';
  const min = params.get('min') || '';
  const max = params.get('max') || '';
  const inStock = params.get('inStock') === 'true';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10));
  const activeCategory = lockedCategorySlug || params.get('category') || '';

  const patch = (next, { resetPage = true } = {}) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined || v === false) p.delete(k);
      else p.set(k, v);
    });
    if (resetPage) p.delete('page');
    setParams(p, { replace: true });
  };

  useEffect(() => {
    getCategories().then((d) => setTree(d.tree || [])).catch(() => setTree([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    getProducts({
      active: 'true',
      category: activeCategory || undefined,
      search: q || undefined,
      minPrice: min || undefined,
      maxPrice: max || undefined,
      inStock: inStock ? 'true' : undefined,
      sort,
      page,
      limit: 24,
    })
      .then(setData)
      .catch(() => setError('এই মুহূর্তে ক্যাটালগ লোড করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।'))
      .finally(() => setLoading(false));
  }, [activeCategory, q, min, max, inStock, sort, page]);

  const hasFilters = q || min || max || inStock || (!lockedCategorySlug && activeCategory);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block">
          <CategoryTree
            tree={tree}
            activeSlug={activeCategory}
            locked={Boolean(lockedCategorySlug)}
            onPick={(slug) => patch({ category: slug })}
          />
          <FilterPanel
            min={min}
            max={max}
            inStock={inStock}
            onChange={patch}
            className="mt-6"
          />
        </aside>

        <div>
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => setFiltersOpen(true)}
              className="lg:hidden btn-secondary py-2"
            >
              <SlidersHorizontal size={15} /> ফিল্টার
            </button>
            <p className="text-sm text-ui-muted">
              {loading ? 'লোড হচ্ছে…' : `${data.total}টি পণ্য`}
            </p>
            <SearchableSelect
              className="w-40 sm:max-w-[12rem] ml-auto"
              value={sort}
              onChange={(v) => patch({ sort: v }, { resetPage: false })}
              options={SORT_OPTIONS}
              clearable={false}
            />
          </div>

          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
              {q && (
                <Chip onClear={() => patch({ q: '' })}>“{q}”</Chip>
              )}
              {!lockedCategorySlug && activeCategory && (
                <Chip onClear={() => patch({ category: '' })}>{activeCategory}</Chip>
              )}
              {(min || max) && (
                <Chip onClear={() => patch({ min: '', max: '' })}>
                  ৳{min || 0}–{max || '∞'}
                </Chip>
              )}
              {inStock && <Chip onClear={() => patch({ inStock: false })}>স্টকে আছে</Chip>}
            </div>
          )}

          {error && (
            <div className="mb-6 border border-ui-rust/40 bg-ui-rust/10 text-ui-rust text-sm px-4 py-3 rounded-xl text-center">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-ui-line bg-ui-panel overflow-hidden animate-pulse">
                  <div className="h-40 bg-ui-line/50" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-ui-line/60 rounded w-2/3" />
                    <div className="h-3 bg-ui-line/40 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : data.products.length === 0 ? (
            <div className="text-center py-20 text-ui-muted">
              এই ফিল্টার অনুযায়ী কোনো পণ্য পাওয়া যায়নি।
              {hasFilters && (
                <div className="mt-3">
                  <Link to={lockedCategorySlug ? `/shop/c/${lockedCategorySlug}` : '/shop'} className="btn-secondary">
                    ফিল্টার মুছুন
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {data.products.map((p) => (
                  <ProductCard key={p._id} product={p} />
                ))}
              </div>
              <Pagination page={data.page} pages={data.pages} onGo={(n) => patch({ page: n }, { resetPage: false })} />
            </>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {filtersOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg">ফিল্টার</h2>
              <button onClick={() => setFiltersOpen(false)} className="w-9 h-9 rounded-full bg-ui-surfaceAlt flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <CategoryTree
              tree={tree}
              activeSlug={activeCategory}
              locked={Boolean(lockedCategorySlug)}
              onPick={(slug) => {
                patch({ category: slug });
                setFiltersOpen(false);
              }}
            />
            <FilterPanel min={min} max={max} inStock={inStock} onChange={patch} className="mt-6" />
            <button onClick={() => setFiltersOpen(false)} className="btn-primary w-full mt-6">
              {data.total}টি ফলাফল দেখুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ui-brand/10 text-ui-brand px-2.5 py-1">
      {children}
      <button onClick={onClear} aria-label="ফিল্টার সরান">
        <X size={12} />
      </button>
    </span>
  );
}

function CategoryTree({ tree, activeSlug, locked, onPick }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ui-faint mb-2">ক্যাটাগরি</h3>
      {!locked && (
        <button
          onClick={() => onPick('')}
          className={`block w-full text-left text-sm py-1.5 ${
            !activeSlug ? 'text-ui-brand font-medium' : 'text-ui-ink hover:text-ui-brand'
          }`}
        >
          সকল পণ্য
        </button>
      )}
      <ul className="space-y-0.5">
        {tree.map((c) => (
          <CategoryNode key={c._id} node={c} activeSlug={activeSlug} onPick={onPick} />
        ))}
      </ul>
    </div>
  );
}

function CategoryNode({ node, activeSlug, onPick }) {
  const hasChildren = node.children && node.children.length > 0;
  const isActive = activeSlug === node.slug;
  const childActive = hasChildren && node.children.some((c) => c.slug === activeSlug);
  const [open, setOpen] = useState(isActive || childActive);

  return (
    <li>
      <div className="flex items-center">
        <button
          onClick={() => onPick(node.slug)}
          className={`flex-1 text-left text-sm py-1.5 ${
            isActive ? 'text-ui-brand font-medium' : 'text-ui-ink hover:text-ui-brand'
          }`}
        >
          {node.name}
          {node.productCount ? <span className="text-ui-faint"> ({node.productCount})</span> : null}
        </button>
        {hasChildren && (
          <button onClick={() => setOpen((o) => !o)} className="p-1 text-ui-faint" aria-label="দেখান/লুকান">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>
      {hasChildren && open && (
        <ul className="ml-3 border-l border-ui-line pl-2 space-y-0.5">
          {node.children.map((c) => (
            <li key={c._id}>
              <button
                onClick={() => onPick(c.slug)}
                className={`block w-full text-left text-sm py-1 ${
                  activeSlug === c.slug ? 'text-ui-brand font-medium' : 'text-ui-muted hover:text-ui-brand'
                }`}
              >
                {c.name}
                {c.productCount ? <span className="text-ui-faint"> ({c.productCount})</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function FilterPanel({ min, max, inStock, onChange, className = '' }) {
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);
  useEffect(() => setLocalMin(min), [min]);
  useEffect(() => setLocalMax(max), [max]);

  return (
    <div className={className}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ui-faint mb-2">দাম (৳)</h3>
      <div className="flex items-center gap-2">
        <input
          className="input py-2"
          inputMode="numeric"
          placeholder="সর্বনিম্ন"
          value={localMin}
          onChange={(e) => setLocalMin(e.target.value.replace(/\D/g, ''))}
        />
        <span className="text-ui-faint">–</span>
        <input
          className="input py-2"
          inputMode="numeric"
          placeholder="সর্বোচ্চ"
          value={localMax}
          onChange={(e) => setLocalMax(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <button
        onClick={() => onChange({ min: localMin, max: localMax })}
        className="btn-secondary w-full mt-2 py-2"
      >
        প্রয়োগ করুন
      </button>

      <label className="flex items-center gap-2 text-sm mt-4">
        <input
          type="checkbox"
          checked={inStock}
          onChange={(e) => onChange({ inStock: e.target.checked })}
        />
        শুধু স্টকে থাকা পণ্য
      </label>
    </div>
  );
}

function Pagination({ page, pages, onGo }) {
  if (pages <= 1) return null;
  const nums = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, from + 4);
  for (let i = from; i <= to; i++) nums.push(i);

  return (
    <div className="flex items-center justify-center gap-1.5 mt-10">
      <button className="btn-secondary py-2 px-3 disabled:opacity-40" disabled={page <= 1} onClick={() => onGo(page - 1)}>
        পূর্ববর্তী
      </button>
      {nums[0] > 1 && <span className="px-1 text-ui-faint">…</span>}
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => onGo(n)}
          className={`w-9 h-9 rounded-xl text-sm font-medium ${
            n === page ? 'bg-ui-brand text-white' : 'border border-ui-line bg-white text-ui-ink hover:bg-ui-surfaceAlt'
          }`}
        >
          {n}
        </button>
      ))}
      {nums[nums.length - 1] < pages && <span className="px-1 text-ui-faint">…</span>}
      <button
        className="btn-secondary py-2 px-3 disabled:opacity-40"
        disabled={page >= pages}
        onClick={() => onGo(page + 1)}
      >
        পরবর্তী
      </button>
    </div>
  );
}
