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

    const userPermissions = req.user.permissions || [];
    
    // Check if the user has AT LEAST ONE of the required permissions
    const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));

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
