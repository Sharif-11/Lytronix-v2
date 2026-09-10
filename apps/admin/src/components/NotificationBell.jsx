import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellRing, Package, Truck, MapPin, Wallet, Info, Volume2, VolumeX, Check, Loader2, MessageCircle,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { pushSupported, getPushState, enablePush, disablePush } from '../lib/push';

const ICONS = {
  order_new: Package,
  courier_status: Truck,
  courier_tracking: MapPin,
  payment_review: Wallet,
  chat: MessageCircle,
  system: Info,
};

const SEV_COLOR = {
  success: 'text-ui-brand bg-ui-brand/10',
  warning: 'text-amber-600 bg-amber-50',
  error: 'text-ui-rust bg-red-50',
  info: 'text-accent-indigo bg-accent-indigo/10',
};

function relTime(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function PushRow() {
  const [state, setState] = useState({ supported: true, permission: 'default', subscribed: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const refresh = () => getPushState().then(setState).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  if (!pushSupported()) return null;

  const toggle = async () => {
    setErr('');
    setBusy(true);
    try {
      if (state.subscribed) await disablePush();
      else await enablePush();
      await refresh();
    } catch (e) {
      const map = {
        denied: 'ব্রাউজার সেটিংসে নোটিফিকেশন ব্লক করা আছে।',
        'server-not-configured': 'সার্ভারে পুশ কনফিগার করা নেই (VAPID কী)।',
        unsupported: 'এই ব্রাউজারে ব্যাকগ্রাউন্ড অ্যালার্ট সাপোর্ট করে না।',
      };
      setErr(map[e.message] || 'পুশ চালু করা যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  const blocked = state.permission === 'denied';

  return (
    <div className="px-4 py-2 border-b border-ui-line bg-ui-surfaceAlt/60">
      <button
        onClick={toggle}
        disabled={busy || blocked}
        className={`w-full flex items-center gap-2 text-xs font-medium rounded-lg px-2.5 py-2 transition-colors ${
          state.subscribed
            ? 'text-ui-brand bg-ui-brand/10 hover:bg-ui-brand/15'
            : 'text-ui-ink bg-white border border-ui-line hover:bg-ui-surfaceAlt'
        } disabled:opacity-60`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
        <span className="flex-1 text-left">
          {blocked
            ? 'ব্যাকগ্রাউন্ড অ্যালার্ট ব্রাউজারে ব্লকড'
            : state.subscribed
            ? 'ব্যাকগ্রাউন্ড অ্যালার্ট চালু — বন্ধ করতে ট্যাপ করুন'
            : 'ব্যাকগ্রাউন্ড অ্যালার্ট চালু করুন (অ্যাপ বন্ধ থাকলেও)'}
        </span>
      </button>
      {err && <p className="text-[11px] text-ui-rust mt-1">{err}</p>}
    </div>
  );
}

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, soundOn, toggleSound } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openItem = (n) => {
    if (!n.read) markRead([n._id]);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-ui-line bg-white text-ui-ink hover:bg-ui-surfaceAlt transition-colors"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-ui-rust text-white text-[10px] font-mono font-semibold leading-[1.1rem] text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-x-2 top-[4.5rem] z-50 bg-white border border-ui-line rounded-2xl shadow-floating overflow-hidden
                     sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-ui-line">
            <span className="font-display font-bold text-sm text-ui-ink">Notifications</span>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                title={soundOn ? 'Mute new-order sound' : 'Unmute new-order sound'}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-ui-muted hover:bg-ui-surfaceAlt"
              >
                {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-ui-brand hover:underline inline-flex items-center gap-1 px-1.5"
                >
                  <Check size={13} /> Mark all read
                </button>
              )}
            </div>
          </div>

          <PushRow />

          <div className="max-h-[65vh] sm:max-h-[24rem] overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              <p className="text-sm text-ui-muted text-center py-10">No notifications yet.</p>
            ) : (
              notifications.map((n) => {
                const Icon = ICONS[n.type] || Info;
                return (
                  <button
                    key={n._id}
                    onClick={() => openItem(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-ui-line/70 last:border-0 hover:bg-ui-surfaceAlt transition-colors ${
                      n.read ? 'opacity-65' : ''
                    }`}
                  >
                    <span
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                        SEV_COLOR[n.severity] || SEV_COLOR.info
                      }`}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ui-ink truncate">{n.title}</span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-ui-rust shrink-0" />}
                      </span>
                      {n.body && <span className="block text-xs text-ui-muted mt-0.5 line-clamp-2">{n.body}</span>}
                      <span className="block text-[11px] text-ui-faint mt-0.5">{relTime(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
