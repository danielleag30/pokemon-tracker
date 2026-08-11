-- Root-cause fix for the admin_* RPC exposure (see the two prior migrations):
-- Supabase's stock config grants EXECUTE on every new function in `public`
-- to anon and authenticated by default (via pg_default_acl for roles
-- postgres/supabase_admin), on top of Postgres's own PUBLIC EXECUTE default.
-- Without this, any *future* function added to `public` — including a new
-- admin_* one — is anon-callable from the moment it's created, regardless of
-- SECURITY DEFINER/INVOKER. This doesn't touch any existing function's
-- grants (ALTER DEFAULT PRIVILEGES only affects objects created after it
-- runs) — existing functions keep whatever the two prior migrations set.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
