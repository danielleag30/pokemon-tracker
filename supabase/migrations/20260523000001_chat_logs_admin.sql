-- chat_logs: full LLM exchange log (every exchange, not just rated ones)
create table if not exists public.chat_logs (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  message            text        not null,
  reply              text        not null,
  intent             text,
  latency_ms         integer,
  prompt_tokens      integer,
  completion_tokens  integer,
  context_card_count integer,
  created_at         timestamptz not null default now()
);
create index if not exists chat_logs_user_idx    on public.chat_logs(user_id);
create index if not exists chat_logs_created_idx on public.chat_logs(created_at desc);
create index if not exists chat_logs_intent_idx  on public.chat_logs(intent);

-- Service role inserts; no user-facing RLS select needed
alter table public.chat_logs enable row level security;

-- ── Admin metric RPCs ─────────────────────────────────────────────────────────

create or replace function public.admin_get_metrics()
returns json
language sql stable security definer
as $$
  select json_build_object(
    'total_users',         (select count(*) from public.profiles),
    'total_chats',         (select count(*) from public.chat_logs),
    'chats_today',         (select count(*) from public.chat_logs where created_at >= current_date),
    'chats_this_week',     (select count(*) from public.chat_logs where created_at >= date_trunc('week', now())),
    'avg_latency_ms',      (select round(avg(latency_ms))::int from public.chat_logs where latency_ms is not null),
    'thumbs_up_count',     (select count(*) from public.chat_feedback where rating = 1),
    'thumbs_down_count',   (select count(*) from public.chat_feedback where rating = -1),
    'total_cards_indexed', (select count(*) from public.cards_vectors)
  );
$$;

create or replace function public.admin_get_chat_logs(p_limit int default 100, p_offset int default 0)
returns table (
  id                 uuid,
  username           text,
  message            text,
  reply              text,
  intent             text,
  latency_ms         integer,
  prompt_tokens      integer,
  completion_tokens  integer,
  context_card_count integer,
  created_at         timestamptz
)
language sql stable security definer
as $$
  select
    l.id, p.username, l.message, l.reply, l.intent,
    l.latency_ms, l.prompt_tokens, l.completion_tokens, l.context_card_count,
    l.created_at
  from public.chat_logs l
  join public.profiles p on p.id = l.user_id
  order by l.created_at desc
  limit p_limit offset p_offset;
$$;

create or replace function public.admin_get_chat_volume()
returns table (day date, count bigint)
language sql stable security definer
as $$
  select
    date_trunc('day', created_at)::date as day,
    count(*)                             as count
  from public.chat_logs
  where created_at >= now() - interval '30 days'
  group by 1
  order by 1;
$$;

create or replace function public.admin_get_intent_breakdown()
returns table (intent text, count bigint)
language sql stable security definer
as $$
  select coalesce(intent, 'unknown') as intent, count(*) as count
  from public.chat_logs
  group by 1
  order by 2 desc;
$$;

create or replace function public.admin_get_user_chat_logs(p_user_id uuid)
returns table (
  id         uuid,
  message    text,
  reply      text,
  intent     text,
  latency_ms integer,
  created_at timestamptz
)
language sql stable security definer
as $$
  select id, message, reply, intent, latency_ms, created_at
  from public.chat_logs
  where user_id = p_user_id
  order by created_at desc
  limit 50;
$$;
