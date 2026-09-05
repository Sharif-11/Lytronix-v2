// Client-side mirror of server/utils/paymentPolicy.js — used only to show the
// right checkout UI (which payment methods are offered, how much to send via
// bKash) before the order is submitted. The server recomputes this itself
// from the database's own Product.paymentPolicy and is the one that actually
// enforces it — this copy is never trusted for the real charge.

const DEFAULT_POLICY = { codAllowed: true, advanceType: 'none', advanceAmount: 0, advancePercent: 0 };

function round2(n) {
  return Math.round(n * 100) / 100;
}

function computeLineAdvance(policy, lineTotal, quantity) {
  const p = { ...DEFAULT_POLICY, ...(policy || {}) };

  if (!p.codAllowed) {
    return { advance: round2(lineTotal), codPortion: 0 };
  }
  if (p.advanceType === 'fixed' && p.advanceAmount > 0) {
    const advance = Math.min(round2(p.advanceAmount * quantity), lineTotal);
    return { advance, codPortion: round2(lineTotal - advance) };
  }
  if (p.advanceType === 'percent' && p.advancePercent > 0) {
    const advance = round2((lineTotal * p.advancePercent) / 100);
    return { advance, codPortion: round2(lineTotal - advance) };
  }
  return { advance: 0, codPortion: round2(lineTotal) };
}

// `items`: cart lines with { unitPrice, quantity, paymentPolicy }.
export function computeCartAdvance(items, deliveryCharge = 0) {
  let advanceSubtotal = 0;
  let codSubtotal = 0;

  for (const it of items) {
    const lineTotal = round2((it.unitPrice || 0) * (it.quantity || 0));
    const { advance, codPortion } = computeLineAdvance(it.paymentPolicy, lineTotal, it.quantity || 0);
    advanceSubtotal += advance;
    codSubtotal += codPortion;
  }

  const anyCodEligible = codSubtotal > 0;
  const requiredAdvance = round2(advanceSubtotal + (anyCodEligible ? 0 : deliveryCharge));
  const codRemainder = anyCodEligible ? round2(codSubtotal + deliveryCharge) : 0;

  return { requiredAdvance, codRemainder, anyCodEligible };
}

// A short Bangla badge for one product — shown on the catalogue card and the
// product detail page so the payment terms are known before adding to cart.
export function describeProductPolicy(policy, price) {
  const p = { ...DEFAULT_POLICY, ...(policy || {}) };

  if (!p.codAllowed) {
    return { text: 'সম্পূর্ণ অগ্রিম পরিশোধ প্রয়োজন', tone: 'rust' };
  }
  if (p.advanceType === 'fixed' && p.advanceAmount > 0) {
    return { text: `৳${p.advanceAmount} অগ্রিম প্রয়োজন`, tone: 'gold' };
  }
  if (p.advanceType === 'percent' && p.advancePercent > 0) {
    return { text: `${p.advancePercent}% অগ্রিম প্রয়োজন`, tone: 'gold' };
  }
  return { text: 'সম্পূর্ণ ক্যাশ অন ডেলিভারি', tone: 'brand' };
}
