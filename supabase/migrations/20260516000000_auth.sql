-- ── Profiles ──────────────────────────────────────────────────────────────────
-- One row per user. real_email is the parent's email for child accounts,
-- or the user's own email for adult accounts. synthetic_email is the internal
-- Supabase auth identity and is never shown to any user.
create table if not exists public.profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  username        text        unique not null,
  synthetic_email text        not null,
  real_email      text        not null,
  is_child        boolean     not null default false,
  created_at      timestamptz not null default now()
);

-- ── User ID on collection ──────────────────────────────────────────────────────
-- Links each collection row to an authenticated user for RLS enforcement.
-- collection_id TEXT is kept (nullable) during the transition period so that
-- existing BRANTLEY data can be identified for the one-time migration.
alter table public.collection
  add column if not exists user_id uuid references auth.users(id);

create index if not exists idx_collection_user_id on public.collection(user_id);

-- Required for upsert onConflict: 'card_id,user_id' in the collection edge function.
-- NULL user_id rows (legacy data) are exempt — Postgres allows multiple NULLs in a unique index.
create unique index if not exists idx_collection_card_user
  on public.collection(card_id, user_id)
  where user_id is not null;

-- ── Row Level Security ─────────────────────────────────────────────────────────
alter table public.collection enable row level security;
alter table public.profiles   enable row level security;

-- Collection: users can only read/write their own rows.
-- Service role key (used by edge functions) bypasses RLS automatically.
create policy "user_collection_select" on public.collection
  for select using (user_id = auth.uid());

create policy "user_collection_insert" on public.collection
  for insert with check (user_id = auth.uid());

create policy "user_collection_update" on public.collection
  for update using (user_id = auth.uid());

create policy "user_collection_delete" on public.collection
  for delete using (user_id = auth.uid());

-- Profiles: users can read their own row only.
-- The auth edge function uses the service role key and bypasses this.
create policy "user_profile_select" on public.profiles
  for select using (id = auth.uid());
