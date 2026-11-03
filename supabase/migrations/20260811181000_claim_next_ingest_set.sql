-- Atomic claim for the per-set ingest queue: picks the next pending/error
-- row (fewest attempts first, so a set that's failed less gets priority
-- over one that's failed more) and flips it to 'processing' in one
-- round-trip. FOR UPDATE SKIP LOCKED makes this safe if ingest-cards is
-- ever invoked concurrently, not just as a single self-invoking chain.
-- Attempts capped at 5 — beyond that a set stops being auto-claimed and
-- sits visibly in status='error' for manual investigation via last_error,
-- rather than retrying forever.
CREATE OR REPLACE FUNCTION public.claim_next_ingest_set()
RETURNS TABLE (id text, set_id text, upstream_total integer, attempts integer)
LANGUAGE plpgsql
AS $$
DECLARE
  claimed record;
BEGIN
  SELECT q.id, q.set_id, q.upstream_total, q.attempts INTO claimed
  FROM public.ingest_queue q
  WHERE q.status IN ('pending', 'error') AND q.attempts < 5
  ORDER BY q.attempts ASC, q.id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF claimed.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ingest_queue
  SET status = 'processing', updated_at = now()
  WHERE public.ingest_queue.id = claimed.id;

  RETURN QUERY SELECT claimed.id, claimed.set_id, claimed.upstream_total, claimed.attempts;
END;
$$;

-- Default privileges (see 20260811160000) revoke EXECUTE on every new
-- function from PUBLIC/anon/authenticated — explicit service_role grant
-- required or this is invisible to PostgREST entirely, including to the
-- service-role client the edge function uses.
GRANT EXECUTE ON FUNCTION public.claim_next_ingest_set() TO service_role;
