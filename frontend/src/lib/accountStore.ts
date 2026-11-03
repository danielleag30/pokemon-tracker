import type { Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Accounts that have signed in on this device, so you can hop between them
// without retyping a PIN. The auth edge function hands back a complete
// Supabase session (access + refresh token), so a switch is just
// supabase.auth.setSession(saved) -- no second trip through /auth/login.
//
// Same storage reasoning as lib/supabase.ts: UserDefaults on native, because
// WKWebView localStorage can be evicted; localStorage on the web.

const KEY = 'poketracker.accounts.v1';

export interface SavedAccount {
  username: string;
  isChild: boolean;
  isAdmin: boolean;
  session: Session;
  savedAt: string;
}

async function read(): Promise<SavedAccount[]> {
  let raw: string | null = null;
  try {
    if (Capacitor.isNativePlatform()) {
      raw = (await Preferences.get({ key: KEY })).value;
    } else {
      raw = window.localStorage.getItem(KEY);
    }
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedAccount[]) : [];
  } catch {
    // Corrupt payload is not worth surfacing -- treat it as "no saved accounts"
    // rather than wedging the app behind a parse error.
    return [];
  }
}

async function write(accounts: SavedAccount[]): Promise<void> {
  const raw = JSON.stringify(accounts);
  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: KEY, value: raw });
    } else {
      window.localStorage.setItem(KEY, raw);
    }
  } catch {
    // Storage unavailable (private window, cleared site data). Quick-switch
    // degrades to normal sign-in; nothing else breaks.
  }
}

export async function listAccounts(): Promise<SavedAccount[]> {
  return (await read()).sort((a, b) => a.username.localeCompare(b.username));
}

export async function rememberAccount(
  entry: Omit<SavedAccount, 'savedAt'>,
): Promise<void> {
  const accounts = await read();
  const others = accounts.filter(
    (a) => a.username.toLowerCase() !== entry.username.toLowerCase(),
  );
  await write([...others, { ...entry, savedAt: new Date().toISOString() }]);
}

export async function forgetAccount(username: string): Promise<void> {
  const accounts = await read();
  await write(
    accounts.filter((a) => a.username.toLowerCase() !== username.toLowerCase()),
  );
}

export async function getAccount(username: string): Promise<SavedAccount | null> {
  const accounts = await read();
  return (
    accounts.find((a) => a.username.toLowerCase() === username.toLowerCase()) ??
    null
  );
}
