/**
 * Role check middleware factory.
 * Must be used AFTER authGuard (relies on req.user.role).
 *
 * Usage:
 *   router.get('/admin-route', authGuard, roleCheck('manager'), handler);
 *   router.get('/any-staff', authGuard, roleCheck('manager', 'salesperson'), handler);
 *
 * @param  {...string} allowedRoles - One or more roles that can access the route
 * @returns {Function} Express middleware
 */
function roleCheck(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required before role check.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
}

module.exports = roleCheck;
