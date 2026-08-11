-- get_collection_with_cards() INNER JOINed collection -> cards_vectors, silently
-- dropping any owned card whose card_id isn't yet in the catalog (396 of 1,133
-- rows as of 2026-08-11 — the catalog ingest stalled in May and never finished).
-- Switch to LEFT JOIN so every owned card is returned; raw_data is null for
-- cards not yet in the catalog, and callers render a "catalog data pending"
-- state instead of the card silently vanishing.
CREATE OR REPLACE FUNCTION get_collection_with_cards()
RETURNS TABLE (
  card_id    text,
  quantity   integer,
  binder_tag text,
  foil_type  text,
  added_at   timestamptz,
  updated_at timestamptz,
  raw_data   jsonb
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    c.card_id,
    c.quantity,
    c.binder_tag,
    c.foil_type,
    c.added_at,
    c.updated_at,
    cv.raw_data
  FROM   collection     c
  LEFT JOIN cards_vectors cv ON cv.card_id = c.card_id
  WHERE  c.user_id = auth.uid();
$$;
