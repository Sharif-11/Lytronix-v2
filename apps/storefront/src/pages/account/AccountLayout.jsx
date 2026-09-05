import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { User, MapPin, Package, Wallet, Heart, LogOut } from 'lucide-react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useCart } from '../../context/CartContext';
import { getMyOrders } from '../../api/client';

const LINKS = [
  { to: '/shop/account/profile', label: 'প্রোফাইল', icon: User },
  { to: '/shop/account/addresses', label: 'ঠিকানা', icon: MapPin },
  { to: '/shop/account/orders', label: 'অর্ডার', icon: Package },
  { to: '/shop/account/payments', label: 'পেমেন্ট', icon: Wallet },
  { to: '/shop/account/saved', label: 'পছন্দের পণ্য', icon: Heart },
];

export default function AccountLayout() {
  const { customer, logout } = useCustomerAuth();
  const { savedIds } = useCart();
  const navigate = useNavigate();
  const [orderCount, setOrderCount] = useState(null);

  useEffect(() => {
    getMyOrders()
      .then((d) => setOrderCount((d.orders || []).length))
      .catch(() => setOrderCount(null));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="rounded-2xl bg-gradient-to-br from-ui-brand to-ui-brandDark text-white p-5 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-xl font-display font-bold shrink-0">
          {(customer?.name || customer?.phone || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl sm:text-2xl">
            {customer?.name ? `স্বাগতম, ${customer.name}` : 'আমার অ্যাকাউন্ট'}
          </h1>
          <p className="text-sm text-white/70 mt-0.5 font-mono">{customer?.phone}</p>
        </div>
        <div className="flex gap-4 sm:gap-6 shrink-0">
          <Stat value={orderCount} label="অর্ডার" />
          <Stat value={customer?.addresses?.length ?? 0} label="ঠিকানা" />
          <Stat value={savedIds.length} label="পছন্দের পণ্য" />
        </div>
      </div>

      <div className="sm:grid sm:grid-cols-[13rem_1fr] sm:gap-8">
        <nav className="flex sm:flex-col gap-1 overflow-x-auto pb-2 sm:pb-0 mb-4 sm:mb-0">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'bg-ui-brand text-white' : 'text-ui-ink hover:bg-ui-surfaceAlt'
                }`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
          <button
            onClick={() => {
              logout();
              navigate('/shop');
            }}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ui-rust hover:bg-red-50 whitespace-nowrap"
          >
            <LogOut size={16} /> লগ আউট
          </button>
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
