import { useCallback, useEffect, useRef, useState } from 'react';
import { Inbox, Search, Loader2, Check, Archive, Trash2, Phone, Mail, RotateCcw, ExternalLink } from 'lucide-react';
import { getContactMessages, updateContactMessage, deleteContactMessage } from '../api/client';
import { formatDate } from '../utils/format';
import { useConfirm } from '../context/ConfirmContext';

const TABS = [
  { key: 'new', label: 'New' },
  { key: 'read', label: 'Read' },
  { key: 'archived', label: 'Archived' },
  { key: '', label: 'All' },
];

export default function Messages() {
  const confirm = useConfirm();
  const [status, setStatus] = useState('new');
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  const load = () => {
    setLoading(true);
    getContactMessages({ status: status || undefined, search: search || undefined, page: 1 })
      .then((d) => {
        setMessages(d.messages);
        setPage(1);
        setPages(d.pages || 1);
        setTotal(d.total || 0);
        setUnread(d.unread || 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (loadingMore || loading || page >= pages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    getContactMessages({ status: status || undefined, search: search || undefined, page: nextPage })
      .then((d) => {
        setMessages((prev) => [...prev, ...d.messages]);
        setPage(nextPage);
        setPages(d.pages || 1);
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, loading, page, pages, status, search]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const setMsgStatus = async (id, next) => {
    try {
      const updated = await updateContactMessage(id, next);
      // Drop it from the current tab if it no longer belongs there.
      setMessages((prev) =>
        prev
          .map((m) => (m._id === id ? updated : m))
          .filter((m) => !status || m.status === status)
      );
      if (next !== 'new') setUnread((u) => Math.max(0, u - (messages.find((m) => m._id === id)?.status === 'new' ? 1 : 0)));
      else load();
    } catch {
      /* surfaced by the global ErrorModal */
    }
  };

  const remove = async (id) => {
    if (!(await confirm('Delete this message permanently?', { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteContactMessage(id);
      setMessages((prev) => prev.filter((m) => m._id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      /* surfaced by the global ErrorModal */
    }
  };

  const onSearchSubmit = (e) => { e.preventDefault(); load(); };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ui-brand flex items-center gap-2">
            <Inbox size={24} /> Messages
          </h1>
          <p className="text-sm text-ui-muted mt-1">
            Sent from the storefront Contact page{unread > 0 ? ` · ${unread} unread` : ''}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              status === tab.key ? 'bg-ui-brand text-white border-ui-brand' : 'bg-white text-ui-muted border-ui-line hover:border-ui-faint/60'
            }`}
          >
            {tab.label}
            {tab.key === 'new' && unread > 0 ? ` (${unread})` : ''}
          </button>
        ))}
      </div>

      <form onSubmit={onSearchSubmit} className="flex gap-2 max-w-md mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-muted pointer-events-none" />
          <input
            className="input pl-9"
            placeholder="Search name, contact or message…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary shrink-0" type="submit">Search</button>
      </form>

      {loading && <p className="py-10 text-center text-ui-muted text-sm">Loading…</p>}
      {!loading && messages.length === 0 && (
        <p className="py-12 text-center text-ui-muted text-sm border border-dashed border-ui-line rounded-2xl">
          No messages here.
        </p>
      )}

      <div className="space-y-3">
        {messages.map((m) => (
          <div
            key={m._id}
            className={`card p-4 sm:p-5 ${m.status === 'new' ? 'border-ui-brand/40 bg-ui-brand/[0.03]' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ui-ink">{m.name || 'No name'}</span>
                  {m.status === 'new' && (
                    <span className="chip text-[11px] bg-ui-brand/10 text-ui-brand border-ui-brand/20">new</span>
                  )}
                  {m.status === 'archived' && (
                    <span className="chip text-[11px] bg-ui-surfaceAlt text-ui-muted border-ui-line">archived</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-ui-muted flex-wrap">
                  {m.email ? (
                    <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 hover:text-ui-brand">
                      <Mail size={12} /> {m.email}
                    </a>
                  ) : m.phone ? (
                    <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 hover:text-ui-brand font-mono">
                      <Phone size={12} /> {m.phone}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1">{m.contact}</span>
                  )}
                  <span>{formatDate(m.createdAt)}</span>
                </div>
              </div>
            </div>

            <p className="mt-2.5 text-sm text-ui-ink whitespace-pre-wrap font-bangla" dir="auto">
              {m.message}
            </p>

            <div className="mt-3 pt-3 border-t border-dashed border-ui-line flex flex-wrap gap-2 text-xs">
              {m.status !== 'read' && (
                <button onClick={() => setMsgStatus(m._id, 'read')} className="btn-secondary text-xs gap-1.5 py-1.5">
                  <Check size={13} /> Mark read
                </button>
              )}
              {m.status !== 'archived' ? (
                <button onClick={() => setMsgStatus(m._id, 'archived')} className="btn-secondary text-xs gap-1.5 py-1.5">
                  <Archive size={13} /> Archive
                </button>
              ) : (
                <button onClick={() => setMsgStatus(m._id, 'new')} className="btn-secondary text-xs gap-1.5 py-1.5">
                  <RotateCcw size={13} /> Move to inbox
                </button>
              )}
              {m.email && (
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Lytronix')}`}
                  className="btn-secondary text-xs gap-1.5 py-1.5"
                >
                  <ExternalLink size={13} /> Reply by email
                </a>
              )}
              <button onClick={() => remove(m._id)} className="btn-secondary text-xs text-ui-rust gap-1.5 py-1.5 ml-auto">
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && messages.length > 0 && page < pages && (
        <div ref={sentinelRef} className="flex items-center justify-center py-8">
          {loadingMore ? (
            <span className="inline-flex items-center gap-2 text-sm text-ui-muted">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </span>
          ) : (
            <button onClick={loadMore} className="btn-secondary text-sm">Next</button>
          )}
        </div>
      )}
    </div>
  );
}
