import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPayments, verifyPayment, rejectPayment } from '../api/client';
import { formatMoney, formatDate } from '../utils/format';
import { CheckCircle2, XCircle, ImageOff, ExternalLink, Search, Printer } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  pending_verification: 'bg-amber-50 text-amber-700 border-amber-200',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-ui-rust border-red-200',
  refunded: 'bg-violet-50 text-violet-700 border-violet-200',
};

function buildPrintQuery({ status, search }) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function Payments() {
  const { t } = useLanguage();
  const TABS = [
    { key: '', label: t('payments.tabAll') },
    { key: 'pending_verification', label: t('payments.tabNeedsReview') },
    { key: 'pending', label: t('payments.tabPending') },
    { key: 'verified', label: t('payments.tabVerified') },
    { key: 'failed', label: t('payments.tabFailed') },
  ];
  const METHOD_LABELS = {
    cod: t('payments.methodCod'),
    bkash_manual: t('payments.methodBkashManual'),
    bkash_automated: t('payments.methodBkashAuto'),
    sslcommerz: t('payments.methodSslcommerz'),
    other: t('payments.methodOther'),
  };

  const [status, setStatus] = useState('pending_verification');
  const [search, setSearch] = useState('');
  const [payments, setPayments] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null); // payment id whose txn-id confirm box is open
  const [txnInput, setTxnInput] = useState('');
  const [rejectingId, setRejectingId] = useState(null); // payment id whose reject-reason box is open
  const [rejectReason, setRejectReason] = useState('');

  const load = () => {
    setLoading(true);
    getPayments({ status: status || undefined, search: search || undefined, page })
      .then((d) => {
        setPayments(d.payments);
        setPages(d.pages || 1);
        setTotal(d.total || 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  // A manual bKash payment (has its own transactionId on file) requires the
  // admin to re-enter it before verifying — opens an inline confirm box
  // instead of verifying immediately. Anything without a transactionId (e.g.
  // COD) has nothing to confirm, so it verifies straight away.
  const handleVerify = async (payment) => {
    if (payment.transactionId) {
      setVerifyingId(payment._id);
      setTxnInput('');
      return;
    }
    setBusyId(payment._id);
    try {
      await verifyPayment(payment._id, {});
      load();
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setBusyId(null);
    }
  };

  const confirmVerify = async (id) => {
    setBusyId(id);
    try {
      await verifyPayment(id, { transactionId: txnInput.trim() });
      setVerifyingId(null);
      load();
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = (id) => {
    setRejectingId(id);
    setRejectReason('');
  };

  const confirmReject = async (id) => {
    setBusyId(id);
    try {
      await rejectPayment(id, rejectReason.trim());
      setRejectingId(null);
      load();
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ui-ink">{t('payments.title')}</h1>
          <p className="text-sm text-ui-muted mt-1">{t('payments.subtitle')}</p>
        </div>
        <a
          href={`/payments/print${buildPrintQuery({ status, search })}`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary gap-1.5 shrink-0"
        >
          <Printer size={15} /> {t('payments.printLog')}
        </a>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatus(tab.key); setPage(1); }}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              status === tab.key ? 'bg-ui-brand text-white border-ui-brand' : 'bg-white text-ui-muted border-ui-line hover:border-ui-faint/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSearchSubmit} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-muted pointer-events-none" />
          <input
            className="input pl-9"
            placeholder={t('payments.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary shrink-0" type="submit">{t('common.search')}</button>
      </form>
      <p className="text-xs text-ui-muted -mt-2">{t('payments.count', { n: total })}</p>

      {loading && <p className="text-ui-muted text-sm py-8 text-center">{t('common.loading')}</p>}
      {!loading && payments.length === 0 && (
        <p className="text-ui-muted text-sm py-10 text-center border border-dashed border-ui-line rounded-2xl">{t('payments.nothingHere')}</p>
      )}

      <div className="space-y-3">
        {payments.map((p) => (
          <div key={p._id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ui-ink">{METHOD_LABELS[p.method] || p.method}</span>
                  <span className={`chip text-[11px] ${STATUS_STYLES[p.status] || ''}`}>{p.status.replace('_', ' ')}</span>
                </div>
                {p.order && (
                  <Link to={`/orders/${p.order._id}`} className="text-sm text-ui-brand hover:underline inline-flex items-center gap-1 mt-1">
                    {p.order.orderNumber} <ExternalLink size={12} />
                  </Link>
                )}
                <p className="text-xs text-ui-muted mt-1">
                  {p.order?.customer?.name} · {p.order?.customer?.phone} · {formatDate(p.createdAt)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono font-semibold text-ui-ink">{formatMoney(p.amount)}</p>
              </div>
            </div>

            {(p.senderNumber || p.transactionId || p.proofImageUrl) && (
              <div className="mt-3 pt-3 border-t border-dashed border-ui-line flex flex-wrap items-center gap-4">
                {p.senderNumber && (
                  <div className="text-xs">
                    <span className="text-ui-faint block">{t('payments.senderNumber')}</span>
                    <span className="font-mono text-ui-ink">{p.senderNumber}</span>
                  </div>
                )}
                {p.transactionId && (
                  <div className="text-xs">
                    <span className="text-ui-faint block">{t('payments.transactionId')}</span>
                    <span className="font-mono text-ui-ink">{p.transactionId}</span>
                  </div>
                )}
                {p.proofImageUrl ? (
                  <button type="button" onClick={() => setLightbox(p.proofImageUrl)} className="shrink-0">
                    <img src={p.proofImageUrl} alt="Payment proof" className="w-14 h-14 rounded-lg object-cover border border-ui-line hover:opacity-80 transition-opacity" />
                  </button>
                ) : (
                  <div className="w-14 h-14 rounded-lg border border-dashed border-ui-line flex items-center justify-center text-ui-faint shrink-0">
                    <ImageOff size={16} />
                  </div>
                )}
              </div>
            )}

            {p.status === 'failed' && p.rejectionReason && (
              <p className="text-xs text-ui-rust mt-2">{t('payments.rejected', { reason: p.rejectionReason })}</p>
            )}

            {p.status === 'pending_verification' && verifyingId === p._id && (
              <div className="mt-3 pt-3 border-t border-ui-line">
                <p className="text-xs font-medium text-ui-ink mb-1.5">{t('payments.confirmTxnTitle')}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    autoFocus
                    className="input font-mono text-sm py-1.5 w-full sm:flex-1"
                    placeholder={t('payments.confirmTxnPlaceholder')}
                    value={txnInput}
                    onChange={(e) => setTxnInput(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmVerify(p._id)}
                      disabled={busyId === p._id || !txnInput.trim()}
                      className="btn-primary gap-1.5 flex-1 sm:flex-none sm:shrink-0"
                    >
                      <CheckCircle2 size={15} /> {t('payments.confirmAndVerify')}
                    </button>
                    <button onClick={() => setVerifyingId(null)} className="btn-secondary shrink-0">
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {p.status === 'pending_verification' && rejectingId === p._id && (
              <div className="mt-3 pt-3 border-t border-ui-line">
                <p className="text-xs font-medium text-ui-ink mb-1.5">{t('payments.rejectPrompt')}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    autoFocus
                    className="input text-sm py-1.5 w-full sm:flex-1"
                    placeholder={t('payments.rejectPrompt')}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmReject(p._id)}
                      disabled={busyId === p._id}
                      className="btn-danger gap-1.5 flex-1 sm:flex-none sm:shrink-0"
                    >
                      <XCircle size={15} /> {t('payments.reject')}
                    </button>
                    <button onClick={() => setRejectingId(null)} className="btn-secondary shrink-0">
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {p.status === 'pending_verification' && verifyingId !== p._id && rejectingId !== p._id && (
              <div className="mt-3 pt-3 border-t border-ui-line flex gap-2">
                <button onClick={() => handleVerify(p)} disabled={busyId === p._id} className="btn-primary flex-1 gap-1.5">
                  <CheckCircle2 size={15} /> {t('payments.verify')}
                </button>
                <button onClick={() => handleReject(p._id)} disabled={busyId === p._id} className="btn-danger flex-1 gap-1.5">
                  <XCircle size={15} /> {t('payments.reject')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('common.prev')}</button>
          <span className="text-sm font-mono text-ui-muted">{t('common.page', { page, pages })}</span>
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t('common.next')}</button>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Payment proof" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
