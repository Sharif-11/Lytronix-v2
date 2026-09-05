import { X, Delete, CornerDownLeft, Space } from 'lucide-react';
import { usePhonetic } from '../context/PhoneticContext';

// A compact, standard Bangla ("National"/Jatiyo-style) on-screen layout —
// vowels, consonants, common kars (vowel signs), and digits — grouped the
// way most Bangla keyboards present them. This is independent from the
// phonetic (Avro-style) typing engine: it inserts real Bangla glyphs
// directly, for people who'd rather tap letters than type Latin phonetics.
const ROWS = [
  ['১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯', '০'],
  ['ও', 'আ', 'ই', 'ঈ', 'উ', 'ঊ', 'এ', 'ঐ', 'অ', 'ঔ'],
  ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ'],
  ['ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন'],
  ['প', 'ফ', 'ব', 'ভ', 'ম', 'য', 'র', 'ল', 'শ', 'ষ'],
  ['স', 'হ', 'ড়', 'ঢ়', 'য়', 'ৎ', 'ং', 'ঃ', 'ঁ', '্'],
  ['া', 'ি', 'ী', 'ু', 'ূ', 'ে', 'ৈ', 'ো', 'ৌ', 'ৃ'],
];

function insertAtCursor(el, text) {
  if (!el) return;
  if (el.isContentEditable) {
    el.focus();
    document.execCommand('insertText', false, text);
    return;
  }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(window[el.tagName === 'TEXTAREA' ? 'HTMLTextAreaElement' : 'HTMLInputElement'].prototype, 'value').set;
  setter.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const pos = start + text.length;
  requestAnimationFrame(() => {
    try { el.focus(); el.setSelectionRange(pos, pos); } catch { /* unsupported input type */ }
  });
}

function backspaceAtCursor(el) {
  if (!el) return;
  if (el.isContentEditable) {
    el.focus();
    document.execCommand('delete', false);
    return;
  }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const cutFrom = start === end ? Math.max(0, start - 1) : start;
  const next = el.value.slice(0, cutFrom) + el.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(window[el.tagName === 'TEXTAREA' ? 'HTMLTextAreaElement' : 'HTMLInputElement'].prototype, 'value').set;
  setter.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => {
    try { el.focus(); el.setSelectionRange(cutFrom, cutFrom); } catch { /* unsupported input type */ }
  });
}

/**
 * Floating, toggleable on-screen Bangla keyboard. Rendered once at the app
 * root; inserts into whichever text field the user last focused, so it
 * works on any form in the app without per-page wiring.
 */
export default function BanglaKeyboard() {
  const { keyboardOpen, setKeyboardOpen, activeFieldRef } = usePhonetic();
  if (!keyboardOpen) return null;

  const press = (ch) => insertAtCursor(activeFieldRef.current, ch);

  return (
    <div className="no-print fixed inset-x-0 bottom-0 sm:bottom-4 sm:right-4 sm:left-auto sm:w-[420px] z-40">
      <div className="bg-ui-panel border-t sm:border border-ui-line sm:rounded-xl shadow-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-ui-muted uppercase tracking-wide">বাংলা keyboard</span>
          <button
            type="button"
            onClick={() => setKeyboardOpen(false)}
            className="p-1 rounded-md text-ui-muted hover:bg-ui-line/60 hover:text-ui-ink transition-colors"
            aria-label="Close Bangla keyboard"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1">
          {ROWS.map((row, i) => (
            <div key={i} className="grid grid-cols-10 gap-1">
              {row.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // keep focus on the target field
                  onClick={() => press(ch)}
                  className="font-bangla text-sm rounded-md border border-ui-line bg-white py-1.5 hover:bg-ui-brand hover:text-white hover:border-ui-brand transition-colors"
                >
                  {ch}
                </button>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-6 gap-1 pt-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => backspaceAtCursor(activeFieldRef.current)}
              className="col-span-1 inline-flex items-center justify-center gap-1 rounded-md border border-ui-line bg-white py-1.5 text-xs hover:bg-ui-line/50 transition-colors"
              aria-label="Backspace"
            >
              <Delete size={14} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => press(' ')}
              className="col-span-4 inline-flex items-center justify-center gap-1 rounded-md border border-ui-line bg-white py-1.5 text-xs hover:bg-ui-line/50 transition-colors"
              aria-label="Space"
            >
              <Space size={14} /> space
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => press('\n')}
              className="col-span-1 inline-flex items-center justify-center gap-1 rounded-md border border-ui-line bg-white py-1.5 text-xs hover:bg-ui-line/50 transition-colors"
              aria-label="New line"
            >
              <CornerDownLeft size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
