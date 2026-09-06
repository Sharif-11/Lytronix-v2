// A thin circular progress ring — no number, just the arc filling up.
// While `value` is 0 (upload started, no bytes reported yet) it spins as a
// quarter-arc so the control never looks frozen; once real progress arrives
// it becomes a determinate ring.
export default function ProgressRing({ value = 0, size = 20, stroke = 2.5, className = '' }) {
  const pct = Math.max(0, Math.min(100, value));
  const indeterminate = pct <= 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = indeterminate ? circ * 0.75 : circ * (1 - pct / 100);
  const mid = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`${indeterminate ? 'animate-spin' : ''} ${className}`}
      role="progressbar"
      aria-label="Uploading"
    >
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth={stroke} />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${mid} ${mid})`}
        style={{ transition: indeterminate ? 'none' : 'stroke-dashoffset 0.2s linear' }}
      />
    </svg>
  );
}
