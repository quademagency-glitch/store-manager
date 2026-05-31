const { supabaseAdmin } = require('../db/supabase');

/**
 * Auth guard middleware.
 * Verifies the JWT from the Authorization header using Supabase.
 * Attaches `req.user` with { id, email, role } on success.
 */
async function authGuard(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header. Expected: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify the JWT using Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token.',
      });
    }

    // Fetch the user's role and permissions from the users and roles table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        name,
        email,
        role_id,
        roles:role_id (
          name,
          permissions
        )
      `)
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User record not found. Please contact your manager.',
      });
    }

    // Attach user data to the request
    req.user = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.roles ? userData.roles.name : 'Unknown',
      role_id: userData.role_id,
      permissions: userData.roles ? userData.roles.permissions : [],
    };

    next();
  } catch (err) {
    console.error('Auth guard error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication check failed.',
    });
  }
}

module.exports = authGuard;
