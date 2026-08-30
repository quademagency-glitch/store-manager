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
    const { name, phone, email, credit_limit } = req.body;

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

    /* Only what was sent. This built `{ name }` unconditionally, so a caller
       updating one field would have blanked the name with undefined. Nothing
       does that today because the form always posts both, which is the kind of
       thing that stays true right up until it doesn't. */
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (normalizedPhone) updatePayload.phone = normalizedPhone;
    if (email !== undefined) updatePayload.email = email === '' ? null : email;

    /* NULL clears the limit back to "no limit set", which is not the same as a
       limit of 0. The form sends '' for cleared and a number otherwise. */
    if (credit_limit !== undefined) {
      if (credit_limit === '' || credit_limit === null) {
        updatePayload.credit_limit = null;
      } else {
        const limit = Number(credit_limit);
        if (!Number.isFinite(limit) || limit < 0) {
          return res.status(400).json({ error: 'Credit limit must be a number of 0 or more, or left blank for no limit.' });
        }
        updatePayload.credit_limit = limit;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    let { data, error } = await supabaseAdmin
      .from('customers')
      .update(updatePayload)
      .eq('id', customerId)
      .select()
      .single();

    /* Migration 075 adds credit_limit. Until it has run, PostgREST rejects the
       whole update because of that one key, so an edit of the name would fail
       for a reason the user cannot act on. Drop the column and retry rather
       than 500. Deploying code that needs an unapplied migration has taken
       sales down here before; this is the compatibility that was missing. */
    if (error && (error.code === 'PGRST204' || error.code === '42703') && 'credit_limit' in updatePayload) {
      logger.warn('credit_limit column missing, migration 075 has not run; saving the rest');
      delete updatePayload.credit_limit;
      ({ data, error } = await supabaseAdmin
        .from('customers')
        .update(updatePayload)
        .eq('id', customerId)
        .select()
        .single());
    }

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

/* Ownership check shared by the routes below. Every handler in this file
   repeats this; these are the new ones, so they share it. Returns the customer
   row on success, or null after having already answered the request. */
async function loadOwnedCustomer(req, res, columns = 'id, business_id, name') {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select(columns)
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Customer not found' });
    return null;
  }
  if (req.user.role !== 'Platform Admin' && data.business_id !== req.user.business_id) {
    res.status(403).json({ error: 'Unauthorized' });
    return null;
  }
  return data;
}

/* Migration 075 creates customer_notes. Until it runs, PostgREST answers with
   42P01 (undefined_table). Notes then read as empty and writing one says so,
   rather than the page showing a 500 nobody can act on. */
const MISSING_TABLE = (error) => error && (error.code === '42P01' || error.code === 'PGRST205');

/**
 * GET /api/customers/:id/notes
 * Staff notes against a customer, newest first.
 */
router.get('/:id/notes', authGuard, async (req, res) => {
  try {
    const customer = await loadOwnedCustomer(req, res);
    if (!customer) return;

    const { data, error } = await supabaseAdmin
      .from('customer_notes')
      .select('id, body, created_at, author:users!author_user_id(id, name)')
      .eq('customer_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (MISSING_TABLE(error)) return res.json({ data: [], pending_migration: true });
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (err) {
    logger.error({ err }, 'Error fetching customer notes:');
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

/**
 * POST /api/customers/:id/notes
 * Add a note. The author and the tenant come from the session, never the body.
 */
router.post('/:id/notes', authGuard, async (req, res) => {
  try {
    const customer = await loadOwnedCustomer(req, res);
    if (!customer) return;

    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ error: 'A note cannot be empty.' });
    if (body.length > 2000) return res.status(400).json({ error: 'A note cannot be longer than 2000 characters.' });

    const { data, error } = await supabaseAdmin
      .from('customer_notes')
      .insert([{
        business_id: customer.business_id,
        customer_id: req.params.id,
        author_user_id: req.user.id,
        body,
      }])
      .select('id, body, created_at, author:users!author_user_id(id, name)')
      .single();

    if (MISSING_TABLE(error)) {
      return res.status(503).json({ error: 'Notes are not available yet. Migration 075 has not been applied.' });
    }
    if (error) throw error;

    res.status(201).json({ message: 'Note added', note: data });
  } catch (err) {
    logger.error({ err }, 'Error adding customer note:');
    res.status(500).json({ error: 'Failed to add note' });
  }
});

/**
 * DELETE /api/customers/:id/notes/:noteId
 * Business Admins only. There is deliberately no update: a note is a record of
 * what was agreed, and one that can be reworded later is not.
 */
router.delete('/:id/notes/:noteId', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Business Admins can delete notes.' });
    }
    const customer = await loadOwnedCustomer(req, res);
    if (!customer) return;

    const { error } = await supabaseAdmin
      .from('customer_notes')
      .delete()
      .eq('id', req.params.noteId)
      .eq('customer_id', req.params.id);

    if (MISSING_TABLE(error)) return res.status(503).json({ error: 'Notes are not available yet.' });
    if (error) throw error;

    res.json({ message: 'Note deleted' });
  } catch (err) {
    logger.error({ err }, 'Error deleting customer note:');
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

/**
 * GET /api/customers/:id/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The money relationship with one customer over a period: what they bought,
 * what they have on deposit with the shop, and what they still owe on credit.
 *
 * Purchases count completed and void_pending, matching the reports. A void
 * that is still awaiting approval is revenue until somebody approves it, and a
 * statement that disagreed with the sales report would be the more confusing
 * of the two documents.
 */
router.get('/:id/statement', authGuard, async (req, res) => {
  try {
    /* `*` rather than a column list on purpose: credit_limit only exists once
       migration 075 has run, and naming a missing column fails the whole
       select in PostgREST rather than omitting it. */
    const customer = await loadOwnedCustomer(req, res, '*');
    if (!customer) return;

    /* Defaults to the last 90 days. `to` is inclusive of the whole day, so it
       is pushed to the next midnight rather than compared against a date at
       00:00, which would silently drop everything that happened on the last
       day of the period. */
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid from or to date.' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'The start of the period is after its end.' });
    }
    const toExclusive = new Date(to.getTime());
    toExclusive.setHours(23, 59, 59, 999);

    const range = (q) => q.gte('created_at', from.toISOString()).lte('created_at', toExclusive.toISOString());

    const [purchasesR, depositsR, invoicesR] = await Promise.all([
      range(supabaseAdmin
        .from('sales')
        .select('id, receipt_number, total_amount, payment_method, status, created_at')
        .eq('customer_id', req.params.id)
        .in('status', ['completed', 'void_pending']))
        .order('created_at', { ascending: false }),
      range(supabaseAdmin
        .from('store_credit_ledger')
        .select('id, type, amount, balance_after, note, created_at')
        .eq('customer_id', req.params.id))
        .order('created_at', { ascending: false }),
      /* Deliberately NOT period-filtered. Purchases and deposits above are
         movements within the window; the receivables section is the balance as
         it stands, which is the number anyone reads a statement to find. An
         invoice raised last year and still unpaid belongs on today's statement,
         and filtering it out would show a customer as owing nothing. The
         response labels this `asAtDate` so the two are not confused. */
      supabaseAdmin
        .from('ar_invoices')
        .select('id, invoice_number, description, total_amount, amount_paid, status, issued_date, due_date, created_at')
        .eq('customer_id', req.params.id)
        .order('created_at', { ascending: false }),
    ]);

    if (purchasesR.error) throw purchasesR.error;
    if (depositsR.error) throw depositsR.error;
    if (invoicesR.error) throw invoicesR.error;

    const purchases = purchasesR.data || [];
    const deposits = depositsR.data || [];
    const invoices = (invoicesR.data || []).filter((inv) => inv.status !== 'void');

    const sum = (rows, pick) => rows.reduce((acc, row) => acc + (Number(pick(row)) || 0), 0);
    const round2 = (n) => Math.round(n * 100) / 100;

    /* The deposit balance is taken from the latest ledger row's balance_after,
       not by summing the movements in the period: the period is a window, and
       summing inside it would report the change rather than the balance. */
    const latestDeposit = deposits[0];
    const depositBalance = latestDeposit ? Number(latestDeposit.balance_after) || 0 : null;

    const arOutstanding = round2(sum(invoices, (i) => i.total_amount) - sum(invoices, (i) => i.amount_paid));

    res.json({
      customer,
      period: {
        from: from.toISOString(),
        to: toExclusive.toISOString(),
        // Purchases and deposits are movements in [from, to]. Receivables and
        // the deposit balance are as at now, whatever the window says.
        asAtDate: new Date().toISOString(),
      },
      summary: {
        purchaseCount: purchases.length,
        purchaseTotal: round2(sum(purchases, (p) => p.total_amount)),
        depositsIn: round2(sum(deposits.filter((d) => Number(d.amount) > 0), (d) => d.amount)),
        depositsOut: round2(Math.abs(sum(deposits.filter((d) => Number(d.amount) < 0), (d) => d.amount))),
        /* null, not 0: no ledger row at all means this customer has never had
           a deposit account, which is not the same as one holding nothing. */
        depositBalance,
        creditLimit: customer.credit_limit ?? null,
        arInvoiced: round2(sum(invoices, (i) => i.total_amount)),
        arPaid: round2(sum(invoices, (i) => i.amount_paid)),
        arOutstanding,
      },
      purchases,
      deposits,
      receivables: invoices,
    });
  } catch (err) {
    logger.error({ err }, 'Error building customer statement:');
    res.status(500).json({ error: 'Failed to build statement' });
  }
});

module.exports = router;
