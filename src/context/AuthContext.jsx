import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchUserRole(authUser) {
    if (!authUser) { setUser(null); setRole(null); return; }
    const { data } = await supabase
      .from('users')
      .select('role, display_name, phone')
      .eq('id', authUser.id)
      .single();
    setUser({ ...authUser, ...data });
    setRole(data?.role || null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      fetchUserRole(session?.user ?? null).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      fetchUserRole(session?.user ?? null);
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
  }

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
