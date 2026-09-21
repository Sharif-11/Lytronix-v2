import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { trackPaymentState } from '../api/client';
import { COMPANY_PHONE, COMPANY_WHATSAPP } from '../utils/company';

// After this long without the receipt SMS reaching us, stop showing a bare
// spinner and tell the customer it is taking longer than usual.
const SLOW_AFTER_S = 90;
// After this long, the SMS is not just slow: say plainly that we could not verify it yet,
// what to double-check, and how to reach us.
const UNVERIFIED_AFTER_S = 300;
// Poll quickly while the SMS is likely in flight, then back off. Give up (the
// page can be reopened any time via the tracking link) after ~30 minutes.
const fastEveryMs = 4000;
const slowEveryMs = 15000;
const FAST_FOR_S = 180;
const GIVE_UP_S = 30 * 60;

const TERMINAL = ['verified', 'failed'];

// Live status of a manual-bKash payment: the customer's phone got the bKash
// SMS, our SMS listener forwards it, the server matches it. That round-trip is
// not instant, so this says what is happening instead of leaving a promise.
export default function ManualPaymentStatus({ trackingId, initial, orderNumber, className = '' }) {
  const [info, setInfo] = useState(initial || null);
  const [waited, setWaited] = useState(initial?.ageSeconds || 0);
  const [pollError, setPollError] = useState(false);
  const startedAt = useRef(Date.now() - (initial?.ageSeconds || 0) * 1000);
  const state = info?.state;

  useEffect(() => {
    if (!trackingId || !info || TERMINAL.includes(state)) return undefined;
    let cancelled = false;
    let timer;

    const tick = async () => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setWaited(Math.round(elapsed));
      if (elapsed > GIVE_UP_S) return;
      try {
        const res = await trackPaymentState(trackingId);
        if (cancelled) return;
        setPollError(false);
        if (res.manualPayment) setInfo(res.manualPayment);
        if (res.manualPayment && TERMINAL.includes(res.manualPayment.state)) return;
      } catch {
        if (!cancelled) setPollError(true);
      }
      if (!cancelled) timer = setTimeout(tick, elapsed < FAST_FOR_S ? fastEveryMs : slowEveryMs);
    };

    timer = setTimeout(tick, fastEveryMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // state is enough: a new `info` object with the same state needs no reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingId, state]);

  if (!info) return null;

  const box = 'flex items-start gap-2.5 border text-sm px-4 py-3 rounded-xl text-left';
  let view;

  if (state === 'verified') {
    view = {
      cls: 'border-ui-brand/30 bg-ui-brand/10 text-ui-brand',
      icon: <CheckCircle2 size={18} className="shrink-0 mt-0.5" />,
      title: 'পেমেন্ট ভেরিফাই হয়েছে ✅',
      text: 'আপনার বিকাশ পেমেন্ট নিশ্চিত হয়েছে। আপনার অর্ডারটি এখন প্রসেসিংয়ের জন্য প্রস্তুত।',
    };
  } else if (state === 'mismatch') {
    view = {
      cls: 'border-ui-gold/40 bg-amber-50 text-ui-gold',
      icon: <AlertTriangle size={18} className="shrink-0 mt-0.5" />,
      title: 'পেমেন্টের তথ্য মিলছে না',
      text: 'এই ট্রানজেকশন আইডিতে একটি পেমেন্ট আমরা পেয়েছি, কিন্তু টাকার পরিমাণ বা আপনার দেওয়া নম্বর মিলছে না। আমাদের টিম হাতে যাচাই করে শীঘ্রই আপনাকে জানাবে — নতুন করে পেমেন্ট করার দরকার নেই।',
    };
  } else if (state === 'failed') {
    view = {
      cls: 'border-ui-rust/40 bg-ui-rust/10 text-ui-rust',
      icon: <XCircle size={18} className="shrink-0 mt-0.5" />,
      title: 'পেমেন্ট ভেরিফাই করা যায়নি',
      text: `${info.reason ? `কারণ: ${info.reason}। ` : ''}অনুগ্রহ করে ফোনে আমাদের সাথে যোগাযোগ করুন অথবা সঠিক ট্রানজেকশন আইডি দিয়ে আবার চেষ্টা করুন।`,
    };
  } else if (waited >= UNVERIFIED_AFTER_S) {
    const waText = encodeURIComponent(`আসসালামু আলাইকুম, আমার ${orderNumber ? `অর্ডার ${orderNumber}` : 'অর্ডারের'} বিকাশ পেমেন্ট এখনও ভেরিফাই হয়নি।`);
    view = {
      cls: 'border-ui-gold/40 bg-amber-50 text-ui-gold',
      icon: <AlertTriangle size={18} className="shrink-0 mt-0.5" />,
      title: 'এখনও পেমেন্ট ভেরিফাই করা যায়নি',
      text: 'আপনার দেওয়া ট্রানজেকশন আইডি ও বিকাশ নম্বর ঠিক আছে কি না আরেকবার মিলিয়ে দেখুন। তথ্য ঠিক থাকলে চিন্তা নেই — পেমেন্টের এসএমএস আমাদের কাছে পৌঁছালেই এটি স্বয়ংক্রিয়ভাবে নিশ্চিত হবে, না হলে আমাদের টিম হাতে যাচাই করে আপনাকে জানাবে। তথ্য ভুল হলে বা জরুরি হলে সরাসরি যোগাযোগ করুন:',
      actions: (
        <div className="flex flex-wrap gap-2 mt-2">
          <a href={`tel:${COMPANY_PHONE}`} className="btn-secondary py-1.5 px-3 text-xs">কল করুন</a>
          <a
            href={`https://wa.me/${COMPANY_WHATSAPP}?text=${waText}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            হোয়াটসঅ্যাপ
          </a>
        </div>
      ),
    };
  } else if (waited >= SLOW_AFTER_S) {
    view = {
      cls: 'border-ui-gold/40 bg-amber-50 text-ui-gold',
      icon: <Clock size={18} className="shrink-0 mt-0.5" />,
      title: 'এসএমএস আসতে একটু সময় লাগছে',
      text: 'বিকাশের কনফার্মেশন এসএমএস আমাদের সিস্টেমে এখনও পৌঁছায়নি — এটা মাঝেমধ্যে কয়েক মিনিট দেরি হয়। চিন্তা করবেন না, পেমেন্ট এসে গেলেই স্বয়ংক্রিয়ভাবে নিশ্চিত হবে এবং না হলে আমাদের টিম হাতে যাচাই করবে। এই পেজ খোলা রাখতে পারেন বা পরে ট্র্যাকিং লিংকে দেখে নিন।',
    };
  } else {
    view = {
      cls: 'border-bkash/30 bg-bkash/[0.05] text-ui-ink',
      icon: <Loader2 size={18} className="shrink-0 mt-0.5 animate-spin text-bkash" />,
      title: 'আপনার পেমেন্ট ভেরিফাই করা হচ্ছে…',
      text: 'বিকাশের এসএমএস মিলিয়ে দেখা হচ্ছে — সাধারণত ১ মিনিটের মধ্যে হয়ে যায়। অনুগ্রহ করে এই পেজ খোলা রাখুন।',
    };
  }

  return (
    <div className={`${box} ${view.cls} ${className}`} role="status" aria-live="polite">
      {view.icon}
      <div className="leading-snug">
        <div className="font-medium">{view.title}</div>
        <div className="text-xs mt-0.5 opacity-90">{view.text}</div>
        {view.actions}
        {pollError && !TERMINAL.includes(state) && (
          <div className="text-[11px] mt-1 opacity-75">স্ট্যাটাস আপডেট করা যাচ্ছে না — আবার চেষ্টা করা হচ্ছে…</div>
        )}
      </div>
    </div>
  );
}
