const express = require('express');
const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');
const ID = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const mockUser = {id:ID(1),business_id:ID(2),active_location_id:ID(3),role:'Business Admin',permissions:[]};
const mockDb=buildMockSupabase({businesses:{data:{qr_tracking_mode:'single'}},store_credit_ledger:{data:{id:'entry',balance_after:45}}});
jest.mock('../db/supabase',()=>({supabaseAdmin:mockDb}));
jest.mock('../middleware/authGuard',()=> (req,res,next)=>{req.user=mockUser;next();});
jest.mock('../middleware/apiCache',()=>({apiCache:()=> (req,res,next)=>next(),invalidateCachePrefix:jest.fn()}));
const app=express();app.use(express.json());app.use('/sales',require('../routes/sales'));app.use('/returns',require('../routes/returns'));app.use('/loyalty',require('../routes/loyalty'));
beforeEach(()=>{mockDb.rpc.mockReset();mockDb.from.mockClear();mockDb.mutations.length=0;mockUser.role='Business Admin';mockUser.permissions=[];mockUser.active_location_id=ID(3);});
const payment={settlement_id:ID(5),payment_method:'mobile',amount_paid:60,store_credit:20,points:100};
test('checkout trusts authenticated identity and returns the committed receipt',async()=>{
  const result={message:'Done',sale:{id:ID(4),payment_method:'mobile',total_amount:90,amount_paid:60,rewards_applied:30}};
  mockDb.rpc.mockResolvedValue({data:result});
  const res=await request(app).post(`/sales/${ID(4)}/finalize`).send({...payment,business_id:ID(99),total_amount:1});
  expect(res.status).toBe(200);expect(res.body).toEqual(result);
  expect(mockDb.rpc).toHaveBeenCalledWith('finalize_sale_transaction',{p_business_id:ID(2),p_location_id:ID(3),p_actor_id:ID(1),p_sale_id:ID(4),p_settlement_id:ID(5),p_payment_method:'mobile',p_amount_paid:60,p_store_credit:20,p_points:100});
  expect(mockDb.mutations).toEqual([]);
});
test.each([{amount_paid:-1},{payment_method:'credit'},{points:1.5},{settlement_id:null}])('invalid payment %j cannot reach database',async patch=>{
  expect((await request(app).post(`/sales/${ID(4)}/finalize`).send({...payment,...patch})).status).toBe(400);expect(mockDb.rpc).not.toHaveBeenCalled();
});
test.each([['P0001',400],['P0002',404],['P0003',409],['PGRST202',503],['XX000',500]])('maps transaction error %s to %s without claiming success',async(code,status)=>{
  mockDb.rpc.mockResolvedValue({error:{code,message:'database detail'}});
  const res=await request(app).post(`/sales/${ID(4)}/finalize`).send(payment);expect(res.status).toBe(status);
  if(status>=500) expect(res.body.error).not.toContain('database detail');
});
test('missing branch cannot complete payment or process returns',async()=>{
  mockUser.active_location_id=null;
  expect((await request(app).post(`/sales/${ID(4)}/finalize`).send(payment)).status).toBe(400);
  expect((await request(app).get(`/returns/sale/${ID(4)}`)).status).toBe(400);expect(mockDb.rpc).not.toHaveBeenCalled();
});
test('delegated returns use quantities and unit identities, never client prices or totals',async()=>{
  mockUser.role='Returns Clerk';mockUser.permissions=['manage_returns'];
  const result={return_id:ID(6),refund:{total_refund_amount:45},items:[]};mockDb.rpc.mockResolvedValue({data:result});
  const res=await request(app).post('/returns').send({sale_id:ID(4),operation_id:ID(6),reason:' Changed mind ',total_refund_amount:999,items:[{sale_item_id:ID(7),quantity:1,unit_price:999,product_id:ID(99)}]});
  expect(res.status).toBe(200);expect(res.body).toEqual(result);
  expect(mockDb.rpc).toHaveBeenCalledWith('process_return_transaction',{p_business_id:ID(2),p_location_id:ID(3),p_actor_id:ID(1),p_sale_id:ID(4),p_operation_id:ID(6),p_reason:'Changed mind',p_items:[{sale_item_id:ID(7),quantity:1,unit_ids:[]}]});
  expect(mockDb.mutations).toEqual([]);
});
test.each([{quantity:1.5},{quantity:0},{return_quantity:1}])('invalid legacy or fractional return %j is rejected',async item=>{
  expect((await request(app).post('/returns').send({sale_id:ID(4),operation_id:ID(6),reason:'Test',items:[{sale_item_id:ID(7),...item}]})).status).toBe(400);expect(mockDb.rpc).not.toHaveBeenCalled();
});
test('reward balance endpoints use ledger sums for both currencies',async()=>{
  mockDb.rpc.mockResolvedValue({data:{points:80.5,credit:10}});
  expect((await request(app).get(`/loyalty/balance/${ID(8)}`)).body.points).toBe(80.5);
  expect((await request(app).get(`/loyalty/store-credit/${ID(8)}`)).body.balance).toBe(10);
});
test('administrative credit issue remains available with trigger-calculated balance',async()=>{
  const res=await request(app).post('/loyalty/store-credit').send({customer_id:ID(8),amount:15,type:'issue'});
  expect(res.status).toBe(201);expect(res.body.new_balance).toBe(45);expect(mockDb.mutations[0].payload).toMatchObject({amount:15,type:'issue',business_id:ID(2)});
  expect(mockDb.mutations[0].payload).not.toHaveProperty('balance_after');
});
test('old client separate sale reward deductions are refused',async()=>{
  expect((await request(app).post('/loyalty/store-credit').send({customer_id:ID(8),sale_id:ID(4),amount:15,type:'redeem'})).status).toBe(409);
  expect((await request(app).post('/loyalty/redeem').send({customer_id:ID(8),sale_id:ID(4),points:100})).status).toBe(409);
  expect(mockDb.mutations).toEqual([]);
});
