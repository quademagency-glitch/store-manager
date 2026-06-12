const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/businesses/me
 * Fetch the current user's business profile
 * Access: Authenticated users
 */
router.get('/me', authGuard, async (req, res) => {
  try {
    if (!req.user.business_id) {
      return res.status(404).json({ error: 'No business associated with this account' });
    }

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', req.user.business_id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Business not found' });

    res.json(data);
  } catch (err) {
    console.error('Error fetching business:', err);
    res.status(500).json({ error: 'Failed to fetch business profile' });
  }
});

/**
 * PUT /api/businesses/:id
 * Update business details (name, contact_email, logo_url)
 * Access: Must have manage_business permission and belong to the business (or be Platform Admin)
 */
router.put('/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { name, contact_email, logo_url, tax_rate, return_policy, phone, address_line1, city, region, letterhead, currency } = req.body;

    // Verify tenant isolation
    if (req.user.role !== 'Platform Admin' && req.user.business_id !== req.params.id) {
      return res.status(403).json({ error: 'Cannot update a different business profile.' });
    }

    // Build update payload, only include fields that were provided
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (contact_email !== undefined) updatePayload.contact_email = contact_email;
    if (logo_url !== undefined) updatePayload.logo_url = logo_url;
    if (tax_rate !== undefined) updatePayload.tax_rate = tax_rate;
    if (return_policy !== undefined) updatePayload.return_policy = return_policy;
    if (phone !== undefined) updatePayload.phone = phone;
    if (address_line1 !== undefined) updatePayload.address_line1 = address_line1;
    if (city !== undefined) updatePayload.city = city;
    if (region !== undefined) updatePayload.region = region;
    if (letterhead !== undefined) updatePayload.letterhead = letterhead;
    if (currency !== undefined) updatePayload.currency = currency;

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .update(updatePayload)
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
