// Circular spinner — a faint full ring with a bright ~270° arc rotating over
// it. Uses `currentColor`, so colour it via a text-* class on the element or
// a parent. Visual language matches ProgressRing's track+arc.
export default function Spinner({ size = 20, stroke = 2.5, className = '' }) {
  const r = (24 - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      role="status"
      aria-label="লোড হচ্ছে"
    >
      <circle cx="12" cy="12" r={r} stroke="currentColor" strokeOpacity="0.2" strokeWidth={stroke} />
      <circle
        cx="12"
        cy="12"
        r={r}
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * 0.75}
      />
    </svg>
  );
}
