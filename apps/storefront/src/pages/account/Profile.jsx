import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { updateProfile } from '../../api/client';
import { useCustomerAuth } from '../../context/CustomerAuthContext';

export default function Profile() {
  const { customer, patchCustomer, refresh } = useCustomerAuth();
  const [name, setName] = useState(customer?.name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(customer?.name || '');
  }, [customer]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { customer: updated } = await updateProfile({ name: name.trim() });
      patchCustomer(updated);
      refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'প্রোফাইল সংরক্ষণ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5 max-w-md">
      <h2 className="font-display text-lg text-ui-ink mb-4">প্রোফাইল</h2>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">পূর্ণ নাম</span>
          <input
            className="input font-bangla"
            dir="auto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="আপনার নাম"
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">ফোন (যাচাইকৃত)</span>
          <input className="input bg-ui-surfaceAlt" value={customer?.phone || ''} disabled />
        </label>
        {error && <p className="text-sm text-ui-rust">{error}</p>}
        <button disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
          {saved ? 'সংরক্ষণ হয়েছে' : 'সংরক্ষণ করুন'}
        </button>
      </form>
    </div>
  );
}
