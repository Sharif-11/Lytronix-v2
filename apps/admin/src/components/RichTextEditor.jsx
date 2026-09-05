import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, RotateCcw } from 'lucide-react';
import { usePhoneticContentEditable } from '../lib/phonetic';

/**
 * Minimal rich-text editor (contentEditable based, no external deps).
 * Renders/stores HTML. Uses a Bangla-capable font stack so Bangla typing
 * (via OS/browser input methods or phonetic tools like Avro) displays
 * correctly — Unicode text input itself works in any contentEditable
 * region without special handling.
 */
export default function RichTextEditor({ value, onChange, placeholder, phoneticEnabled = true }) {
  const ref = useRef(null);
  const phonetic = usePhoneticContentEditable({ enabled: phoneticEnabled, elRef: ref, onChangeHtml: onChange });

  // Keep the DOM in sync when the value changes from outside (e.g. loading
  // an existing customer), without fighting the caret while typing.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (command) => {
    ref.current?.focus();
    document.execCommand(command, false, undefined);
    onChange(ref.current?.innerHTML || '');
    phonetic.resetWord();
  };

  const isEmpty = !value || value === '<br>' || value.replace(/<[^>]*>/g, '').trim() === '';

  return (
    <div className="rounded-lg border border-ui-line bg-white overflow-hidden focus-within:border-ui-brand transition-colors">
      <div className="flex items-center gap-0.5 border-b border-ui-line bg-ui-bg/60 px-1.5 py-1">
        <ToolbarButton icon={Bold} label="Bold" onClick={() => exec('bold')} />
        <ToolbarButton icon={Italic} label="Italic" onClick={() => exec('italic')} />
        <ToolbarButton icon={Underline} label="Underline" onClick={() => exec('underline')} />
        <span className="w-px h-4 bg-ui-line mx-1" />
        <ToolbarButton icon={List} label="Bullet list" onClick={() => exec('insertUnorderedList')} />
        <ToolbarButton icon={ListOrdered} label="Numbered list" onClick={() => exec('insertOrderedList')} />
        <span className="w-px h-4 bg-ui-line mx-1" />
        <ToolbarButton icon={RotateCcw} label="Clear formatting" onClick={() => exec('removeFormat')} />
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2 text-base sm:text-sm text-ui-muted/60">
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
          onKeyDown={phonetic.onKeyDown}
          onClick={phonetic.onClick}
          onBlur={phonetic.onBlur}
          className="font-bangla min-h-[6rem] w-full px-3 py-2 text-base sm:text-sm text-ui-ink outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        />
      </div>
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep focus/selection in the editor
      onClick={onClick}
      className="p-1.5 rounded-md text-ui-ink/70 hover:bg-ui-line/60 hover:text-ui-ink transition-colors"
    >
      <Icon size={15} />
    </button>
  );
}
