import { Languages } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// EN | বাং pill toggle for the whole admin panel's UI language — mirrors the
// compact style of PhoneticToggle so it slots into the same navbar row.
export default function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="inline-flex items-center gap-1.5 rounded-full border border-ui-line bg-white px-2.5 py-1.5 text-xs font-medium text-ui-muted hover:bg-ui-surfaceAlt transition-colors"
      title={language === 'en' ? 'বাংলায় দেখুন' : 'Switch to English'}
      aria-label="Toggle language"
    >
      <Languages size={13} className="text-ui-brand shrink-0" />
      <span className={language === 'en' ? 'text-ui-ink font-semibold' : ''}>EN</span>
      <span className="text-ui-faint">/</span>
      <span className={`font-bangla ${language === 'bn' ? 'text-ui-ink font-semibold' : ''}`}>বাংলা</span>
    </button>
  );
}
