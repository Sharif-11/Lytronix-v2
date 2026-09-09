import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Heart, User, LogOut, Package, ChevronDown, Search, Phone, Truck, Banknote,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { getCategories } from '../api/client';
import { hasGuestSession, GUEST_SESSION_EVENT } from '../lib/guestOrders';
import { COMPANY_PHONE } from '../utils/company';
import logo from '../assets/lytronix-logo.png';

export default function StorefrontHeader() {
  const { count, savedIds } = useCart();
  const { customer, isAuthed, logout } = useCustomerAuth();
  const navigate = useNavigate();
  const [cats, setCats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [q, setQ] = useState('');
  const [guestOrders, setGuestOrders] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    getCategories().then((d) => setCats(d.tree || [])).catch(() => setCats([]));
  }, []);

  // Show a "My orders" shortcut for guests who have ordered from this device.
  useEffect(() => {
    const sync = () => setGuestOrders(hasGuestSession());
    sync();
    window.addEventListener(GUEST_SESSION_EVENT, sync);
    return () => window.removeEventListener(GUEST_SESSION_EVENT, sync);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(`/shop/products?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-30">
      {/* Announcement strip */}
      <div className="bg-ui-dark text-white/90 text-[11px] sm:text-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-1.5 flex items-center justify-center sm:justify-between gap-4">
          <div className="hidden sm:flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <Truck size={12} className="text-accent-lime" /> সারা বাংলাদেশে ডেলিভারি
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Banknote size={12} className="text-accent-lime" /> ক্যাশ অন ডেলিভারি সুবিধা
            </span>
          </div>
          <a href={`tel:${COMPANY_PHONE}`} className="inline-flex items-center gap-1.5 hover:text-white">
            <Phone size={12} /> {COMPANY_PHONE}
          </a>
        </div>
      </div>

      <div className="border-b border-ui-line bg-white/95 backdrop-blur shadow-[0_1px_0_rgba(15,23,42,0.02),0_4px_12px_rgba(15,23,42,0.03)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link to="/shop" className="flex items-center gap-2.5 shrink-0">
            <img src={logo} alt="Lytronix" className="h-7 sm:h-8 w-auto" />
          </Link>

          {/* Categories dropdown (desktop) */}
          <div
            className="relative hidden md:block"
            onMouseEnter={() => setCatOpen(true)}
            onMouseLeave={() => setCatOpen(false)}
          >
            <button className="inline-flex items-center gap-1 text-sm font-medium text-ui-ink px-2 py-2 hover:text-ui-brand">
              ক্যাটাগরি <ChevronDown size={14} />
            </button>
            {catOpen && cats.length > 0 && (
              <div className="absolute left-0 top-full w-[34rem] bg-white border border-ui-line rounded-2xl shadow-floating p-4 grid grid-cols-3 gap-4">
                {cats.slice(0, 9).map((c) => (
                  <div key={c._id}>
                    <Link
                      to={`/shop/c/${c.slug}`}
                      className="block text-sm font-semibold text-ui-ink hover:text-ui-brand mb-1"
                    >
                      {c.name}
                    </Link>
                    <ul className="space-y-0.5">
                      {(c.children || []).slice(0, 5).map((sc) => (
                        <li key={sc._id}>
                          <Link
                            to={`/shop/c/${sc.slug}`}
                            className="block text-xs text-ui-muted hover:text-ui-brand"
                          >
                            {sc.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link to="/shop/products" className="hidden md:inline text-sm font-medium text-ui-ink px-2 py-2 hover:text-ui-brand">
            সকল প্রোডাক্ট
          </Link>
          <Link to="/shop/about" className="hidden lg:inline text-sm font-medium text-ui-ink px-2 py-2 hover:text-ui-brand">
            আমাদের সম্পর্কে
          </Link>
          <Link to="/shop/contact" className="hidden lg:inline text-sm font-medium text-ui-ink px-2 py-2 hover:text-ui-brand">
            যোগাযোগ
          </Link>
          {!isAuthed && guestOrders && (
            <Link
              to="/shop/my-orders"
              className="hidden md:inline text-sm font-medium text-ui-ink px-2 py-2 hover:text-ui-brand"
            >
              আমার অর্ডার
            </Link>
          )}

          {/* Search */}
          <form onSubmit={submitSearch} className="flex-1 max-w-md relative hidden sm:block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-faint" />
            <input
              className="input pl-9 py-2"
              placeholder="প্রোডাক্ট সার্চ করুন…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>

          <div className="flex items-center gap-1.5 ml-auto">
            <Link
              to="/shop/saved"
              className="relative w-10 h-10 rounded-xl flex items-center justify-center text-ui-muted hover:bg-ui-surfaceAlt hover:text-ui-ink transition-colors"
              aria-label="পছন্দের তালিকা"
            >
              <Heart size={19} />
              {savedIds.length > 0 && (
                <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-1 rounded-full bg-ui-rust text-white text-[10px] font-mono leading-4 text-center">
                  {savedIds.length}
                </span>
              )}
            </Link>

            <Link
              to="/shop/cart"
              className="relative w-10 h-10 rounded-xl flex items-center justify-center text-ui-muted hover:bg-ui-surfaceAlt hover:text-ui-ink transition-colors"
              aria-label="কার্ট"
            >
              <ShoppingBag size={19} />
              {count > 0 && (
                <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-1 rounded-full bg-ui-brand text-white text-[10px] font-mono leading-4 text-center">
                  {count}
                </span>
              )}
            </Link>

            {!isAuthed && guestOrders && (
              <Link
                to="/shop/my-orders"
                className="hidden sm:flex md:hidden w-10 h-10 rounded-xl items-center justify-center text-ui-muted hover:bg-ui-surfaceAlt hover:text-ui-ink transition-colors"
                aria-label="আমার অর্ডার"
              >
                <Package size={19} />
              </Link>
            )}

            {isAuthed ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-2 rounded-xl border border-ui-line bg-white px-2.5 py-2 text-sm font-medium text-ui-ink hover:bg-ui-surfaceAlt"
                >
                  <span className="w-6 h-6 rounded-full bg-ui-brand text-white flex items-center justify-center text-xs">
                    {(customer?.name || customer?.phone || '?')[0].toUpperCase()}
                  </span>
                  <span className="hidden sm:inline max-w-[7rem] truncate">
                    {customer?.name || customer?.phone}
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-ui-line rounded-xl shadow-floating py-1.5 text-sm">
                    <MenuLink to="/shop/account" icon={User} onClick={() => setMenuOpen(false)}>
                      আমার অ্যাকাউন্ট
                    </MenuLink>
                    <MenuLink to="/shop/account/orders" icon={Package} onClick={() => setMenuOpen(false)}>
                      আমার অর্ডার
                    </MenuLink>
                    <MenuLink to="/shop/saved" icon={Heart} onClick={() => setMenuOpen(false)}>
                      পছন্দের প্রোডাক্ট
                    </MenuLink>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                        navigate('/shop');
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-ui-rust hover:bg-red-50"
                    >
                      <LogOut size={15} /> লগআউট
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/shop/login" className="btn-secondary py-2">
                <User size={16} /> <span className="hidden sm:inline">লগইন</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuLink({ to, icon: Icon, children, onClick }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3.5 py-2 hover:bg-ui-surfaceAlt ${
          isActive ? 'text-ui-brand' : 'text-ui-ink'
        }`
      }
    >
      <Icon size={15} /> {children}
    </NavLink>
  );
}
