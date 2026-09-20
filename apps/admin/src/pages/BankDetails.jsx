import { useEffect, useState } from 'react';
import { Landmark, Loader2, CheckCircle2 } from 'lucide-react';
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

// Super admin only (route + server both enforce it). These details are shown
// to customers who choose "bank transfer" at checkout, and to admins recording
// a transfer on a customer's behalf.
export default function BankDetails() {
  const { t } = useLanguage();
  usePageTitle(t('nav.bankDetails'));
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getBankSettings()
      .then(setForm)
      .catch(() => {}); // surfaced globally via the ErrorModal
  }, []);

  if (!form) return <Loader inline className="justify-center mt-10" />;

  const set = (k, v) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      setForm(await updateBankSettings(form));
      setSaved(true);
    } catch {
      /* surfaced globally via the ErrorModal */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <h1 className="font-display text-2xl text-ui-ink flex items-center gap-2 mb-1">
        <Landmark size={22} className="text-ui-brand" /> Bank details
      </h1>
      <p className="text-sm text-ui-muted mb-5">
        Customers see these when they choose bank transfer at checkout. Bank transfer stays hidden until bank name,
        account name and account number are filled in.
      </p>

      <form onSubmit={submit} className="bg-ui-panel border border-ui-line rounded-2xl shadow-card p-4 sm:p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-ui-muted mb-1">
                {f.label} {f.required && <span className="text-ui-rust">*</span>}
              </span>
              <input
                className={`input ${f.mono ? 'font-mono' : ''}`}
                value={form[f.key] || ''}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <label className="block">
          <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-ui-muted mb-1">
            Note shown to the customer (optional)
          </span>
          <textarea
            className="input min-h-[70px]"
            placeholder="e.g. Please write your order number in the transfer reference."
            value={form.instructions || ''}
            onChange={(e) => set('instructions', e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save bank details'}
          </button>
          {saved && (
            <span className="text-sm text-ui-brand inline-flex items-center gap-1">
              <CheckCircle2 size={15} /> Saved
            </span>
          )}
          {!form.configured && !saved && (
            <span className="text-xs text-ui-rust">Not active yet — fill in the required fields.</span>
          )}
        </div>
      </form>
    </div>
  );
}
