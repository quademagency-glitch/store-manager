const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { seal, mask } = require('../utils/secretBox');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * GET /api/crm-communications/templates
 * Fetch saved templates for the business
 */
router.get('/templates', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('crm_communication_templates')
      .select('*')
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching CRM templates:');
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * POST /api/crm-communications/templates
 * Create or update a template for the business
 */
router.post('/templates', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { id, name, type, subject, content } = req.body;

    let result;
    if (id) {
      // Make sure they own it
      result = await supabaseAdmin
        .from('crm_communication_templates')
        .update({ name, type, subject, content, updated_at: new Date() })
        .eq('id', id)
        .eq('business_id', req.user.business_id)
        .select()
        .single();
    } else {
      result = await supabaseAdmin
        .from('crm_communication_templates')
        .insert([{ business_id: req.user.business_id, name, type, subject, content }])
        .select()
        .single();
    }

    if (result.error) throw result.error;
    res.json(result.data);
  } catch (err) {
    logger.error({ err: err }, 'Error saving CRM template:');
    res.status(500).json({ error: 'Failed to save template' });
  }
});

/**
 * DELETE /api/crm-communications/templates/:id
 * Delete a template for the business
 */
router.delete('/templates/:id', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('crm_communication_templates')
      .delete()
      .eq('id', req.params.id)
      .eq('business_id', req.user.business_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting CRM template:');
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * GET /api/crm-communications/gateways
 * Fetch all communication gateways for the business
 */
router.get('/gateways', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('communication_gateways')
      .select('*')
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    // Mask secrets
    const masked = (data || []).map(gw => ({
      ...gw,
      api_key: mask(gw.api_key),
      secret_key: mask(gw.secret_key),
    }));
    
    res.json(masked);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching CRM gateways:');
    res.status(500).json({ error: 'Failed to fetch gateways' });
  }
});

/**
 * POST /api/crm-communications/gateways
 * Create a new communication gateway for the business
 */
