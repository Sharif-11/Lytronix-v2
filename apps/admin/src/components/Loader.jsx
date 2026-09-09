import Spinner from './Spinner';
import { useLanguage } from '../context/LanguageContext';

// Centred loading state for a whole page/route or a panel. Replaces bare
// "Loading…" text so every waiting state looks the same across the admin.
//   <Loader />                      full-page (uses the i18n common.loading label)
//   <Loader inline />               compact, left-aligned (in-panel / list)
//   <Loader label="Booking parcel…" />
export default function Loader({ label, inline = false, className = '' }) {
  const { t } = useLanguage();
  const text = label ?? t('common.loading');

  if (inline) {
    return (
      <div className={`flex items-center gap-2 text-sm text-ui-muted ${className}`}>
        <Spinner size={16} className="text-ui-brand" />
        {text && <span>{text}</span>}
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-20 sm:py-24 text-ui-muted ${className}`}
    >
      <Spinner size={30} stroke={3} className="text-ui-brand" />
      {text && <p className="text-sm">{text}</p>}
    </div>
  );
}
