import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx>({ user: null, session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, session, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
