/**
 * Automatic WhatsApp messages: what is queued, what is skipped and why, and
 * what is sent to Meta. Nothing here reaches the network: fetch is mocked.
 */
let results = {};
let writes = [];
let rpcResult = { data: [], error: null };

function mockQuery(table) {
  const calls = [];
  const resolve = () => {
    const r = results[table];
    return typeof r === 'function' ? r(calls) : r || { data: null, error: null };
  };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok, bad) => Promise.resolve(resolve()).then(ok, bad);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(resolve());
      if (['insert', 'update', 'upsert'].includes(prop)) return (payload, options) => { writes.push({ table, op: prop, payload, options, calls }); return chain; };
      return (...args) => { calls.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
jest.mock('../db/supabase', () => ({ supabaseAdmin: { from: jest.fn((t) => mockQuery(t)), rpc: jest.fn(async () => mockRpc()) } }));
function mockRpc() { return rpcResult; }
jest.mock('../utils/cronLock', () => ({ claimCronRun: jest.fn(async () => true) }));

const { queueReceipt, deliver } = require('../services/whatsappAutomation');
const { sendTemplate } = require('../services/whatsappService');

const gateway = { id: 'g1', business_id: 'biz', type: 'whatsapp', provider: 'meta_cloud', is_active: true, api_key: 'EAAG-secret-token-0123456789', sender_id: '109876543210', config: { receipt_template: 'order_receipt', reminder_template: 'payment_due', language: 'en' } };
const message = (kind, extra = {}) => ({ id: 'm1', business_id: 'biz', kind, reference_id: 'ref', customer_id: 'cust', attempts: 1, ...extra });
const okBusiness = { data: { name: 'Omek Gigs', currency: 'GHS', whatsapp_receipts: true, whatsapp_reminders: true, country: 'GH' }, error: null };
const lastUpdate = () => writes.filter((w) => w.table === 'whatsapp_messages' && w.op === 'update').pop()?.payload;

beforeEach(() => {
  writes = [];
  rpcResult = { data: [], error: null };
  results = {
    businesses: okBusiness,
    communication_gateways: { data: gateway, error: null },
    customers: { data: { id: 'cust', name: 'Ama Mensah', phone: '+233241234567' }, error: null },
    customer_contact_preferences: { data: { allowed: true }, error: null },
    sales: { data: { id: 'ref', receipt_number: 'R-1001', total_amount: 250, status: 'completed' }, error: null },
    ar_invoices: { data: { invoice_number: 'INV-7', total_amount: 900, amount_paid: 300, due_date: '2026-10-10', status: 'sent' }, error: null },
    receipt_links: { data: null, error: null },
    locations: { data: null, error: null },
  };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.ABC' }] }) }));
});

describe('queueReceipt', () => {
  test('queues once per sale when receipts are switched on', async () => {
    await queueReceipt('biz', { id: 'sale-1', status: 'completed', customer_id: 'cust' });
    const queued = writes.find((w) => w.table === 'whatsapp_messages' && w.op === 'upsert');
    expect(queued.payload).toEqual({ business_id: 'biz', kind: 'receipt', reference_id: 'sale-1', customer_id: 'cust' });
    expect(queued.options).toEqual({ onConflict: 'business_id,kind,reference_id', ignoreDuplicates: true });
  });

  test('queues nothing when switched off, unpaid, without a customer, or when the database fails', async () => {
    results.businesses = { data: { whatsapp_receipts: false }, error: null };
    await queueReceipt('biz', { id: 's', status: 'completed', customer_id: 'cust' });
    results.businesses = okBusiness;
    await queueReceipt('biz', { id: 's', status: 'pending', customer_id: 'cust' });
    await queueReceipt('biz', { id: 's', status: 'completed' });
    results.businesses = { data: null, error: { message: 'down' } };
    await expect(queueReceipt('biz', { id: 's', status: 'completed', customer_id: 'cust' })).resolves.toBeUndefined();
    expect(writes.filter((w) => w.op === 'upsert')).toHaveLength(0);
  });
});

describe('deliver', () => {
  test('a receipt goes to the customer through the business account, with a private link', async () => {
    await deliver(message('receipt'));
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v26.0/109876543210/messages');
    expect(init.headers.Authorization).toBe('Bearer EAAG-secret-token-0123456789');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '233241234567', type: 'template', template: { name: 'order_receipt', language: { code: 'en' } } });
    const params = body.template.components[0].parameters.map((p) => p.text);
    expect(params.slice(0, 3)).toEqual(['Ama', 'Omek Gigs', 'R-1001']);
    expect(params[3]).toMatch(/250\.00/);
    expect(params[4]).toMatch(/^https:\/\/app\.quaderp\.app\/r\/[A-Za-z0-9_-]{32}$/);
    expect(writes.some((w) => w.table === 'receipt_links' && w.op === 'insert')).toBe(true);
    expect(lastUpdate()).toMatchObject({ status: 'accepted', provider_message_id: 'wamid.ABC' });
  });

  test('a reminder carries the invoice, outstanding amount and due date', async () => {
    await deliver(message('reminder'));
    const params = JSON.parse(global.fetch.mock.calls[0][1].body).template.components[0].parameters.map((p) => p.text);
    expect(params[2]).toBe('INV-7');
    expect(params[3]).toMatch(/600\.00/);
    expect(params[4]).toBe('10 Oct 2026');
  });

  test.each([
    ['switched off', () => { results.businesses = { data: { ...okBusiness.data, whatsapp_receipts: false }, error: null }; }, 'Automatic receipts were switched off.'],
    ['no account', () => { results.communication_gateways = { data: null, error: null }; }, 'WhatsApp is not connected.'],
    ['no template', () => { results.communication_gateways = { data: { ...gateway, config: {} }, error: null }; }, 'No WhatsApp template name is set for this message.'],
    ['no permission', () => { results.customer_contact_preferences = { data: null, error: null }; }, 'The customer has not given WhatsApp permission.'],
    ['opted out', () => { results.customer_contact_preferences = { data: { allowed: false }, error: null }; }, 'The customer opted out of WhatsApp.'],
    ['sale reversed', () => { results.sales = { data: { id: 'ref', status: 'voided' }, error: null }; }, 'The sale is no longer completed.'],
  ])('skips and says why: %s', async (_name, arrange, detail) => {
    arrange();
    await deliver(message('receipt'));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lastUpdate()).toEqual(expect.objectContaining({ status: 'skipped', detail }));
  });

  test('a paid invoice is not chased', async () => {
    results.ar_invoices = { data: { invoice_number: 'INV-7', total_amount: 900, amount_paid: 900, status: 'paid' }, error: null };
    await deliver(message('reminder'));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lastUpdate()).toMatchObject({ status: 'skipped', detail: 'The invoice is no longer outstanding.' });
  });

  test('temporary failures retry later; permanent ones stop with WhatsApp\'s reason', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Rate limit hit' } }) }));
    await deliver(message('receipt', { attempts: 1 }));
    expect(lastUpdate()).toMatchObject({ status: 'queued', detail: 'WhatsApp: Rate limit hit' });
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Template name does not exist' } }) }));
    await deliver(message('receipt', { attempts: 1 }));
    expect(lastUpdate()).toMatchObject({ status: 'failed', detail: 'WhatsApp: Template name does not exist' });
  });
});

describe('sendTemplate', () => {
  test('never pretends to send without an account', async () => {
    expect(await sendTemplate(null, { to: '233241234567', template: 'x' })).toMatchObject({ success: false, permanent: true });
    expect(await sendTemplate(gateway, { to: '0241', template: 'x' })).toMatchObject({ success: false, permanent: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a network failure is retryable', async () => {
    global.fetch = jest.fn(async () => { throw new Error('ECONNRESET'); });
    expect(await sendTemplate(gateway, { to: '233241234567', template: 'order_receipt', params: [] })).toMatchObject({ success: false, permanent: false });
  });
});
