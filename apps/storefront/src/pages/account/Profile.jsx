import { useEffect, useState } from 'react';
import { Loader2, Check, KeyRound, Eye, EyeOff } from 'lucide-react';
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
      setError(err.response?.data?.message || 'প্রোফাইল সেভ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md">
      <div className="card p-5">
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
            <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">ফোন (ভেরিফাইকৃত)</span>
            <input className="input bg-ui-surfaceAlt" value={customer?.phone || ''} disabled />
          </label>
          {error && <p className="text-sm text-ui-rust">{error}</p>}
          <button disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
            {saved ? 'সেভ হয়েছে' : 'সেভ করুন'}
          </button>
        </form>
      </div>

      <PasswordSection />
    </div>
  );
}

function PasswordSection() {
  const { customer, setPassword, removePassword } = useCustomerAuth();
  const hasPassword = Boolean(customer?.hasPassword);
  const isTemp = Boolean(customer?.tempPassword);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const needsCurrent = hasPassword && !isTemp;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next.length < 6) return setError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
    if (next !== confirm) return setError('দুটি পাসওয়ার্ড মিলছে না।');
    setBusy(true);
    try {
      await setPassword({ currentPassword: needsCurrent ? current : undefined, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'পাসওয়ার্ড সেভ করা যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError('');
    setBusy(true);
    try {
      await removePassword();
    } catch (err) {
      setError(err.response?.data?.message || 'পাসওয়ার্ড রিমুভো যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="font-display text-lg text-ui-ink flex items-center gap-2 mb-1">
        <KeyRound size={17} className="text-ui-brand" /> পাসওয়ার্ড
      </h2>
      <p className="text-xs text-ui-muted mb-4">
        {hasPassword
          ? isTemp
            ? 'আপনি একটি অস্থায়ী পাসওয়ার্ড ব্যবহার করছেন — নিজের একটি পাসওয়ার্ড সেট করুন।'
            : 'পাসওয়ার্ড সেট করা আছে — প্রতিবার লগইনে কোড লাগবে না।'
          : 'একটি পাসওয়ার্ড সেট করুন যাতে প্রতিবার ওয়ান-টাইম কোড ছাড়াই লগইন করা যায়।'}
      </p>

      <form onSubmit={submit} className="space-y-3">
        {needsCurrent && (
          <input
            className="input"
            type={show ? 'text' : 'password'}
            placeholder="বর্তমান পাসওয়ার্ড"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        )}
        <input
          className="input"
          type={show ? 'text' : 'password'}
          placeholder="নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <input
          className="input"
          type={show ? 'text' : 'password'}
          placeholder="নতুন পাসওয়ার্ড আবার লিখুন"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-ui-muted">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          {show ? <EyeOff size={14} /> : <Eye size={14} />} পাসওয়ার্ড দেখান
        </label>
        {error && <p className="text-sm text-ui-rust">{error}</p>}
        <div className="flex gap-2">
          <button disabled={busy} className="btn-primary">
            {busy ? <Loader2 size={15} className="animate-spin" /> : done ? <Check size={15} /> : null}
            {done ? 'সেভ হয়েছে' : hasPassword ? 'পাসওয়ার্ড পরিবর্তন করুন' : 'পাসওয়ার্ড সেট করুন'}
          </button>
          {hasPassword && (
            <button type="button" onClick={remove} disabled={busy} className="btn-secondary text-ui-rust">
              পাসওয়ার্ড রিমুভ
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
