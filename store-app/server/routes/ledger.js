const express = require('express');
const logger = require('../utils/logger');
const { ZipArchive } = require('archiver');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const { validateBody } = require('../middleware/validate');
const { logAuditEvent, AUDIT_ACTIONS } = require('../utils/auditLog');

const { reportRange, applyReportRange } = require('../utils/reportDates');
const { fetchAllRows } = require('../utils/fetchAllRows');

const router = express.Router();

const ledgerEntrySchema = z.object({
  type: z.enum(['expense', 'deposit_to_bank', 'pay_in']),
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().optional(),
  location_id: z.string().uuid('Location ID is required and must be a valid UUID'),
  template_id: z.string().uuid().optional().nullable(),
  receipt_url: z.string().url().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
  date: z.string().optional().nullable(),
});

/**
 * Helper to apply location filters based on role/assignment.
 * For ledger, Managers and Staff can only see their assigned locations.
 */
function applyLocationFilter(query, req) {
  if (req.user.active_location_id) return query.eq('location_id', req.user.active_location_id);
  if (req.user.role === 'Platform Admin' || req.user.role === 'Business Admin') {
    return query; // Admins see all locations in the business
  }
  
  if (req.user.active_location_id) {
    return query.eq('location_id', req.user.active_location_id);
  } else if (req.user.location_ids && req.user.location_ids.length > 0) {
    return query.in('location_id', req.user.location_ids);
  } else {
    // Failsafe if no locations assigned
    return query.eq('location_id', '00000000-0000-0000-0000-000000000000');
  }
}

/**
 * GET /api/ledger/till-balance
 * Fetch the current till balance and ledger history depending on user permissions.
 */
