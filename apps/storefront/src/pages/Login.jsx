import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Phone, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';
import { useCustomerAuth } from '../context/CustomerAuthContext';

export default function Login() {
  const { requestOtp, verifyOtp, isAuthed } = useCustomerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/shop/account';

  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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

  const sendCode = async (e) => {
    e?.preventDefault();
    setError('');
    if (!validPhone) {
      setError('সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)।');
      return;
    }
    setBusy(true);
    try {
      const res = await requestOtp(phone.replace(/\D/g, ''));
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
    if (code.trim().length < 4) {
      setError('আমরা যে কোডটি পাঠিয়েছি তা লিখুন।');
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(phone.replace(/\D/g, ''), code.trim());
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'কোডটি সঠিক নয়।');
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
          <div className="w-12 h-12 rounded-2xl bg-ui-brand/10 text-ui-brand flex items-center justify-center mb-4">
            {step === 'phone' ? <Phone size={22} /> : <ShieldCheck size={22} />}
          </div>

          {step === 'phone' ? (
            <>
              <h1 className="font-display text-xl text-ui-ink">সাইন ইন করুন বা অ্যাকাউন্ট খুলুন</h1>
              <p className="text-sm text-ui-muted mt-1 mb-5">
                আপনার ফোনে একটি ওয়ান-টাইম কোড পাঠানো হবে। কোনো পাসওয়ার্ড লাগবে না।
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
                  {busy ? <Loader2 size={16} className="animate-spin" /> : 'যাচাই করে চালিয়ে যান'}
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
