import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';

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

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="access-denied">
        <div className="access-denied-card">
          <div className="access-denied-icon">🚫</div>
          <h2>Access Denied</h2>
          <p>You don't have permission to view this page.</p>
          <p className="access-denied-role">Required permission: <strong>{requiredPermission}</strong></p>
        </div>
      </div>
    );
  }

  return children;
}
