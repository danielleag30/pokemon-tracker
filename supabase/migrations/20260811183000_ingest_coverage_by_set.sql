-- ingest-check pulled raw `set_id` rows from cards_vectors to count per set
-- client-side — silently capped at 1,000 rows by PostgREST's default limit
-- (confirmed live: `content-range: 0-999/13700`), producing wildly wrong
-- per-set counts once the catalog grew past 1,000 rows. Aggregate
-- server-side instead: this returns one row per set (~127), nowhere near
-- any row cap, regardless of how large cards_vectors grows.
CREATE OR REPLACE FUNCTION public.ingest_coverage_by_set()
RETURNS TABLE (set_id text, ingested_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT cv.set_id, count(*)
  FROM public.cards_vectors cv
  WHERE cv.set_id IS NOT NULL
  GROUP BY cv.set_id;
$$;

-- Default privileges don't reliably cover functions created via `supabase
-- db push` (see 20260811181500) — explicit grant/revoke required every time.
REVOKE EXECUTE ON FUNCTION public.ingest_coverage_by_set() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_coverage_by_set() TO service_role;
