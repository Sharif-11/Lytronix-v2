import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getOrders, getOrderStats } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { formatMoney, formatDateShort } from '../utils/format';
import { Printer, Plus, Search, Tag, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const STATUS_TABS = ['pending', 'unverified', 'processing', 'shipped', 'delivered', 'cancelled', 'all'];

function buildPrintQuery({ status, search }) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function OrderList() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ total: 0, byStatus: {} });
  // Pending orders are what needs attention day-to-day, so that's the default
  // view — pass ?status=all (or click the "all" tab) to see everything.
  const [status, setStatus] = useState(() => searchParams.get('status') || 'pending');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true); // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false); // subsequent pages via scroll
  const [selected, setSelected] = useState(new Set());
  const sentinelRef = useRef(null);

  const load = () => {
    setLoading(true);
    getOrders({
      status: status === 'all' ? undefined : status,
      search: search || undefined,
      from: from || undefined,
      to: to || undefined,
      page: 1,
    })
      .then((data) => {
        setOrders(data.orders);
        setPage(1);
        setPages(data.pages);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getOrderStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    setSelected(new Set()); // selection doesn't carry across filter changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Scrolling near the bottom loads the next page and appends — no manual
  // Prev/Next needed.
  const loadMore = useCallback(() => {
    if (loadingMore || loading || page >= pages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    getOrders({
      status: status === 'all' ? undefined : status,
      search: search || undefined,
      from: from || undefined,
      to: to || undefined,
      page: nextPage,
    })
      .then((data) => {
        setOrders((prev) => [...prev, ...data.orders]);
        setPage(nextPage);
        setPages(data.pages);
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, loading, page, pages, status, search, from, to]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '600px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    load();
  };

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const allSelected = orders.every((o) => prev.has(o._id));
      if (allSelected) {
        const next = new Set(prev);
        orders.forEach((o) => next.delete(o._id));
        return next;
      }
      const next = new Set(prev);
      orders.forEach((o) => next.add(o._id));
      return next;
    });
  };

  const bulkLabelsHref = `/orders/print-labels?ids=${[...selected].join(',')}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5 sm:mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ui-brand">{t('orders.title')}</h1>
          <p className="text-sm text-ui-muted mt-1 font-mono">{t('orders.entriesLogged', { n: stats.total })}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <a
            href={`/orders/print${buildPrintQuery({ status, search })}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary flex-1 sm:flex-none gap-1.5"
          >
            <Printer size={15} /> {t('orders.printLogbook')}
          </a>
          <Link to="/orders/new" className="btn-primary flex-1 sm:flex-none gap-1.5">
            <Plus size={16} /> {t('orders.newOrder')}
          </Link>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="no-print mb-4 flex items-center justify-between gap-3 bg-ui-brand/10 border border-ui-brand/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-ui-brand font-medium">{t('orders.selected', { n: selected.size })}</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(new Set())} className="text-xs text-ui-muted hover:underline">{t('orders.clear')}</button>
            <a href={bulkLabelsHref} target="_blank" rel="noreferrer" className="btn-primary gap-1.5 py-1.5">
              <Tag size={14} /> {t('orders.printLabels', { n: selected.size })}
            </a>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs uppercase tracking-wide border transition-colors ${
              status === s
                ? 'bg-ui-brand text-white border-ui-brand'
                : 'bg-white text-ui-ink border-ui-line hover:bg-ui-line/40'
            }`}
          >
            {t(`orders.status.${s}`)} {s !== 'all' && stats.byStatus?.[s] ? `(${stats.byStatus[s]})` : ''}
          </button>
        ))}
      </div>

      <form onSubmit={onSearchSubmit} className="mb-5 flex flex-wrap gap-2 max-w-2xl">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-muted pointer-events-none" />
          <input
            className="input pl-9"
            placeholder={t('orders.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input
          type="date"
          className="input w-auto"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label={t('orders.fromDate')}
        />
        <input
          type="date"
          className="input w-auto"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label={t('orders.toDate')}
        />
        <button className="btn-secondary shrink-0" type="submit">{t('common.search')}</button>
      </form>

      {loading && <p className="py-8 text-center text-ui-muted text-sm">{t('common.loading')}</p>}
      {!loading && orders.length === 0 && (
        <p className="py-8 text-center text-ui-muted text-sm">{t('orders.noneMatch')}</p>
      )}

      {/* Mobile: stacked cards (no horizontal scrolling needed) */}
      {!loading && orders.length > 0 && (
        <div className="sm:hidden space-y-3">
          {orders.map((o) => (
            <div key={o._id} className="relative">
              <label
                className="absolute top-4 right-4 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected.has(o._id)}
                  onChange={() => toggleSelected(o._id)}
                  className="w-4 h-4 accent-ui-brand"
                />
              </label>
              <Link
                to={`/orders/${o._id}`}
                className="block bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 pr-10"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-mono text-ui-brand text-sm">{o.orderNumber}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="text-sm font-medium">{o.customer?.name}</div>
                <div className="text-sm font-mono text-ui-muted">{o.customer?.phone}</div>
                <div className="text-xs text-ui-muted mt-0.5">
                  {[o.customer?.zilla, o.customer?.thana].filter(Boolean).join(' / ') || '—'}
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed border-ui-line text-sm font-mono">
                  <span>{t('common.total')} {formatMoney(o.pricing?.grandTotal)}</span>
                  <span className="text-ui-muted">{t('orders.due')} {formatMoney(o.pricing?.due)}</span>
                </div>
                <div className="text-xs text-ui-muted mt-1">{formatDateShort(o.createdAt)}</div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Desktop / tablet: table */}
      {!loading && orders.length > 0 && (
        <div className="hidden sm:block bg-ui-panel border border-ui-line rounded-xl shadow-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-ui-muted border-b border-ui-line bg-ui-bg/60">
                <th className="py-3 px-4 font-medium w-8">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && orders.every((o) => selected.has(o._id))}
                    onChange={toggleSelectAllOnPage}
                    className="w-4 h-4 accent-ui-brand"
                    aria-label="Select all orders on this page"
                  />
                </th>
                <th className="py-3 px-4 font-medium">{t('orders.orderNumber')}</th>
                <th className="py-3 px-4 font-medium">{t('orders.customer')}</th>
                <th className="py-3 px-4 font-medium">{t('orders.phone')}</th>
                <th className="py-3 px-4 font-medium">{t('orders.zillaThana')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('orders.grandTotal')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('orders.due')}</th>
                <th className="py-3 px-4 font-medium">{t('orders.status')}</th>
                <th className="py-3 px-4 font-medium">{t('orders.date')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id} className="border-b border-ui-line/60 hover:bg-ui-bg/50">
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selected.has(o._id)}
                      onChange={() => toggleSelected(o._id)}
                      className="w-4 h-4 accent-ui-brand"
                      aria-label={`Select order ${o.orderNumber}`}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <Link to={`/orders/${o._id}`} className="font-mono text-ui-brand hover:underline">{o.orderNumber}</Link>
                  </td>
                  <td className="py-3 px-4">{o.customer?.name}</td>
                  <td className="py-3 px-4 font-mono">{o.customer?.phone}</td>
                  <td className="py-3 px-4 text-ui-muted">{[o.customer?.zilla, o.customer?.thana].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatMoney(o.pricing?.grandTotal)}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatMoney(o.pricing?.due)}</td>
                  <td className="py-3 px-4"><StatusBadge status={o.status} /></td>
                  <td className="py-3 px-4 text-ui-muted">{formatDateShort(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && orders.length > 0 && page < pages && (
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
    </div>
  );
}
