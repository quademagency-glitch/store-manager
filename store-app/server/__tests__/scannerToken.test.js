/**
 * The scanner app's credential (routes/scanner.js). Stored as a hash since
 * 8 October 2026, and it expires: a QR code after 15 minutes unredeemed, a
 * linked scanner after 30 days unused. Expiry answers 404, which the app
 * treats as "link me again".
 */
const express = require('express');
const request = require('supertest');
const crypto = require('node:crypto');

const mockUser = { id: 'owner', business_id: 'biz', role: 'Business Admin', permissions: [] };
const mockDb = { from: jest.fn() };
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockDb }));
jest.mock('../middleware/authGuard', () => (req, res, next) => { req.user = { ...mockUser }; next(); });

const app = express();
app.use(express.json());
app.use('/scanner', require('../routes/scanner'));

const TOKEN = crypto.randomUUID();
const HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000, DAY = 86_400_000;

let row, calls;
beforeEach(() => {
  row = null; calls = [];
  mockDb.from.mockImplementation((table) => {
    const own = [];
    calls.push({ table, calls: own });
    const result = () => ({ data: own.some((c) => c[0] === 'update') && own.some((c) => c[0] === 'select') ? (row ? [{ id: row.id }] : []) : row, error: null });
    const chain = new Proxy({}, { get: (_t, key) => {
      if (key === 'then') return (ok, ko) => Promise.resolve(result()).then(ok, ko);
      return (...args) => { own.push([key, ...args]); return key === 'single' || key === 'maybeSingle' ? Promise.resolve(result()) : chain; };
    } });
    return chain;
  });
});
const updates = () => calls.flatMap((q) => q.calls.filter((c) => c[0] === 'update').map((c) => c[1]));

test('a new QR code stores only the hash of the token it returns', async () => {
  const res = await request(app).get('/scanner/token');
  expect(res.status).toBe(200);
  const written = updates()[0];
  expect(written.scanner_token_hash).toBe(crypto.createHash('sha256').update(res.body.token).digest('hex'));
  expect(JSON.stringify(written)).not.toContain(res.body.token);
  expect(written.scanner_linked_at).toBeNull();
});

test('a QR code can be redeemed within 15 minutes, not after', async () => {
  row = { id: 'u1', name: 'Ama', roles: { name: 'Cashier' }, scanner_token_issued_at: ago(14 * MIN), scanner_linked_at: null };
  expect((await request(app).post('/scanner/link').send({ token: TOKEN })).status).toBe(200);
  expect(calls[0].calls).toContainEqual(['eq', 'scanner_token_hash', HASH]);
  row.scanner_token_issued_at = ago(16 * MIN);
  expect((await request(app).post('/scanner/link').send({ token: TOKEN })).status).toBe(404);
});

test('an unredeemed code cannot act as a scanner', async () => {
  row = { id: 'u1', name: 'Ama', scanner_token_issued_at: ago(MIN), scanner_linked_at: null };
  expect((await request(app).get(`/scanner/me?token=${TOKEN}`)).status).toBe(404);
});

test('a linked scanner works until it has gone 30 days unused', async () => {
  row = { id: 'u1', name: 'Ama', roles: { name: 'Cashier' }, scanner_token_issued_at: ago(40 * DAY), scanner_linked_at: ago(40 * DAY), scanner_last_used_at: ago(29 * DAY) };
  const me = await request(app).get('/scanner/me').set('X-Scanner-Token', TOKEN);
  expect(me.status).toBe(200);
  expect(me.body).toEqual({ id: 'u1', name: 'Ama', role: 'Cashier' }); // the response shape installed apps read
  expect(updates()).toContainEqual({ scanner_last_used_at: expect.any(String) }); // use recorded
  row.scanner_last_used_at = ago(31 * DAY);
  expect((await request(app).get(`/scanner/me?token=${TOKEN}`)).status).toBe(404);
});

test('installed apps that send the token in the body still work', async () => {
  row = { id: 'u1', scanner_token_issued_at: ago(DAY), scanner_linked_at: ago(DAY), scanner_last_used_at: ago(MIN) };
  expect((await request(app).post('/scanner/push-scan').send({ token: TOKEN, qr_code: 'QD-1' })).status).toBe(200);
  expect(updates()).toHaveLength(0); // used a minute ago: no write per scan
});

test('unlinking from the app clears every scanner field by hash', async () => {
  row = { id: 'u1' };
  expect((await request(app).post('/scanner/app-unlink').send({ token: TOKEN })).status).toBe(200);
  expect(updates()[0]).toEqual({ scanner_token_hash: null, scanner_token_issued_at: null, scanner_linked_at: null, scanner_last_used_at: null });
  expect(calls[0].calls).toContainEqual(['eq', 'scanner_token_hash', HASH]);
});
