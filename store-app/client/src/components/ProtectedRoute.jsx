import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { Icons } from './icons/Icons';

export default function ProtectedRoute({ children, requiredPermission }) {
  const { isAuthenticated, hasPermission, loading } = useAuthContext();

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

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="access-denied">
        <div className="access-denied-card">
          <div className="access-denied-icon" aria-hidden="true">{Icons.ban}</div>
          <h2>Access Denied</h2>
          <p>You don't have permission to view this page.</p>
          <p className="access-denied-role">Required permission: <strong>{requiredPermission}</strong></p>
        </div>
      </div>
    );
  }

  return children;
}
