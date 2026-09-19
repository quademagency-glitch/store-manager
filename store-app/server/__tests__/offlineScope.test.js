const {buildMockSupabase}=require('./helpers/mockSupabase');
const mockDb=buildMockSupabase({users:{data:{id:'scope-user',business_id:'scope-business',status:'active',roles:{name:'Cashier',permissions:['create_sales']},businesses:{status:'active'},user_locations:[{location_id:'branch-a'},{location_id:'branch-b'}]}}});
jest.mock('../db/supabase',()=>({supabaseAdmin:mockDb}));
jest.mock('../utils/jwtVerifier',()=>({verifyToken:jest.fn().mockResolvedValue({userId:'scope-user'})}));
process.env.AUTH_CACHE_TTL_MS='60000';
const guard=require('../middleware/authGuard');
async function authorize(branch,business='scope-business'){
  const req={method:'GET',path:'/scope',baseUrl:'/api/test',headers:{authorization:'Bearer synthetic',...(branch?{'x-location-id':branch}:{})},get:name=>name==='X-Expected-Business-Id'?business:undefined};
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  let passed=false;await guard(req,res,()=>{passed=true;});return {req,res,passed};
}
beforeEach(()=>guard.invalidateUserCache('scope-user'));
test('cached identities do not share mutable active branch between concurrent requests',async()=>{
  const first=await authorize('branch-a');expect(first.passed).toBe(true);
  const second=await authorize('branch-b');expect(second.passed).toBe(true);
  expect(first.req.user.active_location_id).toBe('branch-a');expect(second.req.user.active_location_id).toBe('branch-b');
  expect(first.req.user).not.toBe(second.req.user);
});
test('a removed or unassigned branch is refused rather than silently changed',async()=>{
  expect((await authorize('branch-a')).passed).toBe(true);
  const result=await authorize('removed-branch');expect(result.res.statusCode).toBe(403);expect(result.passed).toBe(false);
});
test('a saved payment cannot cross businesses on either a fresh or cached identity',async()=>{
  const fresh=await authorize('branch-a','another-business');expect(fresh.res.statusCode).toBe(409);expect(fresh.passed).toBe(false);
  const cached=await authorize('branch-a','another-business');expect(cached.res.statusCode).toBe(409);expect(cached.passed).toBe(false);
});
