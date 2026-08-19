// Set test environment variables before any module is loaded
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key-xxxxxxxxxxxxxxxx';
process.env.AUTH_CACHE_TTL_MS = '0'; // Disable caching in tests
process.env.API_KEY_CACHE_TTL_MS = '0'; // Disable apiKeyGuard caching in tests
process.env.PORT = '0'; // Random port

// Belt-and-braces with instrument.js's own NODE_ENV check: a developer's local
// .env must never switch Sentry on inside a test run. The SDK installs
// OpenTelemetry http instrumentation that would perturb supertest and the
// node-fetch db/supabase.js relies on.
delete process.env.SENTRY_DSN;
