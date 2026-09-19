// Stock, cost, rollback and concurrency invariants run against PostgreSQL in
// checkout-transactions.db.cjs. These tests exercise the HTTP contract and scope.
const express=require('express');
const request=require('supertest');
const {randomUUID:uuid}=require('crypto');
const mockUser={id:uuid(),business_id:uuid(),role:'Business Admin',permissions:[],active_location_id:uuid()};
const mockDb={rpc:jest.fn()};
jest.mock('../db/supabase',()=>({supabaseAdmin:mockDb}));
jest.mock('../middleware/authGuard',()=> (req,res,next)=>{req.user=mockUser;next();});
jest.mock('../middleware/apiCache',()=>({invalidateCachePrefix:jest.fn()}));
const app=express();app.use(express.json());app.use('/purchases',require('../routes/purchaseOrders'));
let po,body;
beforeEach(()=>{mockUser.role='Business Admin';mockUser.permissions=[];mockDb.rpc.mockReset().mockResolvedValue({data:{message:'Goods received',purchase_order:{status:'received'}}});po=uuid();body={operation_id:uuid(),location_id:mockUser.active_location_id,items:[{item_id:uuid(),received_qty:5}]};});
const receive=payload=>request(app).post(`/purchases/${po}/receive`).send(payload || body);
test('passes delivery identity and server-owned business, branch and actor to one transaction',async()=>{
  const res=await receive();expect(res.status).toBe(200);expect(mockDb.rpc).toHaveBeenCalledTimes(1);
  expect(mockDb.rpc).toHaveBeenCalledWith('receive_purchase_transaction',{p_business_id:mockUser.business_id,p_location_id:mockUser.active_location_id,p_actor_id:mockUser.id,p_po_id:po,p_request:{...body,notes:''}});
});
test.each([{}, {received_qty:0},{received_qty:1.5},{received_qty:-1}])('rejects missing identity or invalid whole quantity %p',async(change)=>{
  const payload=Object.keys(change).length?{...body,items:[{item_id:uuid(),...change}]}:{};
  expect((await receive(payload)).status).toBe(400);expect(mockDb.rpc).not.toHaveBeenCalled();
});
test('cannot receive into a branch other than the selected till',async()=>{
  expect((await receive({...body,location_id:uuid()})).status).toBe(403);expect(mockDb.rpc).not.toHaveBeenCalled();
});
test('delegated receiving permission is sufficient; sales permission is not',async()=>{
  mockUser.role='Custom receiver';mockUser.permissions=['receive_goods'];expect((await receive()).status).toBe(200);
  mockDb.rpc.mockClear();mockUser.permissions=['create_sales'];expect((await receive()).status).toBe(403);expect(mockDb.rpc).not.toHaveBeenCalled();
});
test.each([['P0001',400],['P0002',404],['P0003',409],['XX000',500]])('maps database rejection %s without issuing partial writes',async(code,status)=>{
  mockDb.rpc.mockResolvedValue({error:{code,message:'Receiving rejected'}});
  const res=await receive();expect(res.status).toBe(status);expect(mockDb.rpc).toHaveBeenCalledTimes(1);
  if(status===500) expect(res.body.error).not.toBe('Receiving rejected');
});
