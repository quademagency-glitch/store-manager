const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { sendInvoiceEmail } = require('../services/emailService');

const router = express.Router();

/* ============================================================
   PAYMENT GATEWAY CONFIGURATION
   ============================================================ */

/**
 * GET /api/billing/gateways
 * List all configured payment gateways — Platform Admin only
 */
router.get('/gateways', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payment_gateways')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Mask secret keys for frontend display
    const masked = (data || []).map(gw => ({
      ...gw,
      secret_key: gw.secret_key ? '••••••••' + gw.secret_key.slice(-4) : null,
      webhook_secret: gw.webhook_secret ? '••••••••' + gw.webhook_secret.slice(-4) : null,
      // Keep public_key visible
    }));

    res.json(masked);
  } catch (err) {
    console.error('Error fetching gateways:', err);
    res.status(500).json({ error: 'Failed to fetch gateways' });
  }
});

/**
 * POST /api/billing/gateways
 * Add a payment gateway configuration — Platform Admin only
 */
router.post('/gateways', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { provider, display_name, public_key, secret_key, webhook_secret, supported_currencies, config } = req.body;

    if (!provider || !display_name) {
      return res.status(400).json({ error: 'provider and display_name are required' });
    }

    // If this is set as default, unset all others
    if (req.body.is_default) {
      await supabaseAdmin
        .from('payment_gateways')
        .update({ is_default: false })
        .eq('is_default', true);
    }

    const { data, error } = await supabaseAdmin
      .from('payment_gateways')
      .insert([{
        provider,
        display_name,
        public_key: public_key || null,
        secret_key: secret_key || null,
        webhook_secret: webhook_secret || null,
        is_active: req.body.is_active ?? true,
        is_default: req.body.is_default ?? false,
        supported_currencies: supported_currencies || ['GHS'],
        config: config || {},
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({
      ...data,
      secret_key: data.secret_key ? '••••••••' + data.secret_key.slice(-4) : null,
      webhook_secret: data.webhook_secret ? '••••••••' + data.webhook_secret.slice(-4) : null,
    });
  } catch (err) {
    console.error('Error creating gateway:', err);
    res.status(500).json({ error: err.message || 'Failed to create gateway' });
  }
});

/**
 * PUT /api/billing/gateways/:id
 * Update a gateway configuration — Platform Admin only
 */
router.put('/gateways/:id', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.created_at;

    // Don't update keys if they are masked values
    if (updates.secret_key && updates.secret_key.startsWith('••')) delete updates.secret_key;
    if (updates.webhook_secret && updates.webhook_secret.startsWith('••')) delete updates.webhook_secret;

    // If this is set as default, unset all others
    if (updates.is_default) {
      await supabaseAdmin
        .from('payment_gateways')
        .update({ is_default: false })
        .neq('id', id);
    }

    const { data, error } = await supabaseAdmin
      .from('payment_gateways')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Gateway not found' });

    res.json({
      ...data,
      secret_key: data.secret_key ? '••••••••' + data.secret_key.slice(-4) : null,
      webhook_secret: data.webhook_secret ? '••••••••' + data.webhook_secret.slice(-4) : null,
    });
  } catch (err) {
    console.error('Error updating gateway:', err);
    res.status(500).json({ error: err.message || 'Failed to update gateway' });
  }
});

/**
 * DELETE /api/billing/gateways/:id
 * Remove a gateway — Platform Admin only
 */
router.delete('/gateways/:id', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('payment_gateways')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Gateway removed' });
  } catch (err) {
    console.error('Error deleting gateway:', err);
    res.status(500).json({ error: err.message || 'Failed to delete gateway' });
  }
});

/* ============================================================
   INVOICES / BILLING HISTORY
   ============================================================ */

/**
 * GET /api/billing/invoices
 * Get all invoices (filterable by business_id, status) — Platform Admin
 */
