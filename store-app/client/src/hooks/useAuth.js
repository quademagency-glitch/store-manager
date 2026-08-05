import { IS_MOCK } from '../lib/mockMode';
import { useAuth as useRealAuth } from './useAuth.real';
import { useAuth as useMockAuth } from './useAuth.mock';

/**
 * Session hook. Resolves to the real Supabase implementation unless the
 * VITE_USE_MOCKS build flag is set (see src/lib/mockMode.js).
 *
 * The choice is made once at module load, never per-render, so this is not a
 * conditional hook call. `IS_MOCK` folds to a literal at build time, which
 * lets Rollup drop the unused branch from the production bundle.
 */
export const useAuth = IS_MOCK ? useMockAuth : useRealAuth;
