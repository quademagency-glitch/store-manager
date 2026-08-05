import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import AccessDenied from './ui/AccessDenied';

export default function ProtectedRoute({ children, requiredPermission }) {
  const { isAuthenticated, hasPermission, loading, role } = useAuthContext();
  const isPlatformAdmin = role === 'Platform Admin';

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <p className="loading-text">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Allow Platform Admins to visit tenant pages for troubleshooting
  // (Removed the forced redirect to /platform-admin)

  if (requiredPermission && !isPlatformAdmin && !hasPermission(requiredPermission)) {
    return <AccessDenied requiredPermission={requiredPermission} />;
  }

  return children;
}
