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

module.exports = router;
