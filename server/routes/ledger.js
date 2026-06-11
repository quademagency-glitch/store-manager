const express = require('express');
const archiver = require('archiver');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

const ledgerEntrySchema = z.object({
  type: z.enum(['expense', 'deposit_to_bank', 'pay_in']),
  amount: z.number().positive('Amount must be greater than 0'),
  description: z.string().optional(),
  location_id: z.string().uuid('Location ID is required and must be a valid UUID'),
  template_id: z.string().uuid().optional().nullable(),
  receipt_url: z.string().url().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
  date: z.string().optional().nullable(),
});

/**
 * Helper to apply location filters based on role/assignment.
 * For ledger, Managers and Staff can only see their assigned locations.
 */
function applyLocationFilter(query, req) {
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

    // Determine the date range
    let startD = new Date();
    startD.setDate(1); // Default to start of current month
    startD.setHours(0, 0, 0, 0);
    
    let endD = new Date();
    endD.setHours(23, 59, 59, 999);

    if (start_date) startD = new Date(start_date);
    if (end_date) endD = new Date(end_date);

    // 1. Fetch Sales (Cash only)
    let salesQuery = supabaseAdmin
      .from('sales')
      .select('id, total_amount, created_at, location_id')
      .eq('payment_method', 'cash')
      .neq('status', 'voided')
      .gte('created_at', startD.toISOString())
      .lte('created_at', endD.toISOString());

    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    // 2. Fetch Ledger Entries (Expenses, Deposits)
    let ledgerQuery = supabaseAdmin
      .from('business_ledger')
      .select('id, type, amount, description, created_at, location_id, status, user:users!user_id(name)')
      .gte('created_at', startD.toISOString())
      .lte('created_at', endD.toISOString());

    if (req.user.role !== 'Platform Admin') {
      ledgerQuery = ledgerQuery.eq('business_id', req.user.business_id);
    }
    ledgerQuery = applyLocationFilter(ledgerQuery, req);

    // 3. Fetch Locations (for grouping)
    let locQuery = supabaseAdmin
      .from('locations')
      .select('id, name');
    if (req.user.role !== 'Platform Admin') {
      locQuery = locQuery.eq('business_id', req.user.business_id);
    }

    const [salesRes, ledgerRes, locRes] = await Promise.all([
      salesQuery,
      ledgerQuery,
      locQuery
    ]);

    if (salesRes.error) throw salesRes.error;
    if (ledgerRes.error) throw ledgerRes.error;

    const sales = salesRes.data || [];
    const entries = ledgerRes.data || [];
    const locations = locRes.data || [];

    // Map location IDs to names
    const locMap = {};
    locations.forEach(l => locMap[l.id] = l.name);

    // If the user does not have history permission (Basic view for cashiers)
    if (!hasHistoryPerm && req.user.role !== 'Platform Admin') {
      const totalCashSales = sales.reduce((sum, s) => sum + Number(s.total_amount), 0);
      const totalExpenses = entries.filter(e => e.type === 'expense' && e.status === 'approved').reduce((sum, e) => sum + Number(e.amount), 0);
      const totalDeposits = entries.filter(e => e.type === 'deposit_to_bank' && e.status === 'approved').reduce((sum, e) => sum + Number(e.amount), 0);
      
      const currentBalance = totalCashSales - totalExpenses - totalDeposits;

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
          total_expenses: 0,
          total_deposits: 0,
          current_balance: 0,
          transactions: []
        };
      }
    });

    // Populate Sales
    sales.forEach(s => {
      const b = branches[s.location_id];
      if (b) {
        b.total_sales += Number(s.total_amount);
        b.current_balance += Number(s.total_amount);
        b.transactions.push({
          id: s.id,
          date: s.created_at,
          type: 'sale',
          description: 'Cash Sale',
          amount: Number(s.total_amount),
          user: 'System'
        });
      }
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
            b.current_balance += Number(e.amount);
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
        } else if (t.type === 'expense' || t.type === 'deposit_to_bank') {
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
    console.error('Error fetching ledger:', err);
    res.status(500).json({ error: 'Failed to fetch ledger data' });
  }
});

/**
 * POST /api/ledger
 * Create a new ledger entry (expense, deposit)
 */
router.post('/', authGuard, validateBody(ledgerEntrySchema), async (req, res) => {
  try {
    const { type, amount, description, location_id, template_id, receipt_url, metadata, date } = req.body;

    // Permissions logic
    // Admin & Managers = approved automatically
    // Cashiers = pending
    const isCashier = req.user.role === 'Salesperson' || req.user.role === 'Cashier';
    const status = isCashier ? 'pending' : 'approved';

    const insertData = {
      business_id: req.user.business_id,
      user_id: req.user.id,
      type,
      amount,
      description,
      location_id,
      template_id: template_id || null,
      receipt_url: receipt_url || null,
      metadata: metadata || {},
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
    console.error('Error creating ledger entry:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

/**
 * PUT /api/ledger/:id/approve
 * Approve a pending ledger entry
 */
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
    console.error('Error approving entry:', err);
    res.status(500).json({ error: 'Failed to approve entry' });
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
    console.error('Error rejecting entry:', err);
    res.status(500).json({ error: 'Failed to reject entry' });
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

    let query = supabaseAdmin
      .from('business_ledger')
      .select('id, type, created_at, receipt_url')
      .eq('business_id', req.user.business_id)
      .not('receipt_url', 'is', null);

    if (start_date) query = query.gte('created_at', new Date(start_date).toISOString());
    if (end_date) query = query.lte('created_at', new Date(end_date).toISOString());

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'No receipts found in this date range.' });
    }

    res.attachment(`receipts_${new Date().toISOString().split('T')[0]}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    for (const entry of data) {
      // The receipt_url should be the storage path or full public URL.
      // If it's a full URL or a storage path, we need to fetch it.
      // Assuming it's a storage path like 'folder/image.png' in the 'receipts' bucket.
      const urlMatch = entry.receipt_url.match(/receipts\/(.+)$/);
      const storagePath = urlMatch ? urlMatch[1] : entry.receipt_url;

      try {
        const { data: fileData, error: downloadError } = await supabaseAdmin
          .storage
          .from('receipts')
          .download(storagePath);
          
        if (downloadError) {
          console.error(`Failed to download ${storagePath}:`, downloadError);
          continue;
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        // Use extension from the url
        const ext = storagePath.split('.').pop() || 'jpg';
        const filename = `${entry.type}_${entry.id.substring(0,8)}.${ext}`;
        archive.append(buffer, { name: filename });
      } catch (err) {
        console.error(`Error processing ${storagePath}:`, err);
      }
    }

    archive.finalize();

  } catch (err) {
    console.error('Error zipping receipts:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate ZIP file' });
    }
  }
});

module.exports = router;
