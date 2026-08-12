-- Opus review of PR #18 found a real chain-killer before first invocation:
-- claim_next_ingest_set() only claimed 'pending'/'error' rows, and
-- ingest-cards had no path that could leave a row in 'processing' and still
-- recover it. A single embedBatch() throw (no catch around it — falls to
-- the outer handler, which never touched ingest_queue) or a hard isolate
-- kill on a CPU/wall-clock limit would wedge that row in 'processing'
-- forever: unclaimable (status filter excludes it), attempts never
-- incremented (so it'd never exhaust and surface as an error), AND
-- ingest-check's self-heal gate (`active.size === 0`) would see that one
-- stuck row and refuse to ever nudge the chain again. The exact failure
-- that killed the *previous* ingest at page 1,401/2,046 in May, reproduced
-- structurally in the rebuild meant to fix it.
--
-- Two changes: reclaim a 'processing' row if it's been stale for 10+
-- minutes (well beyond one set's realistic embed+upsert time, even for the
-- 9 sets over 250 cards), and increment attempts AT CLAIM TIME rather than
-- only on a JS-visible failure — so a hard isolate kill still counts
-- against the 5-attempt cap even when no application code ever runs to
-- record it.
CREATE OR REPLACE FUNCTION public.claim_next_ingest_set()
RETURNS TABLE (id text, set_id text, upstream_total integer, attempts integer)
LANGUAGE plpgsql
AS $$
DECLARE
  claimed record;
BEGIN
  SELECT q.id, q.set_id, q.upstream_total, q.attempts INTO claimed
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

  RETURN QUERY SELECT claimed.id, claimed.set_id, claimed.upstream_total, claimed.attempts + 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_next_ingest_set() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_ingest_set() TO service_role;
