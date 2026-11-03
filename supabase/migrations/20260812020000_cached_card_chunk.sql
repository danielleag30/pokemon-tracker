-- Serve ingest chunks out of set_cards_cache instead of pokemontcg.io.
--
-- The upstream API measured 20-50% 5xx during this backlog run, which made
-- the ingest chain unable to make reliable forward progress. But 57 of the
-- 69 outstanding sets (9,119 of 10,352 cards) already have their complete
-- card JSON sitting in set_cards_cache from ordinary browse traffic —
-- verified card-for-card against each set's upstream_total. Reading chunks
-- from there removes the upstream dependency for ~88% of the remaining work;
-- ingest-cards falls back to the API only for the 12 uncached sets.
--
-- Returns a slice rather than the whole set so the edge function pulls ~10
-- cards per call instead of a multi-megabyte JSON blob. `with ordinality`
-- pins the original array order, so offset-based paging is deterministic
-- across calls (the same property orderBy=id gives us upstream).
CREATE OR REPLACE FUNCTION public.get_cached_card_chunk(
  p_set_id text,
  p_offset integer,
  p_limit  integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(s.elem ORDER BY s.ord), '[]'::jsonb)
  FROM (
    SELECT t.elem, t.ord
    FROM public.set_cards_cache c,
         LATERAL jsonb_array_elements(c.data->'data') WITH ORDINALITY AS t(elem, ord)
    WHERE c.set_id = p_set_id
    ORDER BY t.ord
    OFFSET p_offset
    LIMIT  p_limit
  ) s;
$$;

-- Default privileges don't reliably cover functions created via `supabase db
-- push` (see 20260811181500) — explicit revoke/grant required every time.
REVOKE EXECUTE ON FUNCTION public.get_cached_card_chunk(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_cached_card_chunk(text, integer, integer) TO service_role;
