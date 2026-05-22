-- ── 1. match_owned_cards ──────────────────────────────────────────────────────
-- Vector search restricted to cards the user already owns.
-- Fixes: "What Charizard cards do I own?" missing owned cards outside top-8.
create or replace function public.match_owned_cards(
  query_embedding  extensions.vector(384),
  owned_card_ids   text[],
  match_count      int default 15
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
  order by cv.embedding <=> query_embedding
  limit match_count;
$$;

-- ── 2. get_set_completion ─────────────────────────────────────────────────────
-- Owned vs. total for one set, with the list of missing card IDs.
-- Fixes: "What's missing from my Base Set?"
create or replace function public.get_set_completion(
  p_set_id        text,
  owned_card_ids  text[]
)
returns table (
  total_in_set     bigint,
  owned_in_set     bigint,
  completion_pct   numeric,
  missing_card_ids text[]
)
language sql stable as $$
  select
    count(*)                                                                        as total_in_set,
    count(*) filter (where cv.card_id = any(owned_card_ids))                       as owned_in_set,
    round(
      100.0 * count(*) filter (where cv.card_id = any(owned_card_ids))
             / nullif(count(*), 0), 1
    )                                                                               as completion_pct,
    array_agg(cv.card_id order by cv.card_id)
      filter (where cv.card_id != all(owned_card_ids))                             as missing_card_ids
  from public.cards_vectors cv
  where cv.set_id = p_set_id;
$$;

-- ── 3. get_all_set_completion ─────────────────────────────────────────────────
-- Ranks all sets the user has at least one card in by completion %.
-- Fixes: "Which sets am I closest to completing?"
create or replace function public.get_all_set_completion(
  owned_card_ids text[]
)
returns table (
  set_id         text,
  set_name       text,
  total_in_set   bigint,
  owned_in_set   bigint,
  completion_pct numeric
)
language sql stable as $$
  select
    cv.set_id,
    cv.set_name,
    count(*)                                                               as total_in_set,
    count(*) filter (where cv.card_id = any(owned_card_ids))              as owned_in_set,
    round(
      100.0 * count(*) filter (where cv.card_id = any(owned_card_ids))
             / nullif(count(*), 0), 1
    )                                                                      as completion_pct
  from public.cards_vectors cv
  group by cv.set_id, cv.set_name
  having count(*) filter (where cv.card_id = any(owned_card_ids)) > 0
  order by completion_pct desc;
$$;

-- ── 4. collection_by_filter ───────────────────────────────────────────────────
-- Filter owned cards by type / rarity / supertype / subtype, with market price.
-- Fixes: fire-type, Trainer/Energy, Stage 2, rarest cards queries.
create or replace function public.collection_by_filter(
  owned_card_ids text[],
  p_type         text    default null,
  p_rarity       text    default null,
  p_supertype    text    default null,
  p_subtype      text    default null,
  p_limit        int     default 25
)
returns table (
  card_id      text,   name         text,   set_name     text,
  types        text[], supertype    text,   subtypes     text[],
  rarity       text,   hp           text,   evolves_from text,
  market_price numeric
)
language sql stable as $$
  select
    cv.card_id, cv.name, cv.set_name,
    cv.types, cv.supertype, cv.subtypes,
    cv.rarity, cv.hp, cv.evolves_from,
    coalesce(
      (cv.raw_data->'tcgplayer'->'prices'->'holofoil'->>'market')::numeric,
      (cv.raw_data->'tcgplayer'->'prices'->'normal'->>'market')::numeric,
      (cv.raw_data->'tcgplayer'->'prices'->'reverseHolofoil'->>'market')::numeric,
      (cv.raw_data->'tcgplayer'->'prices'->'1stEditionHolofoil'->>'market')::numeric,
      (cv.raw_data->'tcgplayer'->'prices'->'1stEditionNormal'->>'market')::numeric
    ) as market_price
  from public.cards_vectors cv
  where cv.card_id = any(owned_card_ids)
    and (p_type      is null or p_type      = any(cv.types))
    and (p_rarity    is null or cv.rarity   ilike '%' || p_rarity    || '%')
    and (p_supertype is null or cv.supertype ilike       p_supertype       )
    and (p_subtype   is null or p_subtype   = any(cv.subtypes))
  order by market_price desc nulls last, cv.name
  limit p_limit;
$$;

-- ── 5. get_collection_with_foil ───────────────────────────────────────────────
-- Joins collection.foil_type with card details. RLS on collection restricts
-- results to the calling user automatically (no user_id param needed).
-- Fixes: "What 1st edition cards do I have?", "What holofoil cards do I own?"
create or replace function public.get_collection_with_foil(
  p_foil_type text default null
)
returns table (
  card_id   text,   name      text,   set_name  text,
  types     text[], rarity    text,   foil_type text,
  quantity  int
)
language sql stable as $$
  select cv.card_id, cv.name, cv.set_name,
         cv.types, cv.rarity,
         c.foil_type, c.quantity
  from public.collection c
  join public.cards_vectors cv on cv.card_id = c.card_id
  where (p_foil_type is null or c.foil_type ilike '%' || p_foil_type || '%')
  order by cv.rarity, cv.name;
$$;

-- ── 6. get_tradeable_cards ────────────────────────────────────────────────────
-- Cards where quantity > 1 — the extras are available to trade or sell.
-- RLS on collection restricts to the calling user automatically.
-- Fixes: "What duplicate cards can I trade away?"
create or replace function public.get_tradeable_cards()
returns table (
  card_id   text,   name      text,   set_name  text,
  types     text[], rarity    text,   foil_type text,
  quantity  int,    extras    int
)
language sql stable as $$
  select cv.card_id, cv.name, cv.set_name,
         cv.types, cv.rarity,
         c.foil_type, c.quantity,
         c.quantity - 1 as extras
  from public.collection c
  join public.cards_vectors cv on cv.card_id = c.card_id
  where c.quantity > 1
  order by c.quantity desc, cv.name;
$$;

-- ── 7. get_collection_by_region ───────────────────────────────────────────────
-- Filter owned cards by national Pokédex number range.
-- Fixes: "What Kanto cards do I own?" and all other regional queries.
create or replace function public.get_collection_by_region(
  owned_card_ids text[],
  min_dex        int,
  max_dex        int
)
returns table (
  card_id                  text,   name    text,   set_name text,
  types                    text[], rarity  text,   hp       text,
  national_pokedex_numbers int[]
)
language sql stable as $$
  select cv.card_id, cv.name, cv.set_name,
         cv.types, cv.rarity, cv.hp,
         cv.national_pokedex_numbers
  from public.cards_vectors cv
  where cv.card_id = any(owned_card_ids)
    and exists (
      select 1 from unnest(cv.national_pokedex_numbers) as n
      where n between min_dex and max_dex
    )
  order by (select min(n) from unnest(cv.national_pokedex_numbers) as n), cv.name;
$$;

-- ── Feedback table ────────────────────────────────────────────────────────────
create table if not exists public.chat_feedback (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  message      text        not null,
  reply        text        not null,
  rating       int         not null check (rating in (-1, 1)),
  note         text,
  page_context jsonb,
  intent       text,
  created_at   timestamptz not null default now()
);

alter table public.chat_feedback enable row level security;

create policy "users_insert_own_feedback" on public.chat_feedback
  for insert with check (auth.uid() = user_id);

create policy "users_read_own_feedback" on public.chat_feedback
  for select using (auth.uid() = user_id);
