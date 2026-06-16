const express = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role_id: z.string().uuid('Invalid role ID'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/register
 * Create a new user (Supabase Auth + users table).
 * Requires authentication and manager role.
 */
router.post('/register', authGuard, permissionCheck('manage_users'), validateBody(registerSchema), async (req, res) => {
  try {
    const { name, email, password, role_id } = req.body;

    // ── Create auth user in Supabase ────────────────────
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // auto-confirm so the user can login immediately
      });

    if (authError) {
      // Supabase returns a clear message for duplicates, etc.
      return res.status(400).json({
        error: 'Registration failed',
        message: authError.message,
      });
    }

    // ── Insert profile row in users table ───────────────
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        name,
        email,
        role_id,
      })
      .select('id, name, email, role_id, created_at')
      .single();

    if (userError) {
      // Rollback: remove the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({
        error: 'Registration failed',
        message: 'Could not create user profile. Auth user rolled back.',
      });
    }

    return res.status(201).json({
      message: 'User created successfully.',
      user: userData,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Registration failed. Please try again.',
    });
  }
});

/**
 * POST /api/auth/login
 * Sign in with email and password.
 * Returns session data and user role.
 */
router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Sign in via Supabase Auth
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: error.message || 'Invalid email or password.',
      });
    }

    // Fetch user role from users table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select(`
        id, 
        name, 
        email, 
        role_id,
        roles:role_id (id, name, permissions),
        user_locations(location_id)
      `)
      .eq('id', data.user.id)
      .single();

    if (userError || !userData) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User account not provisioned. Please contact your manager.',
      });
    }

    return res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role_id: userData.role_id,
        role: userData.roles ? userData.roles.name : 'Unknown',
        permissions: userData.roles ? userData.roles.permissions : [],
        location_ids: userData.user_locations ? userData.user_locations.map(ul => ul.location_id) : [],
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Login failed. Please try again.',
    });
  }
});

/**
 * POST /api/auth/logout
 * Sign out the current user.
 * Requires authentication.
 */
router.post('/logout', authGuard, async (req, res) => {
  try {
    // Supabase handles token invalidation on client side.
    // Server-side we can optionally call signOut with the admin client.
    return res.json({
      message: 'Signed out successfully.',
    });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Logout failed.',
    });
  }
});

/**
 * GET /api/auth/me
 * Get the current authenticated user's info and role.
 * Requires authentication.
 */
router.get('/me', authGuard, async (req, res) => {
  try {
    return res.json({
      user: req.user,
    });
  } catch (err) {
    console.error('Get user error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch user info.',
    });
  }
});

module.exports = router;
