const express = require('express');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const { apiCache, invalidateCachePrefix } = require('../middleware/apiCache');
const { resolveCountry, normalizePhone, toSmsFormat, phoneSearchDigits } = require('../utils/phone');
const crypto = require('crypto');

const router = express.Router();

/**
 * GET /api/customers
 * Fetch all customers for the business
 */
router.get('/', authGuard, apiCache(5), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

    let query = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching customers:');
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

/**
 * GET /api/customers/search
 * Search customers based on role permissions
 */
router.get('/search', authGuard, apiCache(5), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    let query = supabaseAdmin
      .from('customers')
      .select('*')
      .order('name', { ascending: true })
      .limit(20); // reasonable limit for dropdown/autocomplete

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    // Numbers are stored in E.164, so the digits staff actually type
    // (`0241234567`) are not a substring of what is stored
    // (`+233241234567`). Matching on the number without its trunk 0 finds
    // both that and any legacy row still holding a local spelling.
    const phoneDigits = phoneSearchDigits(q);

    // Role-based searching
    if (req.user.role === 'Business Admin' || req.user.role === 'Platform Admin') {
      // Admins can search by name, phone, or ID
      const clauses = [`name.ilike.%${q}%`, `phone.ilike.%${q}%`, `customer_code.ilike.%${q}%`];
      if (phoneDigits) clauses.push(`phone.ilike.%${phoneDigits}%`);
      query = query.or(clauses.join(','));
    } else if (phoneDigits) {
      // Other roles can ONLY search by phone
      query = query.or(`phone.ilike.%${q}%,phone.ilike.%${phoneDigits}%`);
    } else {
      query = query.ilike('phone', `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error searching customers:');
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

/**
 * GET /api/customers/:id
 * Fetch a single customer
 */
router.get('/:id', authGuard, apiCache(5), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Customer not found' });

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching customer:');
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

/**
 * POST /api/customers
 * Create a new customer
 */
router.post('/', authGuard, async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required.' });
    }

    // Store one canonical spelling, in E.164. Without this, `024 123 4567`,
    // `0241234567` and `+233241234567` are three different strings, so the
    // unique constraint below never fires and the same person is created
    // repeatedly, each copy with its own loyalty balance and ledger.
    //
    // The country supplies the dialing code for a number typed without one;
    // an explicit `+…` overrides it, so a foreign customer can be entered at
    // any branch.
    const country = await resolveCountry(supabaseAdmin, req.user.business_id, req.user.active_location_id);
    const normalizedPhone = normalizePhone(phone, country);
    if (!normalizedPhone) {
      return res.status(400).json({
        error: 'Enter a valid phone number, or include the country code (e.g. +233…).',
      });
    }

    const customer_code = 'CUST-' + crypto.randomBytes(2).toString('hex').toUpperCase() + Math.floor(Math.random() * 1000);
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert([
        {
          business_id: req.user.business_id,
          name,
          phone: normalizedPhone,
          customer_code,
          verification_code: code,
          otp_expires_at: expiresAt,
          is_verified: false
        }
      ])
      .select()
      .single();

    if (error) {
      // Check for unique constraint violation
      if (error.code === '23505') {
        return res.status(400).json({ error: 'A customer with this phone number already exists.' });
      }
      throw error;
    }

    // Fire OTP automatically via SMS
    const arkeselKey = process.env.ARKESEL_API_KEY;
    const arkeselSender = process.env.ARKESEL_SENDER_ID || 'StoreMgr';
    
    if (arkeselKey) {
      // Arkesel wants `233XXXXXXXXX`. The old `replace(/[\s\-+()]/g, '')`
      // stripped punctuation but left the local trunk 0 in place, so a
      // number typed as `0241234567` went out as `0241234567`.
      const cleanPhone = toSmsFormat(normalizedPhone);
      const message = `Welcome ${name || 'Customer'}! Your store verification code is: ${code}`;
      
      try {
        const smsRes = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
          method: 'POST',
          headers: {
            'api-key': arkeselKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sender: arkeselSender,
            message: message,
            recipients: [cleanPhone]
          })
        });
        
        const smsData = await smsRes.json();
        if (!smsRes.ok || smsData.status === 'error' || smsData.code === 400) {
          logger.error({ err: smsData }, 'Arkesel SMS failed during customer creation:');
        }
      } catch (smsErr) {
        logger.error({ err: smsErr }, 'Arkesel SMS exception during customer creation:');
      }
    } else {
      logger.warn('ARKESEL_API_KEY not set. Verification code generated but SMS not sent.');
    }

    invalidateCachePrefix('/api/customers');
    res.status(201).json({ message: 'Customer created successfully and OTP sent', customer: data });
  } catch (err) {
    logger.error({ err: err }, 'Error creating customer:');
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

/**
 * PUT /api/customers/:id
 * Update a customer (Business Admins only)
 */
router.put('/:id', authGuard, async (req, res) => {
  try {
    // Only Business Admins or Platform Admins can edit
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Business Admins can edit customers.' });
    }

    const customerId = req.params.id;
    const { name, phone } = req.body;

    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('customers')
      .select('business_id')
      .eq('id', customerId)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Customer not found' });
    if (req.user.role !== 'Platform Admin' && existing.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Same canonical form as create, or an edit becomes a way to reintroduce
    // the duplicate spellings the create path now rejects.
    let normalizedPhone;
    if (phone !== undefined) {
      const country = await resolveCountry(supabaseAdmin, req.user.business_id, req.user.active_location_id);
      normalizedPhone = normalizePhone(phone, country);
      if (!normalizedPhone) {
        return res.status(400).json({
          error: 'Enter a valid phone number, or include the country code (e.g. +233…).',
        });
      }
    }

    const updatePayload = { name };
    if (normalizedPhone) updatePayload.phone = normalizedPhone;

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(updatePayload)
      .eq('id', customerId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'A customer with this phone number already exists.' });
      }
      throw error;
    }

    invalidateCachePrefix('/api/customers');
    res.json({ message: 'Customer updated successfully', customer: data });
  } catch (err) {
    logger.error({ err: err }, 'Error updating customer:');
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

/**
 * DELETE /api/customers/:id
 * Delete a customer (Business Admins only)
 */
router.delete('/:id', authGuard, async (req, res) => {
  try {
    // Only Business Admins or Platform Admins can delete
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Business Admins can delete customers.' });
    }

    const customerId = req.params.id;

    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('customers')
      .select('business_id')
      .eq('id', customerId)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Customer not found' });
    if (req.user.role !== 'Platform Admin' && existing.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { error } = await supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', customerId);

    if (error) throw error;

    invalidateCachePrefix('/api/customers');
    res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting customer:');
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

/**
 * POST /api/customers/:id/send-verification
 * Generates an OTP and sends via Arkesel SMS
 */
router.post('/:id/send-verification', authGuard, async (req, res) => {
  try {
    const customerId = req.params.id;

    // Verify ownership
    const { data: customer, error: fetchError } = await supabaseAdmin
      .from('customers')
      .select('business_id, phone, name, verification_code, otp_expires_at')
      .eq('id', customerId)
      .single();

    if (fetchError || !customer) return res.status(404).json({ error: 'Customer not found' });
    if (req.user.role !== 'Platform Admin' && customer.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    let code = customer.verification_code;
    let expiresAt = customer.otp_expires_at;

    // Generate new code if expired or missing
    if (!code || !expiresAt || new Date(expiresAt) < now) {
      code = Math.floor(1000 + Math.random() * 9000).toString();
      expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

      // Save code to database
      const { error: updateError } = await supabaseAdmin
        .from('customers')
        .update({ verification_code: code, otp_expires_at: expiresAt })
        .eq('id', customerId);

      if (updateError) throw updateError;
    }

    // Send SMS via Arkesel API
    const arkeselKey = process.env.ARKESEL_API_KEY;
    const arkeselSender = process.env.ARKESEL_SENDER_ID || 'StoreMgr';
    
    if (arkeselKey) {
      // `233XXXXXXXXX`. Rows created before normalisation may still hold a
      // local or +233 spelling, so this converts whatever is stored rather
      // than assuming the canonical form.
      const cleanPhone = toSmsFormat(customer.phone);
      const message = `Hello ${customer.name || 'Customer'}, your verification code is: ${code}`;
      
      const smsRes = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: {
          'api-key': arkeselKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: arkeselSender,
          message: message,
          recipients: [cleanPhone]
        })
      });
      
      const smsData = await smsRes.json();
      
      if (!smsRes.ok || smsData.status === 'error' || smsData.code === 400) {
        logger.error({ err: smsData }, 'Arkesel SMS failed:');
        return res.status(400).json({ 
          error: `SMS failed: ${smsData.message || 'Invalid phone number or API key'}` 
        });
      }
    } else {
      logger.warn('ARKESEL_API_KEY not set. Verification code generated but SMS not sent.');
      // Optionally return the code in dev mode, but in prod we shouldn't.
      // We will pretend it sent if there's no key for local testing.
    }

    res.json({ message: 'Verification code sent successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error sending verification:');
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

/**
 * POST /api/customers/:id/verify
 * Validates the provided code
 */
router.post('/:id/verify', authGuard, async (req, res) => {
  try {
    const customerId = req.params.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    // Verify ownership and get code
    const { data: customer, error: fetchError } = await supabaseAdmin
      .from('customers')
      .select('business_id, verification_code, otp_expires_at')
      .eq('id', customerId)
      .single();

    if (fetchError || !customer) return res.status(404).json({ error: 'Customer not found' });
    if (req.user.role !== 'Platform Admin' && customer.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!customer.verification_code || customer.verification_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (customer.otp_expires_at && new Date(customer.otp_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    // Update customer as verified
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({ is_verified: true, verification_code: null, otp_expires_at: null })
      .eq('id', customerId);

    if (updateError) throw updateError;

    res.json({ message: 'Customer verified successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error verifying customer:');
    res.status(500).json({ error: 'Failed to verify customer' });
  }
});

module.exports = router;
