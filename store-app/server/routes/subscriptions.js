const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const { invalidateBusinessCache } = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { checkoutQuote, hasPaidBefore } = require('../utils/subscriptionCharge');
const { applySubscriptionPayment, fromPaystack } = require('../services/subscriptionPayments');
const { resolvePaystackGateway } = require('../services/paystack');
const { logAuditEvent, AUDIT_ACTIONS } = require('../utils/auditLog');

const router = express.Router();

/* ============================================================
   PLAN CRUD
   ============================================================ */

/**
 * GET /api/subscriptions/price  (public)
 * The plan on sale, for the signup page to quote without a session. The same
 * figures the landing page publishes; nothing here is private.
 */
router.get('/price', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('platform_plans')
      .select('name, currency, price_yearly, setup_fee, price_per_extra_location')
      .eq('is_active', true).order('sort_order', { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No plan is on sale.' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      name: data.name, currency: data.currency || 'GHS', price_yearly: Number(data.price_yearly),
      setup_fee: Number(data.setup_fee || 0), price_per_extra_location: Number(data.price_per_extra_location || 0),
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching the public price');
    res.status(500).json({ error: 'The price could not be loaded.' });
  }
});

/**
 * GET /api/subscriptions/plans
 * List active plans (signed in)
 */
router.get('/plans', authGuard, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching plans:');
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * GET /api/subscriptions/plans/all
 * List all plans (including inactive), Platform Admin only
 */
router.get('/plans/all', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_plans')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching all plans:');
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * POST /api/subscriptions/plans
 * Create a new plan, Platform Admin only
 */
router.post('/plans', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const {
      name, description, price_monthly, price_yearly, currency,
      setup_fee, price_per_extra_location, compare_at_price_monthly, compare_at_price_yearly,
      max_users, max_locations, max_products, features, sort_order,
      promo_mode, intro_price_monthly, intro_price_yearly,
      trial_days_monthly, trial_unit_monthly, trial_days_yearly, trial_unit_yearly
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Plan name is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('platform_plans')
      .insert([{
        name,
        description: description || '',
        price_monthly: price_monthly || 0,
        price_yearly: price_yearly || 0,
        setup_fee: setup_fee || 0,
        price_per_extra_location: price_per_extra_location || 0,
        compare_at_price_monthly: compare_at_price_monthly || null,
        compare_at_price_yearly: compare_at_price_yearly || null,
        currency: currency || 'GHS',
        max_users: max_users ?? -1,
        max_locations: max_locations ?? 1,
        max_products: max_products ?? -1,
        features: features || {},
        promo_mode: promo_mode || 'none',
        intro_price_monthly: intro_price_monthly || null,
        intro_price_yearly: intro_price_yearly || null,
        trial_days_monthly: trial_days_monthly ?? 0,
        trial_unit_monthly: trial_unit_monthly || 'days',
        trial_days_yearly: trial_days_yearly ?? 30,
        trial_unit_yearly: trial_unit_yearly || 'days',
        sort_order: sort_order ?? 0,
        is_active: true,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error creating plan:');
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

/**
 * PUT /api/subscriptions/plans/:id
 * Update a plan, Platform Admin only
 */
router.put('/plans/:id', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    // Remove id from updates if present
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabaseAdmin
      .from('platform_plans')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Plan not found' });
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error updating plan:');
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

/**
 * DELETE /api/subscriptions/plans/:id
 * Soft-delete a plan (set is_active = false), Platform Admin only
 */
router.delete('/plans/:id', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('platform_plans')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Plan deactivated', plan: data });
  } catch (err) {
    logger.error({ err: err }, 'Error deactivating plan:');
    res.status(500).json({ error: 'Failed to deactivate plan' });
  }
});

/* ============================================================
   SUBSCRIPTION MANAGEMENT
   ============================================================ */

/**
 * GET /api/subscriptions/business/:id
 * Get subscription for a specific business
 */
router.get('/business/:id', authGuard, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify access: Platform Admin or same business
    if (req.user.role !== 'Platform Admin' && req.user.business_id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabaseAdmin
      .from('business_subscriptions')
      .select('*, platform_plans(*), payment_gateways(provider, display_name)')
      .eq('business_id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    res.json(data || null);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching subscription:');
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * The plan a business pays for: the one it is on if that is still offered,
 * otherwise the plan on sale now (since 8 October 2026 there is one).
 */
async function planFor(business) {
  if (business.subscription_plan_id) {
    const { data, error } = await supabaseAdmin.from('platform_plans').select('*').eq('id', business.subscription_plan_id).maybeSingle();
    if (error) throw error;
    if (data?.is_active) return data;
  }
  const { data, error } = await supabaseAdmin.from('platform_plans').select('*').eq('is_active', true)
    .order('sort_order', { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function businessForBilling(id) {
  const { data, error } = await supabaseAdmin.from('businesses')
    .select('id, name, status, is_demo, paid_locations, subscription_plan_id').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * GET /api/subscriptions/mine
 * Everything the Billing page shows, priced on the server: the plan, the
 * year paid for, branches paid for and in use, and what each payment the
 * business can make now would cost.
 */
router.get('/mine', authGuard, permissionCheck('manage_billing'), async (req, res) => {
  try {
    const business = await businessForBilling(req.user.business_id);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    const [plan, paidBefore, sub, used] = await Promise.all([
      planFor(business),
      hasPaidBefore(supabaseAdmin, business.id),
      supabaseAdmin.from('business_subscriptions').select('status, current_period_start, current_period_end').eq('business_id', business.id).maybeSingle(),
      supabaseAdmin.from('locations').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
    ]);
    if (sub.error) throw sub.error;
    if (used.error) throw used.error;
    const offer = async (kind, branches) => {
      if (!plan) return null;
      const priced = await checkoutQuote(supabaseAdmin, { business, plan, kind, branches });
      return priced.error ? null : { kind, branches: priced.branches, amount: priced.amount, lines: priced.lines };
    };
    res.json({
      status: business.status,
      is_demo: business.is_demo,
      paid_before: paidBefore,
      paid_locations: business.paid_locations || 1,
      locations_used: used.count || 0,
      subscription: sub.data || null,
      plan: plan && {
        id: plan.id, name: plan.name, currency: plan.currency || 'GHS', description: plan.description,
        price_yearly: Number(plan.price_yearly), setup_fee: Number(plan.setup_fee || 0),
        price_per_extra_location: Number(plan.price_per_extra_location || 0),
      },
      offers: {
        start: paidBefore ? null : await offer('start', 1),
        renew: paidBefore ? await offer('renew') : null,
        branch: paidBefore ? await offer('branches', 1) : null,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error loading billing summary');
    res.status(500).json({ error: 'Billing could not be loaded.' });
  }
});

/**
 * GET /api/subscriptions
 * Get all subscriptions, Platform Admin only
 */
router.get('/', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('business_subscriptions')
      .select('*, businesses(id, name), platform_plans(name, price_monthly)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching subscriptions:');
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

/**
 * POST /api/subscriptions/assign { business_id, plan_id, billing_cycle?, paid_locations? }
 * The platform operator assigns a plan by hand, for an account quoted and
 * paid outside checkout; it opens the account. Platform Admins only.
 */
router.post('/assign', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { business_id, plan_id, billing_cycle, paid_locations } = req.body;
    // Until 8 October 2026 a business could switch itself to a "free" plan
    // here. Every plan is paid now and starts through checkout, and with the
    // yearly plan's monthly price of 0 that path would have activated
    // QuadERP for nothing.

    if (!business_id || !plan_id) {
      return res.status(400).json({ error: 'business_id and plan_id are required' });
    }
    if (paid_locations !== undefined && !(Number.isInteger(paid_locations) && paid_locations >= 1 && paid_locations <= 100)) {
      return res.status(400).json({ error: 'paid_locations must be a whole number from 1 to 100.' });
    }

    // Fetch the plan
    const { data: plan, error: planError } = await supabaseAdmin
      .from('platform_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Calculate period
    const now = new Date();
    const periodEnd = new Date(now);
    const cycle = billing_cycle || 'yearly'; // yearly only since 8 October 2026
    if (cycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setDate(periodEnd.getDate() + 30);
    }

    // Calculate trial end if applicable
    let trialEndsAt = null;
    let status = 'active';
    const amount = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

    const promoMode = plan.promo_mode || 'none';
    const trialValue = cycle === 'yearly' ? (plan.trial_days_yearly || 0) : (plan.trial_days_monthly || 0);
    const trialUnit = cycle === 'yearly' ? (plan.trial_unit_yearly || 'days') : (plan.trial_unit_monthly || 'days');

    if (promoMode === 'trial' && trialValue > 0 && amount > 0) {
      trialEndsAt = new Date(now);
      const trialDays = trialUnit === 'months' ? trialValue * 30 : trialValue;
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
      status = 'trialing';
    }

    if (amount === 0) {
      status = 'active'; // Free plans are always active
    }

    // Check for existing subscription
    const { data: existing } = await supabaseAdmin
      .from('business_subscriptions')
      .select('id')
      .eq('business_id', business_id)
      .single();

    let subscription;

    if (existing) {
      // Update existing subscription
      const { data, error } = await supabaseAdmin
        .from('business_subscriptions')
        .update({
          plan_id,
          status,
          billing_cycle: cycle,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          trial_ends_at: trialEndsAt?.toISOString() || null,
          amount,
          currency: plan.currency,
          updated_at: now.toISOString(),
        })
        .eq('id', existing.id)
        .select('*, platform_plans(*)')
        .single();

      if (error) throw error;
      subscription = data;
    } else {
      // Create new subscription
      const { data, error } = await supabaseAdmin
        .from('business_subscriptions')
        .insert([{
          business_id,
          plan_id,
          status,
          billing_cycle: cycle,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          trial_ends_at: trialEndsAt?.toISOString() || null,
          amount,
          currency: plan.currency,
        }])
        .select('*, platform_plans(*)')
        .single();

      if (error) throw error;
      subscription = data;
    }

    // Update business table with plan reference, and the branches it covers
    await supabaseAdmin
      .from('businesses')
      .update({ subscription_plan_id: plan_id, ...(paid_locations ? { paid_locations } : {}) })
      .eq('id', business_id);

    // An operator's assignment opens the account, whatever it was waiting on.
    await supabaseAdmin
      .from('businesses')
      .update({ status: status === 'trialing' ? 'trialing' : 'active' })
      .eq('id', business_id)
      .in('status', ['banned', 'expired', 'unpaid']);

    // The business may have just gone from banned/expired to active. authGuard
    // gates the entire app on the cached business_status, so without this the
    // customer keeps seeing "your trial has ended" after paying.
    invalidateBusinessCache(business_id);

    logAuditEvent(req, AUDIT_ACTIONS.SUBSCRIPTION_CHANGED, 'subscription', subscription?.id, {
      business_id,
      plan_id,
      plan_name: plan.name,
      billing_cycle: cycle,
      status,
    });

    res.json({
      message: `Plan "${plan.name}" assigned successfully`,
      subscription,
    });
  } catch (err) {
    logger.error({ err: err }, 'Error assigning plan:');
    res.status(500).json({ error: 'Failed to assign plan' });
  }
});

/* ============================================================
   PAYSTACK INTEGRATION
   ============================================================ */

/**
 * POST /api/subscriptions/initialize-paystack { kind, branches?, callback_url? }
 * Start a Paystack checkout for one payment: `start` (setup and first year),
 * `renew` (a year, every branch paid for) or `branches` (more branches). The
 * amount is the server's (utils/subscriptionCharge), never the client's.
 */
router.post('/initialize-paystack', authGuard, permissionCheck('manage_billing'), async (req, res) => {
  try {
    const { kind, branches, callback_url } = req.body || {};
    const business = await businessForBilling(req.user.business_id);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (business.is_demo) return res.status(403).json({ error: 'The demo cannot take payments.' });
    const plan = await planFor(business);
    if (!plan) return res.status(409).json({ error: 'No plan is on sale. Contact QuadERP.' });

    const priced = await checkoutQuote(supabaseAdmin, { business, plan, kind, branches: branches === undefined ? undefined : Number(branches) });
    if (priced.error) return res.status(400).json({ error: priced.error });

    /* Through the resolver so this path can be exercised at all. It reads the
       live row in production and can only return test keys outside it, which
       is what stops a stray PAYSTACK_MODE pointing real payments at test keys
       and reporting success while no money moves. */
    const { gateway } = await resolvePaystackGateway(supabaseAdmin);
    if (!gateway) {
      return res.status(400).json({ error: 'Paystack is not configured. Contact your platform administrator.' });
    }

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gateway.secret_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: req.user.email,
        amount: Math.round(priced.amount * 100), // pesewas
        currency: priced.currency,
        callback_url: callback_url || `${process.env.APP_URL || 'https://app.quaderp.app'}/business-admin/billing`,
        metadata: {
          business_id: business.id,
          plan_id: plan.id,
          plan_name: plan.name,
          kind: priced.kind,
          branches: priced.branches,
          user_id: req.user.id,
        },
      }),
    });

    const paystackData = await paystackResponse.json();
    if (!paystackData.status) {
      logger.warn({ paystackMessage: paystackData.message }, 'Paystack initialization refused'); // `message` is swallowed by the log formatter
      return res.status(400).json({ error: 'Paystack could not start the payment. Try again.' });
    }

    res.json({
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: paystackData.data.reference,
      amount: priced.amount,
      currency: priced.currency,
    });
  } catch (err) {
    logger.error({ err: err }, 'Error initializing Paystack:');
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

/**
 * POST /api/subscriptions/verify-paystack { reference }
 * Called by the Billing page when Paystack sends the customer back. Applies
 * the payment now rather than waiting for the webhook; whichever arrives
 * second finds it already applied.
 */
router.post('/verify-paystack', authGuard, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    const { gateway } = await resolvePaystackGateway(supabaseAdmin);
    if (!gateway) {
      return res.status(400).json({ error: 'Paystack is not configured.' });
    }

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${gateway.secret_key}` },
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.status || verifyData.data?.status !== 'success') {
      return res.status(400).json({ error: 'Payment verification failed or payment was not successful' });
    }

    const claim = fromPaystack(verifyData.data);
    if (claim.businessId && req.user.role !== 'Platform Admin' && claim.businessId !== req.user.business_id) {
      return res.status(403).json({ error: 'This payment belongs to another business.' });
    }

    const outcome = await applySubscriptionPayment(claim);
    if (outcome.error) {
      logger.warn({ reference, businessId: claim.businessId, reason: outcome.error }, 'Paystack payment does not match what it claims to buy');
      return res.status(400).json({ error: `${outcome.error} Contact support with payment reference ${reference}.` });
    }

    res.json({
      message: outcome.already ? 'Payment verified and already processed' : 'Payment verified and processed successfully',
      status: 'success',
    });
  } catch (err) {
    logger.error({ err: err }, 'Error verifying Paystack:');
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// NOTE: POST /api/subscriptions/paystack-webhook is no longer defined here.
// It is registered in index.js, above the global JSON body parser, because
// signature verification needs the raw request bytes and the parser destroys
// them. The handler lives in routes/paystackWebhook.js and serves this URL as
// well as the /api/billing/paystack/webhook one. Do not re-add it here.

module.exports = router;
