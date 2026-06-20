const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/locations
 * Fetch all locations.
 * If not Platform Admin, returns only locations for the user's business.
 * Access: Authenticated staff
 */
router.get('/', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('locations')
      .select('*')
      .order('name');

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!['Platform Admin', 'Business Admin', 'Manager'].includes(req.user.role)) {
       const { data: userLocs, error: locErr } = await supabaseAdmin
         .from('user_locations')
         .select('location_id')
         .eq('user_id', req.user.id);
       
       if (locErr) throw locErr;
       
       const allowedIds = userLocs.map(ul => ul.location_id);
       const filteredData = data.filter(loc => allowedIds.includes(loc.id));
       return res.json(filteredData);
    }

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching locations:');
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

/**
 * POST /api/locations
 * Create a new location.
 * Access: Platform Admin or Business Admin
 */
router.post('/', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { name, address, tax_rate, receipt_header, currency } = req.body;
    let business_id = req.user.business_id;

    if (req.user.role === 'Platform Admin' && req.body.business_id) {
      business_id = req.body.business_id;
    }

    if (!name) {
      return res.status(400).json({ error: 'Location name is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('locations')
      .insert([{
        business_id,
        name,
        address,
        tax_rate: tax_rate || 0.00,
        receipt_header,
        currency: currency || null,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error creating location:');
    res.status(500).json({ error: 'Failed to create location' });
  }
});

/**
 * PUT /api/locations/:id
 * Update a location.
 * Access: Platform Admin or Business Admin
 */
router.put('/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { name, address, tax_rate, receipt_header, currency } = req.body;

    // Verify ownership if not Platform Admin
    if (req.user.role !== 'Platform Admin') {
      const { data: existing } = await supabaseAdmin
        .from('locations')
        .select('business_id')
        .eq('id', req.params.id)
        .single();

      if (!existing || existing.business_id !== req.user.business_id) {
        return res.status(403).json({ error: 'Cannot modify a location belonging to another business' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('locations')
      .update({ name, address, tax_rate, receipt_header, currency: currency || null })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Location not found' });

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error updating location:');
    res.status(500).json({ error: 'Failed to update location' });
  }
});

/**
 * DELETE /api/locations/:id
 * Delete a location.
 * Access: Platform Admin or Business Admin
 */
router.delete('/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    // Verify ownership if not Platform Admin
    if (req.user.role !== 'Platform Admin') {
      const { data: existing } = await supabaseAdmin
        .from('locations')
        .select('business_id')
        .eq('id', req.params.id)
        .single();
        
      if (!existing || existing.business_id !== req.user.business_id) {
        return res.status(403).json({ error: 'Cannot delete a location belonging to another business' });
      }
    }

    const { error, count } = await supabaseAdmin
      .from('locations')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);

    if (error) {
      if (error.code === '23503') { // Foreign key constraint
        return res.status(400).json({ error: 'Cannot delete location because it has active users, sales, or inventory tied to it.' });
      }
      throw error;
    }
    
    if (count === 0) return res.status(404).json({ error: 'Location not found' });

    res.json({ message: 'Location deleted successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting location:');
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

module.exports = router;
