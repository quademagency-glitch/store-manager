const express = require('express');
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
    console.error('Error fetching templates:', err);
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
    console.error('Error saving template:', err);
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
    console.error('Error deleting template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
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

    // 2. Fetch Arkesel API settings if SMS is required
    let arkeselApiKey = '';
    let arkeselSenderId = 'QUADEM';
    if (type === 'sms' || type === 'both') {
      const { data: settingsData } = await supabaseAdmin
        .from('platform_settings')
        .select('key, value')
        .in('key', ['ARKESEL_API_KEY', 'ARKESEL_SENDER_ID']);
      
      if (settingsData) {
        const apiKeyRow = settingsData.find(s => s.key === 'ARKESEL_API_KEY');
        const senderRow = settingsData.find(s => s.key === 'ARKESEL_SENDER_ID');
        if (apiKeyRow && apiKeyRow.value) arkeselApiKey = apiKeyRow.value;
        if (senderRow && senderRow.value) arkeselSenderId = senderRow.value;
      }
    }

    let smsResults = null;
    let emailResults = null;

    // 3. Dispatch SMS
    if (type === 'sms' || type === 'both') {
      const phoneNumbers = businesses.map(b => b.phone).filter(Boolean);
      if (phoneNumbers.length > 0) {
        smsResults = await smsService.sendCustomSMS(phoneNumbers, message, arkeselApiKey, arkeselSenderId);
      } else {
        smsResults = { success: false, error: 'No valid phone numbers found' };
      }
    }

    // 4. Dispatch Email
    if (type === 'email' || type === 'both') {
      const emails = businesses.map(b => b.contact_email).filter(Boolean);
      if (emails.length > 0) {
        emailResults = await emailService.sendCustomEmail(emails, subject || 'Message from Platform Admin', message);
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
    console.error('Error sending communications:', err);
    res.status(500).json({ error: 'Failed to send messages' });
  }
});

module.exports = router;
