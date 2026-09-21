import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { VERIFY_FAIL, VERIFY_TIMEOUT_MS, bnDigits } from '../lib/verifyManualPayment';

// Sits right under the submit button while the checkout waits for a manual bKash
// payment to be verified, and explains the outcome when it can't be.
export default function VerifyNote({ phase, secs = VERIFY_TIMEOUT_MS / 1000 }) {
  if (!phase) return null;

  if (phase === 'verifying') {
    return (
      <div className="text-left" role="status" aria-live="polite">
        <div className="h-1.5 rounded-full bg-ui-line overflow-hidden">
          <div
            className="h-full bg-bkash transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, (secs / (VERIFY_TIMEOUT_MS / 1000)) * 100))}%` }}
          />
        </div>
        <p className="flex items-start gap-2 text-xs text-ui-muted mt-2">
          <Loader2 size={14} className="animate-spin shrink-0 mt-0.5" />
          <span>
            বিকাশের এসএমএস মিলিয়ে দেখা হচ্ছে — বাকি <span className="font-mono font-medium text-ui-ink">{bnDigits(secs)}</span> সেকেন্ড।
            অনুগ্রহ করে এই পেজ বন্ধ করবেন না।
          </span>
        </p>
      </div>
    );
  }

  if (phase === 'verified') {
    return (
      <p className="flex items-start gap-2 text-xs text-ui-brand text-left" role="status" aria-live="polite">
        <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
        <span>আপনার বিকাশ পেমেন্ট নিশ্চিত হয়েছে। অর্ডারের পেজে নিয়ে যাওয়া হচ্ছে…</span>
      </p>
    );
  }

  const fail = VERIFY_FAIL[phase];
  if (!fail) return null;
  return (
    <div className="flex items-start gap-2.5 border border-ui-gold/40 bg-amber-50 text-ui-gold text-sm px-4 py-3 rounded-xl text-left" role="status" aria-live="polite">
      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
      <div className="leading-snug">
        <div className="font-medium">{fail.title}</div>
        <div className="text-xs mt-0.5 opacity-90">{fail.text}</div>
        <div className="text-[11px] mt-1 opacity-75">অর্ডারের পেজে নিয়ে যাওয়া হচ্ছে…</div>
      </div>
    </div>
  );
}
