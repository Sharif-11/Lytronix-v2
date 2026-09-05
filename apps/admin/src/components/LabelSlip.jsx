import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import { formatMoney, formatDateShort } from '../utils/format';
import { COMPANY_NAME, COMPANY_PHONE } from '../utils/company';
import logoSrc from '../assets/lytronix-logo.png';

// The Steadfast merchant account these labels print under.
export const MERCHANT_ID = 'TW0UBIVG';

// Die-cut / fanfold courier label sizes (inches). The printer's own driver
// handles the physical media size; this just needs @page to match so nothing
// is cropped or left with huge blank margins. `fontScale` shrinks everything
// proportionally so the same layout fits every stock.
export const LABEL_SIZES = {
  '2x3': { label: '2" x 3"', widthIn: 2, heightIn: 3, fontScale: 0.7 },
  '3x3': { label: '3" x 3"', widthIn: 3, heightIn: 3, fontScale: 0.85 },
  '3x5': { label: '3" x 5"', widthIn: 3, heightIn: 5, fontScale: 0.95 },
  '4x6': { label: '4" x 6"', widthIn: 4, heightIn: 6, fontScale: 1.12 },
};

// The default label size.
export const DEFAULT_LABEL_SIZE = '2x3';

export function labelPageCss(sizeKey) {
  const s = LABEL_SIZES[sizeKey] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
  return `@page { size: ${s.widthIn}in ${s.heightIn}in; margin: 2mm; }`;
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${p(h)}:${p(
    d.getMinutes()
  )}${ampm}`;
}

// Plain grouped number, no currency symbol — for the tight item/price lines.
const num = (n) => (Number(n) || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 });

/**
 * One printable courier/parcel label, modelled on Steadfast's own default
 * label. The SF-ID (Steadfast consignment id) barcode + QR only appear once
 * the parcel has actually been booked with Steadfast — an unbooked order
 * prints the same label minus that block.
 */
export default function LabelSlip({ order, sizeKey = DEFAULT_LABEL_SIZE, merchantId = MERCHANT_ID }) {
  const barcodeRef = useRef(null);
  const size = LABEL_SIZES[sizeKey] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
  const fs = size.fontScale;

  // SF-ID = the Steadfast consignment id. Only present after booking.
  const sfId = order?.courier?.consignmentId ? String(order.courier.consignmentId) : '';

  useEffect(() => {
    if (sfId && barcodeRef.current) {
      JsBarcode(barcodeRef.current, sfId, {
        format: 'CODE128',
        width: 1.2 * fs,
        height: 40 * fs,
        displayValue: false,
        margin: 0,
        background: 'transparent',
      });
    }
  }, [sfId, sizeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return null;
  const c = order.customer;
  const p = order.pricing;
  const baseFont = 11 * fs;
  const tinyFont = Math.max(6, 7 * fs); // items + price breakdown — never below 6px so thermal print stays legible

  // Total already paid up front = the advance field + every logged payment
  // entry. Shown on the label as "(-) Advance paid", and subtracted from the
  // grand total to get the COD figure the courier collects. Steadfast's own
  // figure wins once the parcel is booked. Not floored — if more has been
  // paid than the order is worth, COD legitimately prints negative.
  const advancePaidTotal =
    (p.advancePaid || 0) + (order.payments || []).reduce((sum, pmt) => sum + (pmt.amount || 0), 0);
  const codAmount =
    order.courier?.codAmount != null ? order.courier.codAmount : p.grandTotal - advancePaidTotal;
  const area = [c.thana, c.zilla].filter(Boolean).join(', ') || '—';

  return (
    <div
      className="label-slip print-sheet mx-auto bg-white text-black font-mono border border-ui-line"
      style={{
        width: `${size.widthIn}in`,
        height: `${size.heightIn}in`,
        fontSize: `${baseFont}px`,
        lineHeight: 1.25,
        padding: `${6 * fs}px ${8 * fs}px`,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Header: brand + merchant id */}
      <div className="flex flex-col items-center text-center">
        <img src={logoSrc} alt={COMPANY_NAME} style={{ width: '55%', maxWidth: 160 }} />
        <div style={{ fontSize: `${8 * fs}px`, marginTop: 1 }}>
          Merchant ID: <b>{merchantId || '—'}</b> · {COMPANY_PHONE}
        </div>
      </div>

      {/* SF-ID barcode + QR — only once booked with Steadfast */}
      {sfId && (
        <>
          <Hr thick fs={fs} />
          <div style={{ display: 'flex', alignItems: 'center', gap: `${6 * fs}px` }}>
            <QRCodeSVG value={sfId} size={44 * fs} level="M" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
              <svg ref={barcodeRef} style={{ width: '100%', height: `${40 * fs}px` }} />
              <div style={{ fontSize: `${13 * fs}px`, fontWeight: 800, letterSpacing: '0.06em' }}>{sfId}</div>
            </div>
          </div>
        </>
      )}

      <Hr thick fs={fs} />

      {/* Meta */}
      <Row label="Invoice" value={order.orderNumber} bold fs={fs} />
      <Row label="SF-ID" value={sfId || '(not booked)'} fs={fs} />
      <Row label="Date" value={formatDateShort(order.createdAt)} fs={fs} />

      <Hr thick fs={fs} />

      {/* Recipient — everything bold so the courier reads it at a glance */}
      <div style={{ fontWeight: 700 }}>
        <Row label="Name" value={c.name} bold fs={fs} />
        <Row label="Phone" value={c.phone} bold fs={fs} />
        <div style={{ marginTop: 1 }}>
          <span style={{ color: '#333' }}>Address: </span>
          {c.address || '—'}
        </div>
        <Row label="Area" value={area} bold fs={fs} />
      </div>

      <Hr thick fs={fs} />

      {/* Cash on delivery — the loudest thing on the label */}
      <div style={{ textAlign: 'center', padding: `${2 * fs}px 0` }}>
        <div
          style={{
            fontSize: `${8 * fs}px`,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Cash On Delivery
        </div>
        <div style={{ fontSize: `${22 * fs}px`, fontWeight: 900, lineHeight: 1.1 }}>{formatMoney(codAmount)}</div>
      </div>

      <Hr thick fs={fs} />

      {/* Items — one very small line each: name · qty × unit · line total */}
      <div style={{ fontSize: `${tinyFont}px`, lineHeight: 1.35 }}>
        <div style={{ display: 'flex', gap: `${4 * fs}px`, color: '#555', fontWeight: 700 }}>
          <span style={{ flex: 1, minWidth: 0 }}>Item</span>
          <span style={{ width: `${52 * fs}px`, textAlign: 'right' }}>Qty×Unit</span>
          <span style={{ width: `${40 * fs}px`, textAlign: 'right' }}>Total</span>
        </div>
        {order.items.map((it, idx) => (
          <div key={idx} style={{ display: 'flex', gap: `${4 * fs}px` }}>
            <span
              style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {it.name}
            </span>
            <span style={{ width: `${52 * fs}px`, textAlign: 'right' }}>
              {it.quantity}×{num(it.unitPrice)}
            </span>
            <span style={{ width: `${40 * fs}px`, textAlign: 'right' }}>{num(it.totalPrice)}</span>
          </div>
        ))}
      </div>

      <Hr fs={fs} />

      {/* Price breakdown — small text */}
      <div style={{ fontSize: `${tinyFont}px`, lineHeight: 1.35 }}>
        <PriceRow label="Subtotal" value={num(p.subtotal)} />
        {p.discount > 0 && <PriceRow label="Discount" value={`-${num(p.discount)}`} />}
        <PriceRow label="Delivery charge" value={num(p.deliveryCharge)} />
        <PriceRow label="Amount to pay" value={num(p.grandTotal)} bold />
        {advancePaidTotal > 0 && <PriceRow label="(-) Advance paid" value={`-${num(advancePaidTotal)}`} />}
      </div>

      <Hr fs={fs} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: `${7 * fs}px`,
          color: '#555',
        }}
      >
        <span>Printed: {nowStamp()}</span>
        <span>steadfast.com.bd</span>
      </div>
    </div>
  );
}

function Hr({ thick, fs = 1 }) {
  return <div style={{ borderTop: thick ? '1.5px solid #000' : '1px dashed #999', margin: `${3 * fs}px 0` }} />;
}

function Row({ label, value, bold, fs = 1 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: `${6 * fs}px`, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? undefined : '#333', flexShrink: 0 }}>{label}:</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function PriceRow({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? undefined : '#555' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
