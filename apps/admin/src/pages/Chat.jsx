import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Bot,
  Video,
  Music,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getChatThreads,
  getChatMessages,
  sendChatMessage,
  sendChatTyping,
  editChatMessage,
  deleteChatMessage,
  updateChatThread,
  uploadChatMedia,
} from '../api/client';
import ProgressRing from '../components/ProgressRing';
import Loader from '../components/Loader';
import ChatAiSettingsModal from '../components/ChatAiSettingsModal';
import { useConfirm } from '../context/ConfirmContext';
import usePageTitle from '../lib/usePageTitle';

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
  usePageTitle('Chat');
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
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);

  const bodyRef = useRef(null);
  const lastIdRef = useRef(null); // newest real message _id (cursor for brand-new rows)
  const updatedAtRef = useRef(null); // newest updatedAt seen (cursor for changed rows)
  const lastTypingPingRef = useRef(0); // throttle our own "I'm typing" pings

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
      setCustomerTyping(false);
      return undefined;
    }
    let alive = true;
    setLoadingMsgs(true);
    setEditing(null);
    setMenuFor(null);
    lastIdRef.current = null;
    updatedAtRef.current = null;
    setMessages([]);
    setCustomerTyping(false);

    const tick = async (initial) => {
      try {
        const { messages: fresh, thread } = await getChatMessages(activePhone, {
          after: lastIdRef.current || undefined,
          updatedAfter: updatedAtRef.current || undefined,
        });
        if (!alive) return;
        setCustomerTyping(Boolean(thread?.customerTyping));
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
  }, [messages, customerTyping]);

  const openThread = (phone) => setParams(phone ? { phone } : {}, { replace: true });

  const [attaching, setAttaching] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  // Whole-panel drag & drop, WhatsApp-style: dropping files never sends them
  // immediately — they queue as pending previews (image/video/audio) until
  // the admin explicitly hits Send, same tap-to-confirm as WhatsApp desktop.
  const [dragActive, setDragActive] = useState(false);
  const [pendingDrops, setPendingDrops] = useState([]); // [{ id, file, kind, previewUrl }]
  const [sendingDrops, setSendingDrops] = useState(false);
  const [dropUploadPct, setDropUploadPct] = useState(0);
  const dragCounterRef = useRef(0);
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

  // Throttled to roughly once per ~2.5s of active typing — not per keystroke.
  const onDraftChange = (value) => {
    setDraft(value);
    if (!value.trim() || !activePhone) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < 2500) return;
    lastTypingPingRef.current = now;
    sendChatTyping(activePhone);
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

  // Several images picked at once become ONE album message (like
  // WhatsApp), same as a multi-file drag-drop — not one message per file.
  // uploadPct is a single byte-weighted percentage across every file.
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

    const totalBytes = images.reduce((sum, f) => sum + f.size, 0) || 1;
    const loadedByIndex = new Array(images.length).fill(0);
    const reportProgress = () => {
      const loaded = loadedByIndex.reduce((sum, n) => sum + n, 0);
      setUploadPct(Math.min(99, Math.round((loaded / totalBytes) * 100)));
    };

    try {
      const uploaded = [];
      for (let i = 0; i < images.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { url, mime } = await uploadChatMedia(images[i], {
          onUploadProgress: (ev) => {
            loadedByIndex[i] = ev.total ? ev.loaded : 0;
            reportProgress();
          },
        });
        loadedByIndex[i] = images[i].size;
        reportProgress();
        uploaded.push({ url, mime, type: 'image' });
      }
      setUploadPct(100);
      if (uploaded.length === 1) {
        await pushMessage({ type: 'image', mediaUrl: uploaded[0].url, mediaMime: uploaded[0].mime });
      } else {
        await pushMessage({ type: 'album', media: uploaded });
      }
    } catch {
      /* surfaced globally */
    } finally {
      setAttaching(false);
      setUploadPct(0);
    }
  };

  const MAX_DROP_BYTES = 20 * 1024 * 1024;
  const kindForFile = (file) =>
    file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'voice';

  // dragCounterRef survives dragenter/dragleave firing on every child element
  // as the pointer moves over them — without it the overlay would flicker
  // on/off while dragging across the panel instead of staying up the whole
  // time a file is over it.
  const onDragEnter = (e) => {
    e.preventDefault();
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragCounterRef.current += 1;
    setDragActive(true);
  };
  const onDragOver = (e) => {
    e.preventDefault(); // required, or the browser refuses the drop entirely
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };
  const onDropFiles = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    if (!activePhone) return; // no open conversation to attach to

    const dropped = Array.from(e.dataTransfer?.files || []);
    const accepted = dropped.filter((f) => /^(image|video|audio)\//.test(f.type) && f.size <= MAX_DROP_BYTES);
    const skipped = dropped.length - accepted.length;
    if (skipped) alert(`${skipped} file(s) skipped — images, videos, and audio only, under 20MB each.`);
    if (!accepted.length) return;

    const withPreviews = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      kind: kindForFile(file),
      previewUrl: file.type.startsWith('audio/') ? '' : URL.createObjectURL(file),
    }));
    setPendingDrops((prev) => [...prev, ...withPreviews]);
  };

  const removePendingDrop = (id) => {
    setPendingDrops((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };
  const cancelPendingDrops = () => {
    pendingDrops.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setPendingDrops([]);
  };

  // Multiple files dropped/queued at once become ONE album message (like
  // WhatsApp) instead of one message per file — uploaded first, sent only
  // once every upload has finished. dropUploadPct is a single byte-weighted
  // percentage across every file's upload, not a per-file count, since a
  // few small images finishing instantly alongside one large video would
  // otherwise make a naive "files done / total files" percentage lie.
  const sendPendingDrops = async () => {
    if (!pendingDrops.length || sendingDrops || !activePhone) return;
    setSendingDrops(true);
    setDropUploadPct(0);
    // Thumbnails intentionally stay visible (pendingDrops isn't cleared yet)
    // for the whole upload, like WhatsApp's own send progress — only
    // cleared below once the message is actually sent. On failure they're
    // left in place so the admin can just hit Send again without re-
    // picking the files.
    const queue = pendingDrops;

    const totalBytes = queue.reduce((sum, item) => sum + item.file.size, 0) || 1;
    const loadedByIndex = new Array(queue.length).fill(0);
    const reportProgress = () => {
      const loaded = loadedByIndex.reduce((sum, n) => sum + n, 0);
      setDropUploadPct(Math.min(99, Math.round((loaded / totalBytes) * 100)));
    };

    try {
      const uploaded = [];
      for (let i = 0; i < queue.length; i += 1) {
        const item = queue[i];
        // eslint-disable-next-line no-await-in-loop
        const { url, mime } = await uploadChatMedia(item.file, {
          onUploadProgress: (ev) => {
            loadedByIndex[i] = ev.total ? ev.loaded : 0;
            reportProgress();
          },
        });
        loadedByIndex[i] = item.file.size; // done, regardless of the last progress event's rounding
        reportProgress();
        uploaded.push({ url, mime, type: item.kind });
      }

      setDropUploadPct(100);
      if (uploaded.length === 1) {
        await pushMessage({ type: uploaded[0].type, mediaUrl: uploaded[0].url, mediaMime: uploaded[0].mime });
      } else {
        await pushMessage({ type: 'album', media: uploaded });
      }
      queue.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      setPendingDrops([]);
    } catch {
      /* surfaced globally via the ErrorModal — pendingDrops left as-is so Send can be retried */
    } finally {
      setSendingDrops(false);
      setDropUploadPct(0);
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
              <MessagesSquare size={20} />
              <span className="flex-1">Chat</span>
              <button
                type="button"
                onClick={() => setAiSettingsOpen(true)}
                className="w-8 h-8 rounded-lg text-ui-muted hover:text-ui-brand hover:bg-ui-brand/10 flex items-center justify-center"
                aria-label="AI assistant settings"
                title="AI assistant settings"
              >
                <Bot size={17} />
              </button>
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
                  {(t.name || (t.channel === 'messenger' ? 'M' : t.phone) || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ui-ink truncate flex items-center gap-1.5">
                      {t.name || (t.channel === 'messenger' ? 'Messenger ইউজার' : t.phone)}
                      {t.channel === 'messenger' && (
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[#0084FF] bg-[#0084FF]/10 rounded-full px-1.5 py-0.5">
                          Messenger
                        </span>
                      )}
                    </span>
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
        <section
          className={`relative flex-1 flex-col min-w-0 min-h-0 ${activePhone ? 'flex' : 'hidden sm:flex'}`}
          style={{ backgroundColor: '#ECE5DD' }}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDropFiles}
        >
          {dragActive && (
            <div className="absolute inset-0 z-30 bg-ui-brand/10 border-4 border-dashed border-ui-brand flex items-center justify-center pointer-events-none">
              <div className="bg-white rounded-2xl shadow-floating px-6 py-5 flex flex-col items-center gap-2 text-center">
                <UploadCloud size={32} className="text-ui-brand" />
                <span className="text-sm font-medium text-ui-ink">এখানে ছেড়ে দিন — ছবি, ভিডিও বা অডিও পাঠাতে</span>
              </div>
            </div>
          )}
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
                  {(activeThread?.name || (activeThread?.channel === 'messenger' ? 'M' : activePhone))[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm leading-tight truncate flex items-center gap-1.5">
                    {activeThread?.name || (activeThread?.channel === 'messenger' ? 'Messenger ইউজার' : activePhone)}
                    {activeThread?.channel === 'messenger' && (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide bg-white/20 rounded-full px-1.5 py-0.5">
                        Messenger
                      </span>
                    )}
                  </div>
                  {activeThread?.channel === 'messenger' ? (
                    <span className="text-[11px] text-white/70 leading-tight">কোনো ফোন নম্বর নেই — শুধু Messenger</span>
                  ) : (
                    <a href={`tel:${activePhone}`} className="text-[11px] text-white/70 leading-tight inline-flex items-center gap-1">
                      <Phone size={11} /> {activePhone}
                    </a>
                  )}
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
                {loadingMsgs && <Loader inline className="justify-center mt-4" />}
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
                {customerTyping && <TypingBubble />}
              </div>

              {pendingDrops.length > 0 || sendingDrops ? (
                <div className="shrink-0 bg-[#F0F0F0] px-3 py-2.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ui-muted">{pendingDrops.length}টি ফাইল পাঠানোর জন্য প্রস্তুত</span>
                    <button type="button" onClick={cancelPendingDrops} disabled={sendingDrops} className="text-xs text-ui-rust hover:underline disabled:opacity-40">
                      বাতিল করুন
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {pendingDrops.map((p) => (
                      <div key={p.id} className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-ui-line bg-white">
                        {p.kind === 'image' && <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />}
                        {p.kind === 'video' && (
                          <div className="w-full h-full flex items-center justify-center bg-ui-ink/5 text-ui-muted">
                            <Video size={20} />
                          </div>
                        )}
                        {p.kind === 'voice' && (
                          <div className="w-full h-full flex items-center justify-center bg-ui-ink/5 text-ui-muted">
                            <Music size={20} />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removePendingDrop(p.id)}
                          disabled={sendingDrops}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-ui-line text-ui-rust flex items-center justify-center shadow-card disabled:opacity-40"
                          aria-label="Remove"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {sendingDrops && (
                    <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                      <div
                        className="h-full bg-[#075E54] transition-[width] duration-200"
                        style={{ width: `${dropUploadPct}%` }}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={sendPendingDrops}
                    disabled={sendingDrops}
                    className="w-full h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60"
                  >
                    {sendingDrops ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {sendingDrops ? `আপলোড হচ্ছে… ${dropUploadPct}%` : `পাঠান (${pendingDrops.length})`}
                  </button>
                </div>
              ) : editing ? (
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
                    disabled={attaching || activeThread?.channel === 'messenger'}
                    title={activeThread?.channel === 'messenger' ? 'Messenger থ্রেডে এখনো ছবি পাঠানো যায় না' : undefined}
                    className="w-10 h-10 rounded-full text-ui-muted hover:bg-black/5 flex items-center justify-center shrink-0 disabled:opacity-30"
                    aria-label="Attach images"
                  >
                    {attaching ? <ProgressRing value={uploadPct} size={18} /> : <Paperclip size={18} />}
                  </button>
                  <textarea
                    rows={1}
                    className="flex-1 resize-none max-h-28 rounded-2xl bg-white border border-black/10 px-3.5 py-2 text-sm outline-none focus:border-[#075E54]/40 font-bangla"
                    placeholder="Type a reply…"
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
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
                      disabled={activeThread?.channel === 'messenger'}
                      title={activeThread?.channel === 'messenger' ? 'Messenger থ্রেডে এখনো ভয়েস মেসেজ পাঠানো যায় না' : undefined}
                      className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0 disabled:opacity-30"
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

      {aiSettingsOpen && <ChatAiSettingsModal onClose={() => setAiSettingsOpen(false)} />}
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
  const [lightboxIdx, setLightboxIdx] = useState(null); // index into m.media, or null when closed

  return (
    <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[78%] rounded-lg px-2.5 py-1.5 shadow-sm text-sm leading-snug whitespace-pre-wrap break-words font-bangla ${
          mine
            ? m.isAiReply
              ? 'bg-[#E4E9FF] rounded-tr-none'
              : 'bg-[#DCF8C6] rounded-tr-none'
            : 'bg-white rounded-tl-none'
        }`}
        dir="auto"
      >
        {mine && !deleted && (m.isAiReply || m.senderName) && (
          <div className="text-[11px] font-semibold text-[#075E54] mb-0.5 flex items-center gap-1">
            {m.isAiReply && <Bot size={11} className="text-[#4A5BD4]" />}
            <span className={m.isAiReply ? 'text-[#4A5BD4]' : ''}>{m.isAiReply ? 'AI auto-reply' : m.senderName}</span>
          </div>
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
            {m.type === 'video' && m.mediaUrl && (
              <video src={m.mediaUrl} controls className="rounded-md max-h-56 max-w-full" />
            )}
            {m.type === 'album' && m.media?.length > 0 && <AlbumGrid media={m.media} onOpen={setLightboxIdx} />}
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

      {lightboxIdx !== null && m.media && (
        <ChatLightbox media={m.media} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </div>
  );
}

// A 2+ file message sent together — WhatsApp-style grid instead of a
// message-per-file flood. Shows up to 4 tiles; a 5th+ item collapses into
// a "+N" overlay on the 4th so the bubble never grows unbounded.
const ALBUM_VISIBLE = 4;
function AlbumGrid({ media, onOpen }) {
  const visible = media.slice(0, ALBUM_VISIBLE);
  const overflow = media.length - ALBUM_VISIBLE;
  return (
    <div className="grid grid-cols-2 gap-1 w-56">
      {visible.map((item, i) => {
        const isLastVisible = i === ALBUM_VISIBLE - 1 && overflow > 0;
        return (
          <button
            key={item.url}
            type="button"
            onClick={() => onOpen(i)}
            className="relative aspect-square rounded-md overflow-hidden bg-black/5 block"
          >
            {item.type === 'image' && <img src={item.url} alt="" className="w-full h-full object-cover" />}
            {item.type === 'video' && (
              <>
                <video src={item.url} className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                  <Video size={18} />
                </span>
              </>
            )}
            {item.type === 'voice' && (
              <span className="absolute inset-0 flex items-center justify-center text-ui-muted">
                <Music size={18} />
              </span>
            )}
            {isLastVisible && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm font-semibold">
                +{overflow}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const LIGHTBOX_SWIPE_THRESHOLD = 45; // px of horizontal travel before it counts as a swipe

// Full-screen viewer for an album — arrows, swipe, and keyboard nav so
// every item (not just the 4 visible tiles) is reachable, including the
// ones collapsed behind AlbumGrid's "+N" overlay.
function ChatLightbox({ media, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const startRef = useRef(null);

  const goTo = useCallback((n) => setIdx((c) => (n(c) + media.length) % media.length), [media.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goTo((i) => i + 1);
      else if (e.key === 'ArrowLeft') goTo((i) => i - 1);
    };
    window.addEventListener('keydown', onKey);

    // overflow:hidden alone doesn't reliably stop the page moving under a
    // touch drag on iOS Safari — pin the body in place at its current
    // scroll position instead, and restore it on close (same fix as the
    // storefront's product gallery lightbox).
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, left: body.left, right: body.right, overflow: body.overflow };
    body.position = 'fixed';
    body.top = `-${scrollY}px`;
    body.left = '0';
    body.right = '0';
    body.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      body.position = prev.position;
      body.top = prev.top;
      body.left = prev.left;
      body.right = prev.right;
      body.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [onClose, goTo]);

  const onTouchStart = (e) => {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    const s = startRef.current;
    startRef.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > LIGHTBOX_SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      goTo((i) => (dx < 0 ? i + 1 : i - 1));
    } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      onClose(); // swipe down to dismiss
    }
  };

  const cur = media[idx];

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-md flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 h-14 text-white/90 shrink-0">
        <span className="text-sm font-mono">{idx + 1} / {media.length}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
          <X size={20} />
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center px-4 pb-4 min-h-0"
        style={{ touchAction: 'none' }} // JS fully owns swipe-navigate/swipe-dismiss below — no competing native pan/zoom
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {cur.type === 'video' && <video src={cur.url} controls autoPlay className="max-h-full max-w-full rounded-lg" />}
        {cur.type === 'voice' && <audio src={cur.url} controls className="w-72" />}
        {cur.type === 'image' && <img src={cur.url} alt="" className="max-h-full max-w-full object-contain rounded-lg" draggable={false} />}
      </div>

      {media.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goTo((i) => i - 1); }}
            aria-label="আগেরটি"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goTo((i) => i + 1); }}
            aria-label="পরেরটি"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <style>{`@keyframes lx-admin-typing{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-3px);opacity:.9}}`}</style>
      <div className="bg-white rounded-lg rounded-tl-none px-3 py-2.5 shadow-sm inline-flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-black/40"
            style={{ animation: 'lx-admin-typing 1.2s infinite ease-in-out', animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}
