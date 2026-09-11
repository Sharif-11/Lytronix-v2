import { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Link2, Link2Off,
  Heading2, Heading3, RotateCcw,
} from 'lucide-react';
import { usePhoneticContentEditable } from '../lib/phonetic';
import { RICH_TEXT_CLASS } from './RichText';

/**
 * Word-style rich-text editor — contentEditable, no external deps.
 * Stores/renders HTML. Bangla phonetic typing works inside it via
 * usePhoneticContentEditable. Toolbar: headings, bold/italic/underline/
 * strike, lists, quote, link, clear formatting — with live active states.
 */
export default function RichTextEditor({ value, onChange, placeholder, phoneticEnabled = true }) {
  const ref = useRef(null);
  const phonetic = usePhoneticContentEditable({ enabled: phoneticEnabled, elRef: ref, onChangeHtml: onChange });
  const [active, setActive] = useState({});

  // Seed the DOM once; after that the component owns its content (we don't
  // re-write innerHTML on every keystroke or we'd fight the caret).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || '';
    }
    // Without this, pressing Enter wraps the new line in <div> in some
    // browsers (Chrome's default) rather than <p> — structurally fine now
    // that RichText.jsx allows <div> too, but Tailwind Typography's prose
    // spacing only targets <p>, so div-wrapped lines would render visually
    // cramped. Forcing <p> keeps new content consistent everywhere.
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* unsupported browser — <div> still renders correctly, just tighter */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshActive = () => {
    if (!ref.current || document.activeElement !== ref.current) return;
    const q = (c) => {
      try {
        return document.queryCommandState(c);
      } catch {
        return false;
      }
    };
    let block = '';
    try {
      block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    } catch {
      /* ignore */
    }
    setActive({
      bold: q('bold'),
      italic: q('italic'),
      underline: q('underline'),
      strikeThrough: q('strikeThrough'),
      insertUnorderedList: q('insertUnorderedList'),
      insertOrderedList: q('insertOrderedList'),
      h2: block === 'h2',
      h3: block === 'h3',
      blockquote: block === 'blockquote',
    });
  };

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActive);
    return () => document.removeEventListener('selectionchange', refreshActive);
  }, []);

  const run = (fn) => {
    ref.current?.focus();
    fn();
    onChange(ref.current?.innerHTML || '');
    phonetic.resetWord();
    refreshActive();
  };

  const exec = (command, val) => run(() => document.execCommand(command, false, val));

  const toggleBlock = (tag) =>
    run(() => {
      let cur = '';
      try {
        cur = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      } catch {
        /* ignore */
      }
      document.execCommand('formatBlock', false, cur === tag ? '<p>' : `<${tag}>`);
    });

  const addLink = () =>
    run(() => {
      const url = window.prompt('Link URL', 'https://');
      if (url) document.execCommand('createLink', false, url.trim());
    });

  const isEmpty = !value || value === '<br>' || value.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') === '';

  return (
    <div className="rounded-xl border border-ui-line bg-white overflow-hidden focus-within:border-ui-brand focus-within:ring-4 focus-within:ring-ui-brand/10 transition-shadow">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ui-line bg-ui-surfaceAlt px-1.5 py-1">
        <TB icon={Heading2} label="Heading" on={active.h2} onClick={() => toggleBlock('h2')} />
        <TB icon={Heading3} label="Subheading" on={active.h3} onClick={() => toggleBlock('h3')} />
        <Sep />
        <TB icon={Bold} label="Bold" on={active.bold} onClick={() => exec('bold')} />
        <TB icon={Italic} label="Italic" on={active.italic} onClick={() => exec('italic')} />
        <TB icon={Underline} label="Underline" on={active.underline} onClick={() => exec('underline')} />
        <TB icon={Strikethrough} label="Strikethrough" on={active.strikeThrough} onClick={() => exec('strikeThrough')} />
        <Sep />
        <TB icon={List} label="Bullet list" on={active.insertUnorderedList} onClick={() => exec('insertUnorderedList')} />
        <TB icon={ListOrdered} label="Numbered list" on={active.insertOrderedList} onClick={() => exec('insertOrderedList')} />
        <TB icon={Quote} label="Quote" on={active.blockquote} onClick={() => toggleBlock('blockquote')} />
        <Sep />
        <TB icon={Link2} label="Add link" onClick={addLink} />
        <TB icon={Link2Off} label="Remove link" onClick={() => exec('unlink')} />
        <TB icon={RotateCcw} label="Clear formatting" onClick={() => exec('removeFormat')} />
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-base sm:text-sm text-ui-faint">
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          dir="auto"
          lang="bn"
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          onKeyUp={refreshActive}
          onKeyDown={phonetic.onKeyDown}
          onClick={(e) => {
            phonetic.onClick(e);
            refreshActive();
          }}
          onBlur={phonetic.onBlur}
          className={`${RICH_TEXT_CLASS} min-h-[10rem] w-full px-3 py-2.5 outline-none`}
        />
      </div>
    </div>
  );
}

function Sep() {
  return <span className="w-px h-4 bg-ui-line mx-1 shrink-0" />;
}

function TB({ icon: Icon, label, on, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={Boolean(on)}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors ${
        on ? 'bg-ui-brand/10 text-ui-brand' : 'text-ui-ink/70 hover:bg-ui-line/60 hover:text-ui-ink'
      }`}
    >
      <Icon size={15} />
    </button>
  );
}
