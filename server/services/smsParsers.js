// Turns a raw SMS into structured data. Each parser recognises one provider's
// message format; add another entry to PARSERS to support more (Nagad, Rocket,
// a bank...). A parser only sees messages whose sender matches its `senders`.
//
// bKash "money received" example:
//   You have received Tk 1,300.00 from 01882572730. Fee Tk 0.00. Balance Tk 1,528.58.
//   TrxID DIJ1NISJA3 at 19/09/2026 16:07

const num = (s) => Number(String(s).replace(/,/g, ''));

const BKASH_RECEIVED =
  /You have received Tk\s*([\d,]+(?:\.\d+)?)\s+from\s+(\+?\d{10,14})\s*\.?\s*Fee Tk\s*([\d,]+(?:\.\d+)?)\s*\.?\s*Balance Tk\s*([\d,]+(?:\.\d+)?)\s*\.?\s*TrxID\s+([A-Za-z0-9]+)\s+at\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/i;

const PARSERS = [
  {
    provider: 'bkash',
    senders: ['bkash'],
    parse(body) {
      const m = String(body).replace(/\s+/g, ' ').match(BKASH_RECEIVED);
      if (!m) return null;
      const [, amount, from, fee, balance, trxId, dd, mm, yyyy, hh, min] = m;
      // The time in the SMS is Bangladesh time (UTC+6).
      const paidAt = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh - 6, +min));
      return {
        kind: 'credit',
        amount: num(amount),
        fee: num(fee),
        balance: num(balance),
        counterparty: from.replace(/^\+?88/, ''),
        trxId,
        paidAt: Number.isNaN(paidAt.getTime()) ? null : paidAt,
      };
    },
  },
];

const norm = (s) => String(s || '').trim().toLowerCase();

// Returns { provider, parsed } — parsed is null when the sender is known but the
// text isn't a receipt — or null when no parser handles this sender at all.
function parseSms(sender, body) {
  const parser = PARSERS.find((p) => p.senders.includes(norm(sender)));
  if (!parser) return null;
  return { provider: parser.provider, parsed: parser.parse(body) };
}

const knownSenders = () => PARSERS.flatMap((p) => p.senders);

module.exports = { parseSms, knownSenders, PARSERS };
