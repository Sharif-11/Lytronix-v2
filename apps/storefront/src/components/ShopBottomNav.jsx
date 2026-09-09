import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Grid3x3, ShoppingBag, User, Package } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { hasGuestSession, GUEST_SESSION_EVENT } from '../lib/guestOrders';

const BASE_TABS = [
  { to: '/shop', label: 'শপ', icon: Home, end: true },
  { to: '/shop/products', label: 'প্রোডাক্ট', icon: Grid3x3 },
  { to: '/shop/cart', label: 'কার্ট', icon: ShoppingBag, badge: true },
];

export default function ShopBottomNav() {
  const { count } = useCart();
  const { isAuthed } = useCustomerAuth();
  const [guestOrders, setGuestOrders] = useState(false);

  useEffect(() => {
    const sync = () => setGuestOrders(hasGuestSession());
    sync();
    window.addEventListener(GUEST_SESSION_EVENT, sync);
    return () => window.removeEventListener(GUEST_SESSION_EVENT, sync);
  }, []);

  const tabs = [...BASE_TABS];
  if (!isAuthed && guestOrders) {
    tabs.push({ to: '/shop/my-orders', label: 'অর্ডার', icon: Package });
  }
  tabs.push(
    isAuthed
      ? { to: '/shop/account', label: 'অ্যাকাউন্ট', icon: User }
      : { to: '/shop/login', label: 'লগইন', icon: User }
  );

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-ui-line pb-[env(safe-area-inset-bottom)]">
      <div className={`grid ${tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {tabs.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                isActive ? 'text-ui-brand' : 'text-ui-muted'
              }`
            }
          >
            <span className="relative">
              <Icon size={20} />
              {badge && count > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[1rem] h-4 px-1 rounded-full bg-ui-brand text-white text-[9px] font-mono leading-4 text-center">
                  {count}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
