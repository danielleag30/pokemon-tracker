-- claim_next_ingest_set() returned (id, set_id, upstream_total, attempts) but
-- NOT ingested_count. That was harmless while ingest-cards processed a whole
-- set per invocation, but chunked ingestion derives its read offset from
-- ingested_count — so the claim path handed back `undefined`, the offset went
-- undefined, supabase-js dropped the param from the RPC body, and PostgREST
-- rejected the call as an unknown signature ("Could not find the function
-- public.get_cached_card_chunk(p_limit, p_set_id)"). The function then fell
-- back to the flaky upstream API on every chunk, which is what made the
-- cache-first path look like it wasn't working at all.
-- CREATE OR REPLACE can't widen a RETURNS TABLE signature, so drop first.
DROP FUNCTION IF EXISTS public.claim_next_ingest_set();

CREATE FUNCTION public.claim_next_ingest_set()
RETURNS TABLE (id text, set_id text, upstream_total integer, attempts integer, ingested_count integer)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed record;
BEGIN
  SELECT q.id, q.set_id, q.upstream_total, q.attempts, q.ingested_count INTO claimed
  FROM public.ingest_queue q
  WHERE (
      q.status IN ('pending', 'error')
      OR (q.status = 'processing' AND q.updated_at < now() - interval '10 minutes')
    )
    AND q.attempts < 5
  ORDER BY q.attempts ASC, q.id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF claimed.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ingest_queue
  SET status = 'processing', attempts = claimed.attempts + 1, updated_at = now()
  WHERE public.ingest_queue.id = claimed.id;

  RETURN QUERY SELECT claimed.id, claimed.set_id, claimed.upstream_total,
                      claimed.attempts + 1, claimed.ingested_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_next_ingest_set() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_next_ingest_set() TO service_role;

NOTIFY pgrst, 'reload schema';
