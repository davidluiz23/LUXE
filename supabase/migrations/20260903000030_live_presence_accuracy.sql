-- Faster, bounded storefront presence.
-- Browsers heartbeat every 10 seconds; repeated touches inside eight seconds
-- are ignored, and the admin view treats a session as active for 30 seconds.
-- IP addresses, user agents and device fingerprints remain excluded.

begin;

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
  v_previous_seen_at timestamptz;
  v_bucket timestamptz;
  v_bucket_count integer;
  v_path text := left(coalesce(nullif(trim(p_current_path), ''), '/'), 160);
begin
  if p_session_id is null then
    raise exception 'A session ID is required';
  end if;
  if v_path !~ '^/[A-Za-z0-9/_.-]*$' then
    v_path := '/';
  end if;

  select presence.last_seen_at
  into v_previous_seen_at
  from public.visitor_presence presence
  where presence.session_id = p_session_id
  for update;

  -- Bound write amplification even if a browser or script calls the RPC more
  -- often than the supported heartbeat interval.
  if found and v_previous_seen_at > v_seen_at - interval '8 seconds' then
    return v_previous_seen_at;
  end if;

  if found then
    update public.visitor_presence
    set user_id = auth.uid(),
        current_path = v_path,
        started_at = case
          when last_seen_at < v_seen_at - interval '30 seconds'
            then v_seen_at
          else started_at
        end,
        last_seen_at = v_seen_at
    where session_id = p_session_id;

    return v_seen_at;
  end if;

  -- Only brand-new browser IDs contend on the global bucket. This protects
  -- storage from UUID churn without making normal heartbeat traffic a global
  -- bottleneck or allowing it to lock out established sessions.
  v_bucket := date_trunc('minute', v_seen_at);
  insert into public.visitor_presence_rate_buckets (bucket_start, request_count)
  values (v_bucket, 1)
  on conflict (bucket_start) do update
  set request_count = public.visitor_presence_rate_buckets.request_count + 1
  returning request_count into v_bucket_count;

  if v_bucket_count > 1000 then
    raise exception 'Presence service is temporarily busy';
  end if;

  if v_bucket_count = 1 then
    delete from public.visitor_presence
    where last_seen_at < v_seen_at - interval '24 hours';

    delete from public.visitor_presence_rate_buckets
    where bucket_start < v_seen_at - interval '24 hours';
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
        when public.visitor_presence.last_seen_at < v_seen_at - interval '30 seconds'
          then v_seen_at
        else public.visitor_presence.started_at
      end,
      last_seen_at = v_seen_at;

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
  where presence.last_seen_at >= now() - interval '30 seconds'
  order by presence.last_seen_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.admin_list_online_visitors(integer) from public;
grant execute on function public.admin_list_online_visitors(integer) to authenticated;

commit;
