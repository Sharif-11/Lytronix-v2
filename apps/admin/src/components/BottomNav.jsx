import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, PlusCircle, Package, Menu } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const tabs = [
  { to: '/', end: true, labelKey: 'nav.home', icon: LayoutDashboard },
  { to: '/orders', end: true, labelKey: 'nav.orders', icon: ClipboardList },
  { to: '/orders/new', end: false, labelKey: 'nav.new', icon: PlusCircle, primary: true },
  { to: '/products', end: false, labelKey: 'nav.catalogue', icon: Package },
];

export default function BottomNav({ onOpenMore }) {
  const { t } = useLanguage();

  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-ui-line pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.06)]"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5 h-16">
        {tabs.map(({ to, end, labelKey, icon: Icon, primary }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform"
          >
            {({ isActive }) =>
              primary ? (
                <div
                  className={`w-11 h-11 -mt-5 rounded-2xl flex items-center justify-center shadow-raised transition-colors duration-200 ${
                    isActive ? 'bg-ui-brandDark' : 'bg-ui-brand'
                  }`}
                >
                  <Icon size={22} className="text-white" strokeWidth={2.2} />
                </div>
              ) : (
                <>
                  <span
                    className={`flex items-center justify-center w-11 h-7 rounded-full transition-colors duration-200 ${
                      isActive ? 'bg-ui-brand/10' : ''
                    }`}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} className={isActive ? 'text-ui-brand' : 'text-ui-faint'} />
                  </span>
                  <span className={`text-[10px] tracking-wide transition-colors duration-200 ${isActive ? 'text-ui-brand font-semibold' : 'text-ui-faint'}`}>
                    {t(labelKey)}
                  </span>
                </>
              )
            }
          </NavLink>
        ))}
        <button
          onClick={onOpenMore}
          className="flex flex-col items-center justify-center gap-0.5 text-ui-faint active:scale-90 transition-transform"
        >
          <span className="flex items-center justify-center w-11 h-7 rounded-full">
            <Menu size={20} strokeWidth={1.8} />
          </span>
          <span className="text-[10px] tracking-wide">{t('nav.more')}</span>
        </button>
      </div>
    </nav>
  );
}
