import DOMPurify from 'dompurify';

const HTML_TAG_RE = /<([a-z][a-z0-9]*)\b[^>]*>/i;

// The SINGLE source of truth for how rich product copy looks. Applied both
// to the editor's editable area (RichTextEditor) and to the rendered output
// here, so "what you type" matches "what the storefront shows" exactly.
// The storefront keeps an identical copy of this string.
export const RICH_TEXT_CLASS = [
  'prose prose-sm max-w-none font-bangla whitespace-pre-wrap',
  // Tailwind Typography's prose-p:* rules don't reach a bare <div> — a
  // contentEditable's own line-break element in some browsers, kept as a
  // fallback for content saved before the editor started forcing <p> (see
  // RichTextEditor.jsx) — so it isn't spacing-less/leading-less.
  '[&_div]:my-2 [&_div]:leading-relaxed',
  'prose-p:my-2 prose-p:leading-relaxed prose-p:text-ui-ink/90',
  'prose-headings:font-display prose-headings:text-ui-ink prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1.5',
  'prose-h2:text-lg prose-h3:text-base',
  'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:marker:text-ui-faint',
  'prose-strong:text-ui-ink prose-strong:font-semibold',
  'prose-a:text-ui-brand prose-a:font-medium',
  'prose-blockquote:border-l-2 prose-blockquote:border-ui-brand/40 prose-blockquote:pl-3 prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:text-ui-muted',
].join(' ');

export default function RichText({ html, className = '' }) {
  const raw = typeof html === 'string' ? html.trim() : '';
  if (!raw) return null;

  const looksLikeHtml = HTML_TAG_RE.test(raw);
  const prepared = looksLikeHtml
    ? raw
    : raw
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('');

  const clean = DOMPurify.sanitize(prepared, {
    // 'div' matters here: a contentEditable's default response to Enter is
    // to wrap the new line in <div> (browser-dependent), not <p>. Without it
    // allowed, DOMPurify unwraps the tag but keeps its text — silently
    // merging separate lines into one run with no break between them.
    ALLOWED_TAGS: ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
  });

  return (
    <div dir="auto" className={`${RICH_TEXT_CLASS} ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />
  );
}

// Plain-text excerpt (for list cards etc).
export function toPlainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
