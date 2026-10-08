/**
 * WhatsApp settings: a kind switches on only when the business's own account
 * and its template are set, connection details are validated, and the access
 * token is never read back.
 */
const request = require('supertest');

const mockUsers = {
  owner: { id: 'owner', name: 'Owner', email: 'o@example.invalid', business_id: 'biz-A', status: 'active', role_id: 'r1', roles: { name: 'Business Admin', permissions: [] }, businesses: { status: 'active' }, user_locations: [] },
};
let log = [];
let results = {};

function mockRecording(table) {
  const calls = [];
  log.push({ table, calls });
  const result = () => {
    if (table === 'users') return { data: mockUsers[calls.find(([m, c]) => m === 'eq' && c === 'id')?.[2]] || null, error: null };
    const r = results[table];
    return typeof r === 'function' ? r(calls) : r || { data: null, error: null };
  };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok, bad) => Promise.resolve(result()).then(ok, bad);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
jest.mock('../db/supabase', () => ({ supabaseAdmin: { from: jest.fn((t) => mockRecording(t)), rpc: jest.fn(async () => ({ data: null, error: null })) } }));
jest.mock('../utils/jwtVerifier', () => ({ verifyToken: jest.fn(async (t) => ({ userId: t })) }));

const app = require('../index');
const AUTH = { Authorization: 'Bearer owner' };
const callsOn = (table) => log.filter((q) => q.table === table).map((q) => q.calls);
const updates = (table) => callsOn(table).flat().filter(([m]) => m === 'update').map(([, payload]) => payload);

beforeEach(() => { log = []; results = {}; });

test('a kind cannot be switched on without the account and its template', async () => {
  results.communication_gateways = { data: null, error: null };
  let res = await request(app).put('/api/crm-communications/whatsapp/settings').set(AUTH).send({ receipts: true, reminders: false });
  expect(res.status).toBe(409);
  expect(res.body.error).toBe('Connect your WhatsApp Business account first.');

  results.communication_gateways = { data: { config: { reminder_template: 'payment_due' } }, error: null };
  res = await request(app).put('/api/crm-communications/whatsapp/settings').set(AUTH).send({ receipts: true, reminders: true });
  expect(res.status).toBe(409);
  expect(res.body.error).toBe('Add the approved receipt template name first.');
  expect(updates('businesses')).toHaveLength(0);

  results.communication_gateways = { data: { config: { receipt_template: 'order_receipt', reminder_template: 'payment_due' } }, error: null };
  res = await request(app).put('/api/crm-communications/whatsapp/settings').set(AUTH).send({ receipts: true, reminders: true });
  expect(res.status).toBe(200);
  expect(updates('businesses')).toEqual([{ whatsapp_receipts: true, whatsapp_reminders: true }]);
  expect(callsOn('businesses').flat()).toContainEqual(['eq', 'id', 'biz-A']);
});

test('switching off needs nothing connected', async () => {
  const res = await request(app).put('/api/crm-communications/whatsapp/settings').set(AUTH).send({ receipts: false, reminders: false });
  expect(res.status).toBe(200);
  expect(callsOn('communication_gateways')).toHaveLength(0);
});

test('WhatsApp connection details are validated before saving', async () => {
  const base = { provider: 'meta_cloud', type: 'whatsapp', display_name: 'Shop WhatsApp', api_key: 'EAAG-secret-token-0123456789', sender_id: '109876543210', config: { receipt_template: 'order_receipt', language: 'en' } };
  for (const [change, message] of [
    [{ provider: 'twilio' }, /Meta WhatsApp Cloud API/],
    [{ api_key: 'short' }, /access token/],
    [{ sender_id: 'my number' }, /phone number ID/],
    [{ config: { receipt_template: 'Order Receipt' } }, /lowercase letters/],
  ]) {
    const res = await request(app).post('/api/crm-communications/gateways').set(AUTH).send({ ...base, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  }
  results.communication_gateways = { data: { ...base, id: 'g1' }, error: null };
  const ok = await request(app).post('/api/crm-communications/gateways').set(AUTH).send(base);
  expect(ok.status).toBe(201);
  expect(ok.body.api_key).toBe('••••••••6789');
});

test('the settings read never selects the access token', async () => {
  results.businesses = { data: { whatsapp_receipts: false, whatsapp_reminders: false }, error: null };
  results.communication_gateways = { data: null, error: null };
  results.whatsapp_messages = { data: [], error: null };
  const res = await request(app).get('/api/crm-communications/whatsapp').set(AUTH);
  expect(res.status).toBe(200);
  const select = callsOn('communication_gateways')[0].find(([m]) => m === 'select')[1];
  expect(select).not.toMatch(/api_key|secret_key/);
  expect(res.body).toEqual({ receipts: false, reminders: false, gateway: null, recent: [] });
});
