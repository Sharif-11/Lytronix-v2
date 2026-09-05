import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Package, Truck, MapPin, Wallet, Info, Volume2, VolumeX, Check,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

const ICONS = {
  order_new: Package,
  courier_status: Truck,
  courier_tracking: MapPin,
  payment_review: Wallet,
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
