/**
 * Mock mode — single source of truth for the auth/API bypass used by the
 * Playwright visual harness.
 *
 * Opt-in only. `VITE_USE_MOCKS` is statically replaced at build time, so the
 * comparisons below fold to `false` in a normal `npm run build` and the mock
 * modules tree-shake out of the production bundle entirely.
 *
 *   VITE_USE_MOCKS=true    fixture data — the default capture mode
 *   VITE_USE_MOCKS=empty   every collection endpoint returns []  — exercises
 *                          empty states without hand-building 30 scenarios
 *   (unset / anything else) real Supabase auth + real API
 */
const RAW = import.meta.env.VITE_USE_MOCKS;

export const MOCK_MODE = RAW === 'true' ? 'fixtures' : RAW === 'empty' ? 'empty' : 'off';

export const IS_MOCK = MOCK_MODE !== 'off';

/**
 * Role the mock session assumes. Overridable so the harness can capture the
 * Platform Admin surface too — `hasPermission` follows the same rules as the
 * real hook, so what you see in a screenshot is what a real user of that role
 * would see.
 */
export const MOCK_ROLE = import.meta.env.VITE_MOCK_ROLE || 'Business Admin';
