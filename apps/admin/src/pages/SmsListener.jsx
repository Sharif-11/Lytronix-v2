import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, RefreshCw, Copy, Check, Plus, Ban } from 'lucide-react';
import {
  createSmsPairingCode,
  getSmsDevices,
  revokeSmsDevice,
  getSmsMessages,
  rematchSmsMessage,
} from '../api/client';
import { formatDate, formatMoney } from '../utils/format';
import { copyToClipboard } from '../lib/publicLinks';
import { useConfirm } from '../context/ConfirmContext';
import { useLanguage } from '../context/LanguageContext';
import usePageTitle from '../lib/usePageTitle';
import Loader from '../components/Loader';

const API_BASE = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '');

const STATUS_STYLES = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unmatched: 'bg-amber-50 text-amber-700 border-amber-200',
  needs_review: 'bg-red-50 text-ui-rust border-red-200',
  duplicate: 'bg-slate-100 text-slate-600 border-slate-200',
  ignored: 'bg-slate-100 text-slate-500 border-slate-200',
  error: 'bg-red-50 text-ui-rust border-red-200',
  received: 'bg-slate-100 text-slate-600 border-slate-200',
};
const FILTERS = ['', 'verified', 'unmatched', 'needs_review', 'duplicate', 'ignored', 'error'];

function CopyText({ value }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyToClipboard(value)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-ui-line bg-white px-2 py-1 text-[11px] hover:bg-ui-bg"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'Copied' : 'Copy'}
    </button>
  );
}

