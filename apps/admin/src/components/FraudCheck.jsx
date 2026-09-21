import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from 'lucide-react';
import { getFraudCheck } from '../api/client';

// Steadfast's own wording keys -> plain English.
const REASONS = {
  history_none: 'No delivery history',
  history_little: 'Little delivery history',
  history_some: 'Some delivery history',
  history_long: 'Long delivery history',
  ratio_high: 'High delivery success rate',
  ratio_mid: 'Mixed delivery success rate',
  ratio_low: 'Low delivery success rate',
  reports_none: 'No complaints',
  reports_recent: 'Recent complaints',
  reports_old: 'Older complaints',
  reports_doubtful: 'Doubtful complaints',
  reports_on_delivered: 'Complaints despite delivered parcels',
};

const LEVELS = {
  trusted: { label: 'Trusted', tone: 'good' },
  good: { label: 'Good', tone: 'good' },
  caution: { label: 'Caution', tone: 'warn' },
  risky: { label: 'Risky', tone: 'bad' },
  danger: { label: 'Danger', tone: 'bad' },
  new: { label: 'No history', tone: 'none' },
};

const TONES = {
  good: { box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700', Icon: ShieldCheck },
  warn: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-700', Icon: ShieldAlert },
  bad: { box: 'border-red-200 bg-red-50', text: 'text-ui-rust', Icon: ShieldAlert },
  none: { box: 'border-ui-line bg-ui-bg', text: 'text-ui-muted', Icon: ShieldQuestion },
};

const validPhone = (p) => /^01\d{9}$/.test(String(p || '').replace(/\D/g, ''));

// Delivery-risk score for a customer phone, from Steadfast. Checks by itself
// once a complete number is typed (after a short pause, and Steadfast limits
// how often it may be asked, so nothing is fetched while the number is still
// being typed). A score is a signal, not a verdict.
export default function FraudCheck({ phone }) {
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | ok | error
  const digits = String(phone || '').replace(/\D/g, '');

  useEffect(() => {
    if (!validPhone(digits)) {
      setState({ status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    const timer = setTimeout(() => {
      getFraudCheck(digits)
        .then((d) => !cancelled && setState({ status: 'ok', data: d }))
        .catch((err) => {
          if (!cancelled) setState({ status: 'error', message: err.response?.data?.message || 'Could not check this number right now.' });
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [digits]);

  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ui-muted">
        <Loader2 size={12} className="animate-spin" /> Checking delivery history…
      </div>
    );
  }

  if (state.status === 'error') {
    return <div className="mt-1.5 text-xs text-ui-muted">Fraud check unavailable: {state.message}</div>;
  }

  const d = state.data;
  const level = LEVELS[d.level] || LEVELS.new;
  const tone = TONES[d.score == null ? 'none' : level.tone];
  const Icon = tone.Icon;

  return (
    <div className={`mt-1.5 rounded-lg border px-2.5 py-2 text-xs ${tone.box}`} onClick={(e) => e.stopPropagation()}>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium ${tone.text}`}>
        <Icon size={14} />
        {d.score == null ? (
          <span>No delivery history for this number yet</span>
        ) : (
          <>
            <span>
              Score {d.score}/100 · {level.label}
            </span>
          </>
        )}
      </div>
      {d.reasons.length > 0 && (
        <div className="mt-1 text-ui-muted">{d.reasons.map((r) => REASONS[r] || r.replace(/_/g, ' ')).join(' · ')}</div>
      )}
      {d.doubtful_reports && (
        <div className="mt-1 text-amber-700">
          Has complaints despite a strong delivery record — sometimes they are not from real customers. Weigh it accordingly.
        </div>
      )}
      {d.total_reports > 0 && <div className="mt-1 text-ui-muted">{d.total_reports} report(s) on file</div>}
    </div>
  );
}
