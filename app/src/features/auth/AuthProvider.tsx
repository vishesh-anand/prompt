import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

// `session` is undefined until the saved login has been read from the phone, then a Session or null.
type AuthState = { session: Session | null | undefined };

const AuthContext = createContext<AuthState>({ session: undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext value={{ session }}>{children}</AuthContext>;
}

export function useSession(): AuthState {
  return useContext(AuthContext);
}
