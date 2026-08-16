-- Minor hardening flagged by review: SECURITY INVOKER functions without a
-- pinned search_path are still vulnerable to a search_path-hijack attack if
-- a lower-privileged caller could ever create objects in a schema that
-- sorts earlier — low risk here since both are service_role-only, but
-- costs nothing to close.
ALTER FUNCTION public.claim_next_ingest_set() SET search_path = public, pg_temp;
ALTER FUNCTION public.ingest_coverage_by_set() SET search_path = public, pg_temp;
