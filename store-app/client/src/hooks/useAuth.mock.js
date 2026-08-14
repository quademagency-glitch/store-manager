import { useCallback } from 'react';
import { MOCK_ROLE } from '../lib/mockMode';
import { getFlatPermissions } from '../constants/permissions';

/**
 * Mock session for the Playwright visual harness. Only reachable when
 * VITE_USE_MOCKS is set — see src/lib/mockMode.js.
 *
 * `hasPermission` deliberately mirrors the real hook's rules rather than
 * returning `true` for everything, so captured screenshots show the nav and
 * page surface a real user of MOCK_ROLE would actually get.
 */
const ALL_PERMISSIONS = getFlatPermissions().map((p) => p.id);

export function useAuth() {
  const hasPermission = useCallback((perm) => {
    if (MOCK_ROLE === 'Platform Admin') return perm === 'manage_platform';
    if (MOCK_ROLE === 'Business Admin') return perm !== 'manage_platform';
    return ALL_PERMISSIONS.includes(perm);
  }, []);

  return {
    /* A real name, not "Admin": the dashboard greets the signed-in user by it
       ("Good afternoon, Ama Mensah"), and that greeting is the first line of
       the first screenshot anyone sees. Matches `u1` in api.mock.js.

       `user_metadata.name` is where the real hook carries it — that is the
       Supabase auth shape, written by createStaffUser() — so the mock mirrors
       it rather than inventing a flatter one the app would have to special-case. */
    user: {
      id: 'mock-user',
      email: 'ama@adomsuperstore.com',
      name: 'Ama Mensah',
      user_metadata: { name: 'Ama Mensah' },
      business_id: 'mock-biz',
    },
    session: { access_token: 'mock-token' },
    role: MOCK_ROLE,
    permissions: ALL_PERMISSIONS,
    locationIds: ['mock-loc'],
    activeLocationId: 'mock-loc',
    businessId: 'mock-biz',
    // The harness is never the sandbox tenant, so the demo banner stays out of
    // the screenshot baselines. Set VITE_MOCK_DEMO=true to capture it.
    isDemo: import.meta.env.VITE_MOCK_DEMO === 'true',
    loading: false,
    signIn: async () => ({ data: {}, businessId: 'mock-biz' }),
    signInAsDemo: async () => ({ data: {} }),
    signOut: async () => {},
    hasPermission,
    switchLocation: () => {},
    isAuthenticated: true,
  };
}
