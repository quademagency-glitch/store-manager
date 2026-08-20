const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { resolveCurrency } = require('../utils/currency');
const { resolveCountry } = require('../utils/phone');
const { sendBusinessWelcomeEmail } = require('../services/emailService');
const { logAuditEvent, AUDIT_ACTIONS } = require('../utils/auditLog');
const rateLimit = require('express-rate-limit');
const archiver = require('archiver');
const { appendBusinessData } = require('../services/businessExport');

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
    // Country is resolved the same way and for the same reason, it is what
    // supplies the dialing code for phone numbers typed without one, and a
    // Nigeria branch of a Ghanaian business must not stamp +233 on its
    // customers.
    const [currency, country] = await Promise.all([
      resolveCurrency(supabaseAdmin, req.user.business_id, req.user.active_location_id),
      resolveCountry(supabaseAdmin, req.user.business_id, req.user.active_location_id),
    ]);
    res.json({ ...data, currency, country });
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

    // status is included because changing it suspends or restores every user
    // in the tenant, the single most consequential field on this record.
    logAuditEvent(req, AUDIT_ACTIONS.BUSINESS_UPDATED, 'business', req.params.id, {
      name: data.name,
      status: data.status,
    });

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error updating business:');
    res.status(500).json({ error: err.message || 'Failed to update business profile' });
  }
});

/**
 * GET /api/businesses/me/setup-status
 * Guided setup checklist, every step's completion is computed live from
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

/**
 * POST /api/businesses/:id/send-welcome
 * Re-send the branded welcome email to a business's admin. Regenerates a fresh
 * "set your password" link. Recipient is the business's Business Admin, or an
 * explicit { email } in the body (must belong to the business).
 * Access: Platform Admin only.
 */
router.post('/:id/send-welcome', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { id } = req.params;
    const { email: overrideEmail } = req.body || {};

    const { data: business, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('id, name, slug, subscription_plan_id')
      .eq('id', id)
      .single();

    if (bizErr || !business) return res.status(404).json({ error: 'Business not found' });

    // Resolve the recipient: explicit email (verified to belong to the business),
    // otherwise the business's Business Admin account.
    let recipient;
    if (overrideEmail) {
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('name, email')
        .eq('business_id', id)
        .eq('email', overrideEmail)
        .maybeSingle();
      if (!u) return res.status(400).json({ error: 'That email does not belong to this business.' });
      recipient = u;
    } else {
      const { data: admins } = await supabaseAdmin
        .from('users')
        .select('name, email, roles:role_id!inner(name)')
        .eq('business_id', id)
        .eq('roles.name', 'Business Admin')
        .limit(1);
      recipient = admins && admins[0];
      if (!recipient) {
        return res.status(400).json({ error: 'No Business Admin found for this business. Pass an explicit email.' });
      }
    }

    let planName = null;
    if (business.subscription_plan_id) {
      const { data: plan } = await supabaseAdmin
        .from('platform_plans')
        .select('name')
        .eq('id', business.subscription_plan_id)
        .single();
      planName = plan?.name || null;
    }

    const result = await sendBusinessWelcomeEmail(
      business,
      { name: recipient.name, email: recipient.email },
      { planName },
    );

    if (!result.success) {
      return res.status(502).json({ error: result.error || 'Failed to send welcome email' });
    }

    res.json({
      message: result.simulated
        ? `Welcome email simulated for ${recipient.email} (email provider not configured).`
        : `Welcome email sent to ${recipient.email}.`,
      recipients: result.recipients,
    });
  } catch (err) {
    logger.error({ err: err }, 'Error sending welcome email:');
    res.status(500).json({ error: 'Failed to send welcome email' });
  }
});


/**
 * GET /api/businesses/me/export
 *
 * Streams the business's own records as a ZIP of CSVs. Backs the commitment in
 * the Privacy Policy that an owner can retrieve their data at any time.
 */
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 1,
  // Keyed by business, not IP: two owners of the same shop behind one office
  // connection should not share a budget, and one owner should not be able to
  // start eight exports from eight devices.
  keyGenerator: (req) => req.user?.business_id || rateLimit.ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Export already requested',
    message: 'An export can be generated once per hour. Try again shortly.',
  },
});

// authGuard -> permissionCheck -> limiter, in that order on purpose: the
// limiter keys off req.user.business_id, which only exists once authGuard has
// run. Same reasoning as the apiKeyGuard/publicApiLimiter pairing in index.js.
router.get('/me/export', authGuard, permissionCheck('manage_business'), exportLimiter, async (req, res) => {
  const businessId = req.user.business_id;
  if (!businessId) return res.status(400).json({ error: 'No business associated with this account' });

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, name, slug')
    .eq('id', businessId)
    .single();

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (business?.slug || 'business').replace(/[^a-z0-9-]/gi, '');
  res.attachment(`quaderp-export-${slug}-${stamp}.zip`);

  // level 6, not 9. routes/ledger.js uses 9, but on text-heavy CSV the extra
  // compression buys a few percent for substantially more CPU, and this runs
  // on a worker that is also serving the POS.
  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('warning', (err) => logger.warn({ err, reqId: req.id, businessId }, 'Export archive warning'));
  archive.on('error', (err) => {
    logger.error({ err, reqId: req.id, businessId }, 'Export archive failed');
    // Headers are long gone by now, so there is no way to send a JSON error.
    // Destroying the socket gives the client a truncated transfer it can
    // detect, rather than a well-formed ZIP quietly missing half the data.
    res.destroy(err);
  });

  // If the client goes away, stop. Without this a cancelled download leaves us
  // paging Supabase for nobody, and since the limiter counts starts rather
  // than completions, that would hand an attacker an hour of free queries per
  // attempt.
  res.on('close', () => {
    if (!res.writableEnded) {
      logger.info({ reqId: req.id, businessId }, 'Export client disconnected, aborting');
      archive.abort();
    }
  });

  archive.pipe(res);

  try {
    const counters = await appendBusinessData(archive, businessId, business);
    await archive.finalize();
    logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORTED, 'business', businessId, {
      rows: counters.rows,
      tables_with_errors: counters.errors,
    });
  } catch (err) {
    logger.error({ err, reqId: req.id, businessId }, 'Export failed');
    if (!res.headersSent) return res.status(500).json({ error: 'Export failed' });
    res.destroy(err);
  }
});

module.exports = router;