router.post('/gateways', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { provider, type, display_name, api_key, secret_key, sender_id, config } = req.body;
    
    if (!provider || !type || !display_name) {
      return res.status(400).json({ error: 'provider, type, and display_name are required' });
    }
    const whatsappProblem = type === 'whatsapp' ? checkWhatsAppGateway({ provider, api_key, sender_id, config }) : null;
    if (whatsappProblem) return res.status(400).json({ error: whatsappProblem });

    if (req.body.is_default) {
      // Unset other defaults of the same type for this business
      await supabaseAdmin
        .from('communication_gateways')
        .update({ is_default: false })
        .eq('business_id', req.user.business_id)
        .eq('type', type)
        .eq('is_default', true);
    }

    const { data, error } = await supabaseAdmin
      .from('communication_gateways')
      .insert([{
        business_id: req.user.business_id,
        provider,
        type,
        display_name,
        api_key: seal(api_key || null),
        secret_key: seal(secret_key || null),
        sender_id: sender_id || null,
        is_active: req.body.is_active ?? true,
        is_default: req.body.is_default ?? false,
        config: config || {}
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({
      ...data,
      api_key: mask(data.api_key),
      secret_key: mask(data.secret_key),
    });
  } catch (err) {
    logger.error({ err: err }, 'Error creating CRM gateway:');
    res.status(500).json({ error: 'Failed to create gateway' });
  }
});

/**
 * PUT /api/crm-communications/gateways/:id
 * Update a communication gateway for the business
 */
router.put('/gateways/:id', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { updated_at: new Date().toISOString() };
    for (const field of ['provider', 'display_name', 'api_key', 'secret_key', 'sender_id', 'is_active', 'is_default', 'config']) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (updates.api_key && updates.api_key.startsWith('••')) delete updates.api_key;
    if (updates.secret_key && updates.secret_key.startsWith('••')) delete updates.secret_key;

    const { data: current, error: currentError } = await supabaseAdmin.from('communication_gateways')
      .select('type, provider, api_key, sender_id, config').eq('id', id).eq('business_id', req.user.business_id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return res.status(404).json({ error: 'Gateway not found' });
    if (current.type === 'whatsapp') {
      const problem = checkWhatsAppGateway({ ...current, ...updates });
      if (problem) return res.status(400).json({ error: problem });
    }
    if (updates.api_key) updates.api_key = seal(updates.api_key);
    if (updates.secret_key) updates.secret_key = seal(updates.secret_key);

    if (updates.is_default) {
      // Get the type of this gateway to unset others
      const { data: existingGw } = await supabaseAdmin
        .from('communication_gateways')
        .select('type')
        .eq('id', id)
        .eq('business_id', req.user.business_id)
        .single();
        
      if (existingGw) {
        await supabaseAdmin
          .from('communication_gateways')
          .update({ is_default: false })
          .eq('business_id', req.user.business_id)
          .eq('type', existingGw.type)
          .neq('id', id);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('communication_gateways')
      .update(updates)
      .eq('id', id)
      .eq('business_id', req.user.business_id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Gateway not found' });

    res.json({
      ...data,
      api_key: mask(data.api_key),
      secret_key: mask(data.secret_key),
    });
  } catch (err) {
    logger.error({ err: err }, 'Error updating CRM gateway:');
    res.status(500).json({ error: 'Failed to update gateway' });
  }
});

/** Meta template names are lowercase letters, digits and underscores. */
const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;
function checkWhatsAppGateway({ provider, api_key, sender_id, config = {} }) {
  if (provider !== 'meta_cloud') return 'WhatsApp uses the Meta WhatsApp Cloud API provider.';
  if (!api_key || String(api_key).length < 20) return 'Paste the permanent access token from your Meta app.';
  if (!/^\d{6,20}$/.test(String(sender_id || ''))) return 'The phone number ID is the long number shown in WhatsApp Manager.';
  for (const key of ['receipt_template', 'reminder_template']) {
    if (config[key] && !TEMPLATE_NAME.test(config[key])) return 'Template names use lowercase letters, numbers and underscores, exactly as approved in Meta.';
  }
  if (config.language && !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(config.language)) return 'Use a template language code such as en or en_US.';
  if (config.graph_version && !/^v\d+\.\d+$/.test(config.graph_version)) return 'The API version looks like v26.0.';
  return null;
}

/**
 * GET /api/crm-communications/whatsapp
 * Automatic WhatsApp messages: the switches, the connected account (secret
 * masked) and the last 50 messages with their honest status.
 */
router.get('/whatsapp', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const businessId = req.user.business_id;
    const [business, gateway, recent] = await Promise.all([
      supabaseAdmin.from('businesses').select('whatsapp_receipts, whatsapp_reminders').eq('id', businessId).single(),
      supabaseAdmin.from('communication_gateways').select('id, display_name, sender_id, is_active, config').eq('business_id', businessId)
        .eq('type', 'whatsapp').eq('is_active', true).order('is_default', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('whatsapp_messages').select('id, kind, status, attempts, detail, created_at, updated_at, customer:customers(name)')
        .eq('business_id', businessId).order('created_at', { ascending: false }).limit(50),
    ]);
    for (const r of [business, gateway, recent]) if (r.error) throw r.error;
    res.json({
      receipts: !!business.data?.whatsapp_receipts,
      reminders: !!business.data?.whatsapp_reminders,
      gateway: gateway.data || null,
      recent: recent.data || [],
    });
  } catch (err) {
    logger.error({ err }, 'Error loading WhatsApp settings');
    res.status(500).json({ error: 'WhatsApp settings could not be loaded.' });
  }
});

/**
 * PUT /api/crm-communications/whatsapp/settings { receipts, reminders }
 * A kind can be switched on only when the account and its template are set.
 */
router.put('/whatsapp/settings', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { receipts, reminders } = req.body || {};
    if (typeof receipts !== 'boolean' || typeof reminders !== 'boolean') return res.status(400).json({ error: 'Choose on or off for each message.' });
    if (receipts || reminders) {
      const { data: gateway, error } = await supabaseAdmin.from('communication_gateways').select('config').eq('business_id', req.user.business_id)
        .eq('type', 'whatsapp').eq('is_active', true).order('is_default', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!gateway) return res.status(409).json({ error: 'Connect your WhatsApp Business account first.' });
      if (receipts && !gateway.config?.receipt_template) return res.status(409).json({ error: 'Add the approved receipt template name first.' });
      if (reminders && !gateway.config?.reminder_template) return res.status(409).json({ error: 'Add the approved reminder template name first.' });
    }
    const { error } = await supabaseAdmin.from('businesses').update({ whatsapp_receipts: receipts, whatsapp_reminders: reminders }).eq('id', req.user.business_id);
    if (error) throw error;
    res.json({ receipts, reminders });
  } catch (err) {
    logger.error({ err }, 'Error saving WhatsApp settings');
    res.status(500).json({ error: 'WhatsApp settings could not be saved.' });
  }
});

