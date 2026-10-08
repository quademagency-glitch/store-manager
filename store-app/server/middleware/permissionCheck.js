/**
 * Permission check middleware factory.
 * Must be used AFTER authGuard.
 *
 * Usage:
 *   router.post('/products', authGuard, permissionCheck('manage_products'), handler);
 *
 * @param  {...string} requiredPermissions - One or more permissions required to access the route
 * @returns {Function} Express middleware
 */
function permissionCheck(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required before permission check.',
      });
    }

    if (req.user.role === 'Platform Admin') return next();

    /* A Business Admin holds every permission of their own business, but
       never manage_platform: that is the platform operator's alone. Every
       self-service signup is a Business Admin, and until 8 October 2026 this
       shortcut let any of them through manage_platform routes (Paystack
       keys, plan assignment, platform settings, platform messaging, the
       shared QR pool). This mirrors the client's hasPermission. */
    if (req.user.role === 'Business Admin' && requiredPermissions.some((perm) => perm !== 'manage_platform')) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    
    // Check if the user has AT LEAST ONE of the required permissions
    // manage_platform is satisfied only by the Platform Admin role above, never
    // by a permissions array, whatever a role row happens to contain.
    const hasPermission = requiredPermissions.some(perm => perm !== 'manage_platform' && userPermissions.includes(perm));

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required permission(s): ${requiredPermissions.join(' or ')}.`,
      });
    }

    next();
  };
}

module.exports = permissionCheck;
