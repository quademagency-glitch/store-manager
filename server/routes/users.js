const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/users
 * Fetch all users with their roles
 * Access: Must have manage_users permission
 */
router.get('/', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('users')
      .select(`
        id, 
        name, 
        email, 
        status,
        created_at,
        role_id,
        location_id,
        roles:role_id (id, name, permissions)
      `)
      .order('created_at', { ascending: false });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * POST /api/users/create
 * Create a new user with login credentials (using Admin API)
 * Access: Must have manage_platform or manage_users permission
 */
router.post('/create', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const { email, password, name, business_id, role_name, location_id } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const assigned_business_id = req.user.role === 'Platform Admin' && business_id ? business_id : req.user.business_id;

    // Use Supabase Admin API to create the user securely without logging out the admin
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: name || '',
        business_id: assigned_business_id,
        location_id: location_id || null,
        role: role_name || 'Salesperson'
      }
    });

    if (error) throw error;

    res.json({ message: 'User created successfully', user: data.user });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: err.message || 'Failed to create user' });
  }
});

/**
 * PUT /api/users/:id
 * Update a user (e.g., change role)
 * Access: Must have manage_users permission
 */
router.put('/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const { name, role_id, status, location_id } = req.body;

    if (!role_id) {
      return res.status(400).json({ error: 'role_id is required' });
    }

    const updates = { name, role_id };
    if (status) updates.status = status;
    if (location_id !== undefined) updates.location_id = location_id || null;

    if (req.user.role !== 'Platform Admin') {
      const { data: targetUser } = await supabaseAdmin.from('users').select('business_id').eq('id', req.params.id).single();
      if (!targetUser || targetUser.business_id !== req.user.business_id) {
        return res.status(403).json({ error: 'Cannot update user from another business' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.params.id)
      .select(`
        id, 
        name, 
        email, 
        status,
        created_at,
        role_id,
        location_id,
        roles:role_id (id, name, permissions)
      `)
      .single();

    if (error) throw error;
    
    if (!data) return res.status(404).json({ error: 'User not found' });

    res.json(data);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete a user from Auth and public.users
 * Access: Must have manage_users permission
 */
router.delete('/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    if (req.user.role !== 'Platform Admin') {
      const { data: targetUser } = await supabaseAdmin.from('users').select('business_id').eq('id', req.params.id).single();
      if (!targetUser || targetUser.business_id !== req.user.business_id) {
        return res.status(403).json({ error: 'Cannot delete user from another business' });
      }
    }

    // Supabase admin API deletes the user from auth.users, 
    // which cascades to public.users because of the foreign key ON DELETE CASCADE.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);

    if (error) throw error;

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
