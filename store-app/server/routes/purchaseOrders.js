const express = require('express');
const { z } = require('zod');
const { transactionError } = require('../utils/transactionError');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { invalidateCachePrefix } = require('../middleware/apiCache');

const router = express.Router();

/**
 * GET /api/purchase-orders
 * List purchase orders (paginated, filterable by status).
 * Access: Inventory managers
 */
router.get('/', authGuard, permissionCheck('view_purchases', 'manage_purchases', 'receive_goods'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const statusFilter = req.query.status; // optional: draft, sent, partial, received, cancelled

    /* Do NOT embed `creator:users!created_by` or `receiver:users!received_by`
       here. purchase_orders.created_by and received_by are foreign keys to
       auth.users, NOT to public.users, so PostgREST has no relationship to
       follow and answers the whole request with
       PGRST200 "Could not find a relationship between 'purchase_orders' and
       'users' in the schema cache".

       One unresolvable embed fails the ENTIRE select, so this route and the
       detail route below both returned 500 and the purchase order list was
       always empty. Creating a PO worked, because POST does not embed users,
       which made it look as though saving a PO silently lost it. Reported
       exactly that way on 2026-09-14, with the PO sitting in the table the
       whole time.

       Nothing rendered these fields; they were dead weight that broke the
       feature. If a creator name is ever wanted, read public.users
       separately by id (public.users.id IS the auth user id) and stitch. */
    let query = supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers!supplier_id(id, name, contact_person),
        items:purchase_order_items(
          id, product_id, quantity, received_quantity, unit_cost, total,
          product:products!product_id(id, name, sku)
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching purchase orders:');
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

/**
 * GET /api/purchase-orders/:id
 * Get a single PO with full details.
 * Access: Inventory managers
 */
router.get('/:id', authGuard, permissionCheck('view_purchases', 'manage_purchases', 'receive_goods'), async (req, res) => {
  try {
    const { id } = req.params;

    let query = supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers!supplier_id(id, name, contact_person, phone, email, address),
        items:purchase_order_items(
          id, product_id, quantity, received_quantity, unit_cost, total, notes,
          product:products!product_id(id, name, sku, price, category)
        )
      `)
      .eq('id', id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching purchase order:');
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

/**
 * POST /api/purchase-orders
 * Create a new purchase order (draft) with line items.
 * PO number is auto-generated.
 * Access: Inventory managers
 */
const purchaseSchema = z.object({ operation_id:z.uuid().optional(), supplier_id:z.string().uuid(), expected_date:z.string().nullable().optional(), notes:z.string().max(2000).nullable().optional(),
  items:z.array(z.object({product_id:z.string().uuid(),quantity:z.number().int().positive().max(100000),unit_cost:z.number().finite().nonnegative(),notes:z.string().max(1000).nullable().optional()})).min(1).max(500) });
async function saveOrder(req,res) {
  const parsed=purchaseSchema.safeParse(req.body);
  if (!parsed.success || (req.params.id && !z.uuid().safeParse(req.params.id).success)) return res.status(400).json({error:'Provide a supplier and valid purchase lines.'});
  const {data,error}=await supabaseAdmin.rpc(parsed.data.operation_id ? 'save_purchase_order_once' : 'save_purchase_order',{p_business_id:req.user.business_id,p_actor_id:req.user.id,p_po_id:req.params.id || null,p_request:parsed.data});
  if(error) return transactionError(res,error,'Could not save the purchase order.', !!parsed.data.operation_id);
  res.status(req.params.id ? 200 : 201).json(data);
}
router.post('/',authGuard,permissionCheck('manage_purchases'),saveOrder);
router.put('/:id',authGuard,permissionCheck('manage_purchases'),saveOrder);
for (const [action,status] of [['send','sent'],['cancel','cancelled']]) {
  router.put(`/:id/${action}`,authGuard,permissionCheck('manage_purchases'),async(req,res)=>{
    if(!z.uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Invalid purchase order reference'});
    const {data,error}=await supabaseAdmin.rpc('transition_purchase_order',{p_business_id:req.user.business_id,p_actor_id:req.user.id,p_po_id:req.params.id,p_status:status});
    if(error) return transactionError(res,error,'Could not update the purchase order.');
    res.json(data);
  });
}

/**
 * POST /api/purchase-orders/:id/receive
 * Receive goods against a PO.
 * - Updates received_quantity on PO items
 * - Adjusts product_inventory stock
 * - Creates stock_movements (RECEIPT)
 * - Updates PO status (partial / received)
 * Access: Inventory managers
 */
router.post('/:id/receive', authGuard, permissionCheck('manage_purchases', 'receive_goods'), async (req, res) => {
  const parsed = z.object({ operation_id:z.uuid(), location_id:z.uuid(), notes:z.string().max(1000).default(''),
    items:z.array(z.object({item_id:z.uuid(),received_qty:z.number().int().positive().max(100000)})).min(1).max(500) }).safeParse(req.body);
  if (!parsed.success || !z.uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Provide a delivery reference, branch and positive whole quantities.'});
  if (parsed.data.location_id !== req.user.active_location_id) return res.status(403).json({error:'Select the receiving branch before recording this delivery.'});
  const {data,error} = await supabaseAdmin.rpc('receive_purchase_transaction', {
    p_business_id:req.user.business_id,p_location_id:req.user.active_location_id,p_actor_id:req.user.id,p_po_id:req.params.id,p_request:parsed.data,
  });
  if (error) return transactionError(res,error,'Delivery could not be recorded. Retry the same delivery.');
  for(const prefix of ['/api/products','/api/inventory','/api/purchase-orders']) invalidateCachePrefix(prefix);
  res.json(data);
});

// Linked liabilities are permission-gated separately from receiving stock.
router.get('/:id/billing', authGuard, permissionCheck('manage_financials'), async (req,res) => {
  const {data:po,error:poError}=await supabaseAdmin.from('purchase_orders').select('id,items:purchase_order_items(received_quantity,unit_cost)').eq('business_id',req.user.business_id).eq('id',req.params.id).single();
  if(poError || !po) return res.status(404).json({error:'Purchase order not found.'});
  const {data:bills,error}=await supabaseAdmin.from('ap_bills').select('id,bill_number,amount,amount_paid,status,due_date').eq('business_id',req.user.business_id).eq('purchase_order_id',po.id).order('created_at');
  if(error) return res.status(500).json({error:'Supplier bills could not be loaded.'});
  const active=(bills||[]).filter(b=>b.status!=='void');
  const received=Number((po.items||[]).reduce((sum,line)=>sum+Number(line.received_quantity)*Number(line.unit_cost),0).toFixed(2));
  const billed=Number(active.reduce((sum,b)=>sum+Number(b.amount),0).toFixed(2));
  res.json({bills,received,billed,paid:active.reduce((sum,b)=>sum+Number(b.amount_paid),0),unbilled:Math.max(0,Number((received-billed).toFixed(2)))});
});
router.post('/:id/bills', authGuard, permissionCheck('manage_financials'), async(req,res)=>{
  const parsed=z.object({operation_id:z.uuid(),amount:z.number().finite().positive().multipleOf(0.01),description:z.string().max(2000).default(''),due_date:z.iso.date().nullable().optional()}).safeParse(req.body);
  if(!parsed.success || !z.uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Enter a valid received amount, due date and billing reference.'});
  const {data,error}=await supabaseAdmin.rpc('bill_received_purchase',{p_business_id:req.user.business_id,p_actor_id:req.user.id,p_po_id:req.params.id,p_request:parsed.data});
  if(error) return transactionError(res,error,'The supplier bill could not be confirmed. Retry the same saved request.', true);
  res.status(201).json(data);
});

module.exports = router;