/**
 * DELETE /api/crm-communications/gateways/:id
 * Delete a communication gateway for the business
 */
router.delete('/gateways/:id', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('communication_gateways')
      .delete()
      .eq('id', req.params.id)
      .eq('business_id', req.user.business_id);

    if (error) throw error;
    res.json({ message: 'Gateway removed' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting CRM gateway:');
    res.status(500).json({ error: 'Failed to delete gateway' });
  }
});

/**
 * POST /api/crm-communications/send
 * Dispatch SMS or Emails to target audience (Customers)
 */
router.post('/send', authGuard, permissionCheck('manage_marketing'), async (req, res) => {
  try {
    const { targetAudience, customerId, type, subject, message } = req.body;

    if (!['sms','email','both'].includes(type)) return res.status(400).json({error:'Choose SMS, email or both.'});
    if (typeof message !== 'string' || !message.trim() || message.length>5000) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // 1. Fetch Recipients
    let customers = [];
    if (targetAudience === 'specific_customer' && customerId) {
      const { data, error } = await supabaseAdmin
        .from('customers')
        .select('id, name, email, phone')
        .eq('id', customerId)
        .eq('business_id', req.user.business_id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Customer not found' });
      customers = [data];
    } else if (targetAudience === 'all_customers') {
      const { data, error } = await supabaseAdmin
        .from('customers')
        .select('id, name, email, phone')
        .eq('business_id', req.user.business_id);
      if (error) throw error;
      customers = data || [];
    } else if (targetAudience === 'recent_buyers') {
       // Customers who made a purchase in the last 30 days
       const thirtyDaysAgo = new Date();
       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
       
       const { data: sales, error: salesError } = await supabaseAdmin
         .from('sales')
         .select('customer_id')
         .eq('business_id', req.user.business_id)
         .gte('created_at', thirtyDaysAgo.toISOString())
         .not('customer_id', 'is', null);
         
       if (salesError) throw salesError;
       
       const customerIds = [...new Set(sales.map(s => s.customer_id))];
       
       if (customerIds.length > 0) {
         const { data, error } = await supabaseAdmin
           .from('customers')
           .select('id, name, email, phone')
           .in('id', customerIds)
           .eq('business_id', req.user.business_id);
         if (error) throw error;
         customers = data || [];
       }
    } else {
      return res.status(400).json({ error: 'Invalid target audience' });
    }

    if (customers.length === 0) {
      return res.status(400).json({ error: 'No recipients found for this audience' });
    }

    // All CRM entry points honor explicit channel preferences. Missing
    // preference is not consent; database failures stop dispatch.
    const { data: preferences, error: preferenceError } = await supabaseAdmin
      .from('customer_contact_preferences').select('customer_id,channel,allowed')
      .eq('business_id',req.user.business_id).in('customer_id',customers.map(c=>c.id));
    if(preferenceError) throw preferenceError;
    const allowed=(customer,channel)=>preferences?.some(p=>p.customer_id===customer.id&&p.channel===channel&&p.allowed===true);
    const smsCustomers=customers.filter(c=>c.phone&&allowed(c,'sms'));
    const emailCustomers=customers.filter(c=>c.email&&allowed(c,'email'));
    if(!(type!=='email'&&smsCustomers.length)&&!(type!=='sms'&&emailCustomers.length))return res.status(400).json({error:'No recipients have explicitly allowed the selected channel. Review customer preferences first.'});

    // 2. Fetch Gateways (Fallback logic: business specific -> platform default)
    let smsGateway = null;
    let emailGateway = null;

    if (type === 'sms' || type === 'both') {
      // Check business specific first
      let { data } = await supabaseAdmin
        .from('communication_gateways')
        .select('*')
        .eq('business_id', req.user.business_id)
        .eq('type', 'sms')
        .eq('is_active', true)
        .eq('is_default', true)
        .single();
        
      if (!data) {
        // Fallback to platform default
        const { data: platformData } = await supabaseAdmin
          .from('communication_gateways')
          .select('*')
          .is('business_id', null)
          .eq('type', 'sms')
          .eq('is_active', true)
          .eq('is_default', true)
          .single();
        data = platformData;
      }
      smsGateway = data || null;
    }

    if (type === 'email' || type === 'both') {
      // Check business specific first
      let { data } = await supabaseAdmin
        .from('communication_gateways')
        .select('*')
        .eq('business_id', req.user.business_id)
        .eq('type', 'email')
        .eq('is_active', true)
        .eq('is_default', true)
        .single();
        
      if (!data) {
        // Fallback to platform default
        const { data: platformData } = await supabaseAdmin
          .from('communication_gateways')
          .select('*')
          .is('business_id', null)
          .eq('type', 'email')
          .eq('is_active', true)
          .eq('is_default', true)
          .single();
        data = platformData;
      }
      emailGateway = data || null;
    }

    let smsResults = null;
    let emailResults = null;

    // 3. Dispatch SMS
    if (type === 'sms' || type === 'both') {
      const phoneNumbers = [...new Set(smsCustomers.map(c => c.phone))];
      if (phoneNumbers.length > 0) {
        smsResults = await smsService.sendCustomSMS(phoneNumbers, message, smsGateway);
      } else {
        smsResults = { success: false, error: 'No valid phone numbers found' };
      }
    }

    // 4. Dispatch Email
    if (type === 'email' || type === 'both') {
      const emails = [...new Set(emailCustomers.map(c => c.email))];
      if (emails.length > 0) {
        const { data: business } = await supabaseAdmin.from('businesses').select('name').eq('id', req.user.business_id).maybeSingle();
        const viaPlatform = !emailGateway || emailGateway.business_id !== req.user.business_id;
        const html = emailService.buildBusinessMessageHtml({ businessName: business?.name, text: message, viaPlatform });
        emailResults = await emailService.sendCustomEmail(emails, subject || `Message from ${business?.name || 'Business'}`, html, emailGateway);
      } else {
        emailResults = { success: false, error: 'No valid email addresses found' };
      }
    }

    for(const result of [smsResults,emailResults])if(result?.simulated){result.success=false;result.error='Provider is not configured. No message was dispatched.';}
    res.json({
      success: !!(smsResults?.success || emailResults?.success),
      recipientsCount: new Set([...(type!=='email'?smsCustomers:[]),...(type!=='sms'?emailCustomers:[])].map(c=>c.id)).size,
      smsResults,
      emailResults
    });

  } catch (err) {
    logger.error({ err: err }, 'Error sending CRM communications:');
    res.status(500).json({ error: 'Failed to send messages' });
  }
});

module.exports = router;
