/**
 * Branded sign-in addresses (<slug>.app.quaderp.app) are switched off since
 * the web app moved to Cloudflare in October 2026: they need a certificate
 * add-on that is not on yet, and a welcome email pointing there would hand a
 * new owner a dead link. These pin both states, so switching
 * BRANDED_SUBDOMAINS on later is a setting, not a code change.
 */
jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const { resolveBusinessLoginUrl } = require('../services/emailService');

const business = { id: 'b1', name: 'Adom Superstore', slug: 'adom' };

describe('resolveBusinessLoginUrl', () => {
  const before = process.env.BRANDED_SUBDOMAINS;
  afterEach(() => {
    if (before === undefined) delete process.env.BRANDED_SUBDOMAINS;
    else process.env.BRANDED_SUBDOMAINS = before;
  });

  it('uses the shared app address while branded subdomains are off (the default)', () => {
    delete process.env.BRANDED_SUBDOMAINS;
    expect(resolveBusinessLoginUrl(business)).toBe('https://app.quaderp.app');
  });

  it('treats anything other than "on" as off', () => {
    for (const v of ['', 'true', '1', 'yes', 'ON ']) {
      process.env.BRANDED_SUBDOMAINS = v;
      expect(resolveBusinessLoginUrl(business)).toBe('https://app.quaderp.app');
    }
  });

  it("uses the business's own address once branded subdomains are on", () => {
    process.env.BRANDED_SUBDOMAINS = 'on';
    expect(resolveBusinessLoginUrl(business)).toBe('https://adom.app.quaderp.app');
  });

  it('still uses the shared address for a business with no slug yet', () => {
    process.env.BRANDED_SUBDOMAINS = 'on';
    expect(resolveBusinessLoginUrl({ id: 'b2', name: 'New' })).toBe('https://app.quaderp.app');
  });
});
