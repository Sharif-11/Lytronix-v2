import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, Loader2, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import * as api from '../api/client';
import { emitError } from '../lib/errorBus';
import usePageTitle from '../lib/usePageTitle';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { t } = useLanguage();
  usePageTitle(t('profile.title'));
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (next.length < 8) {
      emitError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      emitError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      await refreshUser();
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-ui-brand">{t('profile.title')}</h1>
        <p className="text-sm text-ui-muted mt-1">{user?.name || 'Staff account'}</p>
      </div>

      <div className="card p-5">
        <h2 className="font-medium text-ui-ink mb-3">{t('profile.accountDetails')}</h2>
        <dl className="text-sm space-y-2">
          <div className="flex justify-between">
            <dt className="text-ui-muted">{t('profile.name')}</dt>
            <dd>{user?.name || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ui-muted">{t('profile.phone')}</dt>
            <dd className="font-mono">{user?.phone}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ui-muted">{t('profile.email')}</dt>
            <dd>{user?.email || t('profile.none')}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ui-muted">{t('profile.role')}</dt>
            <dd>{user?.role?.name}</dd>
          </div>
        </dl>
      </div>

      {user?.mustChangePassword && (
        <div className="flex items-start gap-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          {t('profile.resetBanner')}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <h2 className="font-medium text-ui-ink">{t('profile.changePassword')}</h2>

        <label className="block">
          <span className="label">{t('profile.currentPassword')}</span>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              required
              autoComplete="current-password"
              className="input pr-10"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-faint hover:text-ui-muted"
              tabIndex={-1}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="label">{t('profile.newPassword')}</span>
          <input
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="label">{t('profile.confirmPassword')}</span>
          <input
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        <button disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
          {saved ? t('profile.passwordUpdated') : t('profile.updatePassword')}
        </button>
      </form>
    </div>
  );
}
