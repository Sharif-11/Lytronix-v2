import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  ArrowLeft,
  Paperclip,
  Mic,
  Check,
  CheckCheck,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  chatStart,
  chatMessages,
  chatSend,
  chatUploadMedia,
  chatEditMessage,
  chatDeleteMessage,
} from '../api/client';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { playChatChime } from '../lib/chime';
import { copyText } from '../lib/clipboard';
import ProgressRing from './ProgressRing';
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

const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const previewOf = (m) =>
  m.type === 'image' ? '📷 ছবি' : m.type === 'voice' ? '🎤 ভয়েস মেসেজ' : (m.body || '').slice(0, 120);

const isRealId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));

// Fold freshly-fetched rows in: replace ones we already hold (so tick/edit/
// delete changes land), append the rest, keep chronological order.
function mergeMessages(prev, fresh) {
  const map = new Map(prev.map((m) => [m._id, m]));
  for (const m of fresh) map.set(m._id, m);
  return [...map.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
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

const HINT_DISMISS_KEY = 'lytronix_chat_hint_dismissed';

export default function ChatWidget({ hint = '' }) {
  const { customer, isAuthed } = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [session, setSession] = useState(loadSession);
  const [phoneInput, setPhoneInput] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [toast, setToast] = useState(null); // { text } — small popup when a reply arrives with the panel closed
  const [attaching, setAttaching] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [editing, setEditing] = useState(null); // { id, body }
  const [menuFor, setMenuFor] = useState(null); // message _id whose action menu is open

  const bodyRef = useRef(null);
  const lastIdRef = useRef(null);
  const updatedAtRef = useRef(null);
  const knownIdsRef = useRef(new Set());
  const seenAtRef = useRef(Number(localStorage.getItem(`${LS_KEY}:seen`)) || 0);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const recTimerRef = useRef(null);
  const recChunksRef = useRef([]);
  const recStartRef = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;

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
      updatedAtRef.current = null;
      knownIdsRef.current = new Set();
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
        updatedAfter: updatedAtRef.current || undefined,
        seen: openRef.current ? 1 : undefined,
      });
      if (!fresh?.length) return;

      // Which of these are genuinely new (not just a receipt/edit update)?
      const brandNew = fresh.filter((m) => !knownIdsRef.current.has(m._id));

      for (const m of fresh) {
        knownIdsRef.current.add(m._id);
        if (isRealId(m._id) && (!lastIdRef.current || m._id > lastIdRef.current)) lastIdRef.current = m._id;
        const u = new Date(m.updatedAt || m.createdAt).getTime();
        if (!updatedAtRef.current || u > new Date(updatedAtRef.current).getTime()) {
          updatedAtRef.current = new Date(u).toISOString();
        }
      }
      setMessages((prev) => mergeMessages(prev, fresh));

      if (!openRef.current) {
        const adminNewMsgs = brandNew.filter(
          (m) => m.from === 'admin' && new Date(m.createdAt).getTime() > seenAtRef.current
        );
        if (adminNewMsgs.length) {
          setUnseen((u) => u + adminNewMsgs.length);
          setToast({
            id: adminNewMsgs[adminNewMsgs.length - 1]._id,
            text: previewOf(adminNewMsgs[adminNewMsgs.length - 1]),
          });
          try {
            playChatChime();
          } catch {
            /* audio not allowed yet */
          }
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

  // Don't keep a half-finished edit / open action menu around once the panel closes.
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setMenuFor(null);
    }
  }, [open]);

  // The little "new reply" popup near the launcher — clears on open, and
  // auto-dismisses after a few seconds otherwise.
  useEffect(() => {
    if (open) {
      setToast(null);
      return undefined;
    }
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 12000);
    return () => clearTimeout(id);
  }, [toast, open]);

  // Optional one-line prompt beside the launcher (e.g. on a product page:
  // "প্রোডাক্ট সম্পর্কে প্রশ্ন থাকলে জিজ্ঞেস করুন"). Shows once per tab, a
  // moment after load, and auto-fades.
  useEffect(() => {
    if (!hint) return undefined;
    try {
      if (sessionStorage.getItem(HINT_DISMISS_KEY)) return undefined;
    } catch {
      /* ignore */
    }
    const showT = setTimeout(() => setShowHint(true), 1000);
    const hideT = setTimeout(() => setShowHint(false), 13000);
    return () => {
      clearTimeout(showT);
      clearTimeout(hideT);
    };
  }, [hint]);

  const dismissHint = () => {
    setShowHint(false);
    try {
      sessionStorage.setItem(HINT_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  // Drop any half-finished recording if the widget unmounts.
  useEffect(
    () => () => {
      clearInterval(recTimerRef.current);
      const rec = recRef.current;
      if (rec && rec.state !== 'inactive') {
        rec._cancelled = true;
        rec.stop();
      }
    },
    []
  );

  // One code path for text and media — an optimistic bubble, then the real
  // row from the server (or a ⚠ marker if it never lands).
  const pushMessage = async (payload) => {
    if (!session?.phone) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      from: 'customer',
      type: payload.type || 'text',
      body: payload.body || '',
      mediaUrl: payload.mediaUrl || '',
      mediaMime: payload.mediaMime || '',
      durationSec: payload.durationSec || 0,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const { message } = await chatSend({
        phone: session.phone,
        guestKey: session.guestKey,
        ...payload,
      });
      knownIdsRef.current.add(message._id);
      setMessages((prev) => {
        const swapped = prev.map((m) => (m._id === optimistic._id ? message : m));
        const seen = new Set();
        return swapped.filter((m) => !seen.has(m._id) && seen.add(m._id));
      });
      if (isRealId(message._id)) lastIdRef.current = message._id;
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? { ...m, failed: true } : m)));
      setError(err.response?.data?.message || 'মেসেজ পাঠানো যায়নি।');
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending || !session?.phone) return;
    setSending(true);
    setError('');
    setDraft('');
    await pushMessage({ type: 'text', body });
    setSending(false);
  };

  const auth = () => ({ phone: session?.phone, guestKey: session?.guestKey });

  const copyMsg = async (m) => {
    setMenuFor(null);
    if (m.body) await copyText(m.body);
  };

  const startEdit = (m) => {
    setMenuFor(null);
    setEditing({ id: m._id, body: m.body || '' });
  };

  const submitEdit = async (e) => {
    e?.preventDefault();
    if (!editing) return;
    const body = editing.body.trim();
    const target = messages.find((m) => m._id === editing.id);
    if (!body || !target || body === (target.body || '')) return setEditing(null);
    setEditing(null);
    setMessages((prev) =>
      prev.map((m) => (m._id === target._id ? { ...m, body, editedAt: new Date().toISOString(), pending: true } : m))
    );
    try {
      const { message } = await chatEditMessage(target._id, { ...auth(), body });
      setMessages((prev) => mergeMessages(prev, [message]));
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m._id === target._id ? { ...target } : m)));
      setError(err.response?.data?.message || 'মেসেজ এডিট করা যায়নি।');
    }
  };

  const deleteMsg = async (m) => {
    setMenuFor(null);
    // eslint-disable-next-line no-alert
    if (!window.confirm('এই মেসেজটি ডিলিট করবেন?')) return;
    try {
      const { message } = await chatDeleteMessage(m._id, auth());
      setMessages((prev) => mergeMessages(prev, [message]));
    } catch (err) {
      setError(err.response?.data?.message || 'মেসেজ ডিলিট করা যায়নি।');
    }
  };

  const onPickFile = async (e) => {
    const picked = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!picked.length || attaching) return;
    const images = picked.filter((f) => f.type.startsWith('image/') && f.size <= MEDIA_MAX_BYTES);
    const skipped = picked.length - images.length;
    setError(skipped ? `${skipped}টি ফাইল বাদ দেওয়া হয়েছে — শুধু ছবি, সর্বোচ্চ ৮ MB।` : '');
    if (!images.length) return;
    setAttaching(true);
    setUploadPct(0);
    try {
      for (let i = 0; i < images.length; i += 1) {
        const base = i / images.length;
        // eslint-disable-next-line no-await-in-loop
        const { url, mime } = await chatUploadMedia(images[i], session?.phone, session?.guestKey, {
          onUploadProgress: (ev) => {
            if (!ev.total) return;
            setUploadPct(Math.round((base + ev.loaded / ev.total / images.length) * 100));
          },
        });
        // eslint-disable-next-line no-await-in-loop
        await pushMessage({ type: 'image', mediaUrl: url, mediaMime: mime });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'ছবি আপলোড করা যায়নি।');
    } finally {
      setAttaching(false);
      setUploadPct(0);
    }
  };

  const startRec = async () => {
    if (recording) return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data?.size) recChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recTimerRef.current);
        const secs = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        setRecording(false);
        setRecSecs(0);
        if (rec._cancelled) return;
        const blob = new Blob(recChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 800) return;
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        setAttaching(true);
        setUploadPct(0);
        try {
          const { url, mime } = await chatUploadMedia(file, session?.phone, session?.guestKey, {
            onUploadProgress: (ev) =>
              ev.total && setUploadPct(Math.round((ev.loaded / ev.total) * 100)),
          });
          await pushMessage({ type: 'voice', mediaUrl: url, mediaMime: mime, durationSec: secs });
        } catch (err) {
          setError(err.response?.data?.message || 'ভয়েস মেসেজ পাঠানো যায়নি।');
        } finally {
          setAttaching(false);
          setUploadPct(0);
        }
      };
      recRef.current = rec;
      recStartRef.current = Date.now();
      rec.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(
        () => setRecSecs(Math.round((Date.now() - recStartRef.current) / 1000)),
        250
      );
    } catch {
      setError('মাইক্রোফোন ব্যবহার করা যায়নি।');
    }
  };

  const stopRec = () => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };
  const cancelRec = () => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      rec._cancelled = true;
      rec.stop();
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
        <>
          {toast && (
            <button
              onClick={() => setOpen(true)}
              className="fixed right-4 bottom-36 sm:bottom-24 z-40 max-w-[16rem] text-left bg-white rounded-2xl shadow-floating border border-black/5 px-3.5 py-2.5 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#075E54] mb-0.5">
                <span className="w-4 h-4 rounded-full bg-[#25D366]/20 flex items-center justify-center overflow-hidden">
                  <img src={logoMark} alt="" className="w-3 h-3 object-contain" />
                </span>
                Lytronix
              </div>
              <p className="text-[13px] text-ui-ink leading-snug line-clamp-2 font-bangla">{toast.text}</p>
              <span className="text-[11px] text-[#075E54] font-medium">উত্তর দিন →</span>
            </button>
          )}
          <div className="fixed right-4 bottom-20 sm:bottom-6 z-40 flex items-center gap-2.5 flex-row-reverse">
            <button
              onClick={() => {
                setOpen(true);
                dismissHint();
              }}
              aria-label="চ্যাট করুন"
              className="relative w-14 h-14 rounded-full bg-[#25D366] text-white shadow-floating flex items-center justify-center active:scale-95 transition-transform"
            >
              <MessageCircle size={26} />
              {unseen > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-ui-rust text-white text-[11px] font-mono leading-5 text-center border-2 border-white">
                  {unseen}
                </span>
              )}
            </button>

            {hint && showHint && !toast && (
              <div className="relative max-w-[13.5rem] bg-white rounded-2xl shadow-floating border border-black/5 pl-3 pr-7 py-2">
                <button
                  onClick={() => setOpen(true)}
                  className="text-[12px] leading-snug text-ui-ink font-bangla text-left"
                >
                  {hint}
                </button>
                <button
                  onClick={dismissHint}
                  aria-label="বন্ধ করুন"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full text-ui-faint hover:text-ui-muted flex items-center justify-center"
                >
                  <X size={12} />
                </button>
                <span className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rotate-45 bg-white border-r border-t border-black/5" />
              </div>
            )}
          </div>
        </>
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
                onClick={() => menuFor && setMenuFor(null)}
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
                    <Bubble
                      key={row.key}
                      m={row.m}
                      menuOpen={menuFor === row.m._id}
                      onToggleMenu={() => setMenuFor((cur) => (cur === row.m._id ? null : row.m._id))}
                      onCopy={() => copyMsg(row.m)}
                      onEdit={() => startEdit(row.m)}
                      onDelete={() => deleteMsg(row.m)}
                    />
                  )
                )}
              </div>

              {/* Composer */}
              {error && (
                <div className="shrink-0 bg-ui-rust/10 text-ui-rust text-[12px] px-3 py-1.5 text-center font-bangla">
                  {error}
                </div>
              )}
              {editing ? (
                <form onSubmit={submitEdit} className="shrink-0 bg-[#F0F0F0] px-2 py-2">
                  <div className="flex items-center justify-between px-1.5 pb-1 text-[11px] text-[#075E54]">
                    <span className="inline-flex items-center gap-1 font-medium font-bangla">
                      <Pencil size={11} /> মেসেজ এডিট
                    </span>
                    <button type="button" onClick={() => setEditing(null)} aria-label="বাতিল">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <textarea
                      rows={1}
                      autoFocus
                      className="flex-1 resize-none max-h-24 rounded-2xl bg-white border border-black/10 px-3.5 py-2 text-sm outline-none focus:border-[#075E54]/40 font-bangla"
                      value={editing.body}
                      onChange={(e) => setEditing((s) => ({ ...s, body: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitEdit();
                        }
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                    <button
                      type="submit"
                      className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0"
                      aria-label="সেভ"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </form>
              ) : recording ? (
                <div className="shrink-0 bg-[#F0F0F0] px-3 py-2.5 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-ui-rust animate-pulse shrink-0" />
                  <span className="text-sm text-ui-ink flex-1 font-mono">
                    রেকর্ড হচ্ছে · {String(Math.floor(recSecs / 60)).padStart(2, '0')}:
                    {String(recSecs % 60).padStart(2, '0')}
                  </span>
                  <button
                    onClick={cancelRec}
                    className="text-[13px] text-ui-rust font-medium px-2 py-1"
                    type="button"
                  >
                    বাতিল
                  </button>
                  <button
                    onClick={stopRec}
                    className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0"
                    type="button"
                    aria-label="পাঠান"
                  >
                    <Send size={16} />
                  </button>
                </div>
              ) : (
                <form onSubmit={send} className="shrink-0 bg-[#F0F0F0] px-2 py-2 flex items-end gap-1.5">
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickFile} />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={attaching}
                    className="w-10 h-10 rounded-full text-[#075E54] flex items-center justify-center shrink-0 disabled:opacity-50 hover:bg-black/5"
                    aria-label="ছবি যোগ করুন"
                  >
                    {attaching ? <ProgressRing value={uploadPct} size={18} /> : <Paperclip size={18} />}
                  </button>
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
                  {draft.trim() ? (
                    <button
                      type="submit"
                      disabled={sending}
                      className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0 disabled:opacity-50"
                      aria-label="পাঠান"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRec}
                      disabled={attaching}
                      className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0 disabled:opacity-50"
                      aria-label="ভয়েস মেসেজ"
                    >
                      <Mic size={16} />
                    </button>
                  )}
                </form>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

// Sent → single grey · delivered → double grey · read → double blue.
function Ticks({ m }) {
  if (m.readByAdmin) return <CheckCheck size={14} className="text-[#53BDEB]" />;
  if (m.deliveredToAdmin) return <CheckCheck size={14} className="text-black/40" />;
  return <Check size={14} className="text-black/40" />;
}

function Bubble({ m, menuOpen, onToggleMenu, onCopy, onEdit, onDelete }) {
  const mine = m.from === 'customer';
  const deleted = Boolean(m.deletedAt);
  const canAct = mine && !deleted && !m.pending && !m.failed;

  return (
    <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[80%] rounded-lg px-2.5 py-1.5 shadow-sm text-sm leading-snug whitespace-pre-wrap break-words font-bangla ${
          mine ? 'bg-[#DCF8C6] rounded-tr-none' : 'bg-white rounded-tl-none'
        }`}
        dir="auto"
      >
        {!mine && m.senderName && !deleted && (
          <div className="text-[11px] font-semibold text-[#075E54] mb-0.5">{m.senderName}</div>
        )}

        {deleted ? (
          <span className="italic text-black/45">🚫 এই মেসেজটি মুছে ফেলা হয়েছে</span>
        ) : (
          <>
            {m.type === 'image' && m.mediaUrl && (
              <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="block">
                <img
                  src={m.mediaUrl}
                  alt="ছবি"
                  className="rounded-md max-h-56 w-auto object-cover"
                  loading="lazy"
                />
              </a>
            )}
            {m.type === 'voice' && m.mediaUrl && (
              <audio src={m.mediaUrl} controls preload="none" className="h-9 w-52 max-w-full mt-0.5" />
            )}
            {m.body && <span>{m.body}</span>}
          </>
        )}

        <span className="inline-flex items-center gap-0.5 align-bottom text-[10px] text-black/45 ml-2 -mb-0.5 float-right pl-1">
          {m.editedAt && !deleted && <span className="italic mr-0.5">এডিটেড</span>}
          {m.pending ? '…' : m.failed ? '⚠' : timeStr(m.createdAt)}
          {mine && !m.pending && !m.failed && !deleted && <Ticks m={m} />}
        </span>

        {canAct && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow border border-black/5 text-black/50 flex items-center justify-center transition-opacity ${
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            aria-label="মেসেজ অপশন"
          >
            <MoreVertical size={13} />
          </button>
        )}

        {canAct && menuOpen && (
          <div className="absolute z-20 top-5 right-0 min-w-[8.5rem] bg-white rounded-xl shadow-floating border border-black/10 py-1 text-[13px] text-ui-ink font-bangla">
            {m.body && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-black/5 flex items-center gap-2"
              >
                <Copy size={13} /> কপি
              </button>
            )}
            {m.type === 'text' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-black/5 flex items-center gap-2"
              >
                <Pencil size={13} /> এডিট
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-black/5 flex items-center gap-2 text-ui-rust"
            >
              <Trash2 size={13} /> ডিলিট
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
