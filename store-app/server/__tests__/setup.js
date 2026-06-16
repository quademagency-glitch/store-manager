// Set test environment variables before any module is loaded
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key-xxxxxxxxxxxxxxxx';
process.env.AUTH_CACHE_TTL_MS = '0'; // Disable caching in tests
process.env.PORT = '0'; // Random port
