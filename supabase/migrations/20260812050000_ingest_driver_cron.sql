-- A durable driver for the ingest chain.
--
-- ingest-cards self-invokes fire-and-forget, which works right up until the
-- worker is recycled or hard-killed on the CPU cap — at which point no
-- application code runs, no continuation fires, and the chain is simply gone.
-- Observed repeatedly: rows left 'processing' for 3-15 minutes with nothing
-- alive to resume them. The 10-minute lease reclaim makes those rows
-- claimable again, but reclaim only executes *inside* an invocation, so with
-- a dead chain there was nothing to trigger it. That circularity is why the
-- original May ingest could die at page 1,401 and stay dead for months.
--
-- pg_cron breaks the circularity: it lives in Postgres, not in a worker, so
-- it cannot die with the chain. Four parallel nudges a minute give a floor of
-- ~4 chunks/minute even if every chain dies instantly, and far more when they
-- survive. Claims are atomic (FOR UPDATE SKIP LOCKED), so overlapping nudges
-- pick distinct sets rather than colliding, and a nudge with nothing to claim
-- is a cheap no-op that returns {done:true}.
--
-- This job is self-limiting: once every set is 'done' there is nothing
-- claimable and each run is a single trivial query. It's left scheduled so
-- newly-released sets are picked up automatically.
SELECT cron.schedule(
  'ingest-cards-driver',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://wmwpjkfgapqyyjsjuhos.supabase.co/functions/v1/ingest-cards',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) FROM generate_series(1, 4);
  $$
);