router.get('/till-balance', authGuard, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Check permissions manually or explicitly allow Admins and Managers
    const hasHistoryPerm = req.user.permissions?.includes('view_till_history') || 
                           ['Platform Admin', 'Business Admin', 'Manager'].includes(req.user.role);

    const range = reportRange(start_date, end_date, { defaults: true });

    const scoped = query => applyLocationFilter(query.eq('business_id', req.user.business_id), req);
    const [sales, entries, locations, refunds] = await Promise.all([
      fetchAllRows(() => scoped(supabaseAdmin.from('sales')
        .select('id,total_amount,cash_received,accounting_at,location_id')
        .eq('payment_method','cash').in('status',['completed','void_pending'])
        .gte('accounting_at',range.from).lt('accounting_at',range.until)).order('id')),
      fetchAllRows(() => scoped(supabaseAdmin.from('business_ledger')
        .select('id,type,amount,description,created_at,location_id,status,user:users!user_id(name)')
        .gte('created_at',range.from).lt('created_at',range.until)).order('id')),
      fetchAllRows(() => {
        let query = supabaseAdmin.from('locations').select('id,name').eq('business_id',req.user.business_id);
        if (req.user.active_location_id) query=query.eq('id',req.user.active_location_id);
        return query.order('id');
      }),
      fetchAllRows(() => scoped(supabaseAdmin.from('returns')
        .select('id,location_id,created_at,cash_refund_amount,total_refund_amount,sale:sales!original_sale_id(payment_method)')
        .gte('created_at',range.from).lt('created_at',range.until)).order('id')),
    ]);
    const cashSale = sale => Number(sale.cash_received ?? sale.total_amount);
    const cashRefund = refund => Number(refund.cash_refund_amount ?? (refund.sale?.payment_method === 'cash' ? refund.total_refund_amount : 0));

    // Map location IDs to names
    const locMap = {};
    locations.forEach(l => locMap[l.id] = l.name);

    // If the user does not have history permission (Basic view for cashiers)
    if (!hasHistoryPerm && req.user.role !== 'Platform Admin') {
      const totalCashSales = sales.reduce((sum, s) => sum + cashSale(s), 0);
      const totalExpenses = entries.filter(e => e.type === 'expense' && e.status === 'approved').reduce((sum, e) => sum + Number(e.amount), 0);
      const totalDeposits = entries.filter(e => e.type === 'deposit_to_bank' && e.status === 'approved').reduce((sum, e) => sum + Number(e.amount), 0);
      const totalApPayments = entries.filter(e => e.type === 'ap_payment' && e.status === 'approved').reduce((sum, e) => sum + Number(e.amount), 0);

      const totalPayIns = entries.filter(e => e.type === 'pay_in' && e.status === 'approved').reduce((sum, e) => sum + Number(e.amount), 0);

      const currentBalance = totalCashSales + totalPayIns - totalExpenses - totalDeposits - totalApPayments - refunds.reduce((sum,r) => sum + cashRefund(r),0);

      return res.json({
        view: 'basic',
        currentBalance,
      });
    }

    // Advanced View (History)
    // Group all transactions by Branch (Location)
    const branches = {};

    // Initialize branches user has access to
    locations.forEach(l => {
      // If Admin, add all. If Manager, only add if in location_ids
      if (req.user.role === 'Platform Admin' || req.user.role === 'Business Admin' || req.user.location_ids?.includes(l.id)) {
        branches[l.id] = {
          location_id: l.id,
          location_name: l.name,
          total_sales: 0,
          total_refunds: 0,
          estimated_cash_entries: 0,
          total_expenses: 0,
          total_deposits: 0,
          total_pay_ins: 0,
          total_ap_payments: 0,
          current_balance: 0,
          transactions: []
        };
      }
    });

    // Populate Sales
    sales.forEach(s => {
      const b = branches[s.location_id];
      if (b) {
        if (s.cash_received == null) b.estimated_cash_entries += 1;
        b.total_sales += cashSale(s);
        b.current_balance += cashSale(s);
        b.transactions.push({
          id: s.id,
          date: s.accounting_at,
          type: 'sale',
          description: 'Cash Sale',
          amount: cashSale(s),
          user: 'System'
        });
      }
    });

    refunds.forEach(r => {
      const b = branches[r.location_id], amount = cashRefund(r);
      if (!b || !amount) return;
      b.total_refunds += amount;
      b.current_balance -= amount;
      if (r.cash_refund_amount == null) b.estimated_cash_entries += 1;
      b.transactions.push({ id:r.id, date:r.created_at, type:'refund', description:'Cash refund', amount, user:'System' });
    });

    // Populate Ledger Entries
    entries.forEach(e => {
      const b = branches[e.location_id];
      if (b && e.status !== 'rejected') {
        if (e.status === 'approved') {
          if (e.type === 'expense') {
            b.total_expenses += Number(e.amount);
            b.current_balance -= Number(e.amount);
          } else if (e.type === 'deposit_to_bank') {
            b.total_deposits += Number(e.amount);
            b.current_balance -= Number(e.amount);
          } else if (e.type === 'pay_in') {
            b.total_pay_ins += Number(e.amount);
            b.current_balance += Number(e.amount);
          } else if (e.type === 'ap_payment') {
            b.total_ap_payments += Number(e.amount);
            b.current_balance -= Number(e.amount);
          }
        }

        b.transactions.push({
          id: e.id,
          date: e.created_at,
          type: e.type,
          description: e.description || e.type,
          amount: Number(e.amount),
          status: e.status, // Add status
          user: e.user?.name || 'Unknown'
        });
      }
    });

    // Sort transactions by date descending and calculate running balance
    Object.values(branches).forEach(b => {
      b.transactions.sort((x, y) => new Date(y.date) - new Date(x.date));
      
      let runningBalance = 0;
      for (let i = b.transactions.length - 1; i >= 0; i--) {
        const t = b.transactions[i];
        if (t.status === 'pending') {
          t.balance = runningBalance; // Pending doesn't affect running balance
        } else if (t.type === 'sale' || t.type === 'pay_in') {
          runningBalance += t.amount;
          t.balance = runningBalance;
        } else if (t.type === 'expense' || t.type === 'deposit_to_bank' || t.type === 'ap_payment' || t.type === 'refund') {
          runningBalance -= t.amount;
          t.balance = runningBalance;
        } else {
          t.balance = runningBalance;
        }
      }
    });

    // Convert object to array
    const branchList = Object.values(branches);

    res.json({
      view: 'advanced',
      branches: branchList
    });

  } catch (err) {
    logger.error({ err: err }, 'Error fetching ledger:');
    res.status(err.status === 400 ? 400 : 500).json({ error: 'Failed to fetch ledger data' });
  }
});

/**
 * POST /api/ledger
 * Create a new ledger entry (expense, deposit)
 */
