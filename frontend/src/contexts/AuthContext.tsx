import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, API } from '../lib/supabase';

interface Profile {
  username: string;
  is_child: boolean;
  is_admin: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (opts: {
    username: string;
    pin: string;
    realEmail: string;
    isChild: boolean;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) await fetchProfile(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) fetchProfile(session);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(session: Session) {
    const { data } = await supabase
      .from('profiles')
      .select('username, is_child, is_admin')
      .eq('id', session.user.id)
      .single();
    if (data) setProfile({ username: data.username, is_child: data.is_child, is_admin: data.is_admin ?? false });
  }

  async function login(username: string, pin: string) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Login failed');

    const { error } = await supabase.auth.setSession(body.session);
    if (error) throw new Error(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function register(opts: {
    username: string;
    pin: string;
    realEmail: string;
    isChild: boolean;
  }) {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: opts.username,
        pin: opts.pin,
        realEmail: opts.realEmail,
        isChild: opts.isChild,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Registration failed');
  }

  const isAdmin = profile?.is_admin ?? false;

  return (
    <AuthContext.Provider value={{ session, user, profile, isAdmin, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
