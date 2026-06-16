const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * GET /api/communications/templates
 * Fetch saved templates
 */
router.get('/templates', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('communication_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching templates:');
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * POST /api/communications/templates
 * Create or update a template
 */
router.post('/templates', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { id, name, type, subject, content } = req.body;

    let result;
    if (id) {
      result = await supabaseAdmin
        .from('communication_templates')
        .update({ name, type, subject, content, updated_at: new Date() })
        .eq('id', id)
        .select()
        .single();
    } else {
      result = await supabaseAdmin
        .from('communication_templates')
        .insert([{ name, type, subject, content }])
        .select()
        .single();
    }

    if (result.error) throw result.error;
    res.json(result.data);
  } catch (err) {
    logger.error({ err: err }, 'Error saving template:');
    res.status(500).json({ error: 'Failed to save template' });
  }
});

/**
 * DELETE /api/communications/templates/:id
 * Delete a template
 */
router.delete('/templates/:id', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('communication_templates')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting template:');
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * GET /api/communications/gateways
 * Fetch all communication gateways
 */
router.get('/gateways', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('communication_gateways')
      .select('*')
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
    logger.error({ err: err }, 'Error fetching communication gateways:');
    res.status(500).json({ error: 'Failed to fetch communication gateways' });
  }
});

/**
 * POST /api/communications/gateways
 * Create a new communication gateway
 */
router.post('/gateways', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { provider, type, display_name, api_key, secret_key, sender_id, config } = req.body;
    
    if (!provider || !type || !display_name) {
      return res.status(400).json({ error: 'provider, type, and display_name are required' });
    }

    if (req.body.is_default) {
      // Unset other defaults of the same type
      await supabaseAdmin
        .from('communication_gateways')
        .update({ is_default: false })
        .eq('type', type)
        .eq('is_default', true);
    }

    const { data, error } = await supabaseAdmin
      .from('communication_gateways')
      .insert([{
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
    logger.error({ err: err }, 'Error creating communication gateway:');
    res.status(500).json({ error: err.message || 'Failed to create communication gateway' });
  }
});

/**
 * PUT /api/communications/gateways/:id
 * Update a communication gateway
 */
router.put('/gateways/:id', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.created_at;

    if (updates.api_key && updates.api_key.startsWith('••')) delete updates.api_key;
    if (updates.secret_key && updates.secret_key.startsWith('••')) delete updates.secret_key;

    if (updates.is_default) {
      // Get the type of this gateway to unset others
      const { data: existingGw } = await supabaseAdmin.from('communication_gateways').select('type').eq('id', id).single();
      if (existingGw) {
        await supabaseAdmin
          .from('communication_gateways')
          .update({ is_default: false })
          .eq('type', existingGw.type)
          .neq('id', id);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('communication_gateways')
      .update(updates)
      .eq('id', id)
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
    logger.error({ err: err }, 'Error updating communication gateway:');
    res.status(500).json({ error: err.message || 'Failed to update communication gateway' });
  }
});

/**
 * DELETE /api/communications/gateways/:id
 * Delete a communication gateway
 */
router.delete('/gateways/:id', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('communication_gateways')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Gateway removed' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting communication gateway:');
    res.status(500).json({ error: err.message || 'Failed to delete communication gateway' });
  }
});

/**
 * POST /api/communications/send
 * Dispatch SMS or Emails to target audience
 */
router.post('/send', authGuard, permissionCheck('manage_platform'), async (req, res) => {
  try {
    const { targetAudience, businessId, type, subject, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // 1. Fetch Recipients
    let businesses = [];
    if (targetAudience === 'specific_business' && businessId) {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .select('name, contact_email, phone')
        .eq('id', businessId)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Business not found' });
      businesses = [data];
    } else if (targetAudience === 'all_businesses') {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .select('name, contact_email, phone')
        .neq('status', 'banned');
      if (error) throw error;
      businesses = data || [];
    } else {
      return res.status(400).json({ error: 'Invalid target audience (End-customers disabled per data privacy rules)' });
    }

    if (businesses.length === 0) {
      return res.status(400).json({ error: 'No recipients found for this audience' });
    }

    // 2. Fetch Active Default Gateways
    let smsGateway = null;
    let emailGateway = null;

    if (type === 'sms' || type === 'both') {
      const { data } = await supabaseAdmin
        .from('communication_gateways')
        .select('*')
        .eq('type', 'sms')
        .eq('is_active', true)
        .eq('is_default', true)
        .single();
      smsGateway = data || null;
    }

    if (type === 'email' || type === 'both') {
      const { data } = await supabaseAdmin
        .from('communication_gateways')
        .select('*')
        .eq('type', 'email')
        .eq('is_active', true)
        .eq('is_default', true)
        .single();
      emailGateway = data || null;
    }

    let smsResults = null;
    let emailResults = null;

    // 3. Dispatch SMS
    if (type === 'sms' || type === 'both') {
      const phoneNumbers = businesses.map(b => b.phone).filter(Boolean);
      if (phoneNumbers.length > 0) {
        smsResults = await smsService.sendCustomSMS(phoneNumbers, message, smsGateway);
      } else {
        smsResults = { success: false, error: 'No valid phone numbers found' };
      }
    }

    // 4. Dispatch Email
    if (type === 'email' || type === 'both') {
      const emails = businesses.map(b => b.contact_email).filter(Boolean);
      if (emails.length > 0) {
        emailResults = await emailService.sendCustomEmail(emails, subject || 'Message from Platform Admin', message, emailGateway);
      } else {
        emailResults = { success: false, error: 'No valid email addresses found' };
      }
    }

    res.json({
      success: true,
      recipientsCount: businesses.length,
      smsResults,
      emailResults
    });

  } catch (err) {
    logger.error({ err: err }, 'Error sending communications:');
    res.status(500).json({ error: 'Failed to send messages' });
  }
});

module.exports = router;
