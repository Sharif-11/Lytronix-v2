import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { User, MapPin, Package, Wallet, Heart } from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useCart } from '../../context/CartContext';
import { getMyOrders } from '../../api/client';

const LINKS = [
  { to: '/shop/account/profile', label: 'প্রোফাইল', icon: User },
  { to: '/shop/account/addresses', label: 'অ্যাড্রেস', icon: MapPin },
  { to: '/shop/account/orders', label: 'অর্ডার', icon: Package },
  { to: '/shop/account/payments', label: 'পেমেন্ট', icon: Wallet },
  { to: '/shop/account/saved', label: 'পছন্দের প্রোডাক্ট', icon: Heart },
];

export default function AccountLayout() {
  const { customer } = useCustomerAuth();
  const { savedIds } = useCart();
  const [orderCount, setOrderCount] = useState(null);

  useEffect(() => {
    getMyOrders()
      .then((d) => setOrderCount((d.orders || []).length))
      .catch(() => setOrderCount(null));
  }, []);

  const counts = {
    '/shop/account/orders': orderCount,
    '/shop/account/addresses': customer?.addresses?.length ?? 0,
    '/shop/account/saved': savedIds.length,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
      <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-br from-ui-brand to-ui-brandDark text-white p-4 sm:p-6 mb-4 sm:mb-6 flex items-center gap-3.5 sm:gap-6">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/15 flex items-center justify-center text-lg sm:text-xl font-display font-bold shrink-0">
          {(customer?.name || customer?.phone || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg sm:text-2xl truncate">
            {customer?.name ? `স্বাগতম, ${customer.name}` : 'আমার অ্যাকাউন্ট'}
          </h1>
          <p className="text-xs sm:text-sm text-white/70 mt-0.5 font-mono">{customer?.phone}</p>
        </div>
        <div className="hidden sm:flex gap-4 sm:gap-6 shrink-0">
          <Stat value={orderCount} label="অর্ডার" />
          <Stat value={customer?.addresses?.length ?? 0} label="অ্যাড্রেস" />
          <Stat value={savedIds.length} label="পছন্দের" />
        </div>
      </div>

      <div className="sm:grid sm:grid-cols-[13rem_1fr] sm:gap-8">
        {/* Mobile: app-style tile grid. Desktop: vertical sidebar. */}
        <nav className="grid grid-cols-3 gap-2 sm:flex sm:flex-col sm:gap-1 mb-4 sm:mb-0">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-medium text-center transition-colors sm:flex-row sm:justify-start sm:gap-2.5 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm ${
                  isActive
                    ? 'bg-ui-brand text-white'
                    : 'bg-ui-surface border border-ui-line text-ui-ink active:bg-ui-surfaceAlt sm:border-0 sm:bg-transparent sm:hover:bg-ui-surfaceAlt'
                }`
              }
            >
              <Icon size={18} className="sm:w-4 sm:h-4" />
              <span className="leading-tight">{label}</span>
              {counts[to] > 0 && (
                <span className="absolute top-1.5 right-1.5 sm:static sm:ml-auto min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-ui-brand/15 text-ui-brand text-[10px] font-mono leading-[1.1rem] text-center sm:bg-ui-brand/10">
                  {counts[to]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div className="text-center">
      <div className="font-display font-bold text-lg sm:text-xl">{value ?? '—'}</div>
      <div className="text-[11px] text-white/70">{label}</div>
    </div>
  );
}
