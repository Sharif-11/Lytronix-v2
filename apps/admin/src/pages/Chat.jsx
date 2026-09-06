import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessagesSquare,
  Search,
  Send,
  Loader2,
  ArrowLeft,
  Phone,
  Check,
  CheckCheck,
  Paperclip,
  Mic,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {
  getChatThreads,
  getChatMessages,
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  updateChatThread,
  uploadChatMedia,
} from '../api/client';
import ProgressRing from '../components/ProgressRing';
import { useConfirm } from '../context/ConfirmContext';

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

const isRealId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));

// Fold freshly-fetched rows into the list: replace any we already hold (so
// delivery/read/edit/delete updates land), append the rest, keep time order.
function mergeMessages(prev, fresh) {
  const map = new Map(prev.map((m) => [m._id, m]));
  for (const m of fresh) map.set(m._id, m);
  return [...map.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function Chat() {
  const [params, setParams] = useSearchParams();
  const activePhone = params.get('phone') || '';
  const confirm = useConfirm();

  const [threads, setThreads] = useState([]);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(null); // { id, body }
  const [menuFor, setMenuFor] = useState(null); // message _id whose action menu is open

  const bodyRef = useRef(null);
  const lastIdRef = useRef(null); // newest real message _id (cursor for brand-new rows)
  const updatedAtRef = useRef(null); // newest updatedAt seen (cursor for changed rows)

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

  const absorb = useCallback((fresh) => {
    if (!fresh?.length) return;
    for (const m of fresh) {
      if (isRealId(m._id) && (!lastIdRef.current || m._id > lastIdRef.current)) lastIdRef.current = m._id;
      const u = new Date(m.updatedAt || m.createdAt).getTime();
      if (!updatedAtRef.current || u > new Date(updatedAtRef.current).getTime()) {
        updatedAtRef.current = new Date(u).toISOString();
      }
    }
    setMessages((prev) => mergeMessages(prev, fresh));
  }, []);

  // Load / poll the open conversation.
  useEffect(() => {
    if (!activePhone) {
      setMessages([]);
      lastIdRef.current = null;
      updatedAtRef.current = null;
      return undefined;
    }
    let alive = true;
    setLoadingMsgs(true);
    setEditing(null);
    setMenuFor(null);
    lastIdRef.current = null;
    updatedAtRef.current = null;
    setMessages([]);

    const tick = async (initial) => {
      try {
        const { messages: fresh } = await getChatMessages(activePhone, {
          after: lastIdRef.current || undefined,
          updatedAfter: updatedAtRef.current || undefined,
        });
        if (!alive) return;
        absorb(fresh);
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
  }, [activePhone, loadThreads, absorb]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const openThread = (phone) => setParams(phone ? { phone } : {}, { replace: true });

  const [attaching, setAttaching] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const recTimerRef = useRef(null);
  const recChunksRef = useRef([]);
  const recStartRef = useRef(0);

  const pushMessage = async (payload) => {
    if (!activePhone) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      from: 'admin',
      createdAt: new Date().toISOString(),
      pending: true,
      ...payload,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const { message } = await sendChatMessage(activePhone, payload);
      setMessages((prev) => {
        const swapped = prev.map((m) => (m._id === optimistic._id ? message : m));
        const seen = new Set();
        return swapped.filter((m) => !seen.has(m._id) && seen.add(m._id));
      });
      absorb([message]);
      loadThreads();
    } catch {
      setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? { ...m, failed: true } : m)));
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending || !activePhone) return;
    setSending(true);
    setDraft('');
    await pushMessage({ type: 'text', body });
    setSending(false);
  };

  const copyMsg = async (m) => {
    setMenuFor(null);
    if (m.body) await copyToClipboard(m.body);
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
    if (!body || !target) return setEditing(null);
    if (body === (target.body || '')) return setEditing(null);
    setEditing(null);
    setMessages((prev) =>
      prev.map((m) => (m._id === target._id ? { ...m, body, editedAt: new Date().toISOString(), pending: true } : m))
    );
    try {
      const { message } = await editChatMessage(activePhone, target._id, body);
      absorb([message]);
      loadThreads();
    } catch {
      setMessages((prev) => prev.map((m) => (m._id === target._id ? { ...target } : m)));
    }
  };

  const deleteMsg = async (m) => {
    setMenuFor(null);
    const ok = await confirm('Delete this message for everyone?', {
      title: 'Delete message',
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const { message } = await deleteChatMessage(activePhone, m._id);
      absorb([message]);
      loadThreads();
    } catch {
      /* surfaced globally */
    }
  };

  const onPickFile = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length || attaching) return;
    const images = picked.filter((f) => f.type.startsWith('image/') && f.size <= 8 * 1024 * 1024);
    const skipped = picked.length - images.length;
    if (skipped) alert(`${skipped} file(s) skipped — images only, under 8MB each.`);
    if (!images.length) return;
    setAttaching(true);
    setUploadPct(0);
    try {
      for (let i = 0; i < images.length; i += 1) {
        const base = i / images.length;
        // eslint-disable-next-line no-await-in-loop
        const { url, mime } = await uploadChatMedia(images[i], {
          onUploadProgress: (ev) => {
            if (!ev.total) return;
            setUploadPct(Math.round((base + ev.loaded / ev.total / images.length) * 100));
          },
        });
        // eslint-disable-next-line no-await-in-loop
        await pushMessage({ type: 'image', mediaUrl: url, mediaMime: mime });
      }
    } catch {
      /* surfaced globally */
    } finally {
      setAttaching(false);
      setUploadPct(0);
    }
  };

  const startRec = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunksRef.current = [];
      mr.ondataavailable = (ev) => ev.data.size && recChunksRef.current.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recTimerRef.current);
        setRecording(false);
        const secs = Math.round((Date.now() - recStartRef.current) / 1000);
        setRecSecs(0);
        const blob = new Blob(recChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size < 800) return; // too short / silent
        setAttaching(true);
        setUploadPct(0);
        try {
          const file = new File([blob], 'voice.webm', { type: blob.type });
          const { url, mime } = await uploadChatMedia(file, {
            onUploadProgress: (ev) => ev.total && setUploadPct(Math.round((ev.loaded / ev.total) * 100)),
          });
          await pushMessage({ type: 'voice', mediaUrl: url, mediaMime: mime, durationSec: secs });
        } catch {
          /* surfaced */
        } finally {
          setAttaching(false);
          setUploadPct(0);
        }
      };
      recRef.current = mr;
      recStartRef.current = Date.now();
      mr.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      alert('Microphone permission is needed to record a voice note.');
    }
  };
  const stopRec = () => recRef.current?.state === 'recording' && recRef.current.stop();
  const cancelRec = () => {
    if (recRef.current?.state === 'recording') {
      recRef.current.onstop = null;
      recRef.current.stop();
      recRef.current.stream?.getTracks?.().forEach((t) => t.stop());
    }
    clearInterval(recTimerRef.current);
    setRecording(false);
    setRecSecs(0);
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
      <div className="flex sm:border sm:border-ui-line sm:rounded-2xl sm:overflow-hidden sm:shadow-card bg-white h-[calc(100dvh-8.5rem)] sm:h-[calc(100dvh-7rem)]">
        {/* Thread list */}
        <aside className={`w-full sm:w-[20rem] sm:border-r border-ui-line flex-col min-h-0 ${activePhone ? 'hidden sm:flex' : 'flex'}`}>
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
          <div className="flex-1 min-h-0 overflow-y-auto">
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
        <section className={`flex-1 flex-col min-w-0 min-h-0 ${activePhone ? 'flex' : 'hidden sm:flex'}`} style={{ backgroundColor: '#ECE5DD' }}>
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

              <div
                ref={bodyRef}
                className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5"
                onClick={() => menuFor && setMenuFor(null)}
              >
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

              {editing ? (
                <form onSubmit={submitEdit} className="shrink-0 bg-[#F0F0F0] px-2 py-2">
                  <div className="flex items-center justify-between px-1.5 pb-1 text-[11px] text-[#075E54]">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Pencil size={11} /> Editing message
                    </span>
                    <button type="button" onClick={() => setEditing(null)} aria-label="Cancel edit">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <textarea
                      rows={1}
                      autoFocus
                      className="flex-1 resize-none max-h-28 rounded-2xl bg-white border border-black/10 px-3.5 py-2 text-sm outline-none focus:border-[#075E54]/40 font-bangla"
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
                      aria-label="Save"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </form>
              ) : recording ? (
                <div className="shrink-0 bg-[#F0F0F0] px-3 py-2.5 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-ui-rust animate-pulse" />
                  <span className="text-sm font-mono text-ui-ink flex-1">
                    রেকর্ডিং {String(Math.floor(recSecs / 60)).padStart(1, '0')}:{String(recSecs % 60).padStart(2, '0')}
                  </span>
                  <button onClick={cancelRec} className="text-xs text-ui-muted px-2 py-1">Cancel</button>
                  <button
                    onClick={stopRec}
                    className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center"
                    aria-label="Stop & send"
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
                    className="w-10 h-10 rounded-full text-ui-muted hover:bg-black/5 flex items-center justify-center shrink-0"
                    aria-label="Attach images"
                  >
                    {attaching ? <ProgressRing value={uploadPct} size={18} /> : <Paperclip size={18} />}
                  </button>
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
                  {draft.trim() ? (
                    <button
                      type="submit"
                      disabled={sending}
                      className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0 disabled:opacity-50"
                      aria-label="Send"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRec}
                      className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0"
                      aria-label="Record voice"
                    >
                      <Mic size={18} />
                    </button>
                  )}
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// Sent → single grey · delivered → double grey · read → double blue.
function Ticks({ m }) {
  if (m.readByCustomer) return <CheckCheck size={14} className="text-[#53BDEB]" />;
  if (m.deliveredToCustomer) return <CheckCheck size={14} className="text-black/40" />;
  return <Check size={14} className="text-black/40" />;
}

function Bubble({ m, menuOpen, onToggleMenu, onCopy, onEdit, onDelete }) {
  const mine = m.from === 'admin';
  const deleted = Boolean(m.deletedAt);
  const canAct = mine && !deleted && !m.pending && !m.failed;

  return (
    <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[78%] rounded-lg px-2.5 py-1.5 shadow-sm text-sm leading-snug whitespace-pre-wrap break-words font-bangla ${
          mine ? 'bg-[#DCF8C6] rounded-tr-none' : 'bg-white rounded-tl-none'
        }`}
        dir="auto"
      >
        {mine && m.senderName && !deleted && (
          <div className="text-[11px] font-semibold text-[#075E54] mb-0.5">{m.senderName}</div>
        )}

        {deleted ? (
          <span className="italic text-black/45">🚫 This message was deleted</span>
        ) : (
          <>
            {m.type === 'image' && m.mediaUrl && (
              <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="block">
                <img src={m.mediaUrl} alt="" className="rounded-md max-h-56 max-w-full object-cover" />
              </a>
            )}
            {m.type === 'voice' && m.mediaUrl && (
              <audio src={m.mediaUrl} controls className="h-9 w-52 max-w-full mt-0.5" />
            )}
            {m.body && <span>{m.body}</span>}
          </>
        )}

        <span className="inline-flex items-center gap-0.5 align-bottom text-[10px] text-black/45 ml-2 -mb-0.5 float-right pl-1">
          {m.editedAt && !deleted && <span className="italic mr-0.5">edited</span>}
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
            className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow border border-black/5 text-ui-muted flex items-center justify-center transition-opacity ${
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            aria-label="Message actions"
          >
            <MoreVertical size={13} />
          </button>
        )}

        {canAct && menuOpen && (
          <div className="absolute z-20 top-5 right-0 min-w-[9rem] bg-white rounded-xl shadow-floating border border-ui-line py-1 text-[13px] text-ui-ink">
            {m.body && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-ui-bg flex items-center gap-2"
              >
                <Copy size={13} /> Copy
              </button>
            )}
            {m.type === 'text' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-ui-bg flex items-center gap-2"
              >
                <Pencil size={13} /> Edit
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-ui-bg flex items-center gap-2 text-ui-rust"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
