// Per-product payment policy math, shared conceptually with
// apps/storefront/src/utils/paymentPolicy.js (the storefront needs the same
// numbers client-side to show the right checkout UI before submitting; this
// copy is the authoritative one — createOrder recomputes from the database's
// own Product.paymentPolicy, never trusting whatever the client sent).

const DEFAULT_POLICY = {
  codAllowed: true,
  advanceType: 'none',
  advanceAmount: 0,
  advancePercent: 0,
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// For one order line: how much of it must be paid up front vs. collected on
// delivery. `lineTotal` is (unitPrice * quantity) - discount, i.e. what the
// order model itself calls totalPrice.
function computeLineAdvance(policy, lineTotal, quantity) {
  const p = { ...DEFAULT_POLICY, ...(policy || {}) }

  if (!p.codAllowed) {
    return { advance: round2(lineTotal), codPortion: 0 }
  }
  if (p.advanceType === 'fixed' && p.advanceAmount > 0) {
    const advance = Math.min(round2(p.advanceAmount * quantity), lineTotal)
    return { advance, codPortion: round2(lineTotal - advance) }
  }
  if (p.advanceType === 'percent' && p.advancePercent > 0) {
    const advance = round2((lineTotal * p.advancePercent) / 100)
    return { advance, codPortion: round2(lineTotal - advance) }
  }
  return { advance: 0, codPortion: round2(lineTotal) }
}

// `lines`: [{ lineTotal, quantity, policy }] — one per order item that maps
// to a catalogue product (ad hoc/off-catalogue items have no policy to
// enforce and are treated as fully COD-eligible).
// Returns the order-level split: how much must be paid before shipping
// (`requiredAdvance`) vs. collected on delivery (`codRemainder`), folding the
// delivery charge itself into whichever side the order actually uses — if
// nothing is COD-eligible, there's no delivery-time collection to fold it
// into, so it rides with the advance instead.
function computeOrderAdvance(lines, deliveryCharge = 0) {
  let advanceSubtotal = 0
  let codSubtotal = 0

  for (const line of lines) {
    const { advance, codPortion } = computeLineAdvance(line.policy, line.lineTotal, line.quantity)
    advanceSubtotal += advance
    codSubtotal += codPortion
  }

  const anyCodEligible = codSubtotal > 0
  const requiredAdvance = round2(advanceSubtotal + (anyCodEligible ? 0 : deliveryCharge))
  const codRemainder = anyCodEligible ? round2(codSubtotal + deliveryCharge) : 0

  return { requiredAdvance, codRemainder, anyCodEligible }
}

module.exports = { DEFAULT_POLICY, computeLineAdvance, computeOrderAdvance }
