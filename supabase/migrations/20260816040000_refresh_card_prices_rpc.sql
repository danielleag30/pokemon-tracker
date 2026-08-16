-- refresh-prices did a wholesale `update raw_data = <upstream payload>` for
-- every card it found. Three problems, one of them a scheduled data-loss:
--
-- 1. pokemontcg.io carries me3/me2pt5 but returns them with NO cardmarket key
--    and tcgplayer.prices null. So the next run would have replaced all 419
--    TCGdex-backfilled cardmarket objects with priceless payloads — AND
--    stamped prices_updated_at = now(), so the new "Prices as of" banner
--    would have reported them as fresh at the exact moment they went blank.
--    Both triggers were already live (Actions Tue/Fri 03:00, pg_cron Tue
--    04:00), so this was going to fire on 2026-08-18.
-- 2. It never consulted data_source, so the protection built into
--    ingest-cards had a hole in the other writer. mep survived only because
--    pokemontcg.io doesn't carry that set — luck, not design.
-- 3. It issued 250 parallel single-row UPDATEs per page.
--
-- This does the whole page in one statement: never overwrite a cardmarket
-- object with nothing, and never touch a row sourced from anywhere else.
CREATE OR REPLACE FUNCTION public.refresh_card_prices(p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  affected integer;
BEGIN
  WITH incoming AS (
    SELECT u.card_id, u.raw_data
    FROM jsonb_to_recordset(p_updates) AS u(card_id text, raw_data jsonb)
  ), updated AS (
    UPDATE public.cards_vectors cv
    SET raw_data = CASE
          -- Upstream has no cardmarket but we already hold one (e.g. the
          -- TCGdex backfill): keep ours rather than deleting the only price
          -- these cards have.
          WHEN (i.raw_data -> 'cardmarket') IS NULL
               AND (cv.raw_data -> 'cardmarket') IS NOT NULL
            THEN i.raw_data || jsonb_build_object('cardmarket', cv.raw_data -> 'cardmarket')
          ELSE i.raw_data
        END,
        prices_updated_at = now()
    FROM incoming i
    WHERE cv.card_id = i.card_id
      AND cv.data_source = 'pokemontcg'   -- never rewrite another source's rows
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM updated;
  RETURN affected;
END;
$$;

-- Default privileges don't reliably cover functions created via `supabase db
-- push` (see 20260811181500) — explicit revoke/grant required every time.
REVOKE EXECUTE ON FUNCTION public.refresh_card_prices(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_card_prices(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
