-- Follow-up to 20260811153000: REVOKE ... FROM anon, authenticated had no
-- effect because EXECUTE was granted to PUBLIC (Postgres's implicit
-- every-role pseudo-role), not to anon/authenticated directly — verified via
-- has_function_privilege() still returning true for both after the prior
-- migration applied. PUBLIC membership grants access regardless of what's
-- revoked from a specific role, so PUBLIC itself has to be revoked.
REVOKE EXECUTE ON FUNCTION public.admin_get_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_chat_logs(int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_chat_volume() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_intent_breakdown() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_chat_logs(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_chat_feedback() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_general_feedback() FROM PUBLIC;

-- service_role bypasses grants entirely (Postgres superuser-like role in
-- Supabase), so the admin edge function's service-role client is unaffected.
-- Re-grant to service_role explicitly anyway, for clarity and in case that
-- assumption ever changes.
GRANT EXECUTE ON FUNCTION public.admin_get_users() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_chat_logs(int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_chat_volume() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_intent_breakdown() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_chat_logs(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_chat_feedback() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_general_feedback() TO service_role;
