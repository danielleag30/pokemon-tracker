-- Remove the hard limit from match_owned_cards so owned searches return
-- every matching card in the user's collection, not just the top N.
-- General (non-owned) searches still use match_cards which retains its limit.
create or replace function public.match_owned_cards(
  query_embedding  extensions.vector(384),
  owned_card_ids   text[]
)
returns table (
  card_id      text, name         text, set_name     text, set_id       text,
  types        text[], supertype  text, subtypes     text[], rarity     text,
  hp           text, evolves_from text, similarity   float
)
language sql stable as $$
  select cv.card_id, cv.name, cv.set_name, cv.set_id,
         cv.types, cv.supertype, cv.subtypes, cv.rarity,
         cv.hp, cv.evolves_from,
         1 - (cv.embedding <=> query_embedding) as similarity
  from public.cards_vectors cv
  where cv.card_id = any(owned_card_ids)
  order by cv.embedding <=> query_embedding;
$$;
