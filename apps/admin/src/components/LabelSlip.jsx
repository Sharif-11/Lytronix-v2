import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { formatMoney, formatDateShort } from '../utils/format';
import { COMPANY_NAME, COMPANY_PHONE } from '../utils/company';
import logoSrc from '../assets/lytronix-logo.png';

// Label size presets. "roll" is the original continuous 4" thermal-roll
// receipt (auto height, grows with content). The rest are common
// die-cut/fanfold courier label sizes (inches) for a thermal POS/label
// printer — the printer's own driver handles the physical media size;
// this just needs @page to match so nothing gets cropped or left with
// huge blank margins.
export const LABEL_SIZES = {
  '3x5': { label: '3" x 5"', widthIn: 3, heightIn: 5, fontScale: 0.9 },
  '2x3': { label: '2" x 3"', widthIn: 2, heightIn: 3, fontScale: 0.72 },
  '2x5': { label: '2" x 5"', widthIn: 2, heightIn: 5, fontScale: 0.78 },
  '3x3': { label: '3" x 3"', widthIn: 3, heightIn: 3, fontScale: 0.82 },
  '3.75x5': { label: '3.75" x 5"', widthIn: 3.75, heightIn: 5, fontScale: 1 },
  roll: { label: '4" roll (auto height)', widthIn: 4, heightIn: null, fontScale: 1 },
};

// The default label size — matches the most common courier label stock.
export const DEFAULT_LABEL_SIZE = '3x5';

