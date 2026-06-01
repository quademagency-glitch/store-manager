const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * PUT /api/businesses/:id
 * Update business details (name, contact_email, logo_url)
 * Access: Must have manage_business permission and belong to the business (or be Platform Admin)
 */
router.put('/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { name, contact_email, logo_url } = req.body;

    // Verify tenant isolation
    if (req.user.role !== 'Platform Admin' && req.user.business_id !== req.params.id) {
      return res.status(403).json({ error: 'Cannot update a different business profile.' });
    }

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .update({ name, contact_email, logo_url })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Business not found' });

    res.json(data);
  } catch (err) {
    console.error('Error updating business:', err);
    res.status(500).json({ error: err.message || 'Failed to update business profile' });
  }
});

module.exports = router;
