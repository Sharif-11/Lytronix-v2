import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessagesSquare, Search, Send, Loader2, ArrowLeft, Phone, Check } from 'lucide-react';
import { getChatThreads, getChatMessages, sendChatMessage, updateChatThread } from '../api/client';

const POLL_THREADS_MS = 8000;
const POLL_MESSAGES_MS = 3000;

const dayKey = (d) => new Date(d).toDateString();
const timeStr = (d) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
const relTime = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const dateLabel = (d) => {
  const t = new Date(d);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (dayKey(t) === dayKey(today)) return 'Today';
  if (dayKey(t) === dayKey(y)) return 'Yesterday';
  return t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function Chat() {
  const [params, setParams] = useSearchParams();
  const activePhone = params.get('phone') || '';

  const [threads, setThreads] = useState([]);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const bodyRef = useRef(null);
  const lastIdRef = useRef(null);

  const activeThread = threads.find((t) => t.phone === activePhone) || null;

  const loadThreads = useCallback(() => {
    getChatThreads({ search: search || undefined })
      .then((d) => setThreads(d.threads || []))
      .catch(() => {});
  }, [search]);

  useEffect(() => {
    loadThreads();
    const id = setInterval(loadThreads, POLL_THREADS_MS);
    return () => clearInterval(id);
  }, [loadThreads]);

  // Load / poll the open conversation.
  useEffect(() => {
    if (!activePhone) {
      setMessages([]);
      lastIdRef.current = null;
      return undefined;
    }
    let alive = true;
    setLoadingMsgs(true);
    lastIdRef.current = null;
    setMessages([]);

    const tick = async (initial) => {
      try {
        const { messages: fresh } = await getChatMessages(activePhone, {
          after: lastIdRef.current || undefined,
        });
        if (!alive) return;
        if (fresh?.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m._id));
            return [...prev, ...fresh.filter((m) => !seen.has(m._id))];
          });
          lastIdRef.current = fresh[fresh.length - 1]._id;
        }
        if (initial) loadThreads(); // reflect the now-zeroed unread badge
      } catch {
        /* transient */
      } finally {
        if (alive && initial) setLoadingMsgs(false);
      }
    };

    tick(true);
    const id = setInterval(() => tick(false), POLL_MESSAGES_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [activePhone, loadThreads]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const openThread = (phone) => setParams(phone ? { phone } : {}, { replace: true });

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending || !activePhone) return;
    setSending(true);
    setDraft('');
    const optimistic = { _id: `tmp-${Date.now()}`, from: 'admin', body, createdAt: new Date().toISOString(), pending: true };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const { message } = await sendChatMessage(activePhone, body);
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? message : m)));
      lastIdRef.current = message._id;
      loadThreads();
    } catch {
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? { ...m, failed: true } : m)));
    } finally {
      setSending(false);
    }
  };

  const toggleClosed = async () => {
    if (!activeThread) return;
    const next = activeThread.status === 'closed' ? 'open' : 'closed';
    try {
      await updateChatThread(activePhone, next);
      loadThreads();
    } catch {
      /* surfaced globally */
    }
  };

  const grouped = useMemo(() => {
    const out = [];
    let last = null;
    for (const m of messages) {
      const k = dayKey(m.createdAt);
      if (k !== last) {
        out.push({ sep: dateLabel(m.createdAt), key: `sep-${k}` });
        last = k;
      }
      out.push({ m, key: m._id });
    }
    return out;
  }, [messages]);

  return (
    <div className="max-w-6xl mx-auto sm:px-5 sm:py-6">
      <div className="sm:flex sm:gap-0 sm:border sm:border-ui-line sm:rounded-2xl sm:overflow-hidden sm:shadow-card h-[calc(100vh-8rem)] sm:h-[calc(100vh-9rem)] bg-white">
        {/* Thread list */}
        <aside className={`w-full sm:w-[20rem] sm:border-r border-ui-line flex flex-col ${activePhone ? 'hidden sm:flex' : 'flex'}`}>
          <div className="p-3 border-b border-ui-line">
            <h1 className="font-display text-lg text-ui-brand flex items-center gap-2 mb-2 px-1">
              <MessagesSquare size={20} /> Chat
            </h1>
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-muted" />
              <input
                className="input pl-8 py-2 text-sm"
                placeholder="Search phone or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 && (
              <p className="text-sm text-ui-muted text-center py-10">No conversations yet.</p>
            )}
            {threads.map((t) => (
              <button
                key={t.phone}
                onClick={() => openThread(t.phone)}
                className={`w-full text-left px-3 py-2.5 flex gap-3 items-center border-b border-ui-line/60 hover:bg-ui-bg/60 ${
                  t.phone === activePhone ? 'bg-ui-brand/[0.06]' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-ui-brand/10 text-ui-brand flex items-center justify-center font-semibold shrink-0">
                  {(t.name || t.phone || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ui-ink truncate">{t.name || t.phone}</span>
                    <span className="text-[11px] text-ui-faint shrink-0">{relTime(t.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-ui-muted truncate">
                      {t.lastMessageFrom === 'admin' ? 'You: ' : ''}
                      {t.lastMessagePreview || '—'}
                    </span>
                    {t.unreadForAdmin > 0 && (
                      <span className="shrink-0 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-ui-brand text-white text-[10px] font-mono leading-[1.1rem] text-center">
                        {t.unreadForAdmin}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Conversation */}
        <section className={`flex-1 flex flex-col min-w-0 ${activePhone ? 'flex' : 'hidden sm:flex'}`} style={{ backgroundColor: '#ECE5DD' }}>
          {!activePhone ? (
            <div className="flex-1 flex items-center justify-center text-sm text-ui-muted">
              Pick a conversation to start replying.
            </div>
          ) : (
            <>
              <div className="bg-[#075E54] text-white px-3 py-2.5 flex items-center gap-3 shrink-0">
                <button onClick={() => openThread('')} className="sm:hidden -ml-1 p-1" aria-label="Back">
                  <ArrowLeft size={20} />
                </button>
                <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center font-semibold shrink-0">
                  {(activeThread?.name || activePhone)[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm leading-tight truncate">{activeThread?.name || activePhone}</div>
                  <a href={`tel:${activePhone}`} className="text-[11px] text-white/70 leading-tight inline-flex items-center gap-1">
                    <Phone size={11} /> {activePhone}
                  </a>
                </div>
                <button
                  onClick={toggleClosed}
                  className="text-[11px] bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-1 transition-colors"
                >
                  {activeThread?.status === 'closed' ? 'Reopen' : 'Close'}
                </button>
              </div>

              <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                {loadingMsgs && (
                  <p className="text-center text-xs text-black/40 mt-4">
                    <Loader2 size={14} className="animate-spin inline" /> Loading…
                  </p>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <p className="text-center text-xs text-black/40 mt-6">No messages yet.</p>
                )}
                {grouped.map((row) =>
                  row.sep ? (
                    <div key={row.key} className="flex justify-center my-2">
                      <span className="bg-white/80 text-black/50 text-[11px] px-2.5 py-0.5 rounded-md shadow-sm">
                        {row.sep}
                      </span>
                    </div>
                  ) : (
                    <Bubble key={row.key} m={row.m} />
                  )
                )}
              </div>

              <form onSubmit={send} className="shrink-0 bg-[#F0F0F0] px-2 py-2 flex items-end gap-2">
                <textarea
                  rows={1}
                  className="flex-1 resize-none max-h-28 rounded-2xl bg-white border border-black/10 px-3.5 py-2 text-sm outline-none focus:border-[#075E54]/40 font-bangla"
                  placeholder="Type a reply…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0 disabled:opacity-50"
                  aria-label="Send"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Bubble({ m }) {
  const mine = m.from === 'admin';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-lg px-2.5 py-1.5 shadow-sm text-sm leading-snug whitespace-pre-wrap break-words font-bangla ${
          mine ? 'bg-[#DCF8C6] rounded-tr-none' : 'bg-white rounded-tl-none'
        }`}
        dir="auto"
      >
        {mine && m.senderName && (
          <div className="text-[11px] font-semibold text-[#075E54] mb-0.5">{m.senderName}</div>
        )}
        <span>{m.body}</span>
        <span className="inline-flex items-center gap-0.5 align-bottom text-[10px] text-black/45 ml-2 -mb-0.5 float-right pl-1">
          {m.pending ? '…' : m.failed ? '⚠' : timeStr(m.createdAt)}
          {mine && !m.pending && !m.failed && <Check size={11} className="text-black/40" />}
        </span>
      </div>
    </div>
  );
}
