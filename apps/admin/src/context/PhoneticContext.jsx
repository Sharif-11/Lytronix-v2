import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const PhoneticContext = createContext(null);

const LS_PHONETIC = 'lytronix:phoneticOn';
const LS_KEYBOARD = 'lytronix:keyboardRemember';

/**
 * App-wide (universal) phonetic typing + on-screen Bangla keyboard state.
 *
 * Instead of every form keeping its own "phoneticOn" flag (the old
 * behaviour), this is one switch that lives in the navbar and applies to
 * every Bangla-capable field in the app — order form, customer form,
 * product form, tag inputs, comments, everything. It's also persisted so
 * it "remembers" what the person last chose.
 *
 * It also tracks which text field was last focused, so the floating Bangla
 * keyboard panel (rendered once, at the app root) always knows where to
 * insert characters — no per-field wiring required.
 */
export function PhoneticProvider({ children }) {
  const [phoneticOn, setPhoneticOn] = useState(() => {
    const saved = localStorage.getItem(LS_PHONETIC);
    return saved === null ? true : saved === 'true';
  });
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const activeFieldRef = useRef(null); // last-focused <input>/<textarea>/contentEditable

  useEffect(() => {
    localStorage.setItem(LS_PHONETIC, String(phoneticOn));
  }, [phoneticOn]);

  useEffect(() => {
    const onFocusIn = (e) => {
      const el = e.target;
      const isTextField =
        (el.tagName === 'INPUT' && ['text', 'search', 'tel', 'email', 'url', ''].includes(el.type)) ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable;
      if (isTextField) activeFieldRef.current = el;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const toggleKeyboard = useCallback(() => setKeyboardOpen((v) => !v), []);

  const value = {
    phoneticOn,
    setPhoneticOn,
    keyboardOpen,
    setKeyboardOpen,
    toggleKeyboard,
    activeFieldRef,
  };

  return <PhoneticContext.Provider value={value}>{children}</PhoneticContext.Provider>;
}

export function usePhonetic() {
  const ctx = useContext(PhoneticContext);
  if (!ctx) throw new Error('usePhonetic must be used within a PhoneticProvider');
  return ctx;
}

export { LS_KEYBOARD };
