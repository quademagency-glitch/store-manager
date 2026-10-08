/**
 * Webhook endpoints are customer-chosen URLs whose responses the customer can
 * read back, so they must never reach internal addresses (utils/safeUrl).
 */
const { isPublicAddress, webhookUrlProblem, publicLookup } = require('../utils/safeUrl');

test.each(['8.8.8.8', '41.66.0.1', '2606:4700:4700::1111'])('%s is public', (ip) => expect(isPublicAddress(ip)).toBe(true));
test.each(['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
  '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])('%s is not public', (ip) => expect(isPublicAddress(ip)).toBe(false));

test.each([
  ['http://hooks.example.com/x', /https/],
  ['https://user:pass@hooks.example.com/x', /username or password/],
  ['https://127.0.0.1/x', /public/],
  ['https://169.254.169.254/latest/meta-data', /public/],
  ['https://[::1]/x', /public/],
  ['https://localhost:8080/x', /public/],
  ['https://store-manager-api.railway.internal/api', /public/],
  ['https://intranet/x', /public/],
  ['not a url', /full URL/],
])('%s is refused', (url, why) => expect(webhookUrlProblem(url)).toMatch(why));

test('an ordinary https endpoint is accepted', () => expect(webhookUrlProblem('https://hooks.example.com/quaderp?x=1')).toBeNull());

test('a name that resolves to loopback is refused at connect time', (done) => {
  publicLookup('localhost', {}, (err) => {
    expect(err && err.code).toBe('ENONPUBLIC');
    done();
  });
});

describe('delivery', () => {
  let fetchMock, updates, attemptDelivery;
  beforeEach(() => {
    jest.resetModules();
    updates = [];
    jest.doMock('node-fetch', () => jest.fn());
    jest.doMock('../db/supabase', () => ({ supabaseAdmin: { from: () => ({ update: (row) => { updates.push(row); return { eq: async () => ({ error: null }) }; } }) } }));
    fetchMock = require('node-fetch');
    ({ attemptDelivery } = require('../services/webhookDispatcher'));
  });
  const delivery = { id: 'd1', event: 'order.status_changed', payload: {}, attempt_count: 0 };

  test('an endpoint saved before the check, pointing inward, is never requested', async () => {
    await attemptDelivery(delivery, { id: 'e1', url: 'https://169.254.169.254/latest/meta-data', secret: 's' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates[0].response_body).toMatch(/non-public/);
  });

  test('requests go out with the public-only agent and do not follow redirects', async () => {
    fetchMock.mockResolvedValue({ status: 302, text: async () => 'internal secrets' });
    await attemptDelivery(delivery, { id: 'e1', url: 'https://hooks.example.com/x', secret: 's' });
    const options = fetchMock.mock.calls[0][1];
    expect(options.redirect).toBe('manual');
    expect(typeof options.agent).toBe('function');
    expect(updates[0].status).not.toBe('delivered');
    expect(updates[0].response_body).not.toMatch(/internal secrets/);
  });
});
