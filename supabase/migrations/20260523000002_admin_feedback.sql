-- Add is_admin to profiles
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- General feedback table
create table if not exists public.general_feedback (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  rating     int         not null check (rating in (-1, 1)),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.general_feedback enable row level security;
create policy "users_insert_own_general_feedback" on public.general_feedback
  for insert with check (auth.uid() = user_id);
create policy "users_read_own_general_feedback" on public.general_feedback
  for select using (auth.uid() = user_id);
