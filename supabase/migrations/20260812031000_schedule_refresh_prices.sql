-- Weekly price refresh via pg_cron, replacing sole reliance on the GitHub
-- Actions workflow.
--
-- The Actions workflow (.github/workflows/refresh-prices.yml) has in fact
-- been firing on schedule since May — the 2026-08-14 run reached the function
-- fine and died on a single `TCG 500`, because refresh-prices had no retry
-- and one bad page aborted all ~82. That's why prices_updated_at was NULL on
-- every row. The retry/skip-page fix in refresh-prices addresses the cause;
-- this schedule adds a second, in-database trigger so price freshness no
-- longer depends on GitHub Actions being configured correctly (its
-- SUPABASE_SERVICE_ROLE_KEY secret is currently unset, and its failure-email
-- step silently no-ops because SENDGRID_API_KEY is unset too).
--
-- Auth note: refresh-prices is deployed with verify_jwt=false, so this call
-- carries no bearer token. That does NOT widen the function's exposure — it
-- is already publicly invokable today, which is tracked separately as a
-- hardening item. Once the function is switched to verify_jwt=true, this job
-- must be updated to read a service-role key from Vault.
SELECT cron.schedule(
  'weekly-price-refresh',
  '0 4 * * 2',  -- Tuesdays 04:00 UTC, offset from the Actions run at 03:00
  $$
  SELECT net.http_post(
    url     := 'https://wmwpjkfgapqyyjsjuhos.supabase.co/functions/v1/refresh-prices',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"page": 1}'::jsonb
  );
  $$
);
