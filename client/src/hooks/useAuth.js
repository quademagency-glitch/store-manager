import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch the user's role from the users table
  const fetchRole = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          role_id,
          roles:role_id (name, permissions)
        `)
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user role:', error.message);
        setRole(null);
        setPermissions([]);
        return null;
      }

      const roleName = data.roles?.name || null;
      const userPermissions = data.roles?.permissions || [];
      
      setRole(roleName);
      setPermissions(userPermissions);
      return { role: roleName, permissions: userPermissions };
    } catch (err) {
      console.error('Unexpected error fetching role:', err);
      setRole(null);
      setPermissions([]);
      return null;
    }
  }, []);

  useEffect(() => {
    // Listen for auth state changes without blocking the callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        
        if (!newSession?.user) {
          setRole(null);
          setPermissions([]);
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
      setLoading(false);
      return { error: { message: 'An unexpected error occurred. Please try again.' } };
    }
  }, [fetchRole]);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error.message);
      }
      setUser(null);
      setSession(null);
      setRole(null);
      setPermissions([]);
    } catch (err) {
      console.error('Unexpected error signing out:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const hasPermission = useCallback((perm) => {
    return permissions.includes(perm);
  }, [permissions]);

  return {
    user,
    session,
    role,
    permissions,
    loading,
    signIn,
    signOut,
    hasPermission,
    isAuthenticated: !!session && !!user,
  };
}
