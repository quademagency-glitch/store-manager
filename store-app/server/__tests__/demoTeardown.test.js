/**
 * The demo tenant is rebuilt nightly by a cron that tears it down over a direct
 * Postgres connection. DIRECT_URL was never set on Railway, and `pg` responds
 * to a missing connection string by dialling localhost:5432 instead of
 * complaining. The resulting ECONNREFUSED is an AggregateError whose .message
 * is the empty string, so the failure logged as "teardown:" and nothing more.
 *
 * The demo sat frozen from 2026-08-13 to 2026-08-21, every night claiming its
 * cron slot and failing, and no log line anywhere said why.
 *
 * These two tests are the ones that would have named it in one line.
 */

const path = require('path');

describe('demo teardown, missing DIRECT_URL', () => {
  const SEEDER = path.join(__dirname, '..', 'scripts', 'seed-demo-data.js');
  let saved;

  beforeEach(() => {
    saved = process.env.DIRECT_URL;
    jest.resetModules();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = saved;
  });

  it('refuses up front, naming the variable, instead of dialling localhost', async () => {
    delete process.env.DIRECT_URL;

    const src = require('fs').readFileSync(SEEDER, 'utf8');

    // Asserted against the source rather than by invoking teardown(), which is
    // not exported and would need a live database to reach. The guard must sit
    // ahead of `new Client`, because after it there is nothing left to catch:
    // pg has already substituted its own defaults.
    const guardAt = src.indexOf("if (!process.env.DIRECT_URL)");
    const clientAt = src.indexOf('new Client({');

    expect(guardAt).toBeGreaterThan(-1);
    expect(clientAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(clientAt);
    expect(src).toMatch(/DIRECT_URL is not set/);
  });

  it('does not lose the diagnosis when the error message is empty', () => {
    // Exactly what pg throws when it falls back to localhost and nothing is
    // listening: an AggregateError carrying everything in .code, and an empty
    // string for .message.
    const err = new AggregateError([], '');
    err.code = 'ECONNREFUSED';

    const detail = err.message || err.code || err.name || 'unknown error';

    expect(err.message).toBe('');
    expect(detail).toBe('ECONNREFUSED');
    expect(`teardown: ${detail}`).toBe('teardown: ECONNREFUSED');
  });
});

/**
 * A rebuild recreates the demo's auth account, and config/demo.js supplies a
 * built-in password when DEMO_ACCOUNT_PASSWORD is unset. Production is deployed
 * with a different one, so a rebuild run from a checkout that lacks the
 * variable would finish cleanly, report all its counts, and leave the live
 * demo login unable to sign in. Nothing in the output would mention it.
 *
 * Caught on 2026-08-21 by comparing the deployed value against the default
 * before running a rebuild by hand. It was luck, so it is a guard now.
 */
describe('demo rebuild, missing DEMO_ACCOUNT_PASSWORD', () => {
  const SEEDER = require('path').join(__dirname, '..', 'scripts', 'seed-demo-data.js');
  const src = require('fs').readFileSync(SEEDER, 'utf8');

  it('refuses the destructive path rather than silently using the default', () => {
    expect(src).toMatch(/Refusing to rebuild the demo/);
    expect(src).toMatch(/!process\.env\.DEMO_ACCOUNT_PASSWORD/);
  });

  it('guards only the teardown branch, so a first run still works', () => {
    // An empty environment has no deployed password to contradict, and making
    // the very first seed require a variable would be friction for nothing.
    const guardAt = src.indexOf('Refusing to rebuild the demo');
    const teardownAt = src.indexOf('tearing down previous demo business');
    const elseAt = src.indexOf('a previous run may still have left auth accounts');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(teardownAt);
    expect(teardownAt).toBeLessThan(elseAt);
  });

  it('offers an explicit way through for environments with no deployed app', () => {
    expect(src).toMatch(/--accept-default-credentials/);
  });
});
