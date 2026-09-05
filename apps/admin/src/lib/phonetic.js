import { useCallback, useRef } from 'react';
import avro from './avroPhoneticEngine';

/**
 * Built-in phonetic Bangla typing (Avro-style): type Latin letters like
 * "ami banglay likhi" and they convert to বাংলা automatically, word by
 * word, right inside the field — no OS-level Bangla keyboard needed.
 */
export const parsePhonetic = (text) => avro.parse(text || '');

const isLetterKey = (e) =>
  e.key.length === 1 && /[a-zA-Z]/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey;

/**
 * Phonetic typing for a plain controlled <input>/<textarea>.
 * Tracks the raw Latin letters of the word currently being typed and
 * live-replaces it with its Bangla conversion; any other key (space,
 * punctuation, arrows, click, backspace past the current word, ...)
 * "freezes" that word and hands control back to the browser.
 */
export function usePhoneticField({ enabled, value, onChangeValue }) {
  const bufferRef = useRef(''); // raw latin typed for the current word
  const lastRef = useRef(''); // bangla text currently shown for that word

  const reset = useCallback(() => {
    bufferRef.current = '';
    lastRef.current = '';
  }, []);

  const placeCursor = (el, pos) => {
    requestAnimationFrame(() => {
      try { el.setSelectionRange(pos, pos); } catch { /* unsupported input type */ }
    });
  };

  const applyWord = (el, parsed) => {
    const pos = el.selectionStart;
    const cutFrom = pos - lastRef.current.length;
    const next = value.slice(0, cutFrom) + parsed + value.slice(pos);
    lastRef.current = parsed;
    onChangeValue(next);
    placeCursor(el, cutFrom + parsed.length);
  };

  const onKeyDown = useCallback((e) => {
    if (!enabled) return;
    const el = e.target;

    if (isLetterKey(e)) {
      e.preventDefault();
      bufferRef.current += e.key;
      applyWord(el, parsePhonetic(bufferRef.current));
      return;
    }

    if (e.key === 'Backspace' && bufferRef.current) {
      e.preventDefault();
      bufferRef.current = bufferRef.current.slice(0, -1);
      applyWord(el, parsePhonetic(bufferRef.current));
      return;
    }

    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, value]);

  return { onKeyDown, onClick: reset, onBlur: reset, resetWord: reset };
}

// ---- contentEditable (rich text editor) variant ----

function getCaretRange() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  return range.collapsed ? range : null;
}

function deletePrecedingChars(count) {
  if (count <= 0) return;
  const range = getCaretRange();
  if (!range) return;
  const { startContainer, startOffset } = range;

  if (startContainer.nodeType === Node.TEXT_NODE && startOffset >= count) {
    // Common case: the text we just inserted lives in one text node —
    // delete it by exact offset instead of simulating N backspaces
    // (backspace deletes whole grapheme clusters, which would risk
    // over-deleting multi-part Bangla conjuncts).
    range.setStart(startContainer, startOffset - count);
    range.deleteContents();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  // Rare fallback (e.g. right after a bold/italic toggle split the text
  // node): fall back to simulated backspaces.
  for (let i = 0; i < count; i++) document.execCommand('delete', false);
}

function insertAtCaret(text) {
  if (text) document.execCommand('insertText', false, text);
}

/**
 * Phonetic typing for a contentEditable rich text editor. Same word-by-word
 * behavior as usePhoneticField, implemented via the Selection/Range API so
 * it plays nicely with existing bold/italic/list formatting.
 */
export function usePhoneticContentEditable({ enabled, elRef, onChangeHtml }) {
  const bufferRef = useRef('');
  const lastRef = useRef('');

  const reset = useCallback(() => {
    bufferRef.current = '';
    lastRef.current = '';
  }, []);

  const onKeyDown = useCallback((e) => {
    if (!enabled) return;

    if (isLetterKey(e)) {
      e.preventDefault();
      bufferRef.current += e.key;
      const parsed = parsePhonetic(bufferRef.current);
      deletePrecedingChars(lastRef.current.length);
      insertAtCaret(parsed);
      lastRef.current = parsed;
      onChangeHtml(elRef.current?.innerHTML || '');
      return;
    }

    if (e.key === 'Backspace' && bufferRef.current) {
      e.preventDefault();
      bufferRef.current = bufferRef.current.slice(0, -1);
      const parsed = parsePhonetic(bufferRef.current);
      deletePrecedingChars(lastRef.current.length);
      insertAtCaret(parsed);
      lastRef.current = parsed;
      onChangeHtml(elRef.current?.innerHTML || '');
      return;
    }

    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, elRef, onChangeHtml]);

  return { onKeyDown, onClick: reset, onBlur: reset, resetWord: reset };
}
