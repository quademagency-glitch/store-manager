const express = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { transactionError } = require('../utils/transactionError');
const { invalidateCachePrefix } = require('../middleware/apiCache');
const router = express.Router();
router.use(authGuard, permissionCheck('manage_till'));
router.use((req, res, next) => {
  if (!req.user.active_location_id) return res.status(400).json({ error: 'Choose a branch to open or close its till.' });
  if (!['Business Admin', 'Platform Admin'].includes(req.user.role) && !req.user.location_ids?.includes(req.user.active_location_id)) return res.status(403).json({ error: 'Branch access denied.' });
  next();
});
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('till_sessions')
    .select('*, opener:users!opened_by(name), closer:users!closed_by(name), reviewer:users!reviewed_by(name)')
    .eq('business_id', req.user.business_id).eq('location_id', req.user.active_location_id).order('opened_at', { ascending: false }).limit(50);
  if (error) return res.status(503).json({ error: 'Till sessions could not be loaded. Retry shortly; the cash ledger remains available.' });
  const { data: snapshot, error: snapshotError } = await supabaseAdmin.rpc('branch_cash_snapshot', { p_business_id: req.user.business_id, p_location_id: req.user.active_location_id });
  if (snapshotError) return res.status(503).json({ error: 'The current cash position could not be loaded.' });
  res.json({ sessions: data, snapshot });
});
const money = z.number().finite().nonnegative().max(9999999999).multipleOf(0.01);
const schema = z.object({
  operation_id: z.uuid(), action: z.enum(['open', 'close', 'review', 'cash_in', 'cash_out']),
  session_id: z.uuid().optional(), register_name: z.string().trim().min(1).max(80).optional(),
  opening_float: money.optional(), counted_cash: money.optional(), amount: money.optional(),
  note: z.string().trim().max(2000).default(''),
  denominations: z.record(z.string(), z.number().int().nonnegative().max(100000)).optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'open' && (value.opening_float === undefined || !value.register_name)) ctx.addIssue({ code: 'custom', message: 'Name the till and enter an opening float.' });
  if (value.action !== 'open' && !value.session_id) ctx.addIssue({ code: 'custom', message: 'Select a till session.' });
  if (value.action === 'close' && value.counted_cash === undefined) ctx.addIssue({ code: 'custom', message: 'Enter the counted cash.' });
  if (['cash_in', 'cash_out'].includes(value.action) && !(value.amount > 0)) ctx.addIssue({ code: 'custom', message: 'Enter a positive cash movement.' });
});
router.post('/', (req, res, next) => {
  if (req.body.action === 'review') return permissionCheck('approve_accounting')(req, res, next);
  if (['cash_in', 'cash_out'].includes(req.body.action)) return permissionCheck('manage_financials')(req, res, next);
  next();
}, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { data, error } = await supabaseAdmin.rpc('manage_till_session', { p_business_id: req.user.business_id, p_location_id: req.user.active_location_id, p_actor_id: req.user.id, p_request: parsed.data });
  if (error) return transactionError(res, error, 'The till action could not be confirmed. Retry the saved request.', true);
  invalidateCachePrefix('/api/ledger');
  res.json(data);
});
module.exports = router;
