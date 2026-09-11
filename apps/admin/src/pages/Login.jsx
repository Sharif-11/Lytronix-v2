import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from '../components/LanguageToggle';
import * as api from '../api/client';
import logoMark from '../assets/lytronix-mark.png';
import usePageTitle from '../lib/usePageTitle';

// Turn an axios failure into a short, human message.
function readError(err, t) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.request && !err?.response) return t('login.offline');
  return t('login.errorGeneric');
}

function Alert({ tone = 'error', children }) {
  const isOk = tone === 'ok';
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${
        isOk
          ? 'border-ui-brand/30 bg-ui-brand/10 text-ui-brand'
          : 'border-ui-rust/40 bg-ui-rust/10 text-ui-rust'
      }`}
    >
      {isOk ? (
        <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
      ) : (
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
      )}
      <span className="leading-snug">{children}</span>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const { t } = useLanguage();
  usePageTitle(t('login.title'));
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState({}); // { identifier, password }

  const from = location.state?.from?.pathname || '/';

  async function handleSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!identifier.trim()) next.identifier = t('login.needIdentifier');
    if (!password) next.password = t('login.needPassword');
    setFieldErr(next);
    setError('');
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(readError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-2 bg-ui-bg">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex flex-col justify-between bg-ui-dark text-white p-10 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-ui-brand/20" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-ui-brand/10 -mb-24 -ml-24" />
        <div className="relative flex items-center gap-2.5">
          <img src={logoMark} alt="Lytronix" className="w-10 h-10" />
          <span className="font-display font-bold text-xl tracking-tight">Lytronix</span>
        </div>
        <div className="relative max-w-sm">
          <h2 className="font-display font-bold text-3xl leading-tight">{t('login.heroTitle')}</h2>
          <p className="text-white/60 mt-3 text-sm leading-relaxed">{t('login.heroBody')}</p>
        </div>
        <p className="relative text-xs text-white/40">
          © {new Date().getFullYear()} Lytronix. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col min-h-[100dvh] lg:min-h-0">
        {/* Mobile brand strip */}
        <div className="lg:hidden bg-ui-dark text-white px-5 pt-7 pb-9 relative overflow-hidden">
          <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-ui-brand/20" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src={logoMark} alt="Lytronix" className="w-9 h-9" />
              <span className="font-display font-bold text-lg">Lytronix</span>
            </div>
            <LanguageToggle />
          </div>
          <p className="relative mt-4 text-sm text-white/70 max-w-xs">{t('login.heroTitle')}</p>
        </div>

        <div className="flex-1 flex items-start lg:items-center justify-center px-5 sm:px-8 py-8 lg:py-10">
          <div className="w-full max-w-sm -mt-6 lg:mt-0">
            {/* Desktop-only language toggle (mobile has it in the strip) */}
            <div className="hidden lg:flex justify-end mb-6">
              <LanguageToggle />
            </div>

            <div className="card p-6 sm:p-7 lg:p-0 lg:border-0 lg:shadow-none lg:bg-transparent">
              {forgotMode ? (
                <ForgotPasswordPanel onBack={() => setForgotMode(false)} />
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  <div>
                    <h1 className="font-display font-bold text-2xl text-ui-ink">{t('login.welcome')}</h1>
                    <p className="text-sm text-ui-muted mt-1">{t('login.subtitle')}</p>
                  </div>

                  {error && <Alert>{error}</Alert>}

                  <div>
                    <label className="label" htmlFor="identifier">
                      {t('login.identifier')}
                    </label>
                    <input
                      id="identifier"
                      type="text"
                      autoComplete="username"
                      autoFocus
                      className={`input h-12 ${fieldErr.identifier ? 'border-ui-rust focus:border-ui-rust focus:ring-ui-rust/20' : ''}`}
                      placeholder="you@lytronix.com / 01XXXXXXXXX"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        if (fieldErr.identifier) setFieldErr((s) => ({ ...s, identifier: '' }));
                      }}
                      aria-invalid={Boolean(fieldErr.identifier)}
                    />
                    {fieldErr.identifier && (
                      <p className="mt-1.5 text-xs text-ui-rust flex items-center gap-1">
                        <AlertCircle size={12} /> {fieldErr.identifier}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="label mb-0" htmlFor="password">
                        {t('login.password')}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotMode(true);
                          setError('');
                          setFieldErr({});
                        }}
                        className="text-xs font-medium text-ui-brand hover:underline"
                      >
                        {t('login.forgot')}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        className={`input h-12 pr-11 ${fieldErr.password ? 'border-ui-rust focus:border-ui-rust focus:ring-ui-rust/20' : ''}`}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErr.password) setFieldErr((s) => ({ ...s, password: '' }));
                        }}
                        aria-invalid={Boolean(fieldErr.password)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-faint hover:text-ui-muted p-1"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                    {fieldErr.password && (
                      <p className="mt-1.5 text-xs text-ui-rust flex items-center gap-1">
                        <AlertCircle size={12} /> {fieldErr.password}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full h-12 text-[15px] gap-2"
                  >
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    {submitting ? t('login.signingIn') : t('login.signIn')}
                  </button>
                </form>
              )}
            </div>

            <p className="lg:hidden text-center text-[11px] text-ui-faint mt-8">
              © {new Date().getFullYear()} Lytronix
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordPanel({ onBack }) {
  const { t } = useLanguage();
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setFieldErr(t('login.needIdentifier'));
      return;
    }
    setFieldErr('');
    setError('');
    setSubmitting(true);
    try {
      await api.forgotPassword(identifier.trim());
      setDone(true);
    } catch (err) {
      setError(readError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-brand mb-5"
      >
        <ArrowLeft size={15} /> {t('login.backToSignIn')}
      </button>

      <h1 className="font-display font-bold text-2xl text-ui-ink">{t('login.forgotTitle')}</h1>
      <p className="text-sm text-ui-muted mt-1 mb-5">{t('login.forgotBody')}</p>

      {done ? (
        <Alert tone="ok">{t('login.forgotDone')}</Alert>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <input
              type="text"
              autoFocus
              className={`input h-12 ${fieldErr ? 'border-ui-rust focus:border-ui-rust focus:ring-ui-rust/20' : ''}`}
              placeholder="you@lytronix.com / 01XXXXXXXXX"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (fieldErr) setFieldErr('');
              }}
              aria-invalid={Boolean(fieldErr)}
            />
            {fieldErr && (
              <p className="mt-1.5 text-xs text-ui-rust flex items-center gap-1">
                <AlertCircle size={12} /> {fieldErr}
              </p>
            )}
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full h-12 gap-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? t('login.forgotSending') : t('login.forgotSend')}
          </button>
        </form>
      )}
    </div>
  );
}
