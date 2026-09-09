import { useEffect, useRef } from 'react';

// Autosaves whatever a form is holding to localStorage as the user types, and
// silently restores it the next time the same form mounts. Drafts older than
// MAX_AGE are dropped. Clear the draft on a successful submit via the returned
// `clearDraft`.
//
//   const [form, setForm] = useState(initial);
//   const { clearDraft } = useFormDraft('checkout', form, setForm);
//   ...on success: clearDraft();
//
// `restore` receives the saved object; passing a plain setState works.

const PREFIX = 'lytronix:draft:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.at || Date.now() - parsed.at > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

// All-empty objects/strings/arrays count as "nothing worth keeping".
function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number' || typeof v === 'boolean') return false;
  if (Array.isArray(v)) return v.every(isBlank);
  if (typeof v === 'object') return Object.values(v).every(isBlank);
  return false;
}

export default function useFormDraft(key, data, restore, options = {}) {
  const { enabled = true, debounce = 500 } = options;
  const restoredRef = useRef(false);
  const savedRef = useRef('');
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // Restore once, silently, on first mount.
  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadDraft(key);
    if (saved && typeof restoreRef.current === 'function') {
      savedRef.current = JSON.stringify(saved);
      restoreRef.current(saved);
    }
  }, [key, enabled]);

  // Debounced persist on every change.
  useEffect(() => {
    if (!enabled) return undefined;
    const serialized = JSON.stringify(data ?? null);
    if (serialized === savedRef.current) return undefined;
    const id = setTimeout(() => {
      try {
        if (isBlank(data)) localStorage.removeItem(PREFIX + key);
        else localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
        savedRef.current = serialized;
      } catch {
        /* ignore */
      }
    }, debounce);
    return () => clearTimeout(id);
  }, [key, enabled, debounce, data]);

  return {
    clearDraft: () => {
      clearDraft(key);
      savedRef.current = '';
    },
  };
}
