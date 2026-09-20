import { useState } from 'react';
import { Truck, Copy, Check, Share2 } from 'lucide-react';
import { copyToClipboard } from '../lib/publicLinks';

// The courier tracking link for an order: tappable, one-tap copy, and share
// (native share sheet on phones; WhatsApp link where the browser has none).
// Render it OUTSIDE any <Link> — nested anchors/buttons aren't valid.
export default function TrackingLink({ link, orderNumber, compact = false, className = '' }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;

  const copy = async () => {
    if (await copyToClipboard(link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const share = async () => {
    const text = `${orderNumber ? `Lytronix ${orderNumber} — ` : ''}Courier tracking: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Lytronix courier tracking', text: orderNumber ? `Lytronix ${orderNumber}` : 'Lytronix', url: link });
      } catch {
        /* user dismissed the share sheet */
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const btn =
    'inline-flex items-center justify-center gap-1 rounded-md border border-ui-line bg-white px-2 py-1 text-[11px] text-ui-ink hover:bg-ui-bg active:scale-[0.97]';

  return (
    <div className={`min-w-0 max-w-full rounded-lg border border-ui-line bg-ui-bg/60 px-2.5 py-2 ${className}`}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-[11px] text-ui-muted mb-1">
          <Truck size={12} /> Tracking link
        </div>
      )}
      <a href={link} target="_blank" rel="noreferrer" className="block text-xs text-ui-brand underline underline-offset-2 break-all">
        {link}
      </a>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        <button type="button" onClick={copy} className={btn}>
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={share} className={btn}>
          <Share2 size={12} /> Share
        </button>
      </div>
    </div>
  );
}
