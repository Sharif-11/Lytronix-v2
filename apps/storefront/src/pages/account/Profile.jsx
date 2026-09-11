import { useEffect, useState } from 'react';
import { Loader2, Check, KeyRound, Eye, EyeOff, BellRing } from 'lucide-react';
import { updateProfile } from '../../api/client';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { pushSupported, getPushState, enablePush, disablePush } from '../../lib/push';
import usePageTitle from '../../lib/usePageTitle';

export default function Profile() {
  usePageTitle('প্রোফাইল');
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
      <NotificationsSection />
    </div>
  );
}

function NotificationsSection() {
  const [state, setState] = useState({ supported: true, permission: 'default', subscribed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => getPushState().then(setState).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  if (!pushSupported()) return null;

  const blocked = state.permission === 'denied';

  const toggle = async () => {
    setError('');
    setBusy(true);
    try {
      if (state.subscribed) await disablePush();
      else await enablePush();
      await refresh();
    } catch (e) {
      const map = {
        denied: 'ব্রাউজার সেটিংসে নোটিফিকেশন ব্লক করা আছে।',
        'server-not-configured': 'নোটিফিকেশন সার্ভিস এখন উপলব্ধ নয়।',
        unsupported: 'এই ব্রাউজারে নোটিফিকেশন সাপোর্ট করে না।',
      };
      setError(map[e.message] || 'নোটিফিকেশন চালু করা যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="font-display text-lg text-ui-ink flex items-center gap-2 mb-1">
        <BellRing size={17} className="text-ui-brand" /> নোটিফিকেশন
      </h2>
      <p className="text-xs text-ui-muted mb-4">
        অর্ডারের স্ট্যাটাস, পেমেন্ট নিশ্চিত হওয়া ও সাপোর্টের উত্তর — অ্যাপ বন্ধ থাকলেও ফোনে জানিয়ে দেব।
        (হোম স্ক্রিনে অ্যাপটি ইনস্টল করে নিলে সবচেয়ে ভালো কাজ করে।)
      </p>
      {error && <p className="text-sm text-ui-rust mb-2">{error}</p>}
      <button
        onClick={toggle}
        disabled={busy || blocked}
        className={state.subscribed ? 'btn-secondary' : 'btn-primary'}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />}
        {blocked
          ? 'ব্রাউজারে ব্লকড'
          : state.subscribed
          ? 'নোটিফিকেশন বন্ধ করুন'
          : 'নোটিফিকেশন চালু করুন'}
      </button>
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
