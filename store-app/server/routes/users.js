const express = require('express');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const { invalidateUserCache } = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { sendBusinessWelcomeEmail } = require('../services/emailService');
const { logAuditEvent, AUDIT_ACTIONS } = require('../utils/auditLog');

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
    logger.error({ err: err }, 'Error fetching users:');
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

    if (req.user.role !== 'Platform Admin') {
      const requestedRoleName = role_name || 'Salesperson';
      const { data: targetRole, error: roleErr } = await supabaseAdmin
        .from('roles')
        .select('name, business_id, permissions')
        .eq('name', requestedRoleName)
        .or(`business_id.is.null,business_id.eq.${req.user.business_id}`)
        .order('business_id', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (roleErr) throw roleErr;

      const grantedPermissions = targetRole?.permissions || [];
      const exceedsOwnPermissions = grantedPermissions.some(p => !req.user.permissions.includes(p));

      if (!targetRole || exceedsOwnPermissions) {
        return res.status(403).json({ error: `You cannot assign the "${requestedRoleName}" role because it grants permissions you do not have.` });
      }
    }

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

    // Send the branded welcome email when a business owner account is created.
    // Non-blocking: a failed email must never fail user creation.
    if (role_name === 'Business Admin' && assigned_business_id) {
      try {
        const { data: biz } = await supabaseAdmin
          .from('businesses')
          .select('id, name, slug, subscription_plan_id')
          .eq('id', assigned_business_id)
          .single();

        if (biz) {
          let planName = null;
          if (biz.subscription_plan_id) {
            const { data: plan } = await supabaseAdmin
              .from('platform_plans')
              .select('name')
              .eq('id', biz.subscription_plan_id)
              .single();
            planName = plan?.name || null;
          }

          const result = await sendBusinessWelcomeEmail(
            biz,
            { name, email },
            { planName },
          );
          if (!result.success) {
            logger.warn({ business: biz.name, email, error: result.error }, 'Welcome email not sent');
          }
        }
      } catch (welcomeErr) {
        logger.error({ err: welcomeErr, email }, 'Welcome email step failed (user still created)');
      }
    }

    logAuditEvent(req, AUDIT_ACTIONS.USER_CREATED, 'user', userId, {
      email,
      role_name: role_name || 'Salesperson',
      business_id: assigned_business_id,
    });

    res.json({ message: 'User created successfully', user: data.user });
  } catch (err) {
    logger.error({ err: err }, 'Error creating user:');
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

    if (req.user.role !== 'Platform Admin') {
      const { data: targetRole, error: roleErr } = await supabaseAdmin
        .from('roles')
        .select('name, permissions')
        .eq('id', role_id)
        .single();

      if (roleErr || !targetRole) {
        return res.status(400).json({ error: 'Invalid role_id.' });
      }

      const exceedsOwnPermissions = (targetRole.permissions || []).some(p => !req.user.permissions.includes(p));
      if (exceedsOwnPermissions) {
        return res.status(403).json({ error: `You cannot assign the "${targetRole.name}" role because it grants permissions you do not have.` });
      }
    }

    // Read the prior values before overwriting them — the audit log records
    // from/to, and after the UPDATE the previous state is gone.
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('role_id, status')
      .eq('id', req.params.id)
      .maybeSingle();

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

    // Recorded as two distinct events rather than one generic "user updated".
    // Suspending someone and re-roling them are different administrative acts
    // with different follow-up questions, and collapsing them makes the log
    // much harder to read after the fact. A single request can legitimately do
    // both, in which case both rows are written.
    // Their permissions changed; the cached copy is now wrong on every worker.
    invalidateUserCache(req.params.id);

    if (role_id && role_id !== existingUser?.role_id) {
      logAuditEvent(req, AUDIT_ACTIONS.USER_ROLE_CHANGED, 'user', req.params.id, {
        from_role_id: existingUser?.role_id ?? null,
        to_role_id: role_id,
      });
    }
    if (status && status !== existingUser?.status) {
      logAuditEvent(req, AUDIT_ACTIONS.USER_STATUS_CHANGED, 'user', req.params.id, {
        from_status: existingUser?.status ?? null,
        to_status: status,
      });
    }

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error updating user:');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * PUT /api/users/:id/pin
 * Set a manager PIN for a user
 * Access: Must have manage_users permission
 */
router.put('/:id/pin', authGuard, permissionCheck('manage_users'), async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be a 4 to 6 digit number' });
    }

    const { data: userToUpdate, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('business_id, roles(name)')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !userToUpdate) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (req.user.role !== 'Platform Admin' && userToUpdate.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'You can only set PINs for users in your own business.' });
    }

    const hashedPin = await bcrypt.hash(pin, 10);

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ manager_pin: hashedPin })
      .eq('id', req.params.id);

    if (updateError) throw updateError;

    // Records THAT a PIN was set, never the PIN. The redactor in
    // utils/auditLog.js would strip it anyway — this passes nothing regardless.
    logAuditEvent(req, AUDIT_ACTIONS.USER_PIN_SET, 'user', req.params.id);

    res.json({ message: 'Manager PIN set successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error setting PIN:');
    res.status(500).json({ error: 'Failed to set PIN' });
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
      .update({ user_id: null })
      .eq('user_id', req.params.id);

    // 4. Delete from auth.users (Admin API) - this cascades to public.users and user_locations
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);

    if (deleteError) throw deleteError;

    // Deliberately logged AFTER the delete succeeds, and the row survives it:
    // audit_logs.actor_user_id is ON DELETE SET NULL with actor_email/role kept
    // as denormalised copies (migration 070), precisely so that deleting a user
    // cannot erase the record of what they did — or of who deleted them.
    // Without this, a deleted user's cached entry keeps authorising requests
    // until it expires — they are gone from the database but still logged in.
    invalidateUserCache(req.params.id);

    logAuditEvent(req, AUDIT_ACTIONS.USER_DELETED, 'user', req.params.id, {
      deleted_user_business_id: userToDelete.business_id,
      deleted_user_role: userToDelete.roles?.name,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting user:');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
