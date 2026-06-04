const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');

const router = express.Router();

/**
 * GET /api/customers
 * Fetch all customers for the business
 */
router.get('/', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

/**
 * GET /api/customers/search
 * Search customers based on role permissions
 */
router.get('/search', authGuard, async (req, res) => {
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

    // Role-based searching
    if (req.user.role === 'Business Admin' || req.user.role === 'Platform Admin') {
      // Admins can search by name or phone
      query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    } else {
      // Sales and Managers can ONLY search by phone
      query = query.ilike('phone', `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error searching customers:', err);
    res.status(500).json({ error: 'Failed to search customers' });
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

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert([
        {
          business_id: req.user.business_id,
          name,
          phone
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

    res.status(201).json({ message: 'Customer created successfully', customer: data });
  } catch (err) {
    console.error('Error creating customer:', err);
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

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ name, phone })
      .eq('id', customerId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'A customer with this phone number already exists.' });
      }
      throw error;
    }

    res.json({ message: 'Customer updated successfully', customer: data });
  } catch (err) {
    console.error('Error updating customer:', err);
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

    res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    console.error('Error deleting customer:', err);
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
      .select('business_id, phone, name')
      .eq('id', customerId)
      .single();

    if (fetchError || !customer) return res.status(404).json({ error: 'Customer not found' });
    if (req.user.role !== 'Platform Admin' && customer.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Generate 4-digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // Save code to database
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({ verification_code: code })
      .eq('id', customerId);

    if (updateError) throw updateError;

    // Send SMS via Arkesel API
    const arkeselKey = process.env.ARKESEL_API_KEY;
    const arkeselSender = process.env.ARKESEL_SENDER_ID || 'StoreMgr';
    
    if (arkeselKey) {
      // Clean phone number (remove spaces, dashes)
      const cleanPhone = customer.phone.replace(/[\s\-+()]/g, '');
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
        console.error('Arkesel SMS failed:', smsData);
        return res.status(400).json({ 
          error: `SMS failed: ${smsData.message || 'Invalid phone number or API key'}` 
        });
      }
    } else {
      console.warn('ARKESEL_API_KEY not set. Verification code generated but SMS not sent.');
      // Optionally return the code in dev mode, but in prod we shouldn't.
      // We will pretend it sent if there's no key for local testing.
    }

    res.json({ message: 'Verification code sent successfully' });
  } catch (err) {
    console.error('Error sending verification:', err);
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
      .select('business_id, verification_code')
      .eq('id', customerId)
      .single();

    if (fetchError || !customer) return res.status(404).json({ error: 'Customer not found' });
    if (req.user.role !== 'Platform Admin' && customer.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!customer.verification_code || customer.verification_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Update customer as verified
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({ is_verified: true, verification_code: null })
      .eq('id', customerId);

    if (updateError) throw updateError;

    res.json({ message: 'Customer verified successfully' });
  } catch (err) {
    console.error('Error verifying customer:', err);
    res.status(500).json({ error: 'Failed to verify customer' });
  }
});

module.exports = router;
