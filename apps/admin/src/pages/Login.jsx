import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from '../components/LanguageToggle';
import * as api from '../api/client';
import logoMark from '../assets/lytronix-mark.png';

export default function Login() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  const from = location.state?.from?.pathname || '/';

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(identifier, password);
      navigate(from, { replace: true });
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-ui-bg">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex flex-col justify-between bg-ui-dark text-white p-10 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-ui-brand/20" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-ui-brand/10 -mb-24 -ml-24" />
        <div className="relative flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <img src={logoMark} alt="Lytronix" className="w-10 h-10" />
            <span className="font-display font-bold text-xl tracking-tight">Lytronix</span>
          </div>
        </div>
        <div className="relative max-w-sm">
          <h2 className="font-display font-bold text-3xl leading-tight">{t('login.heroTitle')}</h2>
          <p className="text-white/60 mt-3 text-sm leading-relaxed">{t('login.heroBody')}</p>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Lytronix. All rights reserved.</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="lg:hidden flex items-center gap-2.5">
              <img src={logoMark} alt="Lytronix" className="w-9 h-9" />
              <span className="font-display font-bold text-lg text-ui-ink">Lytronix</span>
            </div>
            <LanguageToggle />
          </div>

          {forgotMode ? (
            <ForgotPasswordPanel onBack={() => setForgotMode(false)} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h1 className="font-display font-bold text-2xl text-ui-ink">{t('login.welcome')}</h1>
                <p className="text-sm text-ui-muted mt-1">{t('login.subtitle')}</p>
              </div>

              <div>
                <label className="label" htmlFor="identifier">{t('login.identifier')}</label>
                <input
                  id="identifier"
                  type="text"
                  required
                  autoComplete="username"
                  autoFocus
                  className="input"
                  placeholder="you@lytronix.com or 01XXXXXXXXX"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0" htmlFor="password">{t('login.password')}</label>
                  <button
                    type="button"
                    onClick={() => setForgotMode(true)}
                    className="text-xs text-ui-brand hover:underline"
                  >
                    {t('login.forgot')}
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="input pr-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-faint hover:text-ui-muted"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
                {submitting ? t('login.signingIn') : t('login.signIn')}
              </button>
            </form>
          )}
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.forgotPassword(identifier);
      setDone(true);
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
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
        <div className="text-sm text-ui-brand bg-ui-brand/10 border border-ui-brand/30 rounded-xl px-3.5 py-3">
          {t('login.forgotDone')}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            required
            autoFocus
            className="input"
            placeholder="you@lytronix.com or 01XXXXXXXXX"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <button type="submit" disabled={submitting} className="btn-primary w-full py-3 gap-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? t('login.forgotSending') : t('login.forgotSend')}
          </button>
        </form>
      )}
    </div>
  );
}
