import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);
const LS_KEY = 'lytronix:lang';

function interpolate(str, vars) {
  if (!vars) return str;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    str
  );
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === 'bn' ? 'bn' : 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LS_KEY, lang);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'bn' : 'en');
  }, [language, setLanguage]);

  // Reflect the active language on <html> so the browser picks the right
  // font/line-height for Bangla and screen readers announce it correctly.
  useEffect(() => {
    document.documentElement.lang = language === 'bn' ? 'bn' : 'en';
  }, [language]);

  // t('nav.orders') or t('dashboard.inProgress', { n: 3 }) for simple
  // {placeholder} interpolation. Falls back to English, then the raw key —
  // never throws, so a missing translation just reads oddly instead of
  // crashing the page.
  const t = useCallback(
    (key, vars) => {
      const dict = translations[language] || translations.en;
      const str = dict[key] ?? translations.en[key] ?? key;
      return interpolate(str, vars);
    },
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage, t }), [language, setLanguage, toggleLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
