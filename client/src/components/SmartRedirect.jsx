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

  // Platform Admins go straight to their management dashboard
  if (hasPermission('manage_platform')) {
    return <Navigate to="/platform-admin" replace />;
  }

  // Everyone else goes to the business dashboard
  return <Navigate to="/dashboard" replace />;
}
