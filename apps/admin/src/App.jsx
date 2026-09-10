import { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import MoreSheet from './components/MoreSheet';
import BanglaKeyboard from './components/BanglaKeyboard';
import ScrollToTop from './components/ScrollToTop';
import ChatToaster from './components/ChatToaster';
import UpdatePrompt from './components/UpdatePrompt';
import RequireAuth from './components/RequireAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrderList from './pages/OrderList';
import OrderForm from './pages/OrderForm';
import OrderDetail from './pages/OrderDetail';
import ProductList from './pages/ProductList';
import ProductForm from './pages/ProductForm';
import ProductDetail from './pages/ProductDetail';
import CategoryManagement from './pages/CategoryManagement';
import Analytics from './pages/Analytics';
import CustomerList from './pages/CustomerList';
import CustomerForm from './pages/CustomerForm';
import TrackOrder from './pages/TrackOrder';
import PrintParcel from './pages/PrintParcel';
import PrintLogbook from './pages/PrintLogbook';
import PrintLabels from './pages/PrintLabels';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import Payments from './pages/Payments';
import Marketing from './pages/Marketing';
import Messages from './pages/Messages';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';

function AdminLayout({ children }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { user } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen sm:flex bg-ui-bg">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Navbar onOpenMore={() => setMoreOpen(true)} />
        {user?.mustChangePassword && (
          <Link
            to="/profile"
            className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 sm:px-6 py-2"
          >
            <ShieldAlert size={15} className="shrink-0" />
            {t('profile.passwordBanner')}
            <span className="underline font-medium ml-auto">{t('profile.goToProfile')}</span>
          </Link>
        )}
        <div className="pb-20 sm:pb-0">{children}</div>
      </div>
      <BottomNav onOpenMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <BanglaKeyboard />
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <ChatToaster />
      <UpdatePrompt />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/track/:trackingId" element={<TrackOrder />} />

      {/* Print views render standalone, without the admin app shell */}
      <Route path="/orders/print" element={<RequireAuth permission="orders:view"><PrintLogbook /></RequireAuth>} />
      <Route path="/orders/:id/print" element={<RequireAuth permission="orders:view"><PrintParcel /></RequireAuth>} />
      <Route path="/orders/print-labels" element={<RequireAuth permission="orders:view"><PrintLabels /></RequireAuth>} />

      <Route path="/" element={<RequireAuth><AdminLayout><Dashboard /></AdminLayout></RequireAuth>} />
      <Route path="/orders" element={<RequireAuth><AdminLayout><OrderList /></AdminLayout></RequireAuth>} />
      <Route path="/orders/new" element={<RequireAuth permission="orders:manage"><AdminLayout><OrderForm /></AdminLayout></RequireAuth>} />
      <Route path="/orders/:id" element={<RequireAuth><AdminLayout><OrderDetail /></AdminLayout></RequireAuth>} />
      <Route path="/orders/:id/edit" element={<RequireAuth permission="orders:manage"><AdminLayout><OrderForm /></AdminLayout></RequireAuth>} />

      <Route path="/products" element={<RequireAuth><AdminLayout><ProductList /></AdminLayout></RequireAuth>} />
      <Route path="/products/new" element={<RequireAuth permission="products:manage"><AdminLayout><ProductForm /></AdminLayout></RequireAuth>} />
      <Route path="/products/:id" element={<RequireAuth><AdminLayout><ProductDetail /></AdminLayout></RequireAuth>} />
      <Route path="/products/:id/edit" element={<RequireAuth permission="products:manage"><AdminLayout><ProductForm /></AdminLayout></RequireAuth>} />

      <Route path="/categories" element={<RequireAuth permission="categories:manage"><AdminLayout><CategoryManagement /></AdminLayout></RequireAuth>} />

      <Route path="/analytics" element={<RequireAuth permission="analytics:view"><AdminLayout><Analytics /></AdminLayout></RequireAuth>} />

      <Route path="/customers" element={<RequireAuth permission="customers:manage"><AdminLayout><CustomerList /></AdminLayout></RequireAuth>} />
      <Route path="/customers/new" element={<RequireAuth permission="customers:manage"><AdminLayout><CustomerForm /></AdminLayout></RequireAuth>} />
      <Route path="/customers/:id/edit" element={<RequireAuth permission="customers:manage"><AdminLayout><CustomerForm /></AdminLayout></RequireAuth>} />

      <Route path="/payments" element={<RequireAuth permission="payments:manage"><AdminLayout><Payments /></AdminLayout></RequireAuth>} />

      <Route path="/marketing" element={<RequireAuth permission="customers:manage"><AdminLayout><Marketing /></AdminLayout></RequireAuth>} />
      <Route path="/messages" element={<RequireAuth permission="customers:manage"><AdminLayout><Messages /></AdminLayout></RequireAuth>} />
      <Route path="/chat" element={<RequireAuth permission="customers:manage"><AdminLayout><Chat /></AdminLayout></RequireAuth>} />

      <Route path="/staff" element={<RequireAuth permission="users:manage"><AdminLayout><UserManagement /></AdminLayout></RequireAuth>} />
      <Route path="/roles" element={<RequireAuth permission="roles:manage"><AdminLayout><RoleManagement /></AdminLayout></RequireAuth>} />

      <Route path="/profile" element={<RequireAuth><AdminLayout><Profile /></AdminLayout></RequireAuth>} />

      <Route path="*" element={<AdminLayout><div className="max-w-3xl mx-auto px-5 py-16 text-center text-ui-muted">Page not found.</div></AdminLayout>} />
    </Routes>
    </>
  );
}
