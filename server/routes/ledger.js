const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');

const router = express.Router();

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
      .select('id, type, amount, description, created_at, location_id, user:users!user_id(name)')
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
      const totalExpenses = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0);
      const totalDeposits = entries.filter(e => e.type === 'deposit_to_bank').reduce((sum, e) => sum + Number(e.amount), 0);
      
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
      if (b) {
        if (e.type === 'expense') {
          b.total_expenses += Number(e.amount);
          b.current_balance -= Number(e.amount);
        } else if (e.type === 'deposit_to_bank') {
          b.total_deposits += Number(e.amount);
          b.current_balance -= Number(e.amount);
        } else if (e.type === 'pay_in') {
          b.current_balance += Number(e.amount);
        }

        b.transactions.push({
          id: e.id,
          date: e.created_at,
          type: e.type,
          description: e.description || e.type,
          amount: Number(e.amount),
          user: e.user?.name || 'Unknown'
        });
      }
    });

    // Sort transactions by date descending
    Object.values(branches).forEach(b => {
      b.transactions.sort((x, y) => new Date(y.date) - new Date(x.date));
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

module.exports = router;
