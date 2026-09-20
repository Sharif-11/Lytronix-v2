import { useRef, useState } from 'react';
import { Landmark, Copy, Check, ImagePlus } from 'lucide-react';
import { copyText } from '../lib/clipboard';
import { formatMoney } from '../utils/format';

function CopyBtn({ value, valueRef }) {
  const [state, setState] = useState('idle');
  const go = async () => {
    const ok = await copyText(value, valueRef?.current);
    setState(ok ? 'copied' : 'select');
    setTimeout(() => setState('idle'), ok ? 1500 : 2500);
  };
  return (
    <button
      type="button"
      onClick={go}
      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-ui-line bg-white px-2 py-1 text-[11px] font-medium text-ui-ink hover:bg-ui-bg"
    >
      {state === 'copied' ? <Check size={12} /> : <Copy size={12} />}
      {state === 'copied' ? 'কপি হয়েছে' : state === 'select' ? 'সিলেক্ট হয়েছে' : 'কপি'}
    </button>
  );
}

function Row({ label, value, mono, copy }) {
  const ref = useRef(null);
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-dashed border-ui-line last:border-0">
      <div className="min-w-0">
        <div className="text-[11px] text-ui-muted">{label}</div>
        <div ref={ref} className={`text-sm text-ui-ink break-all select-all ${mono ? 'font-mono' : ''}`}>{value}</div>
      </div>
      {copy && <CopyBtn value={value} valueRef={ref} />}
    </div>
  );
}

// Bank-transfer instructions for the customer: where to send the money, then
// the transaction id (required) and an optional screenshot. `details` is the
// same { senderNumber, transactionId, proofFile, proofPreview } object the
// manual-bKash form uses, since only one of the two is ever active.
export default function BankTransferPanel({ bank, amount, advanceInfo, details, setDetails, onProofChange, Field }) {
  const required = advanceInfo?.requiredAdvance > 0;
  return (
    <div className="mt-4 rounded-2xl border border-ui-line overflow-hidden">
      <div className="bg-ui-dark text-white px-4 py-3 flex items-center gap-2">
        <Landmark size={16} />
        <span className="font-medium text-sm">ব্যাংক ট্রান্সফার</span>
      </div>

      <div className="p-4 sm:p-5 space-y-4 bg-ui-bg/40">
        <ol className="text-sm text-ui-ink space-y-1.5 list-decimal list-inside">
          <li>নিচের ব্যাংক অ্যাকাউন্টে টাকা ট্রান্সফার করুন</li>
          <li>ট্রান্সফারের ট্রানজেকশন আইডি / রেফারেন্স নম্বর নিচে লিখুন</li>
          <li>আমরা যাচাই করার পর আপনার অর্ডার কনফার্ম হবে</li>
        </ol>

        <div className="rounded-xl bg-white border border-ui-line px-3.5 py-1">
          <Row label="ব্যাংকের নাম" value={bank.bankName} />
          <Row label="অ্যাকাউন্টের নাম" value={bank.accountName} />
          <Row label="অ্যাকাউন্ট নম্বর" value={bank.accountNumber} mono copy />
          <Row label="শাখা" value={bank.branchName} />
          <Row label="জেলা" value={bank.district} />
          <Row label="রাউটিং নম্বর" value={bank.routingNumber} mono copy />
          <Row label="SWIFT" value={bank.swiftCode} mono />
          <Row label={required ? 'অগ্রিম পাঠাতে হবে' : 'পাঠানোর পরিমাণ'} value={formatMoney(amount)} mono />
        </div>

        {bank.instructions && <p className="text-xs text-ui-muted">{bank.instructions}</p>}

        {required && advanceInfo.codRemainder > 0 && (
          <p className="text-xs text-ui-muted">
            বাকি {formatMoney(advanceInfo.codRemainder)} ডেলিভারির সময় ক্যাশে পরিশোধ করতে পারবেন।
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="ট্রানজেকশন আইডি / রেফারেন্স" required>
            <input
              className="input font-mono"
              value={details.transactionId}
              onChange={(e) => setDetails({ ...details, transactionId: e.target.value })}
            />
          </Field>
          <Field label="আপনার অ্যাকাউন্ট / নাম (ঐচ্ছিক)">
            <input
              className="input"
              value={details.senderNumber}
              onChange={(e) => setDetails({ ...details, senderNumber: e.target.value })}
            />
          </Field>
        </div>

        <div>
          <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">
            পেমেন্টের স্ক্রিনশট (ঐচ্ছিক)
          </span>
          {details.proofPreview ? (
            <div className="relative w-24 h-24">
              <img src={details.proofPreview} alt="পেমেন্ট প্রমাণ" className="w-full h-full object-cover rounded-xl border border-ui-line" />
              <button
                type="button"
                onClick={() => onProofChange(null)}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-ui-line text-ui-rust flex items-center justify-center text-xs shadow-card"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="w-24 h-24 rounded-xl border-2 border-dashed border-ui-line hover:border-ui-brand text-ui-faint hover:text-ui-brand flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors">
              <ImagePlus size={18} />
              <span className="text-[10px]">আপলোড</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onProofChange(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
