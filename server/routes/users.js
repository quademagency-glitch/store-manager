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
        roles:role_id (id, name, permissions),
        user_locations (location_id)
      `)
      .order('created_at', { ascending: false });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    // Map user_locations to a clean location_ids array
    const usersWithLocations = data.map(user => ({
      ...user,
      location_ids: user.user_locations.map(ul => ul.location_id)
    }));

    res.json(usersWithLocations);
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
    const { email, password, name, business_id, role_name, location_ids } = req.body;

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
        role: role_name || 'Salesperson'
      }
    });

    if (error) throw error;
    
    const userId = data.user.id;

    // Insert user_locations if provided
    if (Array.isArray(location_ids) && location_ids.length > 0) {
      const locationInserts = location_ids.map(locId => ({
        user_id: userId,
        location_id: locId
      }));
      await supabaseAdmin.from('user_locations').insert(locationInserts);
    }

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
    const { name, role_id, status, location_ids, business_id } = req.body;

    if (!role_id) {
      return res.status(400).json({ error: 'role_id is required' });
    }

    const updates = { name, role_id };
    if (status) updates.status = status;
    
    if (req.user.role === 'Platform Admin' && business_id !== undefined) {
      updates.business_id = business_id || null;
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });
    
    // Manage user_locations
    if (Array.isArray(location_ids)) {
      // 1. Delete existing
      await supabaseAdmin.from('user_locations').delete().eq('user_id', req.params.id);
      
      // 2. Insert new
      if (location_ids.length > 0) {
        const locationInserts = location_ids.map(locId => ({
          user_id: req.params.id,
          location_id: locId
        }));
        await supabaseAdmin.from('user_locations').insert(locationInserts);
      }
    }

    res.json(data);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:id
 * Permanently delete a user (using Admin API)
 * Access: Must have manage_users permission
 */
router.delete('/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    // 1. Check if user is trying to delete themselves
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    // 2. Ensure the admin is authorized to delete THIS user
    const { data: userToDelete, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('business_id, role_id, roles(name)')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !userToDelete) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (req.user.role !== 'Platform Admin' && userToDelete.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'You can only delete users in your own business.' });
    }

    if (req.user.role !== 'Platform Admin' && userToDelete.roles.name === 'Business Admin') {
      return res.status(403).json({ error: 'Only Platform Admins can delete Business Admins.' });
    }

    // 3. Reassign references before deletion
    // Reassign sales
    await supabaseAdmin
      .from('sales')
      .update({ salesperson_id: null })
      .eq('salesperson_id', req.params.id);

    // Reassign stock_movements
    await supabaseAdmin
      .from('stock_movements')
      .update({ created_by: null })
      .eq('created_by', req.params.id);

    // 4. Delete from auth.users (Admin API) - this cascades to public.users and user_locations
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);

    if (deleteError) throw deleteError;

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
