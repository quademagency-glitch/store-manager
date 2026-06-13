import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [locationIds, setLocationIds] = useState([]);
  const [activeLocationId, setActiveLocationId] = useState(localStorage.getItem('active_location_id') || null);
  const [businessId, setBusinessId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch the user's role from the users table
  const fetchRole = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          status,
          role_id,
          business_id,
          businesses (status),
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
        return null;
      }

      // Check for bans globally on the frontend
      if (data.status === 'banned' || (data.businesses && data.businesses.status === 'banned')) {
        if (import.meta.env.DEV) console.warn('User or Business is banned. Forcing logout.');
        await supabase.auth.signOut();
        setRole(null);
        setPermissions([]);
        setLocationIds([]);
        setBusinessId(null);
        return null;
      }

      const roleName = data.roles?.name || null;
      const userPermissions = data.roles?.permissions || [];
      const userLocations = data.user_locations ? data.user_locations.map(ul => ul.location_id) : [];
      
      setRole(roleName);
      setPermissions(userPermissions);
      setLocationIds(userLocations);
      setBusinessId(data.business_id || null);

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

      return { role: roleName, permissions: userPermissions, locationIds: userLocations };
    } catch (err) {
      if (import.meta.env.DEV) console.error('Unexpected error fetching role:', err);
      setRole(null);
      setPermissions([]);
      setLocationIds([]);
      setBusinessId(null);
      return null;
    }
  }, []);

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
      fetchRole(user.id).finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
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
      if (data.session) {
        setSession(data.session);
        setUser(data.user);
        if (data.user) {
          await fetchRole(data.user.id);
        }
      }
      
      setLoading(false);
      return { data };
    } catch (err) {
      if (import.meta.env.DEV) console.error('Sign in error:', err);
      setLoading(false);
      return { error: { message: 'An unexpected error occurred. Please try again.' } };
    }
  }, [fetchRole]);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        if (import.meta.env.DEV) console.error('Error signing out:', error.message);
      }
      setUser(null);
      setSession(null);
      setRole(null);
      setPermissions([]);
      setLocationIds([]);
      setBusinessId(null);
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
    return permissions.includes(perm);
  }, [permissions, role]);

  const switchLocation = useCallback((locationId) => {
    setActiveLocationId(locationId);
    localStorage.setItem('active_location_id', locationId);
    // You might want to trigger a full app reload or emit an event to refetch data
    window.location.reload(); 
  }, []);

  return {
    user: user ? { ...user, business_id: businessId } : null,
    session,
    role,
    permissions,
    locationIds,
    activeLocationId,
    businessId,
    loading,
    signIn,
    signOut,
    hasPermission,
    switchLocation,
    isAuthenticated: !!session && !!user,
  };
}
