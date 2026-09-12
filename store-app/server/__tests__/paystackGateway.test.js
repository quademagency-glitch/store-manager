/**
 * Which Paystack keys a request uses.
 *
 * payment_gateways holds LIVE keys, so until now there was no way to exercise
 * a payment without editing the row real customers would pay through. This
 * resolver adds a test path, and the whole point of the tests below is the
 * guard rather than the feature: production must be unable to select test
 * keys no matter what the environment says.
 *
 * That failure would not look like a failure. Paystack would accept the
 * transaction, the app would write a paid invoice and mark the subscription
 * active, and the money would simply never arrive.
 */
const { buildMockSupabase } = require('./helpers/mockSupabase');
const { resolvePaystackGateway, isPaystackTestMode } = require('../services/paystack');

const LIVE_ROW = {
  id: 'gw-live-1',
  provider: 'paystack',
  display_name: 'Paystack',
  secret_key: 'sk_live_xxx',
  public_key: 'pk_live_xxx',
  webhook_secret: null,
  is_active: true,
};
const supa = (row) => buildMockSupabase({ payment_gateways: { data: row, error: null } });

const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV };
  delete process.env.PAYSTACK_MODE;
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_abc';
  process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_abc';
});
afterAll(() => { process.env = ENV; });

describe('production cannot be switched to test keys', () => {
  it('ignores PAYSTACK_MODE=test when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYSTACK_MODE = 'test';

    expect(isPaystackTestMode()).toBe(false);
    const { gateway } = await resolvePaystackGateway(supa(LIVE_ROW));
    expect(gateway.secret_key).toBe('sk_live_xxx');
    expect(gateway.mode).toBe('live');
  });

  it('needs BOTH conditions, not just a non-production NODE_ENV', async () => {
    process.env.NODE_ENV = 'test';           // no PAYSTACK_MODE set
    const { gateway } = await resolvePaystackGateway(supa(LIVE_ROW));
    expect(gateway.secret_key).toBe('sk_live_xxx');
  });
});

describe('test mode, outside production', () => {
  beforeEach(() => { process.env.NODE_ENV = 'test'; process.env.PAYSTACK_MODE = 'test'; });

  it('uses the key from the environment, never the database row', async () => {
    const { gateway } = await resolvePaystackGateway(supa(LIVE_ROW));
    expect(gateway.secret_key).toBe('sk_test_abc');
    expect(gateway.mode).toBe('test');
  });

  it('carries a null id, because there is no gateway row to point at', async () => {
    // business_subscriptions.gateway_id is nullable and is the only FK to
    // payment_gateways, so a test payment records without one.
    const { gateway } = await resolvePaystackGateway(supa(LIVE_ROW));
    expect(gateway.id).toBeNull();
  });

  it('returns the shape the webhook reads, so signature checks still work', async () => {
    const { gateway } = await resolvePaystackGateway(supa(LIVE_ROW));
    expect(gateway).toHaveProperty('secret_key');
    expect(gateway).toHaveProperty('webhook_secret');
    expect(gateway).toHaveProperty('id');
  });

  it('fails closed when test mode is asked for without a key', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const { gateway, error } = await resolvePaystackGateway(supa(LIVE_ROW));
    expect(gateway).toBeNull();
    expect(error.message).toMatch(/PAYSTACK_SECRET_KEY/);
  });
});

describe('live mode', () => {
  beforeEach(() => { process.env.NODE_ENV = 'production'; });

  it('fails closed when no active gateway row exists', async () => {
    const { gateway } = await resolvePaystackGateway(buildMockSupabase({
      payment_gateways: { data: null, error: null },
    }));
    expect(gateway).toBeNull();
  });

  it('does not invent a mode field that overwrites a real column', async () => {
    const { gateway } = await resolvePaystackGateway(supa(LIVE_ROW));
    expect(gateway.id).toBe('gw-live-1');
    expect(gateway.provider).toBe('paystack');
  });
});