router.get('/invoices', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('billing_invoices')
      .select('*, businesses(id, name, contact_email)')
      .order('created_at', { ascending: false });

    if (req.query.business_id) {
      query = query.eq('business_id', req.query.business_id);
    }
    if (req.query.status) {
      query = query.eq('status', req.query.status);
    }
    if (req.query.limit) {
      query = query.limit(parseInt(req.query.limit));
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * GET /api/billing/invoices/:businessId
 * Get invoices for a specific business
 */
router.get('/invoices/:businessId', authGuard, async (req, res) => {
  try {
    const { businessId } = req.params;

    // Verify access
    if (req.user.role !== 'Platform Admin' && req.user.business_id !== businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabaseAdmin
      .from('billing_invoices')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching business invoices:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * POST /api/billing/invoices/send
 * Send an invoice email — Platform Admin only
 */
router.post('/invoices/send', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { invoice_id, additional_recipients } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ error: 'invoice_id is required' });
    }

    // Fetch invoice with business and plan details
    const { data: invoice, error: invError } = await supabaseAdmin
      .from('billing_invoices')
      .select('*, businesses(id, name, contact_email), business_subscriptions(platform_plans(name))')
      .eq('id', invoice_id)
      .single();

    if (invError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const planName = invoice.business_subscriptions?.platform_plans?.name || 'Subscription';
    const business = invoice.businesses;

    // Send the email
    const result = await sendInvoiceEmail(
      invoice,
      business,
      planName,
      additional_recipients || []
    );

    if (result.success) {
      // Update invoice status and emailed_at
      const updateData = {
        status: invoice.status === 'draft' ? 'sent' : invoice.status,
        emailed_at: new Date().toISOString(),
        emailed_to: result.recipients || [],
      };

      await supabaseAdmin
        .from('billing_invoices')
        .update(updateData)
        .eq('id', invoice_id);

      res.json({
        message: 'Invoice sent successfully',
        recipients: result.recipients,
        simulated: result.simulated || false,
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send invoice' });
    }
  } catch (err) {
    console.error('Error sending invoice:', err);
    res.status(500).json({ error: err.message || 'Failed to send invoice' });
  }
});

/**
 * POST /api/billing/record-payment
 * Manually record a payment — Platform Admin only
 */
router.post('/record-payment', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { business_id, amount, currency, payment_method, description, plan_id } = req.body;

    if (!business_id || !amount) {
      return res.status(400).json({ error: 'business_id and amount are required' });
    }

    // Get the business's subscription
    const { data: subscription } = await supabaseAdmin
      .from('business_subscriptions')
      .select('id, plan_id')
      .eq('business_id', business_id)
      .single();

    // Create the invoice record
    const { data: invoice, error } = await supabaseAdmin
      .from('billing_invoices')
      .insert([{
        business_id,
        subscription_id: subscription?.id || null,
        amount,
        currency: currency || 'GHS',
        status: 'paid',
        payment_method: payment_method || 'manual',
        description: description || 'Manual payment recorded by Platform Admin',
        paid_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;

    // If a plan_id was provided or subscription exists, renew the subscription
    const effectivePlanId = plan_id || subscription?.plan_id;
    if (effectivePlanId) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30); // Default 30 days

      if (subscription) {
        await supabaseAdmin
          .from('business_subscriptions')
          .update({
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', subscription.id);
      }

      // Reactivate business if banned
      await supabaseAdmin
        .from('businesses')
        .update({ status: 'active' })
        .eq('id', business_id)
        .eq('status', 'banned');
    }

    res.status(201).json({
      message: 'Payment recorded successfully',
      invoice,
    });
  } catch (err) {
    console.error('Error recording payment:', err);
    res.status(500).json({ error: err.message || 'Failed to record payment' });
  }
});

/**
 * GET /api/billing/stats
 * Revenue summary stats — Platform Admin only
 */
router.get('/stats', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    // Total revenue (paid invoices)
    const { data: paidInvoices, error: paidErr } = await supabaseAdmin
      .from('billing_invoices')
      .select('amount, currency')
      .eq('status', 'paid');

    if (paidErr) throw paidErr;

    // Current month revenue
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: monthlyInvoices, error: monthErr } = await supabaseAdmin
      .from('billing_invoices')
      .select('amount')
      .eq('status', 'paid')
      .gte('paid_at', startOfMonth.toISOString());

    if (monthErr) throw monthErr;

    // Active subscriptions count
    const { data: activeSubs, error: subErr } = await supabaseAdmin
      .from('business_subscriptions')
      .select('amount')
      .in('status', ['active', 'trialing']);

    if (subErr) throw subErr;

    // Outstanding (sent but unpaid)
    const { data: outstanding, error: outErr } = await supabaseAdmin
      .from('billing_invoices')
      .select('amount')
      .eq('status', 'sent');

    if (outErr) throw outErr;

    // Failed payments
    const { data: failed, error: failErr } = await supabaseAdmin
      .from('billing_invoices')
      .select('amount')
      .eq('status', 'failed');

    if (failErr) throw failErr;

    const totalRevenue = (paidInvoices || []).reduce((sum, inv) => sum + Number(inv.amount), 0);
    const monthlyRevenue = (monthlyInvoices || []).reduce((sum, inv) => sum + Number(inv.amount), 0);
    const mrr = (activeSubs || []).reduce((sum, sub) => sum + Number(sub.amount), 0);
    const totalOutstanding = (outstanding || []).reduce((sum, inv) => sum + Number(inv.amount), 0);
    const totalFailed = (failed || []).reduce((sum, inv) => sum + Number(inv.amount), 0);

    res.json({
      total_revenue: totalRevenue,
      monthly_revenue: monthlyRevenue,
      mrr,
      outstanding: totalOutstanding,
      failed_payments: totalFailed,
      active_subscriptions: (activeSubs || []).length,
    });
  } catch (err) {
    console.error('Error fetching billing stats:', err);
    res.status(500).json({ error: 'Failed to fetch billing stats' });
  }
});

module.exports = router;
