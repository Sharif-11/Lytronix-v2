import { Navigate, useLocation } from 'react-router-dom';
import { useCustomerAuth } from '../context/CustomerAuthContext';

export default function RequireCustomer({ children }) {
  const { isAuthed, loading } = useCustomerAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center text-ui-muted text-sm">Loading…</div>
    );
  }

  if (!isAuthed) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/shop/login?next=${next}`} replace />;
  }

  return children;
}
