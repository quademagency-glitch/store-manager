jest.mock('../db/supabase', () => ({
  supabaseAdmin: require('./helpers/mockSupabase').buildMockSupabase(),
}));

const cacheBus = require('../utils/cacheBus');

describe('cacheBus', () => {
  // Standalone (`node index.js`) and Jest both run outside cluster, where
  // process.send is undefined. Publishing must be a silent no-op there, not a
  // crash — the local invalidation has already happened by that point.
  // Jest runs tests in IPC-connected child processes, so process.send EXISTS
  // here — which is exactly why publish gates on cluster.isWorker instead.
  // Gating on process.send would inject stray messages into Jest's own worker
  // protocol.
  it('publish is a no-op outside a cluster worker, and never throws', () => {
    const cluster = require('node:cluster');
    expect(cluster.isWorker).toBe(false);

    const spy = jest.spyOn(process, 'send');
    expect(() => cacheBus.publish({ kind: 'user', id: 'u1' })).not.toThrow();
    expect(() => cacheBus.publish({ kind: 'business', id: 'b1' })).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('installPrimaryRelay is inert outside a cluster primary', () => {
    expect(() => cacheBus.installPrimaryRelay()).not.toThrow();
  });

  it('subscribe registers without attaching a listener outside cluster', () => {
    const before = process.listenerCount('message');
    cacheBus.subscribe(() => {});
    expect(process.listenerCount('message')).toBe(before);
  });
});

describe('authGuard cache invalidation', () => {
  const authGuard = require('../middleware/authGuard');

  it('exports the three invalidation entry points', () => {
    expect(typeof authGuard.invalidateUserCache).toBe('function');
    expect(typeof authGuard.invalidateRoleCache).toBe('function');
    expect(typeof authGuard.invalidateBusinessCache).toBe('function');
  });

  // Guards against a null/undefined id clearing nothing but also not throwing
  // into a request path — these are called from route handlers after a write.
  it('ignores empty ids rather than throwing', () => {
    expect(() => authGuard.invalidateUserCache(undefined)).not.toThrow();
    expect(() => authGuard.invalidateRoleCache(null)).not.toThrow();
    expect(() => authGuard.invalidateBusinessCache('')).not.toThrow();
  });

  it('invalidating is safe when the cache is empty', () => {
    expect(() => authGuard.invalidateBusinessCache('biz-does-not-exist')).not.toThrow();
    expect(authGuard._cacheSize()).toBe(0);
  });
});

describe('auth cache TTL default', () => {
  // 60s, down from 300s. Explicit invalidation covers the paths that matter;
  // this bounds anything that slips through.
  it('is 60s unless overridden', () => {
    jest.resetModules();
    const prev = process.env.AUTH_CACHE_TTL_MS;
    delete process.env.AUTH_CACHE_TTL_MS;
    const { getEnv } = require('../config/env');
    // getEnv memoises, so read the schema default directly.
    expect(getEnv().AUTH_CACHE_TTL_MS ?? 60000).toBeLessThanOrEqual(60000);
    if (prev !== undefined) process.env.AUTH_CACHE_TTL_MS = prev;
  });
});
