import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, MapPin, MessageSquare, MessageCircle, Instagram, Facebook,
  PhoneCall, MessageSquareText, MoreHorizontal, Megaphone, Loader2,
} from 'lucide-react';
import { getCustomers, deleteCustomer } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import SearchableSelect from '../components/SearchableSelect';
import { useConfirm } from '../context/ConfirmContext';
import usePageTitle from '../lib/usePageTitle';

export default function CustomerList() {
  const { t } = useLanguage();
  usePageTitle(t('customers.title'));
  const confirm = useConfirm();

  const CHANNEL_META = {
    messenger: { label: t('customers.channelMessenger'), icon: MessageCircle },
    whatsapp: { label: t('customers.channelWhatsapp'), icon: Phone },
    instagram: { label: t('customers.channelInstagram'), icon: Instagram },
    facebook: { label: t('customers.channelFacebook'), icon: Facebook },
    phone: { label: t('customers.channelPhone'), icon: PhoneCall },
    sms: { label: t('customers.channelSms'), icon: MessageSquareText },
    other: { label: t('customers.channelOther'), icon: MoreHorizontal },
  };

  const PRIORITY_META = {
    high: { label: t('customers.priorityHigh'), className: 'bg-ui-rust text-white' },
    medium: { label: t('customers.priorityMedium'), className: 'bg-ui-gold text-white' },
    low: { label: t('customers.priorityLow'), className: 'bg-ui-muted text-white' },
  };

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false); // subsequent pages via scroll
  const sentinelRef = useRef(null);

  const load = () => {
    setLoading(true);
    getCustomers({ search: search || undefined, priority: priority || undefined, page: 1 })
      .then((d) => {
        setCustomers(d.customers);
        setPage(1);
        setPages(d.pages || 1);
        setTotal(d.total || 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [priority]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (loadingMore || loading || page >= pages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    getCustomers({ search: search || undefined, priority: priority || undefined, page: nextPage })
      .then((d) => {
        setCustomers((prev) => [...prev, ...d.customers]);
        setPage(nextPage);
        setPages(d.pages || 1);
        setTotal(d.total || 0);
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, loading, page, pages, search, priority]);

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

  const onSearchSubmit = (e) => { e.preventDefault(); load(); };

  const handleDelete = async (id, label) => {
    if (!(await confirm(`Remove "${label}" from the notebook?`, { danger: true, confirmLabel: 'Remove' }))) return;
    await deleteCustomer(id);
    load();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5 sm:mb-6">
        <h1 className="font-display text-2xl sm:text-3xl text-ui-brand">{t('customers.title')}</h1>
        <Link to="/customers/new" className="btn-primary">{t('customers.newEntry')}</Link>
      </div>

      <form onSubmit={onSearchSubmit} className="mb-5 flex flex-wrap gap-2 max-w-xl">
        <input
          className="input flex-1 min-w-[10rem]"
          placeholder={t('customers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SearchableSelect
          className="w-40 shrink-0"
          placeholder={t('customers.allPriorities')}
          value={priority}
          onChange={(v) => { setPriority(v); setPage(1); }}
          options={[
            { value: 'high', label: t('customers.highPriority') },
            { value: 'medium', label: t('customers.mediumPriority') },
            { value: 'low', label: t('customers.lowPriority') },
          ]}
        />
        <button className="btn-secondary" type="submit">{t('common.search')}</button>
      </form>

      <p className="text-xs text-ui-muted mb-3">{t('customers.count', { n: total })}</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <p className="text-ui-muted">{t('common.loading')}</p>}
        {!loading && customers.length === 0 && (
          <p className="text-ui-muted italic">{t('customers.noneYet')}</p>
        )}
        {customers.map((c) => (
          <div key={c._id} className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bangla text-lg text-ui-ink" dir="auto">{c.name || t('customers.unnamed')}</h3>
              {c.priority && (
                <span className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold rounded-full px-2 py-0.5 ${PRIORITY_META[c.priority]?.className}`}>
                  {PRIORITY_META[c.priority]?.label}
                </span>
              )}
            </div>

            <a
              href={`tel:${c.phone}`}
              className="mt-1 flex items-center gap-1.5 text-sm font-mono text-ui-brand"
            >
              <Phone size={14} /> {c.phone}
            </a>

            {c.channels?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.channels.map((ch) => {
                  const meta = CHANNEL_META[ch];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <span key={ch} className="inline-flex items-center gap-1 rounded-full bg-ui-bg border border-ui-line px-2 py-0.5 text-[11px] text-ui-ink">
                      <Icon size={11} /> {meta.label}
                    </span>
                  );
                })}
              </div>
            )}

            {c.address && (
              <div className="mt-2 flex items-start gap-1.5 text-sm text-ui-muted">
                <MapPin size={14} className="mt-0.5 shrink-0" />
                <span className="font-bangla line-clamp-2" dir="auto">{c.address}</span>
              </div>
            )}

            {c.comments && (
              <div className="mt-2 flex items-start gap-1.5 text-sm text-ui-muted">
                <MessageSquare size={14} className="mt-0.5 shrink-0" />
                <div
                  className="font-bangla line-clamp-3 italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
                  dir="auto"
                  dangerouslySetInnerHTML={{ __html: c.comments }}
                />
              </div>
            )}

            {c.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.tags.map((tag) => (
                  <span key={tag} className="font-bangla rounded-full bg-ui-brand/10 text-ui-brand px-2 py-0.5 text-[11px] font-medium" dir="auto">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-2 pt-3 border-t border-dashed border-ui-line">
              <Link to={`/marketing?customer=${c._id}`} className="btn-secondary text-xs flex-1 text-center gap-1">
                <Megaphone size={12} /> {t('customers.message')}
              </Link>
              <Link to={`/customers/${c._id}/edit`} className="btn-secondary text-xs flex-1 text-center">{t('common.edit')}</Link>
              <button onClick={() => handleDelete(c._id, c.name || c.phone)} className="btn-secondary text-xs text-ui-rust flex-1">{t('common.delete')}</button>
            </div>
          </div>
        ))}
      </div>

      {!loading && customers.length > 0 && page < pages && (
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
