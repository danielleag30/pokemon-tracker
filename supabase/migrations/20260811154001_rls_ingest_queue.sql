-- ingest_queue holds no user data but is operationally sensitive — an
-- anon-key client could flip a row to status='done' to mask a failed ingest,
-- or flood it with rows. Enable RLS with zero anon/authenticated policies;
-- service_role bypasses RLS entirely, so ingest-cards/ingest-check are
-- unaffected — no legitimate client-side caller exists for this table.
ALTER TABLE public.ingest_queue ENABLE ROW LEVEL SECURITY;
