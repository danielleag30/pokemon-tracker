-- card_cache, set_cards_cache, sets_cache, cards_vectors hold public reference
-- data (the card catalog), but RLS was disabled — anon and authenticated
-- could INSERT/UPDATE/DELETE directly via PostgREST, not just read. Edge
-- functions (cards, ingest-cards, refresh-prices) all write through the
-- service-role client (_shared/supabase.ts makeClient()), which bypasses RLS
-- entirely — enabling RLS here doesn't affect any legitimate write path.
ALTER TABLE public.card_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_cards_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards_vectors   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON public.card_cache
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.set_cards_cache
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.sets_cache
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.cards_vectors
  FOR SELECT TO anon, authenticated USING (true);
