import { NavLink } from 'react-router-dom';
import { Home, Grid3x3, ShoppingBag, User } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';

const TABS = [
  { to: '/shop', label: 'শপ', icon: Home, end: true },
  { to: '/shop?category=', label: 'বিভাগ', icon: Grid3x3 },
  { to: '/shop/cart', label: 'কার্ট', icon: ShoppingBag, badge: true },
];

export default function ShopBottomNav() {
  const { count } = useCart();
  const { isAuthed } = useCustomerAuth();

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-ui-line pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {TABS.map(({ to, label, icon: Icon, end, badge }) => (
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
        <NavLink
          to={isAuthed ? '/shop/account' : '/shop/login'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
              isActive ? 'text-ui-brand' : 'text-ui-muted'
            }`
          }
        >
          <User size={20} />
          {isAuthed ? 'অ্যাকাউন্ট' : 'সাইন ইন'}
        </NavLink>
      </div>
    </nav>
  );
}
