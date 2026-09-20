import { statusStyle } from '../utils/format';

// The courier's own raw status (Steadfast), shown beside OUR status in admin
// views only — customers never see it.
export function CourierStatus({ status }) {
  if (!status) return null;
  return (
    <span
      title="Status reported by the courier"
      className="inline-block px-2 py-0.5 rounded-full border border-dashed border-ui-line text-[11px] font-medium text-ui-muted"
    >
      Courier: {String(status).replace(/_/g, ' ')}
    </span>
  );
}

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full border text-xs font-medium uppercase tracking-wide ${statusStyle(
        status
      )}`}
    >
      {status}
    </span>
  );
}
