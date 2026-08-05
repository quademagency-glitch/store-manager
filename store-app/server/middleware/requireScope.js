/**
 * API key scope check middleware factory.
 * Must be used AFTER apiKeyGuard.
 *
 * Usage:
 *   router.get('/catalog', requireScope('read:catalog'), handler);
 *
 * @param  {...string} requiredScopes - At least one of these scopes must be granted
 * @returns {Function} Express middleware
 */
function requireScope(...requiredScopes) {
  return (req, res, next) => {
    if (!req.business) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key authentication required before scope check.',
      });
    }

    const grantedScopes = req.business.scopes || [];
    const hasScope = requiredScopes.some(scope => grantedScopes.includes(scope));

    if (!hasScope) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `API key missing required scope: ${requiredScopes.join(' or ')}.`,
      });
    }

    next();
  };
}

module.exports = requireScope;
