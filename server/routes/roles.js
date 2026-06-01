const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/roles
 * Fetch all roles
 * Access: Must have manage_users permission
 */
router.get('/', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('roles')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/**
 * POST /api/roles
 * Create a new role
 * Access: Must have manage_users permission
 */
router.post('/', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    if (req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Platform Admins can create roles.' });
    }

    const { name, description, permissions } = req.body;

    if (!name || !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Name and permissions array are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('roles')
      .insert([{ name, description, permissions }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A role with this name already exists.' });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

/**
 * PUT /api/roles/:id
 * Update a role
 * Access: Must have manage_users permission
 */
router.put('/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    if (req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Platform Admins can modify roles.' });
    }

    const { name, description, permissions } = req.body;

    if (!name || !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Name and permissions array are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('roles')
      .update({ name, description, permissions })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A role with this name already exists.' });
      }
      throw error;
    }

    if (!data) return res.status(404).json({ error: 'Role not found' });

    res.json(data);
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * DELETE /api/roles/:id
 * Delete a role
 * Access: Must have manage_users permission
 */
router.delete('/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    if (req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Platform Admins can delete roles.' });
    }

    // Basic check to prevent deleting 'Manager' or 'Salesperson' could be added here
    const { error, count } = await supabaseAdmin
      .from('roles')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);

    if (error) {
      if (error.code === '23503') { // Foreign key violation
        return res.status(400).json({ error: 'Cannot delete a role that is assigned to users.' });
      }
      throw error;
    }
    
    if (count === 0) return res.status(404).json({ error: 'Role not found' });

    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('Error deleting role:', err);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

module.exports = router;