router.post('/', authGuard, validateBody(ledgerEntrySchema), async (req, res) => {
  try {
    const { type, amount, description, location_id, template_id, receipt_url, metadata, date } = req.body;

    // If a template is specified, enforce receipt requirement and pull account category
    let accountCategory = null;
    let glCode = null;
    if (template_id) {
      const { data: template, error: tplErr } = await supabaseAdmin
        .from('accounting_templates')
        .select('require_receipt, account_category, gl_code')
        .eq('id', template_id)
        .eq('business_id', req.user.business_id)
        .single();

      if (tplErr || !template) return res.status(400).json({ error: 'Accounting template not found for this business.' });
      if (template) {
        // Enforce receipt requirement
        if (template.require_receipt !== false && !receipt_url) {
          return res.status(400).json({ error: 'This template requires a receipt/evidence document.' });
        }
        accountCategory = template.account_category || null;
        glCode = template.gl_code || null;
      }
    }

    // Permissions logic
    // Admin & Managers = approved automatically
    // Every other role requires review, including custom staff roles.
    const canApprove = ['Manager', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    const status = canApprove ? 'approved' : 'pending';

    // Merge account category into metadata
    const enrichedMetadata = {
      ...(metadata || {}),
      ...(accountCategory ? { account_category: accountCategory } : {}),
      ...(glCode ? { gl_code: glCode } : {})
    };

    const insertData = {
      business_id: req.user.business_id,
      user_id: req.user.id,
      type,
      amount,
      description,
      location_id,
      template_id: template_id || null,
      receipt_url: receipt_url || null,
      metadata: enrichedMetadata,
      status,
      date: date || new Date().toISOString().split('T')[0]
    };

    if (status === 'approved') {
      insertData.approved_by = req.user.id;
      insertData.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('business_ledger')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error creating ledger entry:');
    res.status(err.status === 400 ? 400 : 500).json({ error: 'Failed to create entry' });
  }
});

/**
 * PUT /api/ledger/:id/approve
 * Approve a pending ledger entry
 */
/**
 * GET /api/ledger/pending
 * Ledger entries awaiting approval.
 *
 * Added because the approvals page was querying `business_ledger` straight
 * from the browser's Supabase client, which meant the server's role gate never
 * ran (it leaned entirely on RLS), the page could not be exercised by the
 * mock-based test suites, and a failed query surfaced a raw Postgres string to
 * the user, "invalid input syntax for type uuid".
 *
 * The role list is deliberately identical to /:id/approve and /:id/reject
 * below: anyone who can see the queue can act on it, and vice versa.
 */
router.get('/pending', authGuard, async (req, res) => {
  try {
    const canApprove = ['Manager', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    if (!canApprove) return res.status(403).json({ error: 'Unauthorized to view pending entries.' });

    let query = supabaseAdmin
      .from('business_ledger')
      .select('id, type, amount, description, created_at, status, receipt_url, metadata, date, users!user_id(name, email), locations(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }
    query = applyLocationFilter(query, req);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching pending ledger entries:');
    res.status(err.status === 400 ? 400 : 500).json({ error: 'Failed to fetch pending entries' });
  }
});

router.put('/:id/approve', authGuard, async (req, res) => {
  try {
    const canApprove = ['Manager', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    if (!canApprove) return res.status(403).json({ error: 'Unauthorized to approve entries.' });

    const { error } = await supabaseAdmin
      .from('business_ledger')
      .update({
        status: 'approved',
        approved_by: req.user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('business_id', req.user.business_id);

    if (error) throw error;
    res.json({ message: 'Approved successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error approving entry:');
    res.status(err.status === 400 ? 400 : 500).json({ error: 'Failed to approve entry' });
  }
});

/**
 * PUT /api/ledger/:id/reject
 * Reject a pending ledger entry
 */
router.put('/:id/reject', authGuard, async (req, res) => {
  try {
    const canApprove = ['Manager', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    if (!canApprove) return res.status(403).json({ error: 'Unauthorized to reject entries.' });

    const { error } = await supabaseAdmin
      .from('business_ledger')
      .update({
        status: 'rejected'
      })
      .eq('id', req.params.id)
      .eq('business_id', req.user.business_id);

    if (error) throw error;
    res.json({ message: 'Rejected successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error rejecting entry:');
    res.status(err.status === 400 ? 400 : 500).json({ error: 'Failed to reject entry' });
  }
});

/**
 * GET /api/ledger/download-receipts
 * Download receipt images as a ZIP file
 */
router.get('/download-receipts', authGuard, async (req, res) => {
  try {
    const canDownload = ['Manager', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    if (!canDownload) return res.status(403).json({ error: 'Unauthorized to download receipts.' });

    const { start_date, end_date } = req.query;

    const range = reportRange(start_date, end_date);
    const data = await fetchAllRows(() => applyLocationFilter(applyReportRange(supabaseAdmin
      .from('business_ledger')
      .select('id, type, created_at, receipt_url')
      .eq('business_id', req.user.business_id)
      .not('receipt_url', 'is', null), range), req).order('id'));
    if (!data.length) return res.status(404).json({ error: 'No receipts found in this date range.' });

    // Validate every source before sending ZIP headers. A missing receipt must
    // not turn into a plausible, incomplete archive.
    const files = [];
    let bytes = 0;
    for (const entry of data) {
      const match = entry.receipt_url.match(/receipts\/(.+)$/);
      const path = decodeURIComponent((match ? match[1] : entry.receipt_url).split('?')[0]);
      const { data: file, error } = await supabaseAdmin.storage.from('receipts').download(path);
      if (error || !file) {
        logger.error({ err: error, receiptId: entry.id }, 'Receipt archive source unavailable');
        return res.status(502).json({ error: 'A receipt could not be downloaded. No archive was created. Please retry.' });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      bytes += buffer.length;
      if (bytes > 64 * 1024 * 1024) return res.status(413).json({ error: 'Receipts exceed the 64 MB download limit. Select a shorter date range.' });
      const extension = path.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] || 'bin';
      files.push({ buffer, name: `${entry.type}_${entry.id}.${extension}` });
    }
    logAuditEvent(req, AUDIT_ACTIONS.RECEIPTS_DOWNLOADED, 'ledger', null, {
      receipt_count: files.length, start_date: start_date || null, end_date: end_date || null,
    });
    res.attachment(`receipts_${new Date().toISOString().slice(0, 10)}.zip`);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', err => { logger.error({ err }, 'Receipt archive stream failed'); res.destroy(err); });
    res.on('close', () => { if (!res.writableFinished) archive.abort(); });
    archive.pipe(res);
    for (const file of files) archive.append(file.buffer, { name: file.name });
    await archive.finalize();

  } catch (err) {
    logger.error({ err: err }, 'Error zipping receipts:');
    if (!res.headersSent) {
      res.status(err.status === 400 ? 400 : 500).json({ error: 'Failed to generate ZIP file' });
    }
  }
});

/**
 * GET /api/ledger/financial-summary
 * Aggregates approved ledger entries by account_category for financial reporting.
 * Query params: start_date, end_date
 */
router.get('/financial-summary', authGuard, async (req, res) => {
  try {
    const canView = ['Manager', 'Business Admin', 'Platform Admin'].includes(req.user.role);
    if (!canView) return res.status(403).json({ error: 'Unauthorized to view financial summary.' });

    const { start_date, end_date } = req.query;

    const range = reportRange(start_date, end_date, { defaults: true });

    const scoped = query => applyLocationFilter(query.eq('business_id', req.user.business_id), req);
    const [entries, sales, refunds] = await Promise.all([
      fetchAllRows(() => scoped(supabaseAdmin.from('business_ledger')
        .select('id,type,amount,description,metadata,created_at').eq('status','approved')
        .gte('created_at',range.from).lt('created_at',range.until)).order('id')),
      fetchAllRows(() => scoped(supabaseAdmin.from('sales').select('id,total_amount')
        .in('status',['completed','void_pending']).gte('accounting_at',range.from).lt('accounting_at',range.until)).order('id')),
      fetchAllRows(() => scoped(supabaseAdmin.from('returns').select('id,total_refund_amount')
        .gte('created_at',range.from).lt('created_at',range.until)).order('id')),
    ]);
    const totalSales = sales.reduce((sum,s) => sum + Number(s.total_amount),0)
      - refunds.reduce((sum,r) => sum + Number(r.total_refund_amount),0);

    // Categorize ledger entries
    const expenseCategories = {};
    const depositCategories = {};
    let totalExpenses = 0;
    let totalDeposits = 0;
    let totalOtherIncome = 0;

    entries.forEach(entry => {
      const category = entry.metadata?.account_category || 'Uncategorized';
      const amt = Number(entry.amount);

      if (entry.type === 'expense') {
        totalExpenses += amt;
        expenseCategories[category] = (expenseCategories[category] || 0) + amt;
      } else if (entry.type === 'deposit_to_bank') {
        totalDeposits += amt;
        depositCategories[category] = (depositCategories[category] || 0) + amt;
      } else if (entry.type === 'pay_in') {
        totalOtherIncome += amt;
      }
    });

    const totalIncome = totalSales + totalOtherIncome;
    const netPosition = totalIncome - totalExpenses;

    res.json({
      period: {
        start: range.startDate,
        end: range.endDate
      },
      income: {
        total_sales: totalSales,
        other_income: totalOtherIncome,
        total: totalIncome
      },
      expenses: {
        categories: expenseCategories,
        total: totalExpenses
      },
      deposits: {
        categories: depositCategories,
        total: totalDeposits
      },
      net_position: netPosition,
      entry_count: entries.length
    });

  } catch (err) {
    logger.error({ err: err }, 'Error fetching financial summary:');
    res.status(err.status === 400 ? 400 : 500).json({ error: err.status === 400 ? err.message : 'Failed to fetch financial summary' });
  }
});

module.exports = router;
