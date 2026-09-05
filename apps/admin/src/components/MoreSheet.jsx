import { NavLink } from 'react-router-dom';
import { BookUser, Users, ShieldCheck, LogOut, X, Wallet, FolderTree, TrendingUp, UserCircle, Megaphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import PhoneticToggle from './PhoneticToggle';

export default function MoreSheet({ open, onClose }) {
  const { user, logout, hasPermission } = useAuth();
  const { t } = useLanguage();

  if (!open) return null;

  const itemClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium transition-colors ${
      isActive ? 'bg-ui-brand/10 text-ui-brand' : 'bg-ui-surfaceAlt text-ui-ink'
    }`;

  return (
    <div className="sm:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl border-t border-ui-line pb-[env(safe-area-inset-bottom)] max-h-[80vh] overflow-y-auto shadow-floating">
        <div className="w-10 h-1 bg-ui-line rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <NavLink to="/profile" onClick={onClose} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-ui-brand text-white flex items-center justify-center text-sm font-semibold relative">
              {user?.name?.[0]?.toUpperCase() || user?.phone?.[0] || '?'}
              {user?.mustChangePassword && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-ui-rust border-2 border-white" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-ui-ink">{user?.name || user?.phone}</p>
              <p className="text-xs text-ui-faint">{user?.role?.name}</p>
            </div>
          </NavLink>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-ui-muted bg-ui-surfaceAlt" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 pb-3">
          <div className="flex flex-wrap gap-2">
            <PhoneticToggle compact />
          </div>
        </div>

        <div className="px-5 pb-6 space-y-2">
          <NavLink to="/profile" onClick={onClose} className={itemClass}>
            <UserCircle size={18} /> {t('nav.myProfile')}
          </NavLink>
          <NavLink to="/customers" onClick={onClose} className={itemClass}>
            <BookUser size={18} /> {t('nav.customers')}
          </NavLink>
          {hasPermission('customers:manage') && (
            <NavLink to="/marketing" onClick={onClose} className={itemClass}>
              <Megaphone size={18} /> {t('nav.marketing')}
            </NavLink>
          )}
          {hasPermission('categories:manage') && (
            <NavLink to="/categories" onClick={onClose} className={itemClass}>
              <FolderTree size={18} /> {t('nav.categories')}
            </NavLink>
          )}
          {hasPermission('analytics:view') && (
            <NavLink to="/analytics" onClick={onClose} className={itemClass}>
              <TrendingUp size={18} /> {t('nav.analytics')}
            </NavLink>
          )}
          {hasPermission('payments:manage') && (
            <NavLink to="/payments" onClick={onClose} className={itemClass}>
              <Wallet size={18} /> {t('nav.payments')}
            </NavLink>
          )}
          {hasPermission('users:manage') && (
            <NavLink to="/staff" onClick={onClose} className={itemClass}>
              <Users size={18} /> {t('nav.staff')}
            </NavLink>
          )}
          {hasPermission('roles:manage') && (
            <NavLink to="/roles" onClick={onClose} className={itemClass}>
              <ShieldCheck size={18} /> {t('nav.roles')}
            </NavLink>
          )}
          <button
            onClick={() => { onClose(); logout(); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-ui-rust bg-red-50"
          >
            <LogOut size={18} /> {t('common.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
