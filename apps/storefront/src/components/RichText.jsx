import DOMPurify from 'dompurify';

const HTML_TAG_RE = /<([a-z][a-z0-9]*)\b[^>]*>/i;

// Kept identical to apps/admin/src/components/RichText.jsx's RICH_TEXT_CLASS
// so the admin editor and this rendered output look the same.
export const RICH_TEXT_CLASS = [
  'prose prose-sm max-w-none font-bangla',
  'prose-p:my-2 prose-p:leading-relaxed prose-p:text-ui-ink/90',
  'prose-headings:font-display prose-headings:text-ui-ink prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1.5',
  'prose-h2:text-lg prose-h3:text-base',
  'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:marker:text-ui-faint',
  'prose-strong:text-ui-ink prose-strong:font-semibold',
  'prose-a:text-ui-brand prose-a:font-medium',
  'prose-blockquote:border-l-2 prose-blockquote:border-ui-brand/40 prose-blockquote:pl-3 prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:text-ui-muted',
].join(' ');

// Renders admin-authored product copy. Sanitises the HTML (defence in depth —
// the storefront is public), and gracefully upgrades legacy plain-text
// descriptions (newlines) that were saved before the rich editor existed.
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
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
  });

  return (
    <div dir="auto" className={`${RICH_TEXT_CLASS} ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />
  );
}
