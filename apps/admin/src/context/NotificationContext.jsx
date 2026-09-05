import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import { useAuth } from './AuthContext';
import { playChime, playCourierChime } from '../lib/chime';

const NotificationContext = createContext(null);
const POLL_MS = 25000;
const SOUND_PREF_KEY = 'lytronix:notifySound';

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_PREF_KEY) !== 'off';
    } catch {
      return true;
    }
  });

  const seenIds = useRef(new Set());
  const primed = useRef(false); // don't chime for the backlog on first load
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getNotifications({ limit: 40 });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);

      const fresh = (data.notifications || []).filter((n) => !seenIds.current.has(n._id));
      (data.notifications || []).forEach((n) => seenIds.current.add(n._id));

      if (primed.current && readSoundPref()) {
        // New orders take priority (the more urgent event); courier updates
        // get their own, distinct, softer sound so the two are never confused.
        if (fresh.some((n) => n.type === 'order_new')) playChime();
        else if (fresh.some((n) => n.type === 'courier_status' || n.type === 'courier_tracking')) playCourierChime();
      }
      primed.current = true;
    } catch {
      /* keep the last good state */
    }
  }, [user]);

  function readSoundPref() {
    try {
      return localStorage.getItem(SOUND_PREF_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      seenIds.current = new Set();
      primed.current = false;
      return undefined;
    }
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [user, refresh]);

  const markRead = useCallback(async (ids) => {
    setNotifications((prev) => prev.map((n) => (ids.includes(n._id) ? { ...n, read: true } : n)));
    try {
      const { unreadCount: uc } = await api.markNotificationsRead(ids);
      setUnreadCount(uc);
    } catch {
      /* ignore */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      try {
        localStorage.setItem(SOUND_PREF_KEY, next ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      if (next) playChime(); // confirm it works + unlock the AudioContext
      return next;
    });
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, refresh, markRead, markAllRead, soundOn, toggleSound }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
