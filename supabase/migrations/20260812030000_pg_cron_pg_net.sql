-- Neither extension was installed, which is why refresh-prices had never run
-- on a schedule: prices_updated_at was NULL on all 13,700+ rows and every
-- price in the app was frozen at its May 2026 ingest value.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
