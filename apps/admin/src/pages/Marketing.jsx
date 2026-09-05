import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone, Send, Loader2, CheckCircle2, XCircle, X, Users, Coins } from 'lucide-react';
import { getCustomers, getCustomer, sendBroadcast } from '../api/client';
import SearchableSelect from '../components/SearchableSelect';
import { useConfirm } from '../context/ConfirmContext';
import { emitError } from '../lib/errorBus';
import useSmsBalance from '../lib/useSmsBalance';

const MAX_LEN = 640;
// Rough SMS segment estimate: GSM7 (plain Latin) is 160 chars/segment,
// Unicode (Bangla, emoji, ...) is 70/segment — just a heads-up, not billing.
function segmentInfo(text) {
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const per = isUnicode ? 70 : 160;
  const segments = text.length === 0 ? 0 : Math.ceil(text.length / per);
  return { isUnicode, per, segments };
}

export default function Marketing() {
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true); // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false); // subsequent pages via scroll
  const sentinelRef = useRef(null);

  // selected: Map<id, {name, phone}> — kept independent of the paginated list
  // so a preselected/off-page customer still shows in the recipient summary.
  const [selected, setSelected] = useState(new Map());
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false); // mobile: compose bottom-sheet
  const sms = useSmsBalance();

  const load = () => {
    setLoading(true);
    getCustomers({ search: search || undefined, priority: priority || undefined, page: 1, limit: 24 })
      .then((d) => {
        setCustomers(d.customers);
        setPage(1);
        setPages(d.pages || 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [priority]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (loadingMore || loading || page >= pages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    getCustomers({ search: search || undefined, priority: priority || undefined, page: nextPage, limit: 24 })
      .then((d) => {
        setCustomers((prev) => [...prev, ...d.customers]);
        setPage(nextPage);
        setPages(d.pages || 1);
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

  // Preselect ?customer=<id> (from a CustomerList "Message" button) once.
  useEffect(() => {
    const preId = searchParams.get('customer');
    if (!preId) return;
    getCustomer(preId)
      .then((c) => setSelected((prev) => new Map(prev).set(c._id, { name: c.name || c.phone, phone: c.phone })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearchSubmit = (e) => { e.preventDefault(); load(); };

  const toggle = (c) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c._id)) next.delete(c._id);
      else next.set(c._id, { name: c.name || c.phone, phone: c.phone });
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const allSelected = customers.every((c) => prev.has(c._id));
      const next = new Map(prev);
      customers.forEach((c) => {
        if (allSelected) next.delete(c._id);
        else next.set(c._id, { name: c.name || c.phone, phone: c.phone });
      });
      return next;
    });
  };

  const { isUnicode, per, segments } = useMemo(() => segmentInfo(message), [message]);

  const handleSend = async () => {
    setResult(null);
    if (sms.unavailable) {
      emitError(
        sms.depleted
          ? 'SMS credit is 0 — top up the gateway account before sending.'
          : 'SMS balance is unavailable right now — cannot send. Try again shortly.'
      );
      return;
    }
    if (selected.size === 0) {
      emitError('Select at least one customer to message.');
      return;
    }
    if (!message.trim()) {
      emitError('Write a message first.');
      return;
    }
    if (!(await confirm(`Send this message to ${selected.size} customer${selected.size === 1 ? '' : 's'}?`, { confirmLabel: 'Send' }))) return;

    setSending(true);
    try {
      const res = await sendBroadcast([...selected.keys()], message.trim());
      setResult(res);
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSending(false);
    }
  };

  // The compose UI — rendered in the desktop side column and inside the
  // mobile bottom-sheet.
  const composePanel = (
    <>
      <div className="card p-4 sm:p-5">
        <h2 className="font-display text-sm font-bold text-ui-ink mb-2 flex items-center gap-1.5">
          <Users size={15} className="text-ui-brand" /> Recipients ({selected.size})
        </h2>
        {selected.size === 0 ? (
          <p className="text-xs text-ui-muted">Tick customers on the list.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {[...selected.entries()].map(([id, c]) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-ui-bg border border-ui-line px-2 py-0.5 text-[11px] text-ui-ink">
                {c.name}
                <button onClick={() => setSelected((prev) => { const n = new Map(prev); n.delete(id); return n; })} aria-label="Remove">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <h2 className="font-display text-sm font-bold text-ui-ink mb-2">Message</h2>
        <textarea
          className="input min-h-[9rem] font-bangla"
          dir="auto"
          placeholder="Write your message… (Bangla or English)"
          maxLength={MAX_LEN}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <p className="text-[11px] text-ui-faint mt-1.5">
          {message.length}/{MAX_LEN} characters · ~{segments} SMS segment{segments === 1 ? '' : 's'} ({per}/segment,{' '}
          {isUnicode ? 'Bangla/Unicode' : 'plain text'})
        </p>

        <button
          onClick={handleSend}
          disabled={sending || sms.unavailable}
          className="btn-primary w-full mt-3 gap-1.5"
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {sending ? 'Sending…' : `Send to ${selected.size || 0}`}
        </button>
        {sms.unavailable && (
          <p className="text-xs text-ui-rust mt-1.5 text-center">
            {sms.depleted
              ? 'SMS credit is 0 — top up the gateway account to send.'
              : 'SMS balance unavailable — sending is disabled until it can be checked.'}
          </p>
        )}
      </div>

      {result && (
        <div className="card p-4 sm:p-5">
          <h2 className="font-display text-sm font-bold text-ui-ink mb-2">Result</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-ui-brand">
              <CheckCircle2 size={15} /> {result.sent} sent
            </span>
            {result.failed > 0 && (
              <span className="inline-flex items-center gap-1.5 text-ui-rust">
                <XCircle size={15} /> {result.failed} failed
              </span>
            )}
          </div>
          <p className="text-xs text-ui-faint mt-1">Full detail per number is in SMS logs.</p>
        </div>
      )}
    </>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ui-ink flex items-center gap-2">
            <Megaphone size={24} className="text-ui-brand" /> Marketing SMS
          </h1>
          <p className="text-sm text-ui-muted mt-1">
            Send a message to one customer, or a batch of them at once — one SMS request, many recipients.
          </p>
        </div>
        {sms.mocked ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-3 py-1.5 shrink-0">
            <Coins size={13} /> SMS mock mode — nothing is actually sent
          </span>
        ) : sms.unavailable ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ui-rust bg-red-50 border border-red-200 rounded-full px-3 py-1.5 shrink-0">
            <XCircle size={13} /> {sms.depleted ? 'SMS credit: 0' : 'SMS credit unavailable'}
          </span>
        ) : sms.balance !== null ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-ui-muted bg-ui-surfaceAlt border border-ui-line rounded-full px-3 py-1.5 shrink-0">
            <Coins size={13} className="text-ui-brand" /> SMS credit: {sms.balance}
          </span>
        ) : null}
      </div>

      {/* Mobile: sticky bar — pick customers below, then compose from here */}
      <div className="lg:hidden sticky top-16 z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 py-2 bg-ui-bg/95 backdrop-blur border-b border-ui-line flex items-center justify-between gap-3">
        <span className="text-sm text-ui-muted">
          <b className="text-ui-ink">{selected.size}</b> selected
        </span>
        <button
          onClick={() => setComposeOpen(true)}
          disabled={selected.size === 0}
          className="btn-primary text-sm gap-1.5 py-2"
        >
          <Send size={15} /> Compose &amp; send
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_20rem] gap-5">
        {/* Recipient picker */}
        <div className="space-y-4">
          <form onSubmit={onSearchSubmit} className="flex flex-wrap gap-2">
            <input
              className="input flex-1 min-w-[10rem]"
              placeholder="Search customers by name, phone, area…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <SearchableSelect
              className="w-40 shrink-0"
              placeholder="All priorities"
              value={priority}
              onChange={(v) => { setPriority(v); setPage(1); }}
              options={[
                { value: 'high', label: 'High priority' },
                { value: 'medium', label: 'Medium priority' },
                { value: 'low', label: 'Low priority' },
              ]}
            />
            <button className="btn-secondary" type="submit">Search</button>
          </form>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ui-line bg-ui-bg/60">
              <label className="flex items-center gap-2 text-xs font-medium text-ui-muted">
                <input
                  type="checkbox"
                  checked={customers.length > 0 && customers.every((c) => selected.has(c._id))}
                  onChange={toggleAllOnPage}
                  className="w-4 h-4 accent-ui-brand"
                />
                Select all on this page
              </label>
              <span className="text-xs text-ui-faint">{selected.size} selected</span>
            </div>
            {loading ? (
              <p className="text-sm text-ui-muted py-8 text-center">Loading…</p>
            ) : customers.length === 0 ? (
              <p className="text-sm text-ui-muted py-8 text-center">No customers match.</p>
            ) : (
              <div className="divide-y divide-ui-line">
                {customers.map((c) => (
                  <label key={c._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ui-surfaceAlt cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(c._id)}
                      onChange={() => toggle(c)}
                      className="w-4 h-4 accent-ui-brand shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ui-ink truncate font-bangla" dir="auto">
                        {c.name || '(unnamed)'}
                      </span>
                      <span className="block text-xs font-mono text-ui-muted">{c.phone}</span>
                    </span>
                    {c.priority && (
                      <span className="text-[10px] uppercase tracking-wide text-ui-faint shrink-0">{c.priority}</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {!loading && customers.length > 0 && page < pages && (
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
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

        {/* Compose — desktop side column (mobile uses the bottom-sheet below) */}
        <div className="hidden lg:block space-y-4">{composePanel}</div>
      </div>

      {/* Mobile: compose bottom-sheet */}
      {composeOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={() => setComposeOpen(false)}
          />
          <div className="relative bg-ui-bg rounded-t-3xl border-t border-ui-line max-h-[88vh] flex flex-col shadow-floating pb-[env(safe-area-inset-bottom)]">
            <div className="w-10 h-1 bg-ui-line rounded-full mx-auto mt-3 shrink-0" />
            <div className="flex items-center justify-between px-4 pt-2 pb-2 shrink-0">
              <h2 className="font-display font-bold text-ui-ink">Compose &amp; send</h2>
              <button
                onClick={() => setComposeOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-ui-muted bg-ui-surfaceAlt"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-4 space-y-4">{composePanel}</div>
          </div>
        </div>
      )}
    </div>
  );
}
