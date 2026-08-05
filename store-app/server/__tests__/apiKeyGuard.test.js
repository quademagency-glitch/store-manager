const request = require('supertest');
const bcrypt = require('bcryptjs');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const mockSupabase = buildMockSupabase();

jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../utils/jwtVerifier', () => ({
  verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' }),
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed'),
}));

const app = require('../index');

const RAW_KEY = 'pk_live_' + 'a'.repeat(48);

const VALID_ROW = {
  id: 'key-1',
  business_id: 'biz-uuid-123',
  scopes: ['read:catalog'],
  status: 'active',
  key_hash: 'hashed-value',
  businesses: { id: 'biz-uuid-123', slug: 'acme', status: 'active' },
};

function mockApiKeysAnd(otherTables = {}) {
  mockSupabase.from.mockImplementation((table) => {
    if (table === 'api_keys') return otherTables.api_keys;
    if (otherTables[table]) return otherTables[table];
    return makeQueryMock({ data: [], error: null });
  });
}

describe('apiKeyGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests with no API key', async () => {
    const res = await request(app).get('/api/v1/public/catalog');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown key prefix', async () => {
    mockApiKeysAnd({ api_keys: makeQueryMock({ data: null, error: { message: 'not found' } }) });
    const res = await request(app).get('/api/v1/public/catalog').set('X-API-Key', RAW_KEY);
    expect(res.status).toBe(401);
  });

  it('rejects a revoked key', async () => {
    mockApiKeysAnd({ api_keys: makeQueryMock({ data: { ...VALID_ROW, status: 'revoked' }, error: null }) });
    const res = await request(app).get('/api/v1/public/catalog').set('X-API-Key', RAW_KEY);
    expect(res.status).toBe(401);
  });

  it('rejects a key that fails bcrypt compare', async () => {
    mockApiKeysAnd({ api_keys: makeQueryMock({ data: VALID_ROW, error: null }) });
    bcrypt.compare.mockResolvedValue(false);
    const res = await request(app).get('/api/v1/public/catalog').set('X-API-Key', RAW_KEY);
    expect(res.status).toBe(401);
  });

  it('rejects when the business is banned', async () => {
    mockApiKeysAnd({
      api_keys: makeQueryMock({
        data: { ...VALID_ROW, businesses: { ...VALID_ROW.businesses, status: 'banned' } },
        error: null,
      }),
    });
    bcrypt.compare.mockResolvedValue(true);
    const res = await request(app).get('/api/v1/public/catalog').set('X-API-Key', RAW_KEY);
    expect(res.status).toBe(403);
  });

  it('rejects a valid key missing the required scope', async () => {
    mockApiKeysAnd({ api_keys: makeQueryMock({ data: { ...VALID_ROW, scopes: ['write:orders'] }, error: null }) });
    bcrypt.compare.mockResolvedValue(true);
    const res = await request(app).get('/api/v1/public/catalog').set('X-API-Key', RAW_KEY);
    expect(res.status).toBe(403);
  });

  it('allows a valid key with the right scope and scopes req.business to that business', async () => {
    mockApiKeysAnd({
      api_keys: makeQueryMock({ data: VALID_ROW, error: null }),
      products: makeQueryMock({ data: [], error: null }),
    });
    bcrypt.compare.mockResolvedValue(true);
    const res = await request(app).get('/api/v1/public/catalog').set('X-API-Key', RAW_KEY);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
