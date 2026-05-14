create extension if not exists vector schema extensions;

create table if not exists public.collection (
  card_id       text        not null,
  collection_id text        not null default 'default',
  quantity      integer     not null default 1,
  binder_tag    text,
  foil_type     text,
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (card_id, collection_id)
);
create index if not exists idx_collection_id on public.collection(collection_id);

create table if not exists public.card_cache (
  id        text        primary key,
  data      jsonb       not null,
  cached_at timestamptz not null default now()
);

create table if not exists public.set_cards_cache (
  set_id     text        primary key,
  data       jsonb       not null,
  card_count integer     not null default 0,
  cached_at  timestamptz not null default now()
);

create table if not exists public.sets_cache (
  cache_key text        primary key,
  data      jsonb       not null,
  cached_at timestamptz not null default now()
);

create table if not exists public.cards_vectors (
  card_id                  text        primary key,
  name                     text        not null,
  set_name                 text,
  set_id                   text,
  types                    text[],
  supertype                text,
  subtypes                 text[],
  rarity                   text,
  hp                       text,
  evolves_from             text,
  national_pokedex_numbers integer[],
  image_small              text,
  image_large              text,
  raw_data                 jsonb,
  embedding                extensions.vector(384),
  indexed_at               timestamptz not null default now()
);
create index if not exists cards_vectors_embedding_idx
  on public.cards_vectors using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists cards_vectors_set_idx on public.cards_vectors(set_id);

create table if not exists public.ingest_queue (
  id               text        primary key,
  status           text        not null default 'pending',
  total_cards      integer,
  processed_cards  integer     not null default 0,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.collection      enable row level security;
alter table public.card_cache      enable row level security;
alter table public.set_cards_cache enable row level security;
alter table public.sets_cache      enable row level security;
alter table public.cards_vectors   enable row level security;
alter table public.ingest_queue    enable row level security;

-- Cache tables hold public TCG card data; allow anonymous reads.
-- collection and ingest_queue are only accessed via service-role edge functions.
create policy "Allow public read" on public.card_cache      for select using (true);
create policy "Allow public read" on public.set_cards_cache for select using (true);
create policy "Allow public read" on public.sets_cache      for select using (true);
create policy "Allow public read" on public.cards_vectors   for select using (true);

create or replace function public.match_cards(
  query_embedding extensions.vector(384),
  match_count      int default 8
)
returns table (
  card_id                  text,
  name                     text,
  set_name                 text,
  set_id                   text,
  types                    text[],
  supertype                text,
  subtypes                 text[],
  rarity                   text,
  hp                       text,
  evolves_from             text,
  national_pokedex_numbers integer[],
  image_small              text,
  image_large              text,
  similarity               float
)
language sql stable as $$
  select card_id, name, set_name, set_id, types, supertype, subtypes,
    rarity, hp, evolves_from, national_pokedex_numbers, image_small, image_large,
    1 - (embedding <=> query_embedding) as similarity
  from public.cards_vectors
  order by embedding <=> query_embedding
  limit match_count;
$$;
