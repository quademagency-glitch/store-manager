/**
 * The API-key cache, with caching ON (setup.js turns it off everywhere else).
 * Until 8 October 2026 it was keyed on the key's 20-character prefix, which is
 * shown in the Integrations screen and the audit log, so a warm entry admitted
 * any key sharing that prefix.
 */
process.env.API_KEY_CACHE_TTL_MS = '300000';
const request = require('supertest');
const { buildMockSupabase, makeQueryMock } = require('./helpers/mockSupabase');

const mockSupabase = buildMockSupabase();
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));
jest.mock('../utils/jwtVerifier', () => ({ verifyToken: jest.fn().mockResolvedValue({ userId: 'user-uuid-123' }) }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn().mockResolvedValue('hashed') }));
const bcrypt = require('bcryptjs');
const app = require('../index');

const VALID_ROW = { id: 'key-1', business_id: 'biz-uuid-123', scopes: ['read:catalog'], status: 'active', key_hash: 'hashed-value', businesses: { id: 'biz-uuid-123', slug: 'acme', status: 'active' } };

test('a warm cache entry never admits a different key that shares the prefix', async () => {
  mockSupabase.from.mockImplementation((table) => (table === 'api_keys' ? makeQueryMock({ data: VALID_ROW, error: null }) : makeQueryMock({ data: [], error: null })));
  const realKey = 'pk_live_' + 'c'.repeat(48);
  const forged = realKey.slice(0, 20) + 'x'.repeat(36);
  bcrypt.compare.mockImplementation(async (key) => key === realKey);

  expect((await request(app).get('/api/v1/public/catalog').set('X-API-Key', realKey)).status).not.toBe(401);
  expect((await request(app).get('/api/v1/public/catalog').set('X-API-Key', realKey)).status).not.toBe(401);
  expect(bcrypt.compare).toHaveBeenCalledTimes(1); // the second call was served from the cache

  expect((await request(app).get('/api/v1/public/catalog').set('X-API-Key', forged)).status).toBe(401);
});

test('revoking a key drops it from the cache at once', async () => {
  const { invalidateApiKeyCache } = require('../middleware/apiKeyGuard');
  const realKey = 'pk_live_' + 'd'.repeat(48);
  mockSupabase.from.mockImplementation((table) => (table === 'api_keys' ? makeQueryMock({ data: VALID_ROW, error: null }) : makeQueryMock({ data: [], error: null })));
  bcrypt.compare.mockImplementation(async (key) => key === realKey);
  await request(app).get('/api/v1/public/catalog').set('X-API-Key', realKey);
  invalidateApiKeyCache(realKey.slice(0, 20));
  mockSupabase.from.mockImplementation((table) => (table === 'api_keys' ? makeQueryMock({ data: { ...VALID_ROW, status: 'revoked' }, error: null }) : makeQueryMock({ data: [], error: null })));
  expect((await request(app).get('/api/v1/public/catalog').set('X-API-Key', realKey)).status).toBe(401);
});
