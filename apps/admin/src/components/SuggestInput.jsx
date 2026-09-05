import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A free-text input with a custom (non-native) suggestion panel — used where
 * the value must stay free text (an admin can type a custom order status
 * that isn't in the suggested list) but a `<input list="...">` native
 * datalist popup isn't acceptable. Same mobile-sheet / desktop-dropdown
 * pattern as SearchableSelect, just backed by a real text input.
 */
export default function SuggestInput({ value, onChange, suggestions = [], placeholder, className = '' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const filtered = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const pick = (s) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <input
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
      />

      {open && filtered.length > 0 && (
        <>
          {/* Mobile: bottom sheet */}
          <div className="sm:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
            <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl border-t border-ui-line pb-[env(safe-area-inset-bottom)] max-h-[60vh] overflow-y-auto shadow-floating">
              <div className="w-10 h-1 bg-ui-line rounded-full mx-auto mt-3 mb-2" />
              {filtered.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pick(s)}
                  className="w-full text-left px-4 py-3 text-base capitalize hover:bg-ui-surfaceAlt"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop: anchored dropdown */}
          <div className="hidden sm:block absolute z-50 top-full left-0 mt-1.5 w-full min-w-[10rem] bg-white border border-ui-line rounded-xl shadow-floating overflow-hidden max-h-56 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2 text-sm capitalize hover:bg-ui-surfaceAlt"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
