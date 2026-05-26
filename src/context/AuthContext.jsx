import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchUserRole(authUser) {
    if (!authUser) {
      setUser(null);
      setRole(null);
      setAccountStatus(null);
      return;
    }
    const { data } = await supabase
      .from('users')
      .select('role, display_name, phone, account_status, avatar_url, bio')
      .eq('id', authUser.id)
      .single();
    setUser({ ...authUser, ...data });
    setRole(data?.role || null);
    setAccountStatus(data?.account_status || 'active');
  }

  /** Re-fetches the current user's public profile (e.g. after uploading a new avatar). */
  async function refreshUser() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) await fetchUserRole(authUser);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      fetchUserRole(session?.user ?? null).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(true);
      fetchUserRole(session?.user ?? null).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signUp({ email, password, role, display_name, ...profileData }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, display_name, ...profileData },
      },
    });
    return { data, error };
  }

  async function signIn({ email, password }) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setSession(null);
    setAccountStatus(null);
  }

  return (
    <AuthContext.Provider value={{ session, user, role, accountStatus, loading, signUp, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
