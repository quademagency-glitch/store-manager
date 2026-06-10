const { supabaseAdmin } = require('../db/supabase');

/**
 * Auth guard middleware.
 * Verifies the JWT from the Authorization header using Supabase.
 * Attaches `req.user` with { id, email, role } on success.
 */
async function authGuard(req, res, next) {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token.',
      });
    }

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
        business_id,
        status,
        role_id,
        roles:role_id (
          name,
          permissions
        ),
        businesses (
          status
        ),
        user_locations(location_id)
      `)
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User record not found. Please contact your manager.',
      });
    }

    // Check for bans
    if (userData.status === 'banned') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Your account has been banned. Please contact support.',
      });
    }

    if (userData.businesses && userData.businesses.status === 'banned') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Your business has been banned. Please contact support.',
      });
    }

    // Attach user data to the request
    req.user = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      business_id: userData.business_id,
      status: userData.status,
      role: userData.roles ? userData.roles.name : 'Unknown',
      role_id: userData.role_id,
      permissions: userData.roles ? userData.roles.permissions : [],
      location_ids: userData.user_locations ? userData.user_locations.map(ul => ul.location_id) : [],
    };

    // Attach active location if provided in headers and valid
    const requestedLocationId = req.headers['x-location-id'];
    if (requestedLocationId && req.user.location_ids.includes(requestedLocationId)) {
      req.user.active_location_id = requestedLocationId;
    } else if (req.user.role === 'Platform Admin' || req.user.role === 'Business Admin') {
      req.user.active_location_id = requestedLocationId; // Admins can view any
    } else if (req.user.location_ids.length > 0) {
      req.user.active_location_id = req.user.location_ids[0]; // Default to first
    } else {
      req.user.active_location_id = null;
    }

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
