const { redactAndTruncate, logAuditEvent, AUDIT_ACTIONS } = require('../utils/auditLog');

describe('audit metadata redaction', () => {
  // Without this, the audit log becomes the most sensitive table in the
  // database: routes/billing.js handles Paystack gateway secrets and
  // routes/users.js handles manager PINs.
  it('redacts obvious secrets', () => {
    const out = redactAndTruncate({
      password: 'hunter2',
      pin: '1234',
      token: 'abc',
      secret_key: 'sk_live_xxx',
      api_key: 'k',
      authorization: 'Bearer x',
    });
    expect(Object.values(out).every((v) => v === '[redacted]')).toBe(true);
  });

  // Substring matching, not exact — the real column names in this codebase are
  // manager_pin, webhook_secret, paystack_secret_key, new_password.
  it('redacts by substring, catching prefixed and suffixed variants', () => {
    const out = redactAndTruncate({
      manager_pin: '9999',
      webhook_secret: 'wh',
      paystack_secret_key: 'sk',
      new_password: 'p',
      refresh_token: 'r',
    });
    expect(Object.values(out).every((v) => v === '[redacted]')).toBe(true);
  });

  it('redacts nested and array-nested secrets', () => {
    const out = redactAndTruncate({
      gateway: { name: 'paystack', secret_key: 'sk_live' },
      users: [{ email: 'a@b.c', manager_pin: '1111' }],
    });
    expect(out.gateway.secret_key).toBe('[redacted]');
    expect(out.gateway.name).toBe('paystack');
    expect(out.users[0].manager_pin).toBe('[redacted]');
    expect(out.users[0].email).toBe('a@b.c');
  });

  it('keeps non-sensitive values intact', () => {
    const out = redactAndTruncate({ role_id: 'r-1', status: 'active', count: 3 });
    expect(out).toEqual({ role_id: 'r-1', status: 'active', count: 3 });
  });

  it('truncates oversized metadata instead of writing it', () => {
    const out = redactAndTruncate({ blob: 'x'.repeat(20_000) });
    expect(out._truncated).toBe(true);
    expect(out.blob).toBeUndefined();
  });

  it('survives circular references', () => {
    const circular = { name: 'x' };
    circular.self = circular;
    expect(() => redactAndTruncate(circular)).not.toThrow();
  });

  it('handles null and undefined', () => {
    expect(redactAndTruncate(null)).toEqual({});
    expect(redactAndTruncate(undefined)).toEqual({});
  });
});

describe('logAuditEvent contract', () => {
  // Must not be awaitable: a caller cannot accidentally slow a request down,
  // and there is no floating promise for an unhandledRejection handler to trip
  // over. The .catch inside is attached explicitly.
  it('returns undefined, never a Promise', () => {
    const req = { user: { id: 'u1', business_id: 'b1' }, ip: '1.2.3.4', id: 'r1', get: () => 'ua' };
    expect(logAuditEvent(req, AUDIT_ACTIONS.LOGIN, 'user', 'u1')).toBeUndefined();
  });

  // Audit logging is observability; it must never be able to fail a login or a
  // sale. A malformed req must be swallowed, not thrown.
  it('never throws, even on a malformed request', () => {
    expect(() => logAuditEvent(null, AUDIT_ACTIONS.LOGIN, 'user', null)).not.toThrow();
    expect(() => logAuditEvent({}, AUDIT_ACTIONS.LOGIN, 'user', undefined)).not.toThrow();
  });
});
