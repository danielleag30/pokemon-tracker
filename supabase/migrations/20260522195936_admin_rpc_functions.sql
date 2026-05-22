-- Admin SQL functions — applied directly via MCP, stub added to match remote migration history

create or replace function public.admin_get_users()
returns table (
  id         uuid,
  username   text,
  is_child   boolean,
  created_at timestamptz,
  card_count bigint
)
language sql stable
security definer
as $$
  select
    p.id,
    p.username,
    p.is_child,
    p.created_at,
    count(c.card_id) as card_count
  from public.profiles p
  left join public.collection c on c.user_id = p.id
  group by p.id, p.username, p.is_child, p.created_at
  order by p.created_at desc;
$$;

create or replace function public.admin_get_chat_feedback()
returns table (
  id           uuid,
  username     text,
  rating       int,
  message      text,
  reply        text,
  note         text,
  intent       text,
  page_context jsonb,
  created_at   timestamptz
)
language sql stable
security definer
as $$
  select
    f.id,
    p.username,
    f.rating,
    f.message,
    f.reply,
    f.note,
    f.intent,
    f.page_context,
    f.created_at
  from public.chat_feedback f
  join public.profiles p on p.id = f.user_id
  order by f.created_at desc;
$$;

create or replace function public.admin_get_general_feedback()
returns table (
  id         uuid,
  username   text,
  rating     int,
  note       text,
  created_at timestamptz
)
language sql stable
security definer
as $$
  select
    f.id,
    p.username,
    f.rating,
    f.note,
    f.created_at
  from public.general_feedback f
  join public.profiles p on p.id = f.user_id
  order by f.created_at desc;
$$;
