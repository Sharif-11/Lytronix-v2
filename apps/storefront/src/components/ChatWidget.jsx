import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, ArrowLeft } from 'lucide-react';
import { chatStart, chatMessages, chatSend } from '../api/client';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import logoMark from '../assets/lytronix-logo.png';

const LS_KEY = 'lytronix_chat_v1';
const POLL_OPEN_MS = 4000;
const POLL_IDLE_MS = 20000;

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  } catch {
    return null;
  }
}
function saveSession(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const dayKey = (d) => new Date(d).toDateString();
const timeStr = (d) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
const dateLabel = (d) => {
  const t = new Date(d);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (dayKey(t) === dayKey(today)) return 'আজ';
  if (dayKey(t) === dayKey(y)) return 'গতকাল';
  return t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ChatWidget() {
  const { customer, isAuthed } = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(loadSession);
  const [phoneInput, setPhoneInput] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unseen, setUnseen] = useState(0);

  const bodyRef = useRef(null);
  const lastIdRef = useRef(null);
  const seenAtRef = useRef(Number(localStorage.getItem(`${LS_KEY}:seen`)) || 0);

  const phone = session?.phone || (isAuthed ? customer?.phone : '') || '';
  const hasSession = Boolean(session?.phone && (session?.guestKey || isAuthed));

  // A logged-in customer needs no phone prompt — auto-start once.
  useEffect(() => {
    if (open && !hasSession && isAuthed && customer?.phone && !starting) {
      begin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAuthed, customer?.phone]);

  const begin = async (e) => {
    e?.preventDefault();
    setError('');
    const p = isAuthed ? customer?.phone : phoneInput.replace(/\D/g, '');
    if (!isAuthed && !/^01\d{9}$/.test(p)) {
      setError('সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)।');
      return;
    }
    setStarting(true);
    try {
      const s = await chatStart(isAuthed ? undefined : p, customer?.name);
      const next = { phone: s.phone, guestKey: s.guestKey, name: s.name };
      setSession(next);
      saveSession(next);
      lastIdRef.current = null;
      await poll(next);
    } catch (err) {
      setError(err.response?.data?.message || 'চ্যাট শুরু করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setStarting(false);
    }
  };

  const poll = async (s = session) => {
    if (!s?.phone) return;
    try {
      const { messages: fresh } = await chatMessages({
        phone: s.phone,
        guestKey: s.guestKey,
        after: lastIdRef.current || undefined,
      });
      if (fresh?.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m._id));
          const merged = [...prev, ...fresh.filter((m) => !seen.has(m._id))];
          return merged;
        });
        lastIdRef.current = fresh[fresh.length - 1]._id;
        if (!open) {
          const adminNew = fresh.filter(
            (m) => m.from === 'admin' && new Date(m.createdAt).getTime() > seenAtRef.current
          ).length;
          if (adminNew) setUnseen((u) => u + adminNew);
        }
      }
    } catch {
      /* transient — try again next tick */
    }
  };

  // Poll loop — fast while open, slow while closed (so admin replies still
  // light up the launcher).
  useEffect(() => {
    if (!hasSession) return undefined;
    poll();
    const id = setInterval(() => poll(), open ? POLL_OPEN_MS : POLL_IDLE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, open, session?.phone]);

  // Mark seen + scroll to bottom whenever the panel is open and messages change.
  useEffect(() => {
    if (open) {
      setUnseen(0);
      seenAtRef.current = Date.now();
      try {
        localStorage.setItem(`${LS_KEY}:seen`, String(seenAtRef.current));
      } catch {
        /* ignore */
      }
    }
  }, [open, messages.length]);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending || !session?.phone) return;
    setSending(true);
    setDraft('');
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      from: 'customer',
      body,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const { message } = await chatSend({ phone: session.phone, guestKey: session.guestKey, body });
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? message : m)));
      lastIdRef.current = message._id;
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? { ...m, failed: true } : m)));
      setError(err.response?.data?.message || 'মেসেজ পাঠানো যায়নি।');
    } finally {
      setSending(false);
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
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="চ্যাট করুন"
          className="fixed right-4 bottom-20 sm:bottom-6 z-40 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-floating flex items-center justify-center active:scale-95 transition-transform"
        >
          <MessageCircle size={26} />
          {unseen > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-ui-rust text-white text-[11px] font-mono leading-5 text-center border-2 border-white">
              {unseen}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 sm:inset-auto sm:right-5 sm:bottom-5 z-50 sm:w-[24rem] sm:h-[34rem] sm:rounded-2xl overflow-hidden shadow-floating flex flex-col bg-[#ECE5DD]">
          {/* Header */}
          <div className="bg-[#075E54] text-white px-3 py-2.5 flex items-center gap-3 shrink-0">
            <button onClick={() => setOpen(false)} className="sm:hidden -ml-1 p-1" aria-label="বন্ধ করুন">
              <ArrowLeft size={20} />
            </button>
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center overflow-hidden shrink-0">
              <img src={logoMark} alt="" className="w-6 h-6 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm leading-tight">Lytronix সাপোর্ট</div>
              <div className="text-[11px] text-white/70 leading-tight">সাধারণত দ্রুত উত্তর দেওয়া হয়</div>
            </div>
            <button onClick={() => setOpen(false)} className="hidden sm:block p-1" aria-label="বন্ধ করুন">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          {!hasSession ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3 bg-[#ECE5DD]">
              <div className="w-14 h-14 rounded-full bg-[#25D366]/15 text-[#075E54] flex items-center justify-center">
                <MessageCircle size={26} />
              </div>
              <p className="text-sm text-ui-ink">শুরু করতে আপনার মোবাইল নম্বরটি দিন — এই নম্বরেই আমরা আপনাকে চিনব।</p>
              <form onSubmit={begin} className="w-full max-w-[16rem] space-y-2">
                <input
                  className="input text-center"
                  inputMode="numeric"
                  autoFocus
                  placeholder="01XXXXXXXXX"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
                {error && <p className="text-xs text-ui-rust">{error}</p>}
                <button disabled={starting} className="btn-primary w-full">
                  {starting ? <Loader2 size={15} className="animate-spin" /> : 'চ্যাট শুরু করুন'}
                </button>
              </form>
            </div>
          ) : (
            <>
              <div
                ref={bodyRef}
                className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5"
                style={{ backgroundColor: '#ECE5DD' }}
              >
                {messages.length === 0 && (
                  <p className="text-center text-[12px] text-black/40 mt-6">
                    আপনার বার্তা লিখুন — আমরা শীঘ্রই উত্তর দেব।
                  </p>
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

              {/* Composer */}
              <form onSubmit={send} className="shrink-0 bg-[#F0F0F0] px-2 py-2 flex items-end gap-2">
                <textarea
                  rows={1}
                  className="flex-1 resize-none max-h-24 rounded-2xl bg-white border border-black/10 px-3.5 py-2 text-sm outline-none focus:border-[#075E54]/40 font-bangla"
                  placeholder="মেসেজ লিখুন…"
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
                  aria-label="পাঠান"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Bubble({ m }) {
  const mine = m.from === 'customer';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-2.5 py-1.5 shadow-sm text-sm leading-snug whitespace-pre-wrap break-words font-bangla ${
          mine ? 'bg-[#DCF8C6] rounded-tr-none' : 'bg-white rounded-tl-none'
        }`}
        dir="auto"
      >
        {!mine && m.senderName && (
          <div className="text-[11px] font-semibold text-[#075E54] mb-0.5">{m.senderName}</div>
        )}
        <span>{m.body}</span>
        <span className="inline-block align-bottom text-[10px] text-black/45 ml-2 -mb-0.5 float-right pl-1">
          {m.pending ? '…' : m.failed ? '⚠' : timeStr(m.createdAt)}
        </span>
      </div>
    </div>
  );
}