// Payments admins: pair Android phones that forward bKash SMS, and watch what
// the server did with each message.
export default function SmsListener() {
  const { t } = useLanguage();
  const confirm = useConfirm();
  usePageTitle(t('nav.smsListener'));

  const [devices, setDevices] = useState(null);
  const [messages, setMessages] = useState(null);
  const [filter, setFilter] = useState('');
  const [pairing, setPairing] = useState(null); // { code, expiresAt }
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    getSmsDevices()
      .then((d) => setDevices(d.devices))
      .catch(() => setDevices([]));
    getSmsMessages({ status: filter || undefined, limit: 100 })
      .then((d) => setMessages(d.messages))
      .catch(() => setMessages([]));
  }, [filter]);

  useEffect(load, [load]);

  // Countdown for the pairing code.
  useEffect(() => {
    if (!pairing) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pairing]);

  const startPairing = async () => {
    try {
      setPairing(await createSmsPairingCode());
      setNow(Date.now());
    } catch {
      /* surfaced globally via the ErrorModal */
    }
  };

  const revoke = async (d) => {
    const ok = await confirm(`Revoke "${d.name}"? It will stop being able to send SMS to the server.`, {
      title: 'Revoke device',
      danger: true,
      confirmLabel: 'Revoke',
    });
    if (!ok) return;
    setBusyId(d._id);
    try {
      await revokeSmsDevice(d._id);
      load();
    } catch {
      /* ErrorModal */
    } finally {
      setBusyId('');
    }
  };

  const rematch = async (m) => {
    setBusyId(m._id);
    try {
      await rematchSmsMessage(m._id);
      load();
    } catch {
      /* ErrorModal */
    } finally {
      setBusyId('');
    }
  };

  const secondsLeft = pairing ? Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - now) / 1000)) : 0;
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* ---- Devices ---- */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h1 className="font-display text-2xl text-ui-ink flex items-center gap-2">
            <Smartphone size={22} className="text-ui-brand" /> SMS listener
          </h1>
          <button type="button" onClick={startPairing} className="btn-primary gap-1.5">
            <Plus size={15} /> Pair a new phone
          </button>
        </div>
        <p className="text-sm text-ui-muted mb-4">
          Install the Lytronix SMS Listener app on the phone that receives your bKash SMS. It sends each “money
          received” message here, and a matching bKash payment is verified automatically.
        </p>

        {pairing && (
          <div className="mb-4 rounded-2xl border border-ui-brand/40 bg-ui-brand/[0.05] p-4 sm:p-5">
            {secondsLeft > 0 ? (
              <>
                <div className="text-xs uppercase tracking-wide text-ui-muted mb-1">Pairing code — expires in {mmss}</div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-3xl tracking-[0.3em] text-ui-ink">{pairing.code}</span>
                  <CopyText value={pairing.code} />
                </div>
                <div className="mt-3 text-sm text-ui-ink">
                  In the app enter this code and the server address:
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <code className="text-xs bg-white border border-ui-line rounded px-2 py-1 break-all">{API_BASE}</code>
                    <CopyText value={API_BASE} />
                  </div>
                </div>
                <p className="text-xs text-ui-muted mt-2">One use only. Anyone with this code can pair a phone until it expires.</p>
              </>
            ) : (
              <div className="text-sm text-ui-muted">
                That code expired. <button type="button" onClick={startPairing} className="text-ui-brand underline">Generate a new one</button>
              </div>
            )}
          </div>
        )}

        {devices === null ? (
          <Loader inline className="justify-center" />
        ) : devices.length === 0 ? (
          <div className="bg-ui-panel border border-dashed border-ui-line rounded-2xl p-6 text-center text-sm text-ui-muted">
            No phone is paired yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {devices.map((d) => (
              <div key={d._id} className={`bg-ui-panel border rounded-2xl p-4 ${d.revokedAt ? 'border-ui-line opacity-70' : 'border-ui-line'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-ui-ink truncate">{d.name}</div>
                    <div className="text-xs text-ui-muted">Paired {formatDate(d.createdAt)}</div>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5 border ${
                      d.revokedAt ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {d.revokedAt ? 'Revoked' : 'Active'}
                  </span>
                </div>
                <div className="text-xs text-ui-muted mt-2">
                  Last seen: {d.lastSeenAt ? formatDate(d.lastSeenAt) : 'never'}
                  {d.appVersion ? ` · app v${d.appVersion}` : ''}
                </div>
                {!d.revokedAt && (
                  <div className="mt-3 pt-3 border-t border-dashed border-ui-line">
                    <button
                      type="button"
                      disabled={busyId === d._id}
                      onClick={() => revoke(d)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-ui-rust hover:bg-red-50 disabled:opacity-50"
                    >
                      <Ban size={12} /> Revoke
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Message log ---- */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-xl text-ui-ink">Received messages</h2>
          <div className="flex items-center gap-2">
            <select className="input max-w-[11rem]" value={filter} onChange={(e) => setFilter(e.target.value)}>
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f ? f.replace('_', ' ') : 'All statuses'}
                </option>
              ))}
            </select>
            <button type="button" onClick={load} className="btn-secondary gap-1.5">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {messages === null ? (
          <Loader inline className="justify-center" />
        ) : messages.length === 0 ? (
          <p className="text-sm text-ui-muted text-center py-8">No messages yet.</p>
        ) : (
          <div className="card divide-y divide-ui-line">
            {messages.map((m) => (
              <div key={m._id} className="p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[m.status] || STATUS_STYLES.received}`}>
                    {m.status.replace('_', ' ')}
                  </span>
                  {m.parsed?.amount != null && (
                    <span className="text-sm font-medium text-ui-ink">{formatMoney(m.parsed.amount)}</span>
                  )}
                  {m.parsed?.trxId && <span className="font-mono text-xs text-ui-muted">TrxID {m.parsed.trxId}</span>}
                  {m.parsed?.counterparty && <span className="text-xs text-ui-muted">from {m.parsed.counterparty}</span>}
                  <span className="text-xs text-ui-muted sm:ml-auto">{formatDate(m.receivedAt)}</span>
                </div>
                <div className="text-xs text-ui-muted">
                  {m.sender || 'unknown sender'} · {m.device?.name || 'device'}
                  {m.order?.orderNumber && (
                    <>
                      {' · '}
                      <Link to={`/orders/${m.order._id}`} className="text-ui-brand underline">
                        {m.order.orderNumber}
                      </Link>
                    </>
                  )}
                </div>
                {m.note && <div className={`text-xs ${m.status === 'needs_review' ? 'text-ui-rust' : 'text-ui-muted'}`}>{m.note}</div>}
                {(m.status === 'unmatched' || m.status === 'needs_review') && (
                  <button
                    type="button"
                    disabled={busyId === m._id}
                    onClick={() => rematch(m)}
                    className="text-xs text-ui-brand hover:underline disabled:opacity-50"
                  >
                    Try to match again
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
