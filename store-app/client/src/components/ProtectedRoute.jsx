import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import AccessDenied from './ui/AccessDenied';

/**
 * `requiredPermission` takes a string, or an array meaning "any one of these".
 *
 * The array form exists because the server's permissionCheck has always
 * accepted several and treated them as OR, while this side accepted exactly
 * one. /alerts is what exposed the gap: the route demanded `view_alerts` and
 * the API demanded `view_analytics`, so the two ends disagreed about who was
 * allowed in, in both directions.
 */
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

  const required = requiredPermission
    ? (Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission])
    : [];

  if (required.length > 0 && !isPlatformAdmin && !required.some((p) => hasPermission(p))) {
    return <AccessDenied requiredPermission={required.join(' or ')} />;
  }

  return children;
}
