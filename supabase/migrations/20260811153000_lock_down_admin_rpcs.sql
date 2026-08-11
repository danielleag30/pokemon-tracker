-- The admin_* RPCs are SECURITY DEFINER (bypass RLS) and were left with
-- Postgres's default PUBLIC EXECUTE grant, meaning anon and authenticated
-- could call them directly via PostgREST and pull the full user list and
-- every chat log with no auth. The admin edge function already calls these
-- exclusively through the service-role client (see supabase/functions/admin/
-- index.ts) — no legitimate caller needs anon/authenticated access.
REVOKE EXECUTE ON FUNCTION public.admin_get_users() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_metrics() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_chat_logs(int, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_chat_volume() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_intent_breakdown() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_chat_logs(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_chat_feedback() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_general_feedback() FROM anon, authenticated;
