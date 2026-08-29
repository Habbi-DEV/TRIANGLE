import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';

export type StaffRole = 'admin' | 'cashier' | 'kitchen' | 'delivery_driver' | 'pending' | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: StaffRole;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx>({ user: null, session: null, role: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<StaffRole>(null);
  const [loading, setLoading] = useState(true);

  // A fresh signup (including first Google sign-in) starts with role
  // 'pending' (see migration v11) and has zero staff access until an admin
  // promotes it — so the UI needs to know the role, not just "is logged in".
  const loadRole = async (u: User | null) => {
    if (!u) return setRole(null);
    const { data } = await supabase.from('profiles').select('role').eq('id', u.id).single();
    setRole((data?.role as StaffRole) ?? null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadRole(session?.user ?? null).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadRole(session?.user ?? null).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, session, role, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
