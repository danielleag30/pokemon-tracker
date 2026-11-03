-- Track which upstream produced each row, now that the catalog has two
-- sources. Without this, a future full pokemontcg.io re-ingest could
-- overwrite TCGdex-sourced rows with nothing to detect it had happened —
-- and TCGdex is the only source for the Mega Evolution Black Star Promos,
-- so that loss would be silent and unrecoverable except by re-running the
-- TCGdex ingest.
ALTER TABLE public.cards_vectors
  ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'pokemontcg';

-- Partial index: queries only ever ask "which rows are NOT from the primary
-- source", so indexing the small minority keeps it cheap.
CREATE INDEX IF NOT EXISTS cards_vectors_data_source_idx
  ON public.cards_vectors (data_source)
  WHERE data_source <> 'pokemontcg';
