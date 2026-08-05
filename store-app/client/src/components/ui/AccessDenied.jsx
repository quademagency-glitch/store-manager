import { Icons } from '../icons/Icons';

/**
 * Extracted from ProtectedRoute so the four pages that hand-rolled their own
 * "access denied" markup (Settings, PlatformAdmin, SalesRecord,
 * TeamManagement) share one implementation and one wording.
 */
export default function AccessDenied({ requiredPermission, message }) {
  return (
    <div className="access-denied">
      <div className="access-denied-card">
        <div className="access-denied-icon" aria-hidden="true">{Icons.ban}</div>
        <h2>Access Denied</h2>
        <p>{message || "You don't have permission to view this page."}</p>
        {requiredPermission ? (
          <p className="access-denied-role">
            Required permission: <strong>{requiredPermission}</strong>
          </p>
        ) : null}
      </div>
    </div>
  );
}
