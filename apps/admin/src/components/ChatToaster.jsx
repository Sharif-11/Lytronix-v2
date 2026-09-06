import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessagesSquare, X } from 'lucide-react';
import { getChatThreads } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { playChatChime } from '../lib/chime';

const POLL_MS = 7000;
const TOAST_TTL_MS = 12000;
const SOUND_PREF_KEY = 'lytronix:notifySound';

const soundOn = () => {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
};

// Global: watches every chat thread for a new inbound customer message and,
// when the admin isn't already on the Chat page, plays a ping and drops a
// small toast with the message + a "Reply" shortcut.
export default function ChatToaster() {
  const { user, hasPermission } = useAuth();
  const canChat = Boolean(user) && hasPermission('customers:manage');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);

  const lastSeen = useRef(new Map()); // phone -> lastMessageAt (ms)
  const primed = useRef(false);
  const onChatRef = useRef(false);
  onChatRef.current = pathname.startsWith('/chat');

  const dismiss = (id) => setToasts((cur) => cur.filter((t) => t.id !== id));

  useEffect(() => {
    if (!canChat) {
      primed.current = false;
      lastSeen.current.clear();
      setToasts([]);
      return undefined;
    }

    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      let data;
      try {
        data = await getChatThreads();
      } catch {
        return;
      }
      if (!alive) return;

      const first = !primed.current;
      const fresh = [];
      for (const t of data.threads || []) {
        const at = new Date(t.lastMessageAt).getTime();
        const prev = lastSeen.current.get(t.phone) || 0;
        lastSeen.current.set(t.phone, at);
        if (!first && at > prev && t.lastMessageFrom === 'customer' && t.unreadForAdmin > 0) {
          fresh.push({ ...t, at });
        }
      }
      primed.current = true;

      if (fresh.length && !onChatRef.current) {
        if (soundOn()) playChatChime();
        setToasts((cur) => {
          const kept = cur.filter((c) => !fresh.some((f) => f.phone === c.phone));
          const added = fresh.map((f) => ({
            id: `${f.phone}-${f.at}`,
            phone: f.phone,
            name: f.name || f.phone,
            preview: f.lastMessagePreview || 'New message',
          }));
          return [...kept, ...added].slice(-4);
        });
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    const onFocus = () => poll();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [canChat]);

  // Clear toasts when the admin lands on the Chat page.
  useEffect(() => {
    if (pathname.startsWith('/chat')) setToasts([]);
  }, [pathname]);

  // Per-toast auto-dismiss.
  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), TOAST_TTL_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  if (toasts.length === 0) return null;

  const openThread = (phone, id) => {
    dismiss(id);
    navigate(`/chat?phone=${phone}`);
  };

  return (
    <div className="fixed right-4 bottom-4 z-[90] flex flex-col gap-2 w-[19rem] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-white border border-ui-line rounded-2xl shadow-floating p-3 flex gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-[#075E54] text-white flex items-center justify-center shrink-0">
            <MessagesSquare size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ui-ink truncate">{t.name}</span>
              <button onClick={() => dismiss(t.id)} className="text-ui-faint hover:text-ui-ink shrink-0" aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-ui-muted line-clamp-2 mt-0.5 font-bangla" dir="auto">
              {t.preview}
            </p>
            <button
              onClick={() => openThread(t.phone, t.id)}
              className="mt-2 text-xs font-semibold text-[#075E54] hover:underline"
            >
              Reply →
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
