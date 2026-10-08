/**
 * X-Location-Id from a Business Admin must name a branch of their business.
 * Until 8 October 2026 any id was accepted from an admin, and every
 * self-signup is a Business Admin, so branch-scoped routes could be pointed
 * at another tenant's branch.
 */
const { buildMockSupabase } = require('./helpers/mockSupabase');
const mockDb = buildMockSupabase({ users: { data: {
  id: 'owner', business_id: 'biz-a', status: 'active',
  roles: { name: 'Business Admin', permissions: [] },
  businesses: { status: 'active' },
  user_locations: [],
} }, locations: { data: [{ id: 'branch-1' }, { id: 'branch-2' }] } });
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockDb }));
jest.mock('../utils/jwtVerifier', () => ({ verifyToken: jest.fn().mockResolvedValue({ userId: 'owner' }) }));
process.env.AUTH_CACHE_TTL_MS = '60000';
const guard = require('../middleware/authGuard');

async function authorize(branch) {
  const req = { method: 'GET', path: '/x', baseUrl: '/api/test', headers: { authorization: 'Bearer synthetic', ...(branch ? { 'x-location-id': branch } : {}) }, get: () => undefined };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let passed = false;
  await guard(req, res, () => { passed = true; });
  return { req, res, passed };
}
beforeEach(() => guard.invalidateUserCache('owner'));

test("an owner's own branches are accepted", async () => {
  for (const branch of ['branch-1', 'branch-2']) {
    const { passed, req } = await authorize(branch);
    expect(passed).toBe(true);
    expect(req.user.active_location_id).toBe(branch);
  }
});

test("another business's branch is refused, fresh or cached", async () => {
  for (let i = 0; i < 2; i++) {
    const { passed, res } = await authorize('someone-elses-branch');
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(403);
  }
});

test('a failed branch lookup is a retryable 503, never cached', async () => {
  const from = mockDb.from.getMockImplementation();
  mockDb.from.mockImplementation((table) => (table === 'locations'
    ? { select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }
    : from(table)));
  try {
    expect((await authorize('branch-1')).res.statusCode).toBe(503);
  } finally {
    mockDb.from.mockImplementation(from);
  }
  expect((await authorize('branch-1')).passed).toBe(true);
});

test('no header still means every branch of the business', async () => {
  const { passed, req } = await authorize();
  expect(passed).toBe(true);
  expect(req.user.active_location_id).toBeUndefined();
  expect(req.user.business_location_ids).toEqual(['branch-1', 'branch-2']);
});
