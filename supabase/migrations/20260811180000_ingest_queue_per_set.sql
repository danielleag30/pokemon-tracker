-- Rebuild ingest_queue for per-set tracking. The old scheme paged by an
-- arbitrary integer (id = 'full-ingest-p{page}') at PAGE_SIZE=10 — ~2,046
-- sequential self-invoking requests with no per-unit ownership. A single
-- silent failure (2026-05-22, chain died at page 1,401/2,046) left the rest
-- permanently unprocessed with no signal: every row still reads
-- status='done' because the old ingest-cards marked a page done as soon as
-- it processed, with no way to know the *next* self-invoke never landed.
--
-- New scheme: one row per set (174 total), each tracking its own upstream
-- total, how many cards have actually been ingested, and enough state
-- (attempts, last_error) to make a stalled or failed set visible instead of
-- silently indistinguishable from a successful one.
ALTER TABLE public.ingest_queue
  ADD COLUMN IF NOT EXISTS set_id text,
  ADD COLUMN IF NOT EXISTS upstream_total integer,
  ADD COLUMN IF NOT EXISTS ingested_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- The 1,401 page-based rows from the old scheme carry no ongoing meaning
-- under per-set tracking (their ids are 'full-ingest-p{page}', not a set id)
-- — clear them so the table only ever holds the new per-set rows.
DELETE FROM public.ingest_queue WHERE set_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ingest_queue_set_id_idx
  ON public.ingest_queue (set_id) WHERE set_id IS NOT NULL;
