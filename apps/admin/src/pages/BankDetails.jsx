import { useEffect, useState } from 'react';
import { Landmark, Loader2, Plus, Trash2, Pencil, BadgeCheck, X, Wallet } from 'lucide-react';
import { getBankSettings, updateBankSettings, getPaymentSettings, updatePaymentSettings } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmContext';
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

const METHODS = [
  { key: 'cod', title: 'Cash on delivery', hint: 'Customer pays the courier when the parcel arrives.' },
  { key: 'bkash_manual', title: 'bKash — send money', hint: 'Customer sends money to your bKash number and enters the transaction ID.' },
  { key: 'bkash_automated', title: 'bKash checkout (automatic)', hint: 'Customer pays on bKash’s hosted page; confirmed automatically.' },
  { key: 'bank_transfer', title: 'Bank transfer', hint: 'Customer transfers to your active bank account and enters the transaction ID.' },
];

function Toggle({ on, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-ui-brand' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

// Super admin only (route + server both enforce it): which payment methods
// customers can use, and the bank accounts for bank transfer (only the active
// one is shown at checkout).
export default function BankDetails() {
  const { t } = useLanguage();
  const confirm = useConfirm();
  usePageTitle(t('nav.bankDetails'));

  const [methods, setMethods] = useState(null);
  const [gatewayReady, setGatewayReady] = useState(true);
  const [savingMethod, setSavingMethod] = useState('');

  const [accounts, setAccounts] = useState(null);
  const [activeId, setActiveId] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // null | { idx: number | -1, data }

  useEffect(() => {
    getPaymentSettings()
      .then((d) => {
        setMethods(d.methods);
        setGatewayReady(d.bkashGatewayReady);
      })
      .catch(() => {}); // surfaced globally via the ErrorModal
    getBankSettings()
      .then((d) => {
        setAccounts(d.accounts);
        setActiveId(d.activeAccountId);
      })
      .catch(() => {});
  }, []);

  if (!methods || !accounts) return <Loader inline className="justify-center mt-10" />;

  const toggleMethod = async (key, value) => {
    setSavingMethod(key);
    const prev = methods;
    setMethods({ ...methods, [key]: value });
    try {
      const d = await updatePaymentSettings({ [key]: value });
      setMethods(d.methods);
    } catch {
      setMethods(prev); // error already shown by the ErrorModal
    } finally {
      setSavingMethod('');
    }
  };

  // Every bank change replaces the whole list; activeIdx says which entry is active (-1 = let the server pick).
  const persist = async (list, activeIdx) => {
    setBusy(true);
    try {
      const d = await updateBankSettings({ accounts: list, activeIndex: activeIdx });
      setAccounts(d.accounts);
      setActiveId(d.activeAccountId);
      return true;
    } catch {
      return false; // surfaced globally via the ErrorModal
    } finally {
      setBusy(false);
    }
  };

  const activeIndex = accounts.findIndex((a) => a._id === activeId);

  const saveForm = async (e) => {
    e.preventDefault();
    const { idx, data } = editing;
    const list = idx === -1 ? [...accounts, data] : accounts.map((a, i) => (i === idx ? data : a));
    // The first account ever added becomes the active one.
    const ok = await persist(list, idx === -1 && accounts.length === 0 ? 0 : activeIndex);
    if (ok) setEditing(null);
  };

  const remove = async (idx) => {
    const a = accounts[idx];
    const ok = await confirm(`Delete ${a.bankName || 'this account'}${a.accountNumber ? ` (${a.accountNumber})` : ''}?`, {
      title: 'Delete bank account',
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    const list = accounts.filter((_, i) => i !== idx);
    persist(list, idx === activeIndex ? -1 : idx < activeIndex ? activeIndex - 1 : activeIndex);
  };

  const complete = (a) => a.bankName && a.accountName && a.accountNumber;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-8">
      {/* ---- Payment methods ---- */}
      <section>
        <h1 className="font-display text-2xl text-ui-ink flex items-center gap-2 mb-1">
          <Wallet size={22} className="text-ui-brand" /> Payment methods
        </h1>
        <p className="text-sm text-ui-muted mb-4">
          Choose which payment methods customers can use at checkout. Turned-off methods are hidden and refused.
        </p>
        <div className="bg-ui-panel border border-ui-line rounded-2xl shadow-card divide-y divide-ui-line">
          {METHODS.map((m) => (
            <div key={m.key} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ui-ink">{m.title}</div>
                <div className="text-xs text-ui-muted">{m.hint}</div>
                {m.key === 'bkash_automated' && !gatewayReady && (
                  <div className="text-xs text-amber-700 mt-1">
                    The bKash gateway isn’t set up on the server yet, so this stays hidden even when on.
                  </div>
                )}
                {m.key === 'bank_transfer' && !accounts.some(complete) && (
                  <div className="text-xs text-amber-700 mt-1">Add a bank account below — it stays hidden until one exists.</div>
                )}
              </div>
              <Toggle
                on={methods[m.key]}
                disabled={savingMethod === m.key}
                label={m.title}
                onChange={(v) => toggleMethod(m.key, v)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ---- Bank accounts ---- */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-display text-2xl text-ui-ink flex items-center gap-2">
            <Landmark size={22} className="text-ui-brand" /> Bank accounts
          </h2>
          {accounts.length < MAX_ACCOUNTS && (
            <button type="button" onClick={() => setEditing({ idx: -1, data: blankAccount() })} className="btn-primary gap-1.5">
              <Plus size={15} /> Add bank detail
            </button>
          )}
        </div>
        <p className="text-sm text-ui-muted mb-4">
          Only the <b>active</b> account is shown to customers. Admins can still record a transfer against any account.
        </p>

        {accounts.length === 0 ? (
          <div className="bg-ui-panel border border-dashed border-ui-line rounded-2xl p-8 text-center text-sm text-ui-muted">
            No bank accounts yet. Click “Add bank detail” to add one.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {accounts.map((a, idx) => {
              const isActive = a._id === activeId;
              return (
                <div
                  key={a._id}
                  className={`bg-ui-panel rounded-2xl shadow-card p-4 border ${isActive ? 'border-ui-brand' : 'border-ui-line'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-ui-ink truncate">{a.bankName || '—'}</div>
                      <div className="text-xs text-ui-muted truncate">{a.accountName || '—'}</div>
                    </div>
                    {isActive && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-ui-brand bg-ui-brand/10 rounded-full px-2 py-0.5">
                        <BadgeCheck size={12} /> Active
                      </span>
                    )}
                  </div>

                  <div className="font-mono text-sm text-ui-ink mt-2 break-all">{a.accountNumber || '—'}</div>
                  <div className="text-xs text-ui-muted mt-1 space-y-0.5">
                    {(a.branchName || a.district) && <div>{[a.branchName, a.district].filter(Boolean).join(' · ')}</div>}
                    {a.routingNumber && <div>Routing {a.routingNumber}</div>}
                    {a.swiftCode && <div>SWIFT {a.swiftCode}</div>}
                  </div>
                  {!complete(a) && <div className="text-xs text-ui-rust mt-2">Incomplete — customers won’t see it.</div>}

                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-dashed border-ui-line">
                    {!isActive && complete(a) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => persist(accounts, idx)}
                        className="text-xs text-ui-brand hover:underline disabled:opacity-50"
                      >
                        Set as active
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing({ idx, data: { ...a } })}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-ui-line bg-white px-2 py-1 text-xs hover:bg-ui-bg"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(idx)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-ui-rust hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Add / edit form ---- */}
      {editing && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => !busy && setEditing(null)} />
          <form
            onSubmit={saveForm}
            className="relative bg-white w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-floating p-4 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-ui-ink">{editing.idx === -1 ? 'Add bank detail' : 'Edit bank detail'}</h3>
              <button type="button" onClick={() => setEditing(null)} className="text-ui-faint hover:text-ui-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="block text-[11px] sm:text-xs uppercase tracking-wide text-ui-muted mb-1">
                    {f.label} {f.required && <span className="text-ui-rust">*</span>}
                  </span>
                  <input
                    required={f.required}
                    className={`input ${f.mono ? 'font-mono' : ''}`}
                    value={editing.data[f.key] || ''}
                    onChange={(e) => setEditing((s) => ({ ...s, data: { ...s.data, [f.key]: e.target.value } }))}
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
                value={editing.data.instructions || ''}
                onChange={(e) => setEditing((s) => ({ ...s, data: { ...s.data, instructions: e.target.value } }))}
              />
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
                Cancel
              </button>
              <button disabled={busy} className="btn-primary">
                {busy ? <Loader2 size={15} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
