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

const { clientAddress, fromForwarded, normalise } = require('../utils/clientAddress');

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
