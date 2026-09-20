import { useEffect, useState } from 'react';
import { Landmark, Loader2, CheckCircle2, Plus, Trash2, BadgeCheck } from 'lucide-react';
import { getBankSettings, updateBankSettings } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import usePageTitle from '../lib/usePageTitle';
import Loader from '../components/Loader';

const FIELDS = [
  { key: 'bankName', label: 'Bank name', required: true },
  { key: 'accountName', label: 'Account name', required: true },
  { key: 'accountNumber', label: 'Account number', required: true, mono: true },
  { key: 'branchName', label: 'Branch name' },
  { key: 'district', label: 'District' },
  { key: 'routingNumber', label: 'Routing number', mono: true },
  { key: 'swiftCode', label: 'SWIFT code (optional)', mono: true },
];

const blankAccount = () => ({ bankName: '', accountName: '', accountNumber: '', branchName: '', district: '', routingNumber: '', swiftCode: '', instructions: '' });
const MAX_ACCOUNTS = 10;

// Super admin only (route + server both enforce it). Customers see these
// accounts when they choose "bank transfer" at checkout, and admins see them
// when recording a transfer on a customer's behalf.
export default function BankDetails() {
  const { t } = useLanguage();
  usePageTitle(t('nav.bankDetails'));
  const [accounts, setAccounts] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0); // the one account customers see
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getBankSettings()
      .then((d) => {
        setAccounts(d.accounts.length ? d.accounts : [blankAccount()]);
        setActiveIdx(Math.max(0, d.accounts.findIndex((a) => a._id === d.activeAccountId)));
      })
      .catch(() => {}); // surfaced globally via the ErrorModal
  }, []);

  if (!accounts) return <Loader inline className="justify-center mt-10" />;

  const change = (idx, k, v) => {
    setSaved(false);
    setAccounts((list) => list.map((a, i) => (i === idx ? { ...a, [k]: v } : a)));
  };
  const add = () => {
    setSaved(false);
    setAccounts((list) => [...list, blankAccount()]);
  };
  const remove = (idx) => {
    setSaved(false);
    setAccounts((list) => (list.length === 1 ? [blankAccount()] : list.filter((_, i) => i !== idx)));
    // Keep the active marker on the same account (or fall back to the first).
    setActiveIdx((cur) => (idx === cur ? 0 : idx < cur ? cur - 1 : cur));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Fully blank cards are just dropped; half-filled ones are saved but not offered to customers.
      const keepIdx = accounts.map((a, i) => (FIELDS.some((f) => (a[f.key] || '').trim()) ? i : -1)).filter((i) => i >= 0);
      const filled = keepIdx.map((i) => accounts[i]);
      // If the active card is incomplete or dropped, the server falls back to
      // the first complete account.
      const d = await updateBankSettings({ accounts: filled, activeIndex: keepIdx.indexOf(activeIdx) });
      setAccounts(d.accounts.length ? d.accounts : [blankAccount()]);
      setActiveIdx(Math.max(0, d.accounts.findIndex((a) => a._id === d.activeAccountId)));
      setSaved(true);
    } catch {
      /* surfaced globally via the ErrorModal */
    } finally {
      setSaving(false);
    }
  };

  const incomplete = (a) => !(a.bankName?.trim() && a.accountName?.trim() && a.accountNumber?.trim());

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <h1 className="font-display text-2xl text-ui-ink flex items-center gap-2 mb-1">
        <Landmark size={22} className="text-ui-brand" /> Bank details
      </h1>
      <p className="text-sm text-ui-muted mb-5">
        Save as many bank accounts as you like, but only the <b>active</b> one is shown to customers at checkout. It
        needs a bank name, account name and account number. Admins can still record a transfer against any account.
      </p>

      <form onSubmit={submit} className="space-y-4">
        {accounts.map((a, idx) => (
          <section key={a._id || idx} className="bg-ui-panel border border-ui-line rounded-2xl shadow-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base text-ui-ink">
                Account {idx + 1}
                {a.bankName ? <span className="text-ui-muted font-sans text-sm"> · {a.bankName}</span> : null}
              </h2>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="inline-flex items-center gap-1 text-xs text-ui-rust hover:underline"
              >
                <Trash2 size={13} /> Remove
              </button>
            </div>

            <label
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                activeIdx === idx ? 'border-ui-brand bg-ui-brand/[0.06] text-ui-ink' : 'border-ui-line text-ui-muted cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name="activeBank"
                className="accent-ui-brand"
                checked={activeIdx === idx}
                onChange={() => {
                  setSaved(false);
                  setActiveIdx(idx);
                }}
              />
              {activeIdx === idx ? (
                <span className="inline-flex items-center gap-1 font-medium text-ui-brand">
                  <BadgeCheck size={15} /> Active — shown to customers
                </span>
              ) : (
                'Make this the active account'
              )}
            </label>

            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-ui-muted mb-1">
                    {f.label} {f.required && <span className="text-ui-rust">*</span>}
                  </span>
                  <input
                    className={`input ${f.mono ? 'font-mono' : ''}`}
                    value={a[f.key] || ''}
                    onChange={(e) => change(idx, f.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <label className="block">
              <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-ui-muted mb-1">
                Note shown to the customer (optional)
              </span>
              <textarea
                className="input min-h-[60px]"
                placeholder="e.g. Please write your order number in the transfer reference."
                value={a.instructions || ''}
                onChange={(e) => change(idx, 'instructions', e.target.value)}
              />
            </label>
            {incomplete(a) && FIELDS.some((f) => (a[f.key] || '').trim()) && (
              <p className="text-xs text-ui-rust">Not shown to customers yet — fill in the required fields.</p>
            )}
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          {accounts.length < MAX_ACCOUNTS && (
            <button type="button" onClick={add} className="btn-secondary gap-1.5">
              <Plus size={15} /> Add another account
            </button>
          )}
          <button disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save bank details'}
          </button>
          {saved && (
            <span className="text-sm text-ui-brand inline-flex items-center gap-1">
              <CheckCircle2 size={15} /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
