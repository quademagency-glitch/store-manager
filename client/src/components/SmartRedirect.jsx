import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';

export default function SmartRedirect() {
  const { isAuthenticated, hasPermission, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // By default, everyone goes to the store dashboard.
  // Admins can navigate to their specific admin panels via the sidebar.
  return <Navigate to="/dashboard" replace />;
}
