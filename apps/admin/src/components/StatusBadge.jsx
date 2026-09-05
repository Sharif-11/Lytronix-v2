import { statusStyle } from '../utils/format';

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
