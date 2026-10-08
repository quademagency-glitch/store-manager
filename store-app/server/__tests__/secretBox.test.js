/**
 * Provider secrets are encrypted at rest (utils/secretBox) and opened only
 * where they are used.
 */
const crypto = require('node:crypto');

const KEY = crypto.randomBytes(32).toString('base64');
const withKey = (key, fn) => {
  const previous = process.env.SECRETS_KEY;
  if (key === undefined) delete process.env.SECRETS_KEY; else process.env.SECRETS_KEY = key;
  try { return fn(); } finally { if (previous === undefined) delete process.env.SECRETS_KEY; else process.env.SECRETS_KEY = previous; }
};
const { seal, open, mask, openRow, isSealed } = require('../utils/secretBox');

describe('secretBox', () => {
  test('round trip, a fresh IV every time, and the plaintext never appears', () => withKey(KEY, () => {
    const a = seal('EAAG-meta-token-123456789'), b = seal('EAAG-meta-token-123456789');
    expect(a).toMatch(/^enc:v1:/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('EAAG');
    expect(open(a)).toBe('EAAG-meta-token-123456789');
    expect(seal(a)).toBe(a); // already sealed: not sealed twice
  }));

  test('tampering is detected', () => withKey(KEY, () => {
    const sealed = seal('sk_live_secret');
    const parts = sealed.split(':');
    parts[4] = Buffer.from('sk_live_hacked').toString('base64');
    expect(() => open(parts.join(':'))).toThrow();
  }));

  test('rows written before encryption keep working', () => withKey(KEY, () => {
    expect(open('legacy-plain-key')).toBe('legacy-plain-key');
    expect(open(null)).toBeNull();
    expect(mask('legacy-plain-key')).toBe('••••••••-key');
  }));

  test('without a key: saving still works (plaintext), opening a sealed value fails loudly', () => {
    const sealed = withKey(KEY, () => seal('sk_live_secret'));
    withKey(undefined, () => {
      expect(seal('plain')).toBe('plain');
      expect(() => open(sealed)).toThrow(/SECRETS_KEY is required/);
      expect(mask(sealed)).toBe('••••••••');
    });
    withKey(crypto.randomBytes(16).toString('base64'), () => expect(() => seal('x')).toThrow(/32 bytes/));
  });

  test('masks show the last four characters of the real secret', () => withKey(KEY, () => {
    expect(mask(seal('abcdefgh1234'))).toBe('••••••••1234');
    expect(openRow({ id: 1, api_key: seal('k-9999'), sender_id: 'S' }, ['api_key', 'secret_key'])).toEqual({ id: 1, api_key: 'k-9999', sender_id: 'S' });
    expect(isSealed(seal('x'))).toBe(true);
  }));
});

describe('secrets are opened where they are used', () => {
  test('WhatsApp sends with the real token from a sealed gateway', async () => {
    process.env.SECRETS_KEY = KEY;
    const { sendTemplate } = require('../services/whatsappService');
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.1' }] }) }));
    const gateway = { api_key: seal('EAAG-real-token-0000000000'), sender_id: '109876543210', config: {} };
    expect(await sendTemplate(gateway, { to: '233241234567', template: 'order_receipt', params: [] })).toMatchObject({ success: true });
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer EAAG-real-token-0000000000');
    delete process.env.SECRETS_KEY;
  });

  test('a sealed token without the key fails as a permanent error, never a request', async () => {
    const sealed = withKey(KEY, () => seal('EAAG-real-token-0000000000'));
    const { sendTemplate } = require('../services/whatsappService');
    global.fetch = jest.fn();
    expect(await sendTemplate({ api_key: sealed, sender_id: '109876543210' }, { to: '233241234567', template: 't' }))
      .toMatchObject({ success: false, permanent: true, error: 'The provider key could not be read.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('webhooks are signed with the real secret', async () => {
    process.env.SECRETS_KEY = KEY;
    jest.resetModules();
    jest.doMock('node-fetch', () => jest.fn(async () => ({ ok: true, status: 200, text: async () => '' })));
    jest.doMock('../db/supabase', () => ({ supabaseAdmin: { from: () => new Proxy({}, { get: (_t, p) => (p === 'then' ? (ok) => ok({ data: null, error: null }) : () => ({ eq: () => ({ then: (ok) => ok({ data: null, error: null }) }) })) }) } }));
    const fetchMock = require('node-fetch');
    const { attemptDelivery } = require('../services/webhookDispatcher');
    const { seal: sealAgain } = require('../utils/secretBox');
    const delivery = { id: 'd1', event: 'sale.completed', payload: { id: 1 }, attempt_count: 0 };
    await attemptDelivery(delivery, { id: 'e1', url: 'https://example.invalid/hook', secret: sealAgain('whsec-plain') }).catch(() => {});
    const body = JSON.stringify({ event: delivery.event, data: delivery.payload, delivery_id: delivery.id });
    const expected = 'sha256=' + crypto.createHmac('sha256', 'whsec-plain').update(body).digest('hex');
    expect(fetchMock.mock.calls[0][1].headers['X-Webhook-Signature']).toBe(expected);
    delete process.env.SECRETS_KEY;
  });
});
