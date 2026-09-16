/**
 * The environment check at startup.
 *
 * It exists to turn a typo in the Railway dashboard into a clear message.
 * Two ways it failed to do that, both asserted here:
 *
 *   One invalid value used to return raw process.env, throwing away every
 *   default in the schema. The trigger in production was FRONTEND_URL set to
 *   an empty string, which is not a URL.
 *
 *   A missing SUPABASE_SERVICE_ROLE_KEY warned and carried on, so the process
 *   booted healthy and failed every real request.
 */
/* Individual keys are saved and put back, rather than swapping process.env
   for a plain object. Node's process.env is not an ordinary object, and the
   suite runs --runInBand in CI, so replacing it leaks into every file that
   runs afterwards, which took out ledger and resendConfirmation. */
const restore = [];

function loadEnv(overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    restore.push([key, process.env[key]]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  jest.resetModules();
  return require('../config/env');
}

afterEach(() => {
  while (restore.length > 0) {
    const [key, value] = restore.pop();
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  jest.resetModules();
});

describe('getEnv', () => {
  it('applies the schema defaults when everything is valid', () => {
    const { getEnv } = loadEnv({});
    const env = getEnv();
    expect(env.APP_URL).toBe('https://app.quaderp.app');
    expect(env.TRUST_PROXY_HOPS).toBe(2);
    expect(env.API_RATE_LIMIT).toBe(300);
  });

  it('keeps every other default when one optional value is invalid', () => {
    /* The production case: present but empty is not a URL. This used to
       return process.env itself, so PORT came back as a string and
       TRUST_PROXY_HOPS, API_RATE_LIMIT and APP_URL came back undefined. */
    const { getEnv } = loadEnv({ FRONTEND_URL: '' });
    const env = getEnv();

    expect(env.FRONTEND_URL).toBeUndefined();
    expect(env.APP_URL).toBe('https://app.quaderp.app');
    expect(env.TRUST_PROXY_HOPS).toBe(2);
    expect(env.API_RATE_LIMIT).toBe(300);
    expect(typeof env.PORT).toBe('number');
  });

  it('falls back per field, not for the whole object', () => {
    const { getEnv } = loadEnv({ FROM_EMAIL: 'not-an-email', APP_URL: 'https://shop.example' });
    const env = getEnv();

    expect(env.FROM_EMAIL).toBe('info@quaderp.app');   // dropped, default applied
    expect(env.APP_URL).toBe('https://shop.example');  // valid, kept
  });

  it('refuses to start when a required variable is missing', () => {
    const { getEnv } = loadEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined });
    /* Booting without this answers the health check and fails every real
       request, which reads as a working deploy. Better to crash and say so. */
    expect(() => getEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('refuses to start when a required variable is malformed', () => {
    const { getEnv } = loadEnv({ SUPABASE_URL: 'not-a-url' });
    expect(() => getEnv()).toThrow(/SUPABASE_URL/);
  });

  it('does not refuse to start over an optional one', () => {
    const { getEnv } = loadEnv({ SENTRY_TRACES_SAMPLE_RATE: 'high' });
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().SENTRY_TRACES_SAMPLE_RATE).toBe(0);
  });
});
