import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Phone, ArrowLeft, ShieldCheck, Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { getGuestPhone } from '../lib/guestOrders';

export default function Login() {
  const { requestOtp, verifyOtp, login, forgotPassword, isAuthed } = useCustomerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/shop/account';

  const [mode, setMode] = useState('otp'); // 'otp' | 'password'
  const [step, setStep] = useState('phone'); // otp flow: 'phone' | 'code'
  const [phone, setPhone] = useState(() => getGuestPhone() || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isAuthed) navigate(next, { replace: true });
  }, [isAuthed, navigate, next]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    timerRef.current = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [resendIn]);

  const validPhone = /^01\d{9}$/.test(phone.replace(/\D/g, ''));
  const digits = () => phone.replace(/\D/g, '');

  const switchMode = (m) => {
    setMode(m);
    setStep('phone');
    setError('');
    setNotice('');
    setCode('');
    setPassword('');
    setDevCode('');
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setError('');
    if (!validPhone) return setError('সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)।');
    setBusy(true);
    try {
      const res = await requestOtp(digits());
      setStep('code');
      setResendIn(60);
      if (res.devCode) setDevCode(res.devCode);
    } catch (err) {
      setError(err.response?.data?.message || 'কোড পাঠানো যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    if (code.trim().length < 4) return setError('আমরা যে কোডটি পাঠিয়েছি তা লিখুন।');
    setBusy(true);
    try {
      await verifyOtp(digits(), code.trim());
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'কোডটি সঠিক নয়।');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!validPhone) return setError('সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)।');
    if (!password) return setError('পাসওয়ার্ড দিন।');
    setBusy(true);
    try {
      await login(digits(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'ফোন নম্বর বা পাসওয়ার্ড সঠিক নয়।');
    } finally {
      setBusy(false);
    }
  };

  const doForgot = async () => {
    setError('');
    setNotice('');
    if (!validPhone) return setError('আগে সঠিক মোবাইল নম্বর দিন।');
    setBusy(true);
    try {
      const res = await forgotPassword(digits());
      setNotice(
        res.devPassword
          ? `ডেভ মোড — আপনার নতুন পাসওয়ার্ড ${res.devPassword}`
          : res.message || 'যদি এই নম্বরে অ্যাকাউন্ট থাকে, নতুন পাসওয়ার্ড এসএমএসে পাঠানো হয়েছে।'
      );
    } catch (err) {
      setError(err.response?.data?.message || 'অনুরোধটি সম্পন্ন করা যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-brand mb-6">
          <ArrowLeft size={15} /> শপে ফিরে যান
        </Link>

        <div className="card p-6">
          {/* Mode toggle */}
          {step === 'phone' && (
            <div className="flex rounded-xl border border-ui-line p-1 mb-5 text-sm">
              <button
                type="button"
                onClick={() => switchMode('otp')}
                className={`flex-1 rounded-lg py-1.5 font-medium transition-colors ${
                  mode === 'otp' ? 'bg-ui-brand text-white' : 'text-ui-muted'
                }`}
              >
                ওয়ান-টাইম কোড
              </button>
              <button
                type="button"
                onClick={() => switchMode('password')}
                className={`flex-1 rounded-lg py-1.5 font-medium transition-colors ${
                  mode === 'password' ? 'bg-ui-brand text-white' : 'text-ui-muted'
                }`}
              >
                পাসওয়ার্ড
              </button>
            </div>
          )}

          <div className="w-12 h-12 rounded-2xl bg-ui-brand/10 text-ui-brand flex items-center justify-center mb-4">
            {mode === 'password' ? <KeyRound size={22} /> : step === 'phone' ? <Phone size={22} /> : <ShieldCheck size={22} />}
          </div>

          {notice && (
            <div className="mb-3 text-xs bg-ui-brand/10 border border-ui-brand/30 text-ui-brand rounded-lg px-3 py-2 font-bangla">
              {notice}
            </div>
          )}

          {/* ---- Password mode ---- */}
          {mode === 'password' ? (
            <>
              <h1 className="font-display text-xl text-ui-ink">পাসওয়ার্ড দিয়ে লগইন</h1>
              <p className="text-sm text-ui-muted mt-1 mb-5">
                অ্যাকাউন্টে পাসওয়ার্ড সেট করা থাকলে কোড ছাড়াই লগইন করুন।
              </p>
              <form onSubmit={submitPassword} className="space-y-3">
                <input
                  className="input"
                  inputMode="numeric"
                  autoFocus
                  placeholder="01XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPw ? 'text' : 'password'}
                    placeholder="পাসওয়ার্ড"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-muted"
                    aria-label={showPw ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান'}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {error && <p className="text-sm text-ui-rust">{error}</p>}
                <button disabled={busy} className="btn-primary w-full py-3">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : 'লগইন'}
                </button>
                <button
                  type="button"
                  onClick={doForgot}
                  disabled={busy}
                  className="w-full text-sm text-ui-muted hover:text-ui-brand"
                >
                  পাসওয়ার্ড ভুলে গেছেন? নতুন পাসওয়ার্ড এসএমএসে পান
                </button>
              </form>
            </>
          ) : step === 'phone' ? (
            /* ---- OTP mode: phone ---- */
            <>
              <h1 className="font-display text-xl text-ui-ink">লগইন করুন বা অ্যাকাউন্ট খুলুন</h1>
              <p className="text-sm text-ui-muted mt-1 mb-5">
                আপনার ফোনে একটি ওয়ান-টাইম কোড পাঠানো হবে।
              </p>
              <form onSubmit={sendCode} className="space-y-3">
                <input
                  className="input"
                  inputMode="numeric"
                  autoFocus
                  placeholder="01XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                {error && <p className="text-sm text-ui-rust">{error}</p>}
                <button disabled={busy} className="btn-primary w-full py-3">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : 'কোড পাঠান'}
                </button>
              </form>
            </>
          ) : (
            /* ---- OTP mode: code ---- */
            <>
              <h1 className="font-display text-xl text-ui-ink">কোডটি লিখুন</h1>
              <p className="text-sm text-ui-muted mt-1 mb-5">
                পাঠানো হয়েছে <span className="font-medium text-ui-ink">{phone}</span> নম্বরে।{' '}
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setCode('');
                    setDevCode('');
                  }}
                  className="text-ui-brand underline"
                >
                  পরিবর্তন করুন
                </button>
              </p>
              {devCode && (
                <div className="mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                  ডেভ মোড — আপনার কোড <span className="font-mono font-semibold">{devCode}</span>
                </div>
              )}
              <form onSubmit={submitCode} className="space-y-3">
                <input
                  className="input text-center text-lg tracking-[0.4em] font-mono"
                  inputMode="numeric"
                  autoFocus
                  maxLength={8}
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                {error && <p className="text-sm text-ui-rust">{error}</p>}
                <button disabled={busy} className="btn-primary w-full py-3">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : 'ভেরিফাই করে চালিয়ে যান'}
                </button>
                <button
                  type="button"
                  disabled={resendIn > 0 || busy}
                  onClick={sendCode}
                  className="w-full text-sm text-ui-muted hover:text-ui-brand disabled:opacity-50"
                >
                  {resendIn > 0 ? `${resendIn} সেকেন্ড পর আবার পাঠান` : 'আবার কোড পাঠান'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-xs text-ui-faint text-center mt-4">
          আপনি চাইলে{' '}
          <Link to="/shop/checkout" className="underline hover:text-ui-brand">
            গেস্ট হিসেবেও চেকআউট
          </Link>{' '}
          করতে পারেন।
        </p>
      </div>
    </div>
  );
}
