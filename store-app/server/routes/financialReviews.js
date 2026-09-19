const express = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { transactionError } = require('../utils/transactionError');
const { scopeMoney } = require('../utils/settledMoney');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { invalidateCachePrefix } = require('../middleware/apiCache');
const router = express.Router();
router.use(authGuard, permissionCheck('manage_reconciliation'));
router.get('/', async (req,res) => {
  try {
    const {page,limit,offset}=getPagination(req.query);
    const {data,error,count}=await scopeMoney(supabaseAdmin.from('financial_exceptions').select('*',{count:'exact'}),req.user)
      .order('occurred_at',{ascending:false}).order('record_id').range(offset,offset+limit-1);
    if(error) throw error;
    res.json({data,...buildPaginationMeta(count,page,limit)});
  } catch(err) { res.status(err.status || 500).json({error:err.status ? err.message : 'Could not load financial exceptions'}); }
});
router.get('/:kind/:id', async(req,res) => {
  if(!z.uuid().safeParse(req.params.id).success) return res.status(400).json({error:'Invalid financial record'});
  const {data,error}=await scopeMoney(supabaseAdmin.from('financial_reviews').select('id,action,note,evidence,created_at,actor:users!actor_id(name)').eq('kind',req.params.kind).eq('record_id',req.params.id),req.user).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error:'Could not load review history'});
  res.json(data);
});
const schema=z.object({operation_id:z.uuid(),kind:z.enum(['sale','cost','commission','return']),record_id:z.uuid(),action:z.enum(['record_evidence','confirm_settlement','confirm_cost','link_payout']),
  note:z.string().trim().min(10).max(2000),evidence:z.string().trim().min(3).max(1000),values:z.record(z.string(),z.union([z.string(),z.number().finite()])).default({})});
router.post('/',async(req,res)=>{
  const parsed=schema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'Provide a record, review note and evidence reference.'});
  if(!req.user.active_location_id) return res.status(400).json({error:'Select the record’s branch before saving this review.'});
  const {data,error}=await supabaseAdmin.rpc('reconcile_financial_record',{p_business_id:req.user.business_id,p_location_id:req.user.active_location_id,p_actor_id:req.user.id,p_request:parsed.data});
  if(error) return transactionError(res,error,'Could not confirm the review. Retry the same saved review.');
  for(const prefix of ['/api/analytics','/api/ledger','/api/reports','/api/hr']) invalidateCachePrefix(prefix);
  res.json(data);
});
module.exports=router;
