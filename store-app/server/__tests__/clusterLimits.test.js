/**
 * express-rate-limit's MemoryStore counts inside one process, and this API runs
 * one worker per core: 8 in production, measured 2026-08-21 by sampling the pid
 * returned by /api/health/deep. So `max: 100` is 100 per worker and the real
 * ceiling is 800.
 *
 * The symptom is quiet. Repeating one request against production returned
 * RateLimit-Remaining of 4, 4, 3, 4, 4 — not a counter that is broken, five
 * different counters being sampled at random.
 */

const { perWorker } = require('../utils/clusterLimits');

describe('perWorker', () => {
  let saved;
  beforeEach(() => { saved = process.env.WORKER_COUNT; });
  afterEach(() => {
    if (saved === undefined) delete process.env.WORKER_COUNT;
    else process.env.WORKER_COUNT = saved;
  });

  it('divides a ceiling so the cluster total lands near the intent', () => {
    process.env.WORKER_COUNT = '8';
    expect(perWorker(100)).toBe(13);       // 13 * 8 = 104, close enough for a ceiling
    expect(perWorker(300)).toBe(38);       // 38 * 8 = 304
  });

  it('rounds up, never down, so a ceiling is never tighter than asked for', () => {
    process.env.WORKER_COUNT = '8';
    // Rounding down would give 12 * 8 = 96, quietly stricter than the 100 the
    // caller wrote. Being slightly generous is the safe direction for a limit
    // whose failure mode is turning away real customers.
    expect(perWorker(100) * 8).toBeGreaterThanOrEqual(100);
  });

  it('never returns zero, whatever the arithmetic says', () => {
    process.env.WORKER_COUNT = '64';
    expect(perWorker(5)).toBe(1);          // not 0, which would block everyone
    expect(perWorker(1)).toBe(1);
  });

  it('is a no-op when not running under cluster', () => {
    // Standalone (`node index.js`) and Jest both have no WORKER_COUNT, and
    // there is exactly one process, so the number must pass through untouched
    // or every test in this repo would run against divided limits.
    delete process.env.WORKER_COUNT;
    expect(perWorker(100)).toBe(100);
    expect(perWorker(5)).toBe(5);
  });

  it('ignores a nonsense WORKER_COUNT rather than dividing by it', () => {
    for (const junk of ['', 'eight', '0', '-4']) {
      process.env.WORKER_COUNT = junk;
      expect(perWorker(100)).toBe(100);
    }
  });
});

describe('cluster.js hands the count to its workers', () => {
  it('forks with WORKER_COUNT, including on restart', () => {
    // A worker that never receives it divides by 1 and the ceiling silently
    // reverts to per-process. The re-fork path is easy to miss and would leave
    // a restarted worker on different limits from its siblings.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'cluster.js'), 'utf8');
    expect(src).toMatch(/WORKER_COUNT: String\(WORKER_COUNT\)/);
    expect(src.match(/cluster\.fork\(forkEnv\)/g) || []).toHaveLength(2);
    expect(src).not.toMatch(/cluster\.fork\(\)/);
  });
});
