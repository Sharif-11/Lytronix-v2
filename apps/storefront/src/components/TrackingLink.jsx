import { useState } from 'react';
import { Truck, Copy, Check, Share2 } from 'lucide-react';
import { copyText } from '../lib/clipboard';

// The courier tracking link for an order: tappable, one-tap copy, and share
// (native share sheet on phones; WhatsApp link where the browser has none).
// Render it OUTSIDE any <Link> — nested anchors/buttons aren't valid.
export default function TrackingLink({ link, orderNumber, className = '' }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;

  const copy = async () => {
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const share = async () => {
    const text = `${orderNumber ? `Lytronix ${orderNumber} — ` : ''}কুরিয়ার ট্র্যাকিং: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Lytronix কুরিয়ার ট্র্যাকিং', text: orderNumber ? `Lytronix ${orderNumber}` : 'Lytronix', url: link });
      } catch {
        /* user dismissed the share sheet */
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className={`min-w-0 max-w-full rounded-lg border border-ui-line bg-ui-bg/60 px-3 py-2 font-bangla ${className}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-ui-muted mb-1">
        <Truck size={12} /> কুরিয়ার ট্র্যাকিং লিংক
      </div>
      <a href={link} target="_blank" rel="noreferrer" className="block text-xs text-ui-brand underline underline-offset-2 break-all">
        {link}
      </a>
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" onClick={copy} className="btn-secondary py-1.5 px-3 text-xs gap-1.5 flex-1 sm:flex-none">
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'কপি হয়েছে' : 'কপি'}
        </button>
        <button type="button" onClick={share} className="btn-secondary py-1.5 px-3 text-xs gap-1.5 flex-1 sm:flex-none">
          <Share2 size={13} /> শেয়ার
        </button>
      </div>
    </div>
  );
}
