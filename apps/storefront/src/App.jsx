import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import StorefrontHeader from './components/StorefrontHeader';
import Footer from './components/Footer';
import ShopBottomNav from './components/ShopBottomNav';
import RequireCustomer from './components/RequireCustomer';
import ScrollToTop from './components/ScrollToTop';
import { trackVisitOnce } from './lib/analytics';

import Shop from './pages/Shop';
import Category from './pages/Category';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import TrackOrder from './pages/TrackOrder';
import About from './pages/About';
import Contact from './pages/Contact';

import AccountLayout from './pages/account/AccountLayout';
import Profile from './pages/account/Profile';
import Addresses from './pages/account/Addresses';
import Orders from './pages/account/Orders';
import Payments from './pages/account/Payments';
import Saved from './pages/account/Saved';

function ShopLayout({ children }) {
  return (
    <div className="min-h-screen bg-ui-bg flex flex-col">
      <StorefrontHeader />
      <div className="pb-20 sm:pb-0 flex-1">{children}</div>
      <Footer />
      <ShopBottomNav />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    trackVisitOnce();
  }, []);

  return (
    <>
      <ScrollToTop />
    <Routes>
      {/* Public order tracking — standalone, no shop chrome */}
      <Route path="/track/:trackingId" element={<TrackOrder />} />

      <Route path="/shop" element={<ShopLayout><Shop /></ShopLayout>} />
      <Route path="/shop/c/:slug" element={<ShopLayout><Category /></ShopLayout>} />
      <Route path="/shop/p/:slug" element={<ShopLayout><ProductDetail /></ShopLayout>} />
      <Route path="/shop/cart" element={<ShopLayout><Cart /></ShopLayout>} />
      <Route path="/shop/checkout" element={<ShopLayout><Checkout /></ShopLayout>} />
      <Route path="/shop/login" element={<ShopLayout><Login /></ShopLayout>} />
      <Route path="/shop/about" element={<ShopLayout><About /></ShopLayout>} />
      <Route path="/shop/contact" element={<ShopLayout><Contact /></ShopLayout>} />

      <Route
        path="/shop/account"
        element={
          <RequireCustomer>
            <ShopLayout>
              <AccountLayout />
            </ShopLayout>
          </RequireCustomer>
        }
      >
        <Route index element={<Navigate to="profile" replace />} />
        <Route path="profile" element={<Profile />} />
        <Route path="addresses" element={<Addresses />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<Orders />} />
        <Route path="payments" element={<Payments />} />
        <Route path="saved" element={<Saved />} />
      </Route>

      <Route path="/" element={<Navigate to="/shop" replace />} />
      <Route path="*" element={<Navigate to="/shop" replace />} />
    </Routes>
    </>
  );
}
