const express=require('express');
const request=require('supertest');
jest.mock('../db/supabase',()=>({supabaseAdmin:{rpc:jest.fn()}}));
jest.mock('../middleware/authGuard',()=> (req,res,next)=>{req.user=JSON.parse(req.headers['x-test-user']);next();});
const {supabaseAdmin}=require('../db/supabase');
const router=require('../routes/tillSessions');
const app=express();app.use(express.json());app.use('/api/till-sessions',router);
const id='10000000-0000-4000-8000-000000000001';
const loc='10000000-0000-4000-8000-000000000002';
const user={id,business_id:id,active_location_id:loc,location_ids:[loc],role:'Cashier',permissions:['manage_till']};
const post=(body,operator=user)=>request(app).post('/api/till-sessions').set('x-test-user',JSON.stringify(operator)).send(body);
const base={operation_id:id,session_id:id,note:'Test movement',amount:10};
beforeEach(()=>{supabaseAdmin.rpc.mockReset();supabaseAdmin.rpc.mockResolvedValue({data:{id},error:null});});
test('cashiers can open a scoped till, but cannot self-approve cash movements or reviews',async()=>{
 expect((await post({...base,action:'open',register_name:'Drawer',opening_float:100})).status).toBe(200);
 expect(supabaseAdmin.rpc).toHaveBeenCalledWith('manage_till_session',expect.objectContaining({p_business_id:id,p_location_id:loc,p_actor_id:id}));
 supabaseAdmin.rpc.mockClear();
 expect((await post({...base,action:'cash_out'})).status).toBe(403);
 expect((await post({...base,action:'review'})).status).toBe(403);
 expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
});
test('branch assignment and till permission are enforced before financial mutation',async()=>{
 expect((await post({...base,action:'close',counted_cash:0},{...user,active_location_id:null})).status).toBe(400);
 expect((await post({...base,action:'close',counted_cash:0},{...user,location_ids:[]})).status).toBe(403);
 expect((await post({...base,action:'close',counted_cash:0},{...user,permissions:[]})).status).toBe(403);
 expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
});
test('validation rejects missing count and fractional precision before invoking the RPC',async()=>{
 expect((await post({...base,action:'close'})).status).toBe(400);
 expect((await post({...base,action:'close',counted_cash:1.001})).status).toBe(400);
 expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
});

test('a definitive transaction rejection permits editing, while reference collisions stay preserved',async()=>{
 supabaseAdmin.rpc.mockResolvedValueOnce({error:{code:'P0003',message:'This branch already has an open till session'}});
 const rejected=await post({...base,action:'open',register_name:'Drawer',opening_float:100});
 expect(rejected.status).toBe(409);expect(rejected.body.requestRejected).toBe(true);
 supabaseAdmin.rpc.mockResolvedValueOnce({error:{code:'P0003',message:'Reference already used for another operation'}});
 const collision=await post({...base,action:'open',register_name:'Drawer',opening_float:100});
 expect(collision.status).toBe(409);expect(collision.body.requestRejected).toBeUndefined();
});
