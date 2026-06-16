const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * GET /api/crm-communications/templates
 * Fetch saved templates for the business
 */
router.get('/templates', authGuard, permissionCheck('manage_business'), async (req, res) => {
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
router.post('/templates', authGuard, permissionCheck('manage_business'), async (req, res) => {
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
router.delete('/templates/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
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
router.get('/gateways', authGuard, permissionCheck('manage_business'), async (req, res) => {
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
      api_key: gw.api_key ? '••••••••' + gw.api_key.slice(-4) : null,
      secret_key: gw.secret_key ? '••••••••' + gw.secret_key.slice(-4) : null,
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
router.post('/gateways', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { provider, type, display_name, api_key, secret_key, sender_id, config } = req.body;
    
    if (!provider || !type || !display_name) {
      return res.status(400).json({ error: 'provider, type, and display_name are required' });
    }

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
        api_key: api_key || null,
        secret_key: secret_key || null,
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
      api_key: data.api_key ? '••••••••' + data.api_key.slice(-4) : null,
      secret_key: data.secret_key ? '••••••••' + data.secret_key.slice(-4) : null,
    });
  } catch (err) {
    logger.error({ err: err }, 'Error creating CRM gateway:');
    res.status(500).json({ error: err.message || 'Failed to create gateway' });
  }
});

/**
 * PUT /api/crm-communications/gateways/:id
 * Update a communication gateway for the business
 */
router.put('/gateways/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.created_at;
    delete updates.business_id; // Don't allow changing business_id

    if (updates.api_key && updates.api_key.startsWith('••')) delete updates.api_key;
    if (updates.secret_key && updates.secret_key.startsWith('••')) delete updates.secret_key;

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
      api_key: data.api_key ? '••••••••' + data.api_key.slice(-4) : null,
      secret_key: data.secret_key ? '••••••••' + data.secret_key.slice(-4) : null,
    });
  } catch (err) {
    logger.error({ err: err }, 'Error updating CRM gateway:');
    res.status(500).json({ error: err.message || 'Failed to update gateway' });
  }
});

/**
 * DELETE /api/crm-communications/gateways/:id
 * Delete a communication gateway for the business
 */
router.delete('/gateways/:id', authGuard, permissionCheck('manage_business'), async (req, res) => {
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
    res.status(500).json({ error: err.message || 'Failed to delete gateway' });
  }
});

/**
 * POST /api/crm-communications/send
 * Dispatch SMS or Emails to target audience (Customers)
 */
router.post('/send', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { targetAudience, customerId, type, subject, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // 1. Fetch Recipients
    let customers = [];
    if (targetAudience === 'specific_customer' && customerId) {
      const { data, error } = await supabaseAdmin
        .from('customers')
        .select('name, email, phone')
        .eq('id', customerId)
        .eq('business_id', req.user.business_id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Customer not found' });
      customers = [data];
    } else if (targetAudience === 'all_customers') {
      const { data, error } = await supabaseAdmin
        .from('customers')
        .select('name, email, phone')
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
           .select('name, email, phone')
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
      const phoneNumbers = customers.map(c => c.phone).filter(Boolean);
      if (phoneNumbers.length > 0) {
        smsResults = await smsService.sendCustomSMS(phoneNumbers, message, smsGateway);
      } else {
        smsResults = { success: false, error: 'No valid phone numbers found' };
      }
    }

    // 4. Dispatch Email
    if (type === 'email' || type === 'both') {
      const emails = customers.map(c => c.email).filter(Boolean);
      if (emails.length > 0) {
        emailResults = await emailService.sendCustomEmail(emails, subject || 'Message from Business', message, emailGateway);
      } else {
        emailResults = { success: false, error: 'No valid email addresses found' };
      }
    }

    res.json({
      success: true,
      recipientsCount: customers.length,
      smsResults,
      emailResults
    });

  } catch (err) {
    logger.error({ err: err }, 'Error sending CRM communications:');
    res.status(500).json({ error: 'Failed to send messages' });
  }
});

module.exports = router;
