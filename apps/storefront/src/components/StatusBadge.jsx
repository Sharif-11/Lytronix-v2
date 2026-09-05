import { statusStyle, statusLabel } from '../utils/format';

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full border text-xs font-medium ${statusStyle(
        status
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}
