import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// In the iOS build the app runs inside a WKWebView, where localStorage is
// web storage the system can evict under disk pressure. Losing it signs the
// user out with no warning. Capacitor Preferences writes to UserDefaults
// instead, which is not subject to that eviction.
//
// Losing a session costs a PIN re-entry, not data -- the collection lives in
// Postgres -- but there is no reason to make a 10-year-old re-authenticate
// because the device got low on space.
const nativeSessionStorage = {
  getItem: (key: string) => Preferences.get({ key }).then(({ value }) => value),
  setItem: (key: string, value: string) => Preferences.set({ key, value }).then(() => undefined),
  removeItem: (key: string) => Preferences.remove({ key }).then(() => undefined),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: Capacitor.isNativePlatform()
    ? {
        storage: nativeSessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        // No URL to read a session back from in a native shell.
        detectSessionInUrl: false,
      }
    : undefined,
});

export const API = supabaseUrl + '/functions/v1';
