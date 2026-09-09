import { Navigate, useLocation } from 'react-router-dom';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import Loader from './Loader';

export default function RequireCustomer({ children }) {
  const { isAuthed, loading } = useCustomerAuth();
  const location = useLocation();

  if (loading) {
    return <Loader />;
  }

  if (!isAuthed) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/shop/login?next=${next}`} replace />;
  }

  return children;
}
