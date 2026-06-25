const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { resolveCurrency } = require('../utils/currency');

const router = express.Router();

/**
 * GET /api/businesses/by-slug/:slug
 * Public lookup used to brand the login page on a business's subdomain
 * (e.g. acme-hardware.quaderp.app). Deliberately returns only the minimal
 * fields needed for branding, never the full business record.
 * Access: Public (no auth)
 */
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('id, name, logo_url, status')
      .eq('slug', req.params.slug)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Business not found' });

    res.json({ id: data.id, name: data.name, logo_url: data.logo_url, status: data.status });
  } catch (err) {
    logger.error({ err: err }, 'Error looking up business by slug:');
    res.status(500).json({ error: 'Failed to look up business' });
  }
});

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

    // Active location's currency (if set) overrides the business default,
    // so the whole app follows whichever location is currently selected.
    const currency = await resolveCurrency(supabaseAdmin, req.user.business_id, req.user.active_location_id);
    res.json({ ...data, currency });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching business:');
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
    const { name, contact_email, logo_url, tax_rate, return_policy, phone, address_line1, city, region, letterhead, currency, qr_tracking_mode } = req.body;

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
    if (qr_tracking_mode !== undefined) updatePayload.qr_tracking_mode = qr_tracking_mode;

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
    logger.error({ err: err }, 'Error updating business:');
    res.status(500).json({ error: err.message || 'Failed to update business profile' });
  }
});

/**
 * GET /api/businesses/me/setup-status
 * Guided setup checklist — every step's completion is computed live from
 * existing data rather than persisted, except the dismissed flag.
 * Access: Any authenticated user from the business
 */
router.get('/me/setup-status', authGuard, async (req, res) => {
  try {
    const businessId = req.user.business_id;
    if (!businessId) {
      return res.status(404).json({ error: 'No business associated with this account' });
    }

    const [business, locations, templates, products, productInventory, customers, suppliers, users] = await Promise.all([
      supabaseAdmin.from('businesses').select('name, contact_email, currency, setup_checklist_dismissed_at').eq('id', businessId).single(),
      supabaseAdmin.from('locations').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabaseAdmin.from('accounting_templates').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabaseAdmin.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabaseAdmin.from('product_inventory').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabaseAdmin.from('suppliers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    ]);

    if (business.error) throw business.error;

    const profileComplete = !!(business.data?.name && business.data?.contact_email && business.data?.currency);

    const steps = [
      { key: 'profile', label: 'Complete your business profile', complete: profileComplete, actionPath: '/business-admin/organization' },
      { key: 'locations', label: 'Add at least one location', complete: (locations.count || 0) > 0, actionPath: '/business-admin/locations' },
      { key: 'accounting_templates', label: 'Set up accounting templates', complete: (templates.count || 0) > 0, actionPath: '/business-admin/setup' },
      { key: 'products', label: 'Import products and opening stock', complete: (products.count || 0) > 0 && (productInventory.count || 0) > 0, actionPath: '/imports/products' },
      { key: 'customers', label: 'Import customers and opening balances', complete: (customers.count || 0) > 0, actionPath: '/imports/customers' },
      { key: 'suppliers', label: 'Import suppliers and opening balances', complete: (suppliers.count || 0) > 0, actionPath: '/imports/suppliers' },
      { key: 'team', label: 'Invite your team', complete: (users.count || 0) > 1, actionPath: '/business-admin/team' },
    ];

    res.json({ steps, dismissed: !!business.data?.setup_checklist_dismissed_at });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching setup status:');
    res.status(500).json({ error: 'Failed to fetch setup status' });
  }
});

/**
 * PUT /api/businesses/:id/setup-status/dismiss
 * Access: Must have manage_business permission
 */
router.put('/:id/setup-status/dismiss', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    if (req.user.role !== 'Platform Admin' && req.user.business_id !== req.params.id) {
      return res.status(403).json({ error: 'Cannot update a different business profile.' });
    }

    const { error } = await supabaseAdmin
      .from('businesses')
      .update({ setup_checklist_dismissed_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Setup checklist dismissed' });
  } catch (err) {
    logger.error({ err: err }, 'Error dismissing setup checklist:');
    res.status(500).json({ error: 'Failed to dismiss setup checklist' });
  }
});

module.exports = router;
