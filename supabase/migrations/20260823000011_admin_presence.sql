-- Lightweight admin presence. "Online" means the admin console has sent a
-- heartbeat recently; it does not expose browsing activity or IP addresses.

alter table public.admin_users
  add column if not exists last_seen_at timestamptz;

create or replace function public.admin_touch_presence()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seen_at timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  update public.admin_users
  set last_seen_at = v_seen_at
  where user_id = auth.uid();

  return v_seen_at;
end;
$$;

revoke all on function public.admin_touch_presence() from public;
grant execute on function public.admin_touch_presence() to authenticated;

drop function if exists public.list_admins();

create function public.list_admins()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  added_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Owner permission required';
  end if;

  return query
  select
    a.user_id,
    u.email::text,
    p.full_name,
    a.role,
    a.added_at,
    a.last_seen_at
  from public.admin_users a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  order by
    case when a.role = 'owner' then 0 else 1 end,
    a.added_at asc;
end;
$$;

revoke all on function public.list_admins() from public;
grant execute on function public.list_admins() to authenticated;
