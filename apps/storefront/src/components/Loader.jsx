import Spinner from './Spinner';

// Centred loading state for a whole page/route or a panel. Replaces bare
// "লোড হচ্ছে…" text so every waiting state looks the same across the store.
//   <Loader />                       full-page
//   <Loader inline />                compact, left-aligned (in-panel / list)
//   <Loader label="অর্ডার আনা হচ্ছে…" />
export default function Loader({ label = 'লোড হচ্ছে…', inline = false, className = '' }) {
  if (inline) {
    return (
      <div className={`flex items-center gap-2 text-sm text-ui-muted ${className}`}>
        <Spinner size={16} className="text-ui-brand" />
        {label && <span>{label}</span>}
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-20 sm:py-24 text-ui-muted ${className}`}
    >
      <Spinner size={30} stroke={3} className="text-ui-brand" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
