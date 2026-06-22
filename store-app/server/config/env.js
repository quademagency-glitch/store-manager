const { z } = require('zod');

const envSchema = z.object({
  // Supabase — required
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  // Server
  PORT: z.coerce.number().int().min(0).default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // Auth cache — set to 0 to disable caching (safer in multi-instance deployments)
  AUTH_CACHE_TTL_MS: z.coerce.number().int().min(0).default(30000),

  // Email
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().default('billing@quaderp.app'),
  PLATFORM_ADMIN_EMAIL: z.string().email().optional().or(z.literal('')),

  // App
  APP_URL: z.string().url().default('https://app.quaderp.app'),
  FRONTEND_URL: z.string().url().optional(),

  // Paystack
  PAYSTACK_SECRET_KEY: z.string().optional(),
});

let _env;

function getEnv() {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    const logger = require('../utils/logger');
    logger.warn(`Environment validation issues:\n${issues}`);
    // Use defaults for any missing/invalid fields so the server still boots
    _env = envSchema.catch((ctx) => ctx.input).parse(process.env);
  } else {
    _env = result.data;
  }
  return _env;
}

module.exports = { getEnv };
