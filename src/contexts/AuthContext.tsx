import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';

export type StaffRole = 'admin' | 'cashier' | 'kitchen' | 'delivery_driver' | 'pending' | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: StaffRole;
  roleError: string | null;
  loading: boolean;
  reloadRole: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({ user: null, session: null, role: null, roleError: null, loading: true, reloadRole: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<StaffRole>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // A fresh signup (including first Google sign-in) starts with role
  // 'pending' (see migration v11) and has zero staff access until an admin
  // promotes it — so the UI needs to know the role, not just "is logged in".
  const loadRole = async (u: User | null) => {
    if (!u) {
      setRole(null);
      setRoleError(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('role').eq('id', u.id).single();
    if (error) {
      // FIX: RLS denial used to fail silently -> role=null -> dashboard loads
      // but every API returns 403 and user thinks "admin doesn't work".
      // Now we surface it explicitly (see ProtectedRoute).
      console.error('[auth] loadRole failed:', error.message);
      setRole(null);
      setRoleError(error.message);
      return;
    }
    setRoleError(null);
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

  return <AuthContext.Provider value={{ user, session, role, roleError, loading, reloadRole: () => loadRole(user) }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
