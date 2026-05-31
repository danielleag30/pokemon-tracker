-- RPC that joins the user's collection against cards_vectors in one query.
-- Replaces the N-per-set fan-out in the frontend (one request per owned set).
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
  JOIN   cards_vectors  cv ON cv.card_id = c.card_id
  WHERE  c.user_id = auth.uid();
$$;
