import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

// Wrap any admin page: <RequireAuth permission="orders:manage"><OrderForm /></RequireAuth>
// Omit `permission` to just require any logged-in, active account.
export default function RequireAuth({ children, permission }) {
  const { user, loading, hasPermission } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) {
    return <div className="max-w-3xl mx-auto px-5 py-16 text-center text-ui-muted">{t('common.loading')}</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-16 text-center text-ui-muted">
        {t('common.noPermission')}
      </div>
    );
  }

  return children;
}
