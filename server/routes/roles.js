const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/roles
 * Fetch all roles available to the business (Generic + Custom)
 * Access: Must have manage_users permission
 */
router.get('/', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    let query = supabaseAdmin.from('roles').select('*').order('name');
    
    // Platform Admins can see everything
    if (req.user.role !== 'Platform Admin') {
      // Get Generic roles (business_id IS NULL) + their own custom roles
      query = query.or(`business_id.is.null,business_id.eq.${req.user.business_id}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/**
 * POST /api/roles
 * Create a new custom role for the business
 * Access: Must have manage_users permission
 */
router.post('/', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    
    if (!name || !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Name and permissions array are required' });
    }

    const business_id = req.user.role === 'Platform Admin' ? req.body.business_id || null : req.user.business_id;

    const { data, error } = await supabaseAdmin
      .from('roles')
      .insert([{ name, description, permissions, business_id }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A role with this name already exists in your business.' });
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
 * Update an existing role
 * Access: Must have manage_users permission
 */
router.put('/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const roleId = req.params.id;
    const { name, description, permissions } = req.body;

    if (!name || !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Name and permissions array are required' });
    }

    // Check if the role exists and if it's generic
    const { data: role } = await supabaseAdmin.from('roles').select('*').eq('id', roleId).single();
    if (!role) return res.status(404).json({ error: 'Role not found' });

    if (role.business_id === null && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Cannot modify a generic platform role. Please create a custom role instead.' });
    }

    // Verify tenant isolation
    if (req.user.role !== 'Platform Admin' && role.business_id !== req.user.business_id) {
       return res.status(403).json({ error: 'Unauthorized to edit this role.' });
    }

    const { data: updatedRole, error } = await supabaseAdmin
      .from('roles')
      .update({ name, description, permissions })
      .eq('id', roleId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A role with this name already exists.' });
      }
      throw error;
    }

    res.json(updatedRole);
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * DELETE /api/roles/:id
 * Delete a custom role
 * Access: Must have manage_users permission
 */
router.delete('/:id', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const roleId = req.params.id;
    
    const { data: role } = await supabaseAdmin.from('roles').select('*').eq('id', roleId).single();
    if (!role) return res.status(404).json({ error: 'Role not found' });

    if (role.business_id === null && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Cannot delete a generic platform role.' });
    }

    if (req.user.role !== 'Platform Admin' && role.business_id !== req.user.business_id) {
       return res.status(403).json({ error: 'Unauthorized to delete this role.' });
    }

    const { error, count } = await supabaseAdmin
      .from('roles')
      .delete({ count: 'exact' })
      .eq('id', roleId);

    if (error) {
      if (error.code === '23503') { 
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
