import { Navigate, useLocation } from 'react-router-dom';
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
/* Statuses that close the app until the business pays: 'unpaid' (signed up,
   setup fee and first year not yet paid; there is no free trial since
   8 October 2026) and 'expired' (the year ran out). The server refuses
   everything but billing either way (authGuard); this sends the owner to the
   one page that works instead of a screen of errors. */
const NOT_PAID_UP = ['unpaid', 'expired'];
const PAGES_WHILE_NOT_PAID_UP = ['/business-admin/billing', '/business-admin/invoices', '/profile'];

export default function ProtectedRoute({ children, requiredPermission }) {
  const { isAuthenticated, hasPermission, loading, role, businessStatus, isDemo } = useAuthContext();
  const { pathname } = useLocation();
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

  if (!isPlatformAdmin && !isDemo && NOT_PAID_UP.includes(businessStatus)
    && !PAGES_WHILE_NOT_PAID_UP.some((page) => pathname.startsWith(page))) {
    if (role === 'Business Admin' || hasPermission('manage_billing')) {
      return <Navigate to="/business-admin/billing" replace />;
    }
    return (
      <AccessDenied message={businessStatus === 'unpaid'
        ? "This shop's QuadERP subscription has not started yet. The owner can pay for it under Billing."
        : "This shop's QuadERP subscription has ended. The owner can renew it under Billing; nothing has been lost."} />
    );
  }

  const required = requiredPermission
    ? (Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission])
    : [];

  if (required.length > 0 && !isPlatformAdmin && !required.some((p) => hasPermission(p))) {
    return <AccessDenied requiredPermission={required.join(' or ')} />;
  }

  return children;
}
