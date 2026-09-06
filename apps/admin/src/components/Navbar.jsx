import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Wallet, Menu } from 'lucide-react';
import { getSteadfastBalance } from '../api/client';
import { formatMoney } from '../utils/format';
import PhoneticToggle from './PhoneticToggle';
import LanguageToggle from './LanguageToggle';
import NotificationBell from './NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import logoMark from '../assets/lytronix-mark.png';

// Page titles resolve through t() (see below) rather than hard-coded English
// strings, so the top bar's heading follows the language toggle too. Routes
// not covered here (order/product/customer editors) just show a blank
// heading on desktop — unchanged from before this list existed.
const PAGE_TITLES = [
  { match: /^\/$/, key: 'nav.dashboard' },
  { match: /^\/orders\/new/, key: 'nav.newOrder' },
  { match: /^\/orders\/[^/]+\/edit/, key: 'nav.orders' },
  { match: /^\/orders\/[^/]+/, key: 'nav.orders' },
  { match: /^\/orders/, key: 'nav.orders' },
  { match: /^\/products/, key: 'nav.products' },
  { match: /^\/categories/, key: 'nav.categories' },
  { match: /^\/analytics/, key: 'nav.analytics' },
  { match: /^\/payments/, key: 'nav.payments' },
  { match: /^\/customers/, key: 'nav.customers' },
  { match: /^\/marketing/, key: 'nav.marketing' },
  { match: /^\/messages/, key: 'nav.messages' },
  { match: /^\/chat/, key: 'nav.chat' },
  { match: /^\/staff/, key: 'nav.staff' },
  { match: /^\/roles/, key: 'nav.roles' },
  { match: /^\/profile/, key: 'nav.myProfile' },
];

function titleKeyFor(pathname) {
  return PAGE_TITLES.find((p) => p.match.test(pathname))?.key || '';
}

// Top bar: shows current section + quick context (courier balance) on
// desktop, and a compact brand + menu trigger on mobile. Navigation itself
// lives in the Sidebar (desktop) / bottom tabs (mobile).
export default function Navbar({ onOpenMore }) {
  const [balance, setBalance] = useState(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  useEffect(() => {
    getSteadfastBalance().then((d) => setBalance(d.balance)).catch(() => {});
  }, []);

  const titleKey = titleKeyFor(location.pathname);

  return (
    <header className="h-16 border-b border-ui-line bg-white/80 backdrop-blur sticky top-0 z-20 flex items-center px-4 sm:px-6 gap-3">
      <div className="flex items-center gap-2 sm:hidden">
        <img src={logoMark} alt="Lytronix" className="w-8 h-8" />
        <span className="font-display font-bold text-ui-ink">Lytronix</span>
      </div>

      <h1 className="hidden sm:block font-display font-bold text-lg text-ui-ink truncate">
        {titleKey ? t(titleKey) : ''}
      </h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="hidden lg:block">
          <LanguageToggle />
        </div>

        <div className="hidden md:block">
          <PhoneticToggle compact />
        </div>

        {balance !== null && (
          <span className="flex items-center gap-1.5 text-xs font-mono font-medium text-ui-muted bg-ui-surfaceAlt border border-ui-line rounded-full px-3 py-1.5">
            <Wallet size={13} className="text-ui-brand" />
            <span className="hidden sm:inline">Steadfast</span> {formatMoney(balance)}
          </span>
        )}

        <NotificationBell />

        {user && (
          <div className="hidden sm:flex w-9 h-9 rounded-full bg-ui-brand text-white items-center justify-center text-sm font-semibold">
            {user.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}

        <button
          onClick={onOpenMore}
          className="sm:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-ui-line text-ui-ink bg-white"
          aria-label="More menu"
        >
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
}
