-- Privacy-light storefront presence for the admin console.
-- A random browser-session ID, coarse page path and timestamps are stored.
-- IP addresses, user agents and device fingerprints are intentionally excluded.

create table if not exists public.visitor_presence (
  session_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  current_path text not null default '/',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists visitor_presence_last_seen_idx
  on public.visitor_presence (last_seen_at desc);

alter table public.visitor_presence enable row level security;
revoke all on table public.visitor_presence from anon, authenticated;

create or replace function public.touch_visitor_presence(
  p_session_id uuid,
  p_current_path text default '/'
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seen_at timestamptz := now();
  v_path text := left(coalesce(nullif(trim(p_current_path), ''), '/'), 160);
begin
  if p_session_id is null then
    raise exception 'A session ID is required';
  end if;

  insert into public.visitor_presence (
    session_id,
    user_id,
    current_path,
    started_at,
    last_seen_at
  ) values (
    p_session_id,
    auth.uid(),
    v_path,
    v_seen_at,
    v_seen_at
  )
  on conflict (session_id) do update
  set user_id = auth.uid(),
      current_path = excluded.current_path,
      started_at = case
        when public.visitor_presence.last_seen_at < v_seen_at - interval '2 minutes'
          then v_seen_at
        else public.visitor_presence.started_at
      end,
      last_seen_at = excluded.last_seen_at;

  return v_seen_at;
end;
$$;

revoke all on function public.touch_visitor_presence(uuid, text) from public;
grant execute on function public.touch_visitor_presence(uuid, text) to anon, authenticated;

create or replace function public.admin_list_online_visitors(p_limit integer default 100)
returns table (
  session_id uuid,
  user_id uuid,
  email text,
  full_name text,
  current_path text,
  started_at timestamptz,
  last_seen_at timestamptz,
  is_authenticated boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  return query
  select
    presence.session_id,
    presence.user_id,
    users.email::text,
    profiles.full_name,
    presence.current_path,
    presence.started_at,
    presence.last_seen_at,
    presence.user_id is not null
  from public.visitor_presence presence
  left join auth.users users on users.id = presence.user_id
  left join public.profiles profiles on profiles.id = presence.user_id
  where presence.last_seen_at >= now() - interval '2 minutes'
  order by presence.last_seen_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.admin_list_online_visitors(integer) from public;
grant execute on function public.admin_list_online_visitors(integer) to authenticated;
