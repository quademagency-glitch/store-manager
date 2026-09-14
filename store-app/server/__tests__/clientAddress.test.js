/**
 * Recovering the real caller from behind Vercel's rewrite.
 *
 * Express reads x-forwarded-for, and Railway's edge replaces that header
 * instead of appending to it, so the original caller is gone by the time
 * req.ip is computed. Measured against production on 2026-08-21, a request
 * from 154.163.174.227 arrived as:
 *
 *   x-forwarded-for         15.240.64.77, 152.233.29.1
 *   x-vercel-forwarded-for  154.163.174.227
 *   forwarded               for=154.163.174.227;host=...;proto=https
 *
 * Every browser request therefore collapsed into a handful of Vercel egress
 * addresses, and signup was capped at 5 an hour for the entire platform.
 */

const { clientAddress, clientAddressKey, fromForwarded, normalise } = require('../utils/clientAddress');

/** Minimal stand-in for the bits of req this reads. */
const asReq = (headers = {}, ip = '15.240.64.77') => ({
  ip,
  get(name) {
    const key = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : undefined;
  },
});

describe('clientAddress', () => {
  it('recovers the caller from the exact headers production sends', () => {
    const req = asReq({
      'x-forwarded-for': '15.240.64.77, 152.233.29.1',
      'x-vercel-forwarded-for': '154.163.174.227',
      'forwarded': 'for=154.163.174.227;host=store-manager-api-production-c330.up.railway.app;proto=https',
    });
    expect(clientAddress(req)).toBe('154.163.174.227');
    expect(clientAddress(req)).not.toBe(req.ip);
  });

  it('gives two visitors behind one Vercel node different keys', () => {
    // The whole point. Under req.ip these two were the same bucket.
    const a = asReq({ 'x-vercel-forwarded-for': '154.163.174.227' }, '15.240.64.77');
    const b = asReq({ 'x-vercel-forwarded-for': '41.66.220.10' }, '15.240.64.77');
    expect(clientAddress(a)).not.toBe(clientAddress(b));
  });

  it('keeps one visitor on one key as Vercel rotates its egress', () => {
    const first = asReq({ 'x-vercel-forwarded-for': '154.163.174.227' }, '15.240.64.77');
    const later = asReq({ 'x-vercel-forwarded-for': '154.163.174.227' }, '13.247.245.82');
    expect(clientAddress(first)).toBe(clientAddress(later));
  });

  it('falls back to the Forwarded header, then to req.ip', () => {
    expect(clientAddress(asReq({ 'forwarded': 'for=203.0.113.9;proto=https' }))).toBe('203.0.113.9');
    // A direct caller (a Paystack webhook, the uptime probe) has neither
    // header, and for those req.ip is already correct.
    expect(clientAddress(asReq({}, '79.127.178.81'))).toBe('79.127.178.81');
  });

  it('takes the leftmost entry when a header carries a chain', () => {
    expect(clientAddress(asReq({ 'x-vercel-forwarded-for': '154.163.174.227, 10.0.0.1' }))).toBe('154.163.174.227');
    expect(fromForwarded('for=154.163.174.227, for=10.0.0.1')).toBe('154.163.174.227');
  });

  it('normalises ports, brackets and quoting so one caller is one key', () => {
    // Otherwise a caller varying only the port would mint a fresh bucket
    // per request, which is the failure this is meant to prevent.
    expect(normalise('203.0.113.9:52134')).toBe('203.0.113.9');
    expect(normalise('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(normalise('[2001:db8::1]')).toBe('2001:db8::1');
    expect(normalise('  "203.0.113.9"  ')).toBe('203.0.113.9');
    expect(fromForwarded('for="[2001:db8::1]:443";proto=https')).toBe('2001:db8::1');
  });

  it('leaves a bare IPv6 address intact', () => {
    // It has colons but no port; splitting on ':' would mangle it.
    expect(normalise('2001:db8::1')).toBe('2001:db8::1');
  });

  it('never returns empty, whatever it is handed', () => {
    for (const junk of [undefined, null, '', '   ', '""']) {
      const out = clientAddress(asReq({ 'x-vercel-forwarded-for': junk }, '15.240.64.77'));
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    }
    // Built directly, not via asReq: its default parameter would substitute an
    // address for the explicit undefined and the assertion would pass vacuously.
    expect(clientAddress({ ip: undefined, get: () => undefined })).toBe('unknown');
  });
});

/**
 * The rate-limit key, which is not the same thing as the address.
 *
 * The signup, demo-login and resend-confirmation limiters keyed on
 * clientAddress directly. For IPv4 that is a fair bucket. For IPv6 it is not:
 * a single home connection is handed a whole prefix, so the same person can
 * send every request from a different address, be given a fresh allowance each
 * time, and never once trip a limit that reads as enforced.
 *
 * express-rate-limit warned about exactly this at startup, once per limiter
 * per worker. With eight workers that was 72 lines of red stack trace ahead of
 * any "Worker started" line, which is both why the bypass went unnoticed and
 * why a healthy deploy looked like a crash loop in the Railway log view.
 */
describe('clientAddressKey', () => {
  const v6 = (addr) => asReq({ 'x-vercel-forwarded-for': addr });

  it('leaves an IPv4 caller exactly as it is', () => {
    expect(clientAddressKey(asReq({ 'x-vercel-forwarded-for': '154.163.174.227' })))
      .toBe('154.163.174.227');
  });

  /* The bypass, closed. These are two addresses one visitor can hold at once. */
  it('gives two addresses from the same IPv6 prefix the same bucket', () => {
    const a = clientAddressKey(v6('2001:db8:1234:5678:9abc:def0:1234:5678'));
    const b = clientAddressKey(v6('2001:db8:1234:5678:ffff:ffff:ffff:0001'));

    expect(a).toBe(b);
    expect(a).not.toBe('2001:db8:1234:5678:9abc:def0:1234:5678');
  });

  it('still separates genuinely different IPv6 callers', () => {
    expect(clientAddressKey(v6('2001:db8:1111:0:0:0:0:1')))
      .not.toBe(clientAddressKey(v6('2001:db8:2222:0:0:0:0:1')));
  });

  it('keys on the real caller, not on the Vercel hop', () => {
    const req = asReq({
      'x-forwarded-for': '15.240.64.77, 152.233.29.1',
      'x-vercel-forwarded-for': '154.163.174.227',
    });
    expect(clientAddressKey(req)).toBe('154.163.174.227');
  });

  it('survives an address it cannot parse rather than throwing', () => {
    // clientAddress falls back to 'unknown' when there is nothing usable, and
    // a keyGenerator that throws takes the whole request down with it.
    const req = { ip: undefined, get: () => undefined };
    expect(() => clientAddressKey(req)).not.toThrow();
    expect(clientAddressKey(req)).toBeTruthy();
  });
});
