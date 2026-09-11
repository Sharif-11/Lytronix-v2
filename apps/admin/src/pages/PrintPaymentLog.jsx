import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAllPayments } from '../api/client';
import { formatMoney, formatDateShort } from '../utils/format';
import { COMPANY_NAME } from '../utils/company';
import Loader from '../components/Loader';

// Same paging approach as PrintLogbook.jsx (order logbook) — see there for
// why this is an approximation, not an exact per-page row count.
const ROWS_PER_PAGE = 26;

const METHOD_LABELS = {
  cod: 'Cash on Delivery',
  bkash_manual: 'bKash (manual)',
  bkash_automated: 'bKash (auto)',
  sslcommerz: 'SSLCommerz',
  other: 'Other',
};

export default function PrintPaymentLog() {
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPages, setSelectedPages] = useState(null); // null = "all" (not yet chosen)

  const status = searchParams.get('status') || '';
  const method = searchParams.get('method') || '';
  const search = searchParams.get('search') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  useEffect(() => {
    document.title = 'Payment Log';
  }, []);

  useEffect(() => {
    setLoading(true);
    getAllPayments({
      status: status || undefined,
      method: method || undefined,
      search: search || undefined,
      from: from || undefined,
      to: to || undefined,
    })
      .then((data) => setPayments(data.payments))
      .finally(() => setLoading(false));
  }, [status, method, search, from, to]);

  const pages = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < payments.length; i += ROWS_PER_PAGE) {
      chunks.push(payments.slice(i, i + ROWS_PER_PAGE));
    }
    return chunks.length ? chunks : [[]];
  }, [payments]);

  useEffect(() => {
    // Default to "everything selected" once we know how many pages there are.
    setSelectedPages(new Set(pages.map((_, i) => i)));
  }, [pages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePage = (i) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const selectAll = () => setSelectedPages(new Set(pages.map((_, i) => i)));
  const selectNone = () => setSelectedPages(new Set());

  const visiblePageIndexes = pages.map((_, i) => i).filter((i) => selectedPages?.has(i));

  // Only sums what's actually selected to print — if some pages are
  // deselected, the printed total shouldn't silently include amounts that
  // never made it onto paper.
  const totalAmount = visiblePageIndexes.reduce((sum, i) => sum + pages[i].reduce((s, p) => s + (p.amount || 0), 0), 0);

  return (
    <div className="min-h-screen bg-ui-bg no-ruled">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .logbook-page { page-break-after: always; }
          .logbook-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-ui-brand text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          Payment log{status ? ` — ${status}` : ''} ({payments.length} entries, {pages.length} A4 page{pages.length === 1 ? '' : 's'})
        </span>
        <button
          onClick={() => window.print()}
          disabled={visiblePageIndexes.length === 0}
          className="bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:hover:bg-white/15 transition-colors rounded-sm px-4 py-1.5 text-sm"
        >
          Print {visiblePageIndexes.length ? `(${visiblePageIndexes.length} page${visiblePageIndexes.length === 1 ? '' : 's'})` : ''}
        </button>
      </div>

      {!loading && pages.length > 1 && (
        <div className="no-print max-w-[1100px] mx-auto bg-white border border-ui-line rounded-xl shadow-card mt-4 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ui-ink">Choose which pages to print</span>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-ui-brand hover:underline">Select all</button>
              <span className="text-ui-line">|</span>
              <button onClick={selectNone} className="text-ui-brand hover:underline">Select none</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pages.map((_, i) => (
              <label
                key={i}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors ${
                  selectedPages?.has(i)
                    ? 'border-ui-brand bg-ui-brand/10 text-ui-brand'
                    : 'border-ui-line bg-white text-ui-muted'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selectedPages?.has(i) || false}
                  onChange={() => togglePage(i)}
                />
                Page {i + 1}
              </label>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <Loader />
      ) : payments.length === 0 ? (
        <p className="text-ui-muted text-sm py-10 text-center">No payments match this filter.</p>
      ) : (
        pages.map((pagePayments, pageIdx) => {
          if (!selectedPages?.has(pageIdx)) return null;
          const isLastPage = pageIdx === Math.max(...visiblePageIndexes);
          return (
            <div key={pageIdx} className="logbook-page print-sheet max-w-[1100px] mx-auto bg-white text-ui-ink p-6 my-6">
              <div className="flex items-baseline justify-between mb-1">
                <div className="font-display text-2xl font-semibold">{COMPANY_NAME}</div>
                <div className="text-xs text-ui-muted font-mono">Printed {formatDateShort(new Date())}</div>
              </div>
              <div className="text-sm text-ui-muted mb-4">
                Payment log{status ? ` — status: ${status}` : ''}{method ? ` — method: ${METHOD_LABELS[method] || method}` : ''}
                {from || to ? ` — ${from || '…'} to ${to || '…'}` : ''}
                {' — '}Page {pageIdx + 1} of {pages.length}
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-ui-ink text-left">
                    <th className="py-1.5 pr-2 font-semibold">#</th>
                    <th className="py-1.5 pr-2 font-semibold">Date</th>
                    <th className="py-1.5 pr-2 font-semibold">Order No.</th>
                    <th className="py-1.5 pr-2 font-semibold">Customer</th>
                    <th className="py-1.5 pr-2 font-semibold">Phone</th>
                    <th className="py-1.5 pr-2 font-semibold">Method</th>
                    <th className="py-1.5 pr-2 font-semibold">Transaction ID</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Amount</th>
                    <th className="py-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagePayments.map((p, idx) => (
                    <tr key={p._id} className="border-b border-ui-line align-top">
                      <td className="py-1.5 pr-2 font-mono">{pageIdx * ROWS_PER_PAGE + idx + 1}</td>
                      <td className="py-1.5 pr-2">{formatDateShort(p.createdAt)}</td>
                      <td className="py-1.5 pr-2 font-mono">{p.order?.orderNumber || '—'}</td>
                      <td className="py-1.5 pr-2">{p.order?.customer?.name || '—'}</td>
                      <td className="py-1.5 pr-2 font-mono">{p.order?.customer?.phone || '—'}</td>
                      <td className="py-1.5 pr-2">{METHOD_LABELS[p.method] || p.method}</td>
                      <td className="py-1.5 pr-2 font-mono">{p.transactionId || p.gatewayReference || '—'}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{formatMoney(p.amount)}</td>
                      <td className="py-1.5 capitalize">{p.status.replace('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
                {isLastPage && (
                  <tfoot>
                    <tr className="border-t-2 border-ui-ink font-semibold">
                      <td colSpan={7} className="py-1.5 pr-2 text-right">Total (printed pages)</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{formatMoney(totalAmount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}
