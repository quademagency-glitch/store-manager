import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { postPublic } from '../lib/api';
import { setUserContext } from '../lib/errorReporting';

/**
 * The real Supabase-backed session hook. Selected by src/hooks/useAuth.js —
 * import that, not this file.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [locationIds, setLocationIds] = useState([]);
  const [activeLocationId, setActiveLocationId] = useState(localStorage.getItem('active_location_id') || null);
  const [businessId, setBusinessId] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  /* The user id whose role is already in state.
     Without this, the effect below re-fetches the role for a user we have
     just resolved: signInAsDemo seeds everything from the demo-login payload,
     then calls setUser, and the effect fires on the id change and queries for
     exactly what we already had. The saving was real but invisible, because
     the round trip simply moved from signInAsDemo into the effect. */
  const roleLoadedFor = useRef(null);

  /**
   * Commit a resolved identity to state.
   *
   * Split out of fetchRole so the demo can reuse it. POST /auth/demo-login
   * already returns the role, permissions, locations and demo flag, and the
   * client used to throw that away and re-derive all of it with a second
   * query — roughly 1.6s of the demo's load, spent on the critical path
   * asking a question the server had already answered.
   *
   * Both callers normalise into this shape, so the ban checks and the
   * active-location bootstrap below run for every sign-in path, not just the
   * one that happens to query the table.
   *
   * Returns null when the identity is refused.
   */
  const applyRoleData = useCallback(async (identity) => {
    const {
      userId, status, businessStatus,
      role: roleName, permissions: userPermissions,
      locationIds: userLocations, businessId: userBusinessId, isDemo: demoFlag,
    } = identity;

    const clear = () => {
      setRole(null);
      setPermissions([]);
      setLocationIds([]);
      setBusinessId(null);
      setIsDemo(false);
    };

    // Check for bans globally on the frontend
    if (status === 'banned' || businessStatus === 'banned') {
      if (import.meta.env.DEV) console.warn('User or Business is banned. Forcing logout.');
      await supabase.auth.signOut();
      roleLoadedFor.current = null;
      clear();
      return null;
    }

    setRole(roleName);
    setPermissions(userPermissions);
    setLocationIds(userLocations);
    setBusinessId(userBusinessId);
    setIsDemo(demoFlag);

    // Attach identity to error reports so a crash says which tenant hit it.
    // Id and business only — never email or name. No-op without a DSN.
    // The id comes from the caller: this used to read it off the fetched row,
    // which never selected `id`, so every report carried id: undefined.
    setUserContext({ id: userId, business_id: userBusinessId });

    // Initialize active location if none set or if invalid
    const currentActive = localStorage.getItem('active_location_id');
    if (roleName !== 'Platform Admin' && roleName !== 'Business Admin') {
      if (!currentActive || !userLocations.includes(currentActive)) {
        if (userLocations.length > 0) {
          setActiveLocationId(userLocations[0]);
          localStorage.setItem('active_location_id', userLocations[0]);
        } else {
          setActiveLocationId(null);
          localStorage.removeItem('active_location_id');
        }
      }
    }

    roleLoadedFor.current = userId;

    return {
      role: roleName,
      permissions: userPermissions,
      locationIds: userLocations,
      businessId: userBusinessId,
      isDemo: demoFlag,
    };
  }, []);

  // Fetch the user's role from the users table.
  // Keep this SELECT in step with the one in server/routes/auth.js's
  // /demo-login — both feed applyRoleData above.
  const fetchRole = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          status,
          role_id,
          business_id,
          businesses (status, is_demo),
          roles:role_id (name, permissions),
          user_locations (location_id)
        `)
        .eq('id', userId)
        .single();

      if (error) {
        if (import.meta.env.DEV) console.error('Error fetching user role:', error.message);
        setRole(null);
        setPermissions([]);
        setLocationIds([]);
        setBusinessId(null);
        setIsDemo(false);
        return null;
      }

      return await applyRoleData({
        userId,
        status: data.status,
        businessStatus: data.businesses?.status,
        role: data.roles?.name || null,
        permissions: data.roles?.permissions || [],
        locationIds: data.user_locations ? data.user_locations.map(ul => ul.location_id) : [],
        businessId: data.business_id || null,
        isDemo: data.businesses?.is_demo === true,
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Unexpected error fetching role:', err);
      setRole(null);
      setPermissions([]);
      setLocationIds([]);
      setBusinessId(null);
      setIsDemo(false);
      return null;
    }
  }, [applyRoleData]);

  useEffect(() => {
    // Listen for auth state changes without blocking the callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Handle password recovery specifically
        if (event === 'PASSWORD_RECOVERY') {
          if (window.location.pathname !== '/update-password') {
            window.location.replace('/update-password');
          }
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);
        
        if (!newSession?.user) {
          setRole(null);
          setPermissions([]);
          setLocationIds([]);
          setBusinessId(null);
          setIsDemo(false);
          setActiveLocationId(null);
          localStorage.removeItem('active_location_id');
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch role separately when user changes
  useEffect(() => {
    let isMounted = true;

    if (user?.id) {
      // Already resolved for this user — seeded by signInAsDemo from the
      // demo-login payload, or by the fetchRole that signIn awaited. Fetching
      // again would re-ask a question we have the answer to, on the critical
      // path to first render.
      if (roleLoadedFor.current === user.id) {
        setLoading(false);
      } else {
        fetchRole(user.id).finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });
      }
    } else {
      roleLoadedFor.current = null;
    }

    return () => {
      isMounted = false;
    };
  }, [user?.id, fetchRole]);

  const signIn = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        return { error };
      }
      
      // Eagerly update state to avoid race condition with onAuthStateChange
      let roleResult = null;
      if (data.session) {
        setSession(data.session);
        setUser(data.user);
        if (data.user) {
          roleResult = await fetchRole(data.user.id);
        }
      }

      setLoading(false);
      return { data, businessId: roleResult?.businessId ?? null };
    } catch (err) {
      if (import.meta.env.DEV) console.error('Sign in error:', err);
      setLoading(false);
      return { error: { message: 'An unexpected error occurred. Please try again.' } };
    }
  }, [fetchRole]);

  /**
   * Start a sandbox session.
   *
   * The demo credentials never reach the browser: the server signs in on our
   * behalf and hands back the tokens, which are installed into the Supabase
   * client with setSession so that everything downstream — RLS reads, token
   * refresh, the api.js bearer header — behaves exactly as it does for a real
   * sign-in. Without setSession the app would hold a session the Supabase
   * client knew nothing about, and every direct table read would fail.
   */
  const signInAsDemo = useCallback(async () => {
    setLoading(true);
    try {
      const result = await postPublic('/auth/demo-login', {});

      const { data, error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

      if (error) {
        setLoading(false);
        return { error };
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.user);

        // Seed straight from the demo-login response instead of querying for
        // what it already told us. location_ids is the tell that the server is
        // new enough to carry the full payload; against an older deploy we
        // fall back to the extra round trip rather than booting with no
        // permissions and no locations.
        const demoUser = result.user;
        if (demoUser && Array.isArray(demoUser.location_ids)) {
          await applyRoleData({
            userId: demoUser.id,
            // The server refuses a banned demo account before it ever gets
            // here, so there is nothing left for the client to re-check.
            status: 'active',
            businessStatus: 'active',
            role: demoUser.role || null,
            permissions: demoUser.permissions || [],
            locationIds: demoUser.location_ids,
            businessId: demoUser.business_id || null,
            isDemo: demoUser.is_demo === true,
          });
        } else if (data.user) {
          await fetchRole(data.user.id);
        }
      }

      setLoading(false);
      return { data };
    } catch (err) {
      if (import.meta.env.DEV) console.error('Demo sign in error:', err);
      setLoading(false);
      return { error: { message: err.message || 'Could not start the demo. Please try again.' } };
    }
  }, [fetchRole, applyRoleData]);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        if (import.meta.env.DEV) console.error('Error signing out:', error.message);
      }
      setUser(null);
      setUserContext(null);
      setSession(null);
      setRole(null);
      setPermissions([]);
      setLocationIds([]);
      setBusinessId(null);
      setIsDemo(false);
      setActiveLocationId(null);
      localStorage.removeItem('active_location_id');
    } catch (err) {
      if (import.meta.env.DEV) console.error('Unexpected error signing out:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const hasPermission = useCallback((perm) => {
    if (role === 'Platform Admin') return perm === 'manage_platform';
    if (role === 'Business Admin') return perm !== 'manage_platform';
    return permissions.includes(perm);
  }, [permissions, role]);

  const switchLocation = useCallback((locationId, { silent = false } = {}) => {
    setActiveLocationId(locationId);
    localStorage.setItem('active_location_id', locationId);
    // Pages fetch their data keyed off the location header rather than
    // watching activeLocationId, so a reload is needed to refresh them —
    // except for the automatic first-login default assignment, where
    // there's no stale data on screen yet and reloading just causes a
    // jarring flash right after sign-in.
    if (!silent) {
      window.location.reload();
    }
  }, []);

  return {
    user: user ? { ...user, business_id: businessId } : null,
    session,
    role,
    permissions,
    locationIds,
    activeLocationId,
    businessId,
    isDemo,
    loading,
    signIn,
    signInAsDemo,
    signOut,
    hasPermission,
    switchLocation,
    isAuthenticated: !!session && !!user,
  };
}