export function labelPageCss(sizeKey) {
  const s = LABEL_SIZES[sizeKey] || LABEL_SIZES.roll;
  const size = s.heightIn ? `${s.widthIn}in ${s.heightIn}in` : `${s.widthIn}in auto`;
  return `@page { size: ${size}; margin: 2mm; }`;
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

/**
 * One printable courier/parcel label. Mirrors the fields on Steadfast's own
 * default label (Merchant ID, SF-ID / consignment number + barcode, Invoice,
 * Delivery type, Weight, Area, COD amount, "printed" stamp) and keeps our
 * item / price breakdown below it.
 */
export default function LabelSlip({ order, sizeKey = 'roll', merchantId = '' }) {
  const barcodeRef = useRef(null);
  const size = LABEL_SIZES[sizeKey] || LABEL_SIZES.roll;

  const consignmentId = order?.courier?.consignmentId || null;
  const trackingCode = order?.courier?.trackingCode || '';
  // Steadfast prints the consignment id as the big number + barcode; before a
  // parcel is booked we fall back to our own tracking id so the label still
  // scans.
  const bigNumber = consignmentId ? String(consignmentId) : order?.trackingId || '';
  const barcodeValue = trackingCode || bigNumber;

  useEffect(() => {
    if (order && barcodeRef.current && barcodeValue) {
      JsBarcode(barcodeRef.current, barcodeValue, {
        format: 'CODE128',
        width: 1.1 * size.fontScale,
        height: 34 * size.fontScale,
        displayValue: true,
        fontSize: 10 * size.fontScale,
        margin: 0,
        background: 'transparent',
      });
    }
  }, [order, sizeKey, barcodeValue]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return null;
  const c = order.customer;
  const p = order.pricing;
  const baseFont = 11 * size.fontScale;
  const codAmount = order.courier?.codAmount ?? p.due;
  const area = [c.thana, c.zilla].filter(Boolean).join(', ') || '—';
  const weight = order.weightKg ? `${order.weightKg} KG` : '—';

  return (
    <div
      className="label-slip print-sheet mx-auto bg-white text-black font-mono border border-ui-line"
      style={{
        width: `${size.widthIn}in`,
        height: size.heightIn ? `${size.heightIn}in` : 'auto',
        fontSize: `${baseFont}px`,
        lineHeight: 1.3,
        padding: `${6 * size.fontScale}px ${8 * size.fontScale}px`,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Header: brand + merchant id */}
      <div className="flex flex-col items-center text-center">
        <img src={logoSrc} alt={COMPANY_NAME} style={{ width: '58%', maxWidth: 170 }} />
        <div style={{ fontSize: `${8.5 * size.fontScale}px`, marginTop: 1 }}>
          Merchant ID: {merchantId || '—'} · {COMPANY_PHONE}
        </div>
      </div>

      <Hr thick />

      {/* Big SF-ID / consignment number + barcode */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: `${17 * size.fontScale}px`, fontWeight: 800, letterSpacing: '0.04em' }}>
          {bigNumber || '—'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 1 }}>
          <svg ref={barcodeRef} />
        </div>
      </div>

      <Hr />

      {/* Steadfast-style meta grid */}
      <Row label="Invoice" value={order.orderNumber} bold />
      <Row label="SF-ID" value={consignmentId ? String(consignmentId) : '(not booked)'} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Delivery: <b>Home</b></span>
        <span>Weight: <b>{weight}</b></span>
      </div>
      <Row label="Date" value={formatDateShort(order.createdAt)} />

      <Hr thick />

      {/* Recipient */}
      <Row label="Name" value={c.name} bold />
      <Row label="Phone" value={c.phone} bold />
      <div style={{ marginTop: 2 }}>
        <div style={{ color: '#444', fontSize: `${8.5 * size.fontScale}px` }}>Address:</div>
        <div>{c.address || '—'}</div>
      </div>
      <Row label="Area" value={area} />

      <Hr thick />

      {/* Cash on delivery — prominent, like Steadfast's label */}
      <div style={{ textAlign: 'center', padding: '2px 0' }}>
        <div
          style={{
            fontSize: `${8.5 * size.fontScale}px`,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Cash On Delivery
        </div>
        <div style={{ fontSize: `${18 * size.fontScale}px`, fontWeight: 800 }}>{formatMoney(codAmount)}</div>
      </div>

      <Hr thick />

      {/* Items + price breakdown (kept from our own label) */}
      {order.items.map((it, idx) => (
        <div key={idx} style={{ marginBottom: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>{it.name}</span>
            <span>{formatMoney(it.totalPrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#444' }}>
            <span>
              {it.quantity} x {formatMoney(it.unitPrice)}
            </span>
            {it.discount > 0 && <span>-discount {formatMoney(it.discount)}</span>}
          </div>
        </div>
      ))}

      <Hr />

      <Row label="Overall price" value={formatMoney(p.subtotal)} />
      {p.discount > 0 && <Row label="Discount" value={`-${formatMoney(p.discount)}`} />}
      <Row label="Delivery charge" value={formatMoney(p.deliveryCharge)} />
      <Row label="Amount to pay" value={formatMoney(p.grandTotal)} bold />
      {p.advancePaid > 0 && <Row label="(-) Advance paid" value={`-${formatMoney(p.advancePaid)}`} />}

      {order.courierTrackingLink && (
        <>
          <Hr />
          <div style={{ fontSize: `${8.5 * size.fontScale}px` }}>
            <div style={{ color: '#444' }}>Courier tracking:</div>
            <div style={{ wordBreak: 'break-all' }}>{order.courierTrackingLink}</div>
          </div>
        </>
      )}

      <Hr />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: `${8 * size.fontScale}px`,
          color: '#444',
        }}
      >
        <span>Printed: {nowStamp()}</span>
        <span>steadfast.com.bd</span>
      </div>
      <div style={{ textAlign: 'right', fontSize: `${8.5 * size.fontScale}px`, marginTop: 2 }}>
        Sign: ________
      </div>
    </div>
  );
}

function Hr({ thick }) {
  return <div style={{ borderTop: thick ? '2px solid #000' : '1px dashed #999', margin: '3px 0' }} />;
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
      <span>{label}:</span>
      <span>{value}</span>
    </div>
  );
}
