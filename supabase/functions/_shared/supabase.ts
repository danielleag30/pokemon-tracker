import { createClient } from 'npm:@supabase/supabase-js@2';

// Service role client — bypasses RLS. Use for admin operations only (never in browser).
export function makeClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

// Anon key client — used for signInWithPassword so a real user session JWT is returned.
export function makeAnonClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false } }
  );
}

// User-scoped client — forwards the request's Bearer token so RLS policies apply.
export function makeUserClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    }
  );
}

export const SETS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function cacheValid(cachedAt: string, ttl = CARD_TTL_MS): boolean {
  return Date.now() - new Date(cachedAt).getTime() < ttl;
}

export function tcgHeaders(): Record<string, string> {
  const key = Deno.env.get('POKEMON_TCG_API_KEY');
  return key ? { 'X-Api-Key': key } : {};
}

export async function tcgFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: tcgHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `TCG ${res.status}`);
  return data;
}
