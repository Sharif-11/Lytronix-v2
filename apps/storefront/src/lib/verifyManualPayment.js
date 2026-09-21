import { trackPaymentState } from '../api/client';

// After a manual bKash order is placed the checkout stays on the page while the
// server matches the receipt SMS. This waits for that, and says how it ended.
const POLL_MS = 2000;
export const VERIFY_TIMEOUT_MS = 40000;
// How long the result stays visible in the button before the page moves on.
export const VERIFIED_HOLD_MS = 1200;
export const FAILED_HOLD_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Copy for every way verification can end without success (Bangla, like the rest of checkout).
export const VERIFY_FAIL = {
  mismatch: {
    title: 'পেমেন্টের তথ্য মিলছে না',
    text: 'এই ট্রানজেকশন আইডিতে একটি পেমেন্ট আমরা পেয়েছি, কিন্তু টাকার পরিমাণ বা আপনার দেওয়া বিকাশ নম্বর মিলছে না। আমাদের টিম হাতে যাচাই করে আপনাকে জানাবে — নতুন করে পেমেন্ট করার দরকার নেই।',
  },
  failed: {
    title: 'পেমেন্ট ভেরিফাই করা যায়নি',
    text: 'আপনার পেমেন্টটি আমরা গ্রহণ করতে পারিনি। অনুগ্রহ করে ফোনে আমাদের সাথে যোগাযোগ করুন অথবা সঠিক ট্রানজেকশন আইডি দিয়ে আবার চেষ্টা করুন।',
  },
  timeout: {
    title: 'এখনও পেমেন্ট ভেরিফাই করা যায়নি',
    text: 'এই ট্রানজেকশন আইডির এসএমএস এখনও আমাদের কাছে পৌঁছায়নি। আইডি ও বিকাশ নম্বর ঠিক আছে কি না মিলিয়ে দেখুন। ঠিক থাকলে চিন্তা নেই — পেমেন্ট এসে গেলেই স্বয়ংক্রিয়ভাবে নিশ্চিত হবে, না হলে আমাদের টিম হাতে যাচাই করে জানাবে। আপনার অর্ডার সংরক্ষিত আছে।',
  },
};

/**
 * Resolves with { state, info }:
 *   verified – confirmed
 *   mismatch – a receipt with this TrxID arrived but amount/number differ (won't fix itself)
 *   failed   – rejected
 *   timeout  – nothing matched within the time limit
 *   skipped  – no SMS phone is online (or no state at all), so there is nothing to wait for
 */
export async function waitForVerification(trackingId, initial, { timeoutMs = VERIFY_TIMEOUT_MS } = {}) {
  let info = initial;
  if (!info) return { state: 'skipped', info };
  const started = Date.now();
  for (;;) {
    if (['verified', 'mismatch', 'failed'].includes(info.state)) return { state: info.state, info };
    if (info.autoVerify === false) return { state: 'skipped', info };
    if (Date.now() - started >= timeoutMs) return { state: 'timeout', info };
    await sleep(POLL_MS);
    try {
      const r = await trackPaymentState(trackingId);
      if (r.manualPayment) info = { ...info, ...r.manualPayment };
    } catch {
      /* a failed poll just tries again until the time limit */
    }
  }
}

export { sleep };
