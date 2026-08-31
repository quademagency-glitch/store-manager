const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * How many locations this business's plan allows, or null for "do not enforce".
 *
 * The whole price list rests on this number and until now nothing read it.
 * platform_plans.max_locations was set, shown to the customer on the billing
 * screen, and never once compared against reality, so a Single Branch account
 * could open five shops and pay for one. auth.js already treats the column as
 * load-bearing: its SELF_SERVICE_PLANS allowlist exists so that a guessed
 * `?plan=franchise` cannot "hand somebody unlimited locations for thirty days".
 * That guard was protecting a limit that did not exist.
 *
 * Returns null, meaning allow, in three cases, all deliberate:
 *
 *   - max_locations is -1, the schema's documented "unlimited" (migration 015).
 *   - The business has no plan attached. Accounts predate the plans table and
 *     some were created before signup assigned one. Blocking them from adding
 *     a shop because of our own bookkeeping would be a support ticket caused
 *     by a billing feature, which is the wrong way round.
 *   - The lookup itself failed. This is a commercial limit, not a security
 *     control. If the database is unwell the right failure is to let a paying
 *     customer carry on working and to leave a line in the log, not to block
 *     the shop that is trying to open.
 */
async function locationAllowance(businessId) {
  try {
    const { data: business, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('subscription_plan_id')
      .eq('id', businessId)
      .single();

    if (bizErr || !business?.subscription_plan_id) return null;

    const { data: plan, error: planErr } = await supabaseAdmin
      .from('platform_plans')
      .select('name, max_locations')
      .eq('id', business.subscription_plan_id)
      .single();

    if (planErr || !plan) return null;

    const max = Number(plan.max_locations);
    if (!Number.isFinite(max) || max < 0) return null;

    return { max, planName: plan.name };
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
            { businessId: business_id, used, max: allowance.max, plan: allowance.planName },
            'Location create refused, plan allowance reached',
          );
          return res.status(402).json({
            error: 'Plan limit reached',
            message: `Your ${allowance.planName} plan covers ${allowance.max} ${allowance.max === 1 ? 'shop' : 'shops'} and you are using ${used}. Move up a plan to add another.`,
            code: 'LOCATION_LIMIT_REACHED',
            limit: allowance.max,
            used,
            plan: allowance.planName,
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
