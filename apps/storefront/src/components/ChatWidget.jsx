import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, ArrowLeft, Paperclip, Mic } from 'lucide-react';
import { chatStart, chatMessages, chatSend, chatUploadMedia } from '../api/client';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { playChatChime } from '../lib/chime';
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
  const [toast, setToast] = useState(null); // { text } — small popup when a reply arrives with the panel closed
  const [attaching, setAttaching] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const bodyRef = useRef(null);
  const lastIdRef = useRef(null);
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
        if (!openRef.current) {
          const adminNewMsgs = fresh.filter(
            (m) => m.from === 'admin' && new Date(m.createdAt).getTime() > seenAtRef.current
          );
          if (adminNewMsgs.length) {
            setUnseen((u) => u + adminNewMsgs.length);
            const latest = adminNewMsgs[adminNewMsgs.length - 1];
            setToast({
              id: latest._id,
              text: previewOf(latest),
            });
            try {
              playChatChime();
            } catch {
              /* audio not allowed yet */
            }
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
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? message : m)));
      lastIdRef.current = message._id;
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

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('শুধু ছবি পাঠানো যাবে।');
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      setError('ছবিটি অনেক বড় (সর্বোচ্চ ৮ MB)।');
      return;
    }
    setAttaching(true);
    setError('');
    try {
      const { url, mime } = await chatUploadMedia(file, session?.phone, session?.guestKey);
      await pushMessage({ type: 'image', mediaUrl: url, mediaMime: mime });
    } catch (err) {
      setError(err.response?.data?.message || 'ছবি আপলোড করা যায়নি।');
    } finally {
      setAttaching(false);
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
        try {
          const { url, mime } = await chatUploadMedia(file, session?.phone, session?.guestKey);
          await pushMessage({ type: 'voice', mediaUrl: url, mediaMime: mime, durationSec: secs });
        } catch (err) {
          setError(err.response?.data?.message || 'ভয়েস মেসেজ পাঠানো যায়নি।');
        } finally {
          setAttaching(false);
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
              {error && (
                <div className="shrink-0 bg-ui-rust/10 text-ui-rust text-[12px] px-3 py-1.5 text-center font-bangla">
                  {error}
                </div>
              )}
              {recording ? (
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
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={attaching}
                    className="w-10 h-10 rounded-full text-[#075E54] flex items-center justify-center shrink-0 disabled:opacity-50 hover:bg-black/5"
                    aria-label="ছবি যোগ করুন"
                  >
                    {attaching ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
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
        <span className="inline-block align-bottom text-[10px] text-black/45 ml-2 -mb-0.5 float-right pl-1">
          {m.pending ? '…' : m.failed ? '⚠' : timeStr(m.createdAt)}
        </span>
      </div>
    </div>
  );
}
