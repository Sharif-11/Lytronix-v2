import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

/**
 * A custom, searchable single-select — replaces the OS-native <select>
 * wherever the option list is long (districts, thanas, ...) and the native
 * picker is cramped/inconsistent, especially on mobile.
 *
 * - Mobile: opens as a bottom sheet.
 * - Desktop: opens as an anchored dropdown below the trigger.
 * - Always has a search box so a long list (64 districts) doesn't mean
 *   scrolling through everything.
 *
 * Props: label, placeholder, value, onChange(value), options: [{value,label}],
 * disabled, loading, disabledHint, searchPlaceholder, noMatchLabel.
 */
export default function SearchableSelect({
  label,
  placeholder = 'সিলেক্ট করুন…',
  value,
  onChange,
  options,
  disabled = false,
  loading = false,
  disabledHint,
  required = false,
  clearable = true,
  searchPlaceholder = 'সার্চ করুন…',
  noMatchLabel = 'কোনো ফলাফল নেই।',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const pick = (val) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {label && (
        <span className="label">
          {label} {required && <span className="text-ui-rust">*</span>}
        </span>
      )}

      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        className={`w-full rounded-xl border border-ui-line bg-white px-3.5 py-2.5 text-sm text-left flex items-center gap-2 transition-shadow ${
          disabled || loading ? 'opacity-60 cursor-not-allowed' : 'hover:border-ui-faint/60'
        } ${open ? 'border-ui-brand ring-4 ring-ui-brand/10' : ''}`}
      >
        <span className={`flex-1 min-w-0 truncate ${selected ? 'text-ui-ink' : 'text-ui-faint'}`}>
          {loading ? 'লোড হচ্ছে…' : selected ? selected.label : disabled && disabledHint ? disabledHint : placeholder}
        </span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="shrink-0 text-ui-faint hover:text-ui-rust"
            aria-label="Clear"
          >
            <X size={14} />
          </span>
        )}
        <ChevronDown size={15} className={`shrink-0 text-ui-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Mobile: bottom sheet */}
          <div className="sm:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
            <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl border-t border-ui-line pb-[env(safe-area-inset-bottom)] max-h-[75vh] flex flex-col shadow-floating">
              <div className="w-10 h-1 bg-ui-line rounded-full mx-auto mt-3 shrink-0" />
              <div className="px-4 pt-3 pb-2 shrink-0">
                {label && <p className="text-sm font-semibold text-ui-ink mb-2">{label}</p>}
                <SearchBox innerRef={searchRef} query={query} setQuery={setQuery} placeholder={searchPlaceholder} />
              </div>
              <OptionList
                options={filtered}
                value={value}
                onPick={pick}
                itemClass="px-4 py-3 text-base"
                noMatchLabel={noMatchLabel}
              />
            </div>
          </div>

          {/* Desktop: anchored dropdown */}
          <div className="hidden sm:block absolute z-50 top-full left-0 mt-1.5 w-full min-w-[14rem] bg-white border border-ui-line rounded-xl shadow-floating overflow-hidden">
            <div className="p-2 border-b border-ui-line">
              <SearchBox innerRef={searchRef} query={query} setQuery={setQuery} placeholder={searchPlaceholder} compact />
            </div>
            <OptionList
              options={filtered}
              value={value}
              onPick={pick}
              itemClass="px-3 py-2 text-sm"
              maxHeight="16rem"
              noMatchLabel={noMatchLabel}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SearchBox({ innerRef, query, setQuery, placeholder, compact }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-faint" />
      <input
        ref={innerRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-ui-line bg-ui-bg/60 pl-8 pr-2.5 ${
          compact ? 'py-1.5 text-sm' : 'py-2.5 text-base'
        } text-ui-ink placeholder:text-ui-faint focus:border-ui-brand outline-none`}
      />
    </div>
  );
}

function OptionList({ options, value, onPick, itemClass, maxHeight, noMatchLabel }) {
  return (
    <div className="overflow-y-auto overscroll-contain" style={maxHeight ? { maxHeight } : undefined}>
      {options.length === 0 ? (
        <p className="text-sm text-ui-muted text-center py-8">{noMatchLabel}</p>
      ) : (
        options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            className={`w-full flex items-center justify-between gap-2 text-left hover:bg-ui-surfaceAlt transition-colors ${itemClass} ${
              o.value === value ? 'text-ui-brand font-medium' : 'text-ui-ink'
            }`}
          >
            <span className="truncate">{o.label}</span>
            {o.value === value && <Check size={15} className="shrink-0" />}
          </button>
        ))
      )}
    </div>
  );
}
