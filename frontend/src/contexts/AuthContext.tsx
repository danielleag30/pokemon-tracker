import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, API } from '../lib/supabase';
import {
  listAccounts,
  rememberAccount,
  forgetAccount as forgetStoredAccount,
  getAccount,
  type SavedAccount,
} from '../lib/accountStore';

interface Profile {
  username: string;
  is_child: boolean;
  is_admin: boolean;
}

// Thrown when a switch needs the PIN re-entered rather than a stored session.
export class PinRequiredError extends Error {
  constructor(public username: string) {
    super(`${username} requires a PIN`);
    this.name = 'PinRequiredError';
  }
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  savedAccounts: SavedAccount[];
  login: (username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTo: (username: string) => Promise<void>;
  forgetAccount: (username: string) => Promise<void>;
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
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const queryClient = useQueryClient();
  const activeUserId = useRef<string | null>(null);

  // Collection queries are keyed by name alone -- ['collection'],
  // ['collection-stats'] -- with no user in the key. Switching accounts would
  // therefore serve the previous account's cards from cache until they went
  // stale, so the cache is dropped whenever the signed-in identity changes.
  const applySession = useCallback((next: Session | null) => {
    const nextUserId = next?.user?.id ?? null;
    if (activeUserId.current !== null && activeUserId.current !== nextUserId) {
      queryClient.clear();
    }
    activeUserId.current = nextUserId;
    setSession(next);
    setUser(next?.user ?? null);
  }, [queryClient]);

  const refreshAccounts = useCallback(async () => {
    setSavedAccounts(await listAccounts());
  }, []);

  useEffect(() => {
    refreshAccounts();

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      applySession(session);
      try {
        if (session?.user) await fetchProfile(session);
      } finally {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      if (session) {
        fetchProfile(session).catch(console.error);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchProfile(session: Session) {
    const { data } = await supabase
      .from('profiles')
      .select('username, is_child, is_admin')
      .eq('id', session.user.id)
      .single();
    if (!data) return;

    const next = {
      username: data.username,
      is_child: data.is_child,
      is_admin: data.is_admin ?? false,
    };
    setProfile(next);

    // Recorded here rather than in login() so it also covers a restored
    // session and a rotated refresh token -- any time a profile resolves, the
    // stored tokens for that account are current.
    await rememberAccount({
      username: next.username,
      isChild: next.is_child,
      isAdmin: next.is_admin,
      session,
    });
    await refreshAccounts();
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

  // Hop to another account that has signed in on this device, reusing its
  // stored refresh token so no PIN is needed.
  //
  // Admin accounts are deliberately excluded: the admin dashboard exposes every
  // user, the full chat log and user deletion, and this app is meant to be
  // handed to a 10-year-old. Switching *into* admin costs one PIN entry;
  // switching back out is free.
  async function switchTo(username: string) {
    const account = await getAccount(username);
    if (!account) throw new PinRequiredError(username);
    if (account.isAdmin) throw new PinRequiredError(username);

    const { error } = await supabase.auth.setSession({
      access_token: account.session.access_token,
      refresh_token: account.session.refresh_token,
    });

    if (error) {
      // Refresh token rejected (rotated out, or the account's PIN changed).
      // Drop it so the UI stops offering a switch that cannot work.
      await forgetStoredAccount(username);
      await refreshAccounts();
      throw new PinRequiredError(username);
    }
  }

  async function forgetAccount(username: string) {
    await forgetStoredAccount(username);
    await refreshAccounts();
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
    <AuthContext.Provider
      value={{
        session, user, profile, isAdmin, loading, savedAccounts,
        login, logout, switchTo, forgetAccount, register,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
