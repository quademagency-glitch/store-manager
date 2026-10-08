const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * How many branches this business has paid for, or null for "do not enforce".
 *
 * Since 8 October 2026 a subscription covers one branch, and each further
 * branch is bought for the plan's price_per_extra_location a year
 * (businesses.paid_locations, kept by apply_subscription_payment, migration
 * 105). Until then this read the plan's max_locations.
 *
 * Returns null, meaning allow, when:
 *   - the business is the public demo;
 *   - the lookup itself failed. This is a commercial limit, not a security
 *     control. If the database is unwell the right failure is to let a paying
 *     customer carry on working and to leave a line in the log, not to block
 *     the shop that is trying to open.
 */
async function locationAllowance(businessId) {
  try {
    const { data: business, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('paid_locations, is_demo, platform_plans:subscription_plan_id (price_per_extra_location, currency)')
      .eq('id', businessId)
      .single();

    if (bizErr || !business || business.is_demo) return null;
    const max = Number(business.paid_locations);
    if (!Number.isInteger(max) || max < 1) return null;

    const plan = business.platform_plans || {};
    return { max, pricePerBranch: Number(plan.price_per_extra_location) || 0, currency: plan.currency || 'GHS' };
  } catch (err) {
    logger.error({ err, businessId }, 'Location allowance lookup failed, allowing the create');
    return null;
  }
}

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

    /* Platform Admins are acting on the business's behalf, normally while
       setting up an account that has been quoted by hand, so the plan ceiling
       does not apply to them. */
    if (req.user.role !== 'Platform Admin') {
      const allowance = await locationAllowance(business_id);
      if (allowance) {
        const { count, error: countErr } = await supabaseAdmin
          .from('locations')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business_id);

        const used = countErr ? null : (count ?? 0);
        if (used !== null && used >= allowance.max) {
          logger.info(
            { businessId: business_id, used, max: allowance.max },
            'Location create refused, paid branches all in use',
          );
          const price = allowance.pricePerBranch ? ` for ${allowance.currency} ${allowance.pricePerBranch.toLocaleString('en-GH')} a year` : '';
          return res.status(402).json({
            error: 'Branch limit reached',
            message: `Your subscription covers ${allowance.max} ${allowance.max === 1 ? 'branch' : 'branches'} and you are using ${used}. Add another branch${price} under Billing.`,
            code: 'LOCATION_LIMIT_REACHED',
            limit: allowance.max,
            used,
            price_per_branch: allowance.pricePerBranch,
            currency: allowance.currency,
          });
        }
      }
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
    // The signed-in user's cached branch list is what X-Location-Id is checked against.
    authGuard.invalidateBusinessCache(business_id);
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
    // A deleted branch left in a cached list for up to a minute is harmless; this just tidies it.
    if (req.user.role !== 'Platform Admin') authGuard.invalidateBusinessCache(req.user.business_id);

    res.json({ message: 'Location deleted successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting location:');
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

module.exports = router;
