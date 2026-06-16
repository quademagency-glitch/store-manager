const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const crypto = require('crypto');

const router = express.Router();

/* ============================================================
   PLAN CRUD
   ============================================================ */

/**
 * GET /api/subscriptions/plans
 * List active plans (public for pricing display)
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
 * List all plans (including inactive) — Platform Admin only
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
 * Create a new plan — Platform Admin only
 */
router.post('/plans', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const {
      name, description, price_monthly, price_yearly, currency,
      max_users, max_locations, max_products, features, trial_days, sort_order
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
        currency: currency || 'GHS',
        max_users: max_users ?? -1,
        max_locations: max_locations ?? 1,
        max_products: max_products ?? -1,
        features: features || {},
        trial_days: trial_days ?? 7,
        sort_order: sort_order ?? 0,
        is_active: true,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error creating plan:');
    res.status(500).json({ error: err.message || 'Failed to create plan' });
  }
});

/**
 * PUT /api/subscriptions/plans/:id
 * Update a plan — Platform Admin only
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
    res.status(500).json({ error: err.message || 'Failed to update plan' });
  }
});

/**
 * DELETE /api/subscriptions/plans/:id
 * Soft-delete a plan (set is_active = false) — Platform Admin only
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
    res.status(500).json({ error: err.message || 'Failed to deactivate plan' });
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
 * GET /api/subscriptions
 * Get all subscriptions — Platform Admin only
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
 * POST /api/subscriptions/assign
 * Assign or change a plan for a business — Platform Admin only
 */
router.post('/assign', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { business_id, plan_id, billing_cycle } = req.body;

    if (!business_id || !plan_id) {
      return res.status(400).json({ error: 'business_id and plan_id are required' });
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
    const cycle = billing_cycle || 'monthly';
    if (cycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setDate(periodEnd.getDate() + 30);
    }

    // Calculate trial end if applicable
    let trialEndsAt = null;
    let status = 'active';
    const amount = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

    if (plan.trial_days > 0 && amount > 0) {
      trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + plan.trial_days);
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

    // Update business table with plan reference
    await supabaseAdmin
      .from('businesses')
      .update({ subscription_plan_id: plan_id })
      .eq('id', business_id);

    // If business was banned due to expired sub, reactivate it
    await supabaseAdmin
      .from('businesses')
      .update({ status: 'active' })
      .eq('id', business_id)
      .eq('status', 'banned');

    res.json({
      message: `Plan "${plan.name}" assigned successfully`,
      subscription,
    });
  } catch (err) {
    logger.error({ err: err }, 'Error assigning plan:');
    res.status(500).json({ error: err.message || 'Failed to assign plan' });
  }
});

/* ============================================================
   PAYSTACK INTEGRATION
   ============================================================ */

/**
 * POST /api/subscriptions/initialize-paystack
 * Initialize a Paystack payment transaction for subscription
 */
