-- The ingest driver was scheduled at `* * * * *` firing 10 POSTs a minute,
-- permanently. That's ~432,000 edge invocations/month against a 500,000/month
-- free-tier cap — for a backlog that needs a few thousand and then nothing.
-- The migration comment was true of the backlog and wrong about the job.
--
-- Two changes:
--   - Only fire when there is actually something claimable, so once the
--     catalog is complete the job costs one cheap query per minute and zero
--     edge invocations.
--   - Scale the burst to the work outstanding (at most 10) rather than always
--     sending 10.
--
-- Left at one-minute granularity so a newly-released set is still picked up
-- promptly; the guard is what makes that affordable.
SELECT cron.unschedule('ingest-cards-driver');
SELECT cron.schedule(
  'ingest-cards-driver',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://wmwpjkfgapqyyjsjuhos.supabase.co/functions/v1/ingest-cards',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  )
  FROM generate_series(
    1,
    LEAST(
      10,
      (SELECT count(*)
       FROM public.ingest_queue
       WHERE attempts < 5
         AND (status IN ('pending', 'error')
              OR (status = 'processing' AND updated_at < now() - interval '3 minutes')))
    )
  );
  $$
);
