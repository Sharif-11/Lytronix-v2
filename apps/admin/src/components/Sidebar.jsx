import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, PlusCircle, Package, FolderTree, TrendingUp, BookUser, Users,
  ShieldCheck, LogOut, Wallet, Megaphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import logoMark from '../assets/lytronix-mark.png';

const NAV_SECTIONS = [
  {
    labelKey: null,
    items: [{ to: '/', end: true, labelKey: 'nav.dashboard', icon: LayoutDashboard }],
  },
  {
    labelKey: 'nav.sales',
    items: [
      { to: '/orders', end: true, labelKey: 'nav.orders', icon: ClipboardList },
      { to: '/orders/new', end: false, labelKey: 'nav.newOrder', icon: PlusCircle, permission: 'orders:manage' },
      { to: '/payments', end: false, labelKey: 'nav.payments', icon: Wallet, permission: 'payments:manage' },
      { to: '/customers', end: false, labelKey: 'nav.customers', icon: BookUser, permission: 'customers:manage' },
      { to: '/marketing', end: false, labelKey: 'nav.marketing', icon: Megaphone, permission: 'customers:manage' },
    ],
  },
  {
    labelKey: 'nav.catalogue',
    items: [
      { to: '/products', end: false, labelKey: 'nav.products', icon: Package },
      { to: '/categories', end: false, labelKey: 'nav.categories', icon: FolderTree, permission: 'categories:manage' },
    ],
  },
  {
    labelKey: 'nav.insights',
    items: [
      { to: '/analytics', end: false, labelKey: 'nav.analytics', icon: TrendingUp, permission: 'analytics:view' },
    ],
  },
  {
    labelKey: 'nav.administration',
    items: [
      { to: '/staff', end: false, labelKey: 'nav.staff', icon: Users, permission: 'users:manage' },
      { to: '/roles', end: false, labelKey: 'nav.roles', icon: ShieldCheck, permission: 'roles:manage' },
    ],
  },
];

// Dark chrome echoes the logo's black badge; the brand green marks the
// active/interactive state. Content area (App.jsx) stays light so tables
// and forms remain easy to read.
export default function Sidebar() {
  const { user, logout, hasPermission } = useAuth();
  const { t } = useLanguage();

  return (
    <aside className="hidden sm:flex sm:flex-col w-64 shrink-0 h-screen sticky top-0 bg-ui-dark text-white">
      <div className="h-16 px-5 flex items-center gap-2.5 border-b border-ui-darkLine">
        <img src={logoMark} alt="Lytronix" className="w-9 h-9 shrink-0" />
        <div className="min-w-0">
          <p className="font-display font-bold text-[15px] text-white leading-tight tracking-tight">Lytronix</p>
          <p className="text-[11px] text-white/40 leading-tight">{t('nav.consoleSubtitle')}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section, i) => {
          const items = section.items.filter((it) => !it.permission || hasPermission(it.permission));
          if (items.length === 0) return null;
          return (
            <div key={i}>
              {section.labelKey && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">
                  {t(section.labelKey)}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map(({ to, end, labelKey, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-ui-brand text-white'
                          : 'text-white/70 hover:bg-ui-darkAlt hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={18} strokeWidth={isActive ? 2.3 : 1.9} className={isActive ? 'text-white' : 'text-white/40 group-hover:text-white/70'} />
                        {t(labelKey)}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-3 pb-2">
        <LanguageToggle />
      </div>

      {user && (
        <div className="border-t border-ui-darkLine p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-ui-darkAlt transition-colors">
            <Link to="/profile" className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-full bg-ui-brand text-white flex items-center justify-center text-sm font-semibold shrink-0 relative">
                {user.name?.[0]?.toUpperCase() || user.phone?.[0] || '?'}
                {user.mustChangePassword && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-ui-rust border-2 border-ui-dark" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{user.name || user.phone}</p>
                <p className="text-xs text-white/40 truncate">{user.role?.name}</p>
              </div>
            </Link>
            <button
              onClick={logout}
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              aria-label={t('common.logout')}
              title={t('common.logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