router.post('/initialize-paystack', authGuard, async (req, res) => {
  try {
    const { plan_id, billing_cycle, callback_url } = req.body;

    if (!plan_id) {
      return res.status(400).json({ error: 'plan_id is required' });
    }

    // Fetch the plan
    const { data: plan } = await supabaseAdmin
      .from('platform_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    // Get the active Paystack gateway
    const { data: gateway } = await supabaseAdmin
      .from('payment_gateways')
      .select('*')
      .eq('provider', 'paystack')
      .eq('is_active', true)
      .single();

    if (!gateway) {
      return res.status(400).json({ error: 'Paystack is not configured. Contact your platform administrator.' });
    }

    const cycle = billing_cycle || 'monthly';
    const amount = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
    const amountInPesewas = Math.round(amount * 100); // Paystack uses smallest currency unit

    // Initialize Paystack transaction
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gateway.secret_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: req.user.email,
        amount: amountInPesewas,
        currency: plan.currency || 'GHS',
        callback_url: callback_url || `${process.env.APP_URL || 'https://quaderp.app'}/platform-admin`,
        metadata: {
          business_id: req.user.business_id,
          plan_id: plan.id,
          plan_name: plan.name,
          billing_cycle: cycle,
          user_id: req.user.id,
        },
      }),
    });

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      return res.status(400).json({ error: paystackData.message || 'Paystack initialization failed' });
    }

    res.json({
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: paystackData.data.reference,
    });
  } catch (err) {
    logger.error({ err: err }, 'Error initializing Paystack:');
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

/**
 * POST /api/subscriptions/verify-paystack
 * Synchronously verify a Paystack transaction and provision the subscription immediately.
 */
router.post('/verify-paystack', authGuard, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    // Get the active Paystack gateway
    const { data: gateway } = await supabaseAdmin
      .from('payment_gateways')
      .select('*')
      .eq('provider', 'paystack')
      .eq('is_active', true)
      .single();

    if (!gateway) {
      return res.status(400).json({ error: 'Paystack is not configured.' });
    }

    // Verify transaction with Paystack
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${gateway.secret_key}`
      }
    });

    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment verification failed or payment was not successful' });
    }

    const { data } = verifyData;
    const metadata = data.metadata || {};
    
    // Check if we already processed this invoice to prevent duplication
    const { data: existingInvoice } = await supabaseAdmin
      .from('billing_invoices')
      .select('id')
      .eq('paystack_reference', reference)
      .single();

    if (existingInvoice) {
      // Already processed by webhook
      return res.json({ message: 'Payment verified and already processed', status: 'success' });
    }

    if (metadata.business_id && metadata.plan_id) {
      const now = new Date();
      const periodEnd = new Date(now);
      const cycle = metadata.billing_cycle || 'monthly';
      if (cycle === 'yearly') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setDate(periodEnd.getDate() + 30);
      }

      // Upsert subscription
      const { data: existingSub } = await supabaseAdmin
        .from('business_subscriptions')
        .select('id')
        .eq('business_id', metadata.business_id)
        .single();

      const subData = {
        plan_id: metadata.plan_id,
        status: 'active',
        billing_cycle: cycle,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        trial_ends_at: null,
        amount: data.amount / 100, // Convert from pesewas/kobo
        currency: data.currency || 'GHS',
        paystack_subscription_code: reference,
        updated_at: now.toISOString(),
      };

      let subId = existingSub?.id;
      if (existingSub) {
        await supabaseAdmin
          .from('business_subscriptions')
          .update(subData)
          .eq('id', existingSub.id);
      } else {
        const { data: newSub } = await supabaseAdmin
          .from('business_subscriptions')
          .insert([{ business_id: metadata.business_id, ...subData }])
          .select('id')
          .single();
        subId = newSub?.id;
      }

      // Update business plan reference and ensure active status
      await supabaseAdmin
        .from('businesses')
        .update({
          subscription_plan_id: metadata.plan_id,
          status: 'active',
        })
        .eq('id', metadata.business_id);

      // Create billing invoice record
      await supabaseAdmin
        .from('billing_invoices')
        .insert([{
          business_id: metadata.business_id,
          subscription_id: subId || null,
          amount: data.amount / 100,
          currency: data.currency || 'GHS',
          status: 'paid',
          payment_method: data.channel || 'paystack',
          paystack_reference: reference,
          description: `${metadata.plan_name || 'Subscription'} — ${cycle} payment`,
          paid_at: now.toISOString(),
        }]);
    }

    res.json({ message: 'Payment verified and processed successfully', status: 'success' });
  } catch (err) {
    logger.error({ err: err }, 'Error verifying Paystack:');
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

/**
 * POST /api/subscriptions/paystack-webhook
 * Handle Paystack webhook events (charge.success, subscription.disable, etc.)
 * This endpoint is PUBLIC but verified via Paystack signature
 */
router.post('/paystack-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Get the active Paystack gateway for webhook secret
    const { data: gateway } = await supabaseAdmin
      .from('payment_gateways')
      .select('webhook_secret, secret_key')
      .eq('provider', 'paystack')
      .eq('is_active', true)
      .single();

    if (!gateway) {
      logger.warn('[WEBHOOK] No active Paystack gateway found');
      return res.sendStatus(200);
    }

    // Verify webhook signature
    const hash = crypto
      .createHmac('sha512', gateway.webhook_secret || gateway.secret_key)
      .update(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
      .digest('hex');

    const signature = req.headers['x-paystack-signature'];
    if (signature !== hash) {
      logger.warn('[WEBHOOK] Invalid Paystack signature');
      return res.sendStatus(401);
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    logger.info('[WEBHOOK] Paystack event: ${event.event}');

    if (event.event === 'charge.success') {
      const { metadata, reference, amount, currency } = event.data;

      if (metadata?.business_id && metadata?.plan_id) {
        const now = new Date();
        const periodEnd = new Date(now);
        const cycle = metadata.billing_cycle || 'monthly';
        if (cycle === 'yearly') {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
          periodEnd.setDate(periodEnd.getDate() + 30);
        }

        // Upsert subscription
        const { data: existingSub } = await supabaseAdmin
          .from('business_subscriptions')
          .select('id')
          .eq('business_id', metadata.business_id)
          .single();

        const subData = {
          plan_id: metadata.plan_id,
          status: 'active',
          billing_cycle: cycle,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          trial_ends_at: null,
          amount: amount / 100, // Convert from smallest unit
          currency: currency || 'GHS',
          paystack_subscription_code: reference,
          updated_at: now.toISOString(),
        };

        if (existingSub) {
          await supabaseAdmin
            .from('business_subscriptions')
            .update(subData)
            .eq('id', existingSub.id);
        } else {
          await supabaseAdmin
            .from('business_subscriptions')
            .insert([{ business_id: metadata.business_id, ...subData }]);
        }

        // Update business plan reference and ensure active status
        await supabaseAdmin
          .from('businesses')
          .update({
            subscription_plan_id: metadata.plan_id,
            status: 'active',
          })
          .eq('id', metadata.business_id);

        // Create billing invoice record
        await supabaseAdmin
          .from('billing_invoices')
          .insert([{
            business_id: metadata.business_id,
            subscription_id: existingSub?.id || null,
            amount: amount / 100,
            currency: currency || 'GHS',
            status: 'paid',
            payment_method: 'paystack',
            paystack_reference: reference,
            description: `${metadata.plan_name || 'Subscription'} — ${cycle} payment`,
            paid_at: now.toISOString(),
          }]);

        logger.info('[WEBHOOK] Payment recorded for business ${metadata.business_id}');
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err: err }, '[WEBHOOK] Error processing Paystack webhook:');
    res.sendStatus(200); // Always return 200 to Paystack
  }
});

module.exports = router;
