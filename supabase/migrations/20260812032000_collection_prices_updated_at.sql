-- Expose prices_updated_at through the collection RPC so the UI can show how
-- fresh prices actually are. Without this the app had no way to distinguish
-- "these are today's prices" from "these have been frozen since May" — which
-- is precisely the condition that went unnoticed for three months while the
-- price refresh silently failed on every run.
--
-- DROP first: CREATE OR REPLACE cannot widen a RETURNS TABLE signature. Both
-- statements run inside the migration's transaction, so there's no window
-- where the function is missing for the live app.
DROP FUNCTION IF EXISTS public.get_collection_with_cards();

CREATE FUNCTION public.get_collection_with_cards()
RETURNS TABLE (
  card_id           text,
  quantity          integer,
  binder_tag        text,
  foil_type         text,
  added_at          timestamptz,
  updated_at        timestamptz,
  raw_data          jsonb,
  prices_updated_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    c.card_id,
    c.quantity,
    c.binder_tag,
    c.foil_type,
    c.added_at,
    c.updated_at,
    cv.raw_data,
    cv.prices_updated_at
  FROM   collection     c
  LEFT JOIN cards_vectors cv ON cv.card_id = c.card_id
  WHERE  c.user_id = auth.uid();
$$;

-- SECURITY INVOKER + auth.uid() filter, so authenticated users must retain
-- EXECUTE; the RLS policy on `collection` is what actually scopes the rows.
REVOKE EXECUTE ON FUNCTION public.get_collection_with_cards() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_collection_with_cards() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
