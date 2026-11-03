-- Throughput fix. Two coupled changes.
--
-- The 10-minute lease was sized for "don't steal a set from a live worker",
-- but a chunk actually takes 5-15s, so it was ~40x longer than needed. Its
-- real effect was the opposite of protective: when a chain died (routine —
-- workers get recycled and hard-killed on the CPU cap), that set stayed
-- unclaimable for a full 10 minutes. With only ~51 outstanding sets, the
-- queue would saturate with 'processing' rows and every driver nudge became
-- a no-op until leases aged out. Measured throughput was ~16 cards/min.
--
-- 3 minutes still leaves ~12x headroom over a real chunk, and a stolen set
-- is harmless anyway: claims are atomic, upserts are idempotent on card_id,
-- and both workers derive the same offset from ingested_count — the cost of
-- an occasional overlap is duplicated work, not corruption.
CREATE OR REPLACE FUNCTION public.claim_next_ingest_set()
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
      OR (q.status = 'processing' AND q.updated_at < now() - interval '3 minutes')
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

-- 10 nudges a minute instead of 4. Each Edge Function invocation is its own
-- isolate with its own CPU budget, so this adds throughput rather than
-- contention, and it stays far inside the free tier's 500k monthly
-- invocations (the whole backlog needs a few thousand). Parallelism is
-- naturally bounded by the number of claimable sets — surplus nudges find
-- nothing and return {done:true} cheaply.
SELECT cron.unschedule('ingest-cards-driver');
SELECT cron.schedule(
  'ingest-cards-driver',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://wmwpjkfgapqyyjsjuhos.supabase.co/functions/v1/ingest-cards',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) FROM generate_series(1, 10);
  $$
);
