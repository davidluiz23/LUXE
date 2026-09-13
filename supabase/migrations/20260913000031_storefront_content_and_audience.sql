begin;

-- One published document. Public readers never receive editor identities.
create table public.storefront_content (
  id boolean primary key default true check (id),
  content jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.storefront_content enable row level security;
revoke all on public.storefront_content from public, anon, authenticated;

insert into public.storefront_content (content) values ($json$
{
  "slides": [
    {"id":"ijele","title":"Ijele","image":"assets/products/ijele.jpg","alt":"Black Ijele tee with warm lettering and intricate expressive artwork","productId":null},
    {"id":"durbar","title":"Durbar","image":"assets/products/durbar.jpg","alt":"Black tee with gold Durbar lettering and a mounted figure print","productId":null},
    {"id":"dun-dun","title":"Dùn Dùn","image":"assets/products/dun-dun.jpg","alt":"Black Dùn Dùn tee with yellow lettering and a print of three drummers","productId":null}
  ],
  "collections": {
    "men":{"image":"https://images.unsplash.com/photo-1617137968427-85924c800a22?w=1200&auto=format&fit=crop","focusY":50},
    "women":{"image":"https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=1200&auto=format&fit=crop","focusY":50}
  },
  "detail":{"image":"assets/products/durbar.jpg","alt":"A closer look at the gold Durbar lettering and detailed artwork","linkLabel":"Explore Durbar","productId":null,"focusY":50}
}
$json$::jsonb);

create function public.get_storefront_content_v1()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('content', content, 'revision', revision, 'updatedAt', updated_at)
  from public.storefront_content where id;
$$;
revoke all on function public.get_storefront_content_v1() from public, anon, authenticated;
grant execute on function public.get_storefront_content_v1() to anon, authenticated;

create function public.admin_save_storefront_content_v1(p_content jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_image text;
  v_product_id bigint;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 32768
     or jsonb_typeof(p_content->'slides') is distinct from 'array'
     or jsonb_typeof(p_content->'collections') is distinct from 'object'
     or jsonb_typeof(p_content->'detail') is distinct from 'object' then
    raise exception 'Invalid storefront content';
  end if;
  if jsonb_array_length(p_content->'slides') not between 1 and 12 then
    raise exception 'Keep between 1 and 12 slideshow images';
  end if;
  if (select count(distinct s->>'id') from jsonb_array_elements(p_content->'slides') s)
     <> jsonb_array_length(p_content->'slides') then
    raise exception 'Slideshow image IDs must be unique';
  end if;
  for v_item in select value from jsonb_array_elements(p_content->'slides') loop
    if coalesce(v_item->>'id', '') !~ '^[a-zA-Z0-9_-]{1,64}$'
       or length(trim(coalesce(v_item->>'title', ''))) not between 1 and 80
       or length(trim(coalesce(v_item->>'alt', ''))) not between 1 and 300 then
      raise exception 'Each slide needs a title and image description';
    end if;
  end loop;
  if length(trim(coalesce(p_content->'detail'->>'alt', ''))) not between 1 and 300
     or length(trim(coalesce(p_content->'detail'->>'linkLabel', ''))) not between 1 and 80 then
    raise exception 'The closer look image needs a description and link label';
  end if;
  for v_item in
    select value from jsonb_array_elements(p_content->'slides')
    union all select p_content->'collections'->'men'
    union all select p_content->'collections'->'women'
    union all select p_content->'detail'
  loop
    v_image := coalesce(v_item->>'image', '');
    if jsonb_typeof(v_item) is distinct from 'object' or length(v_image) not between 1 and 2048
       or v_image ~ '[[:space:]<>"\\]'
       or not (v_image ~ '^https://[A-Za-z0-9][^[:space:]]+$'
               or (v_image ~ '^assets/[A-Za-z0-9/_.-]+$' and v_image not like '%..%')) then
      raise exception 'Choose an uploaded image or a secure https image URL';
    end if;
    if v_item ? 'focusY' and (jsonb_typeof(v_item->'focusY') <> 'number'
        or (v_item->>'focusY')::numeric not between 0 and 100) then
      raise exception 'Image position must be between 0 and 100';
    end if;
    if v_item->>'productId' is not null then
      if coalesce(v_item->>'productId', '') !~ '^[1-9][0-9]{0,14}$' then
        raise exception 'Invalid linked product';
      end if;
      v_product_id := (v_item->>'productId')::bigint;
      if not exists (select 1 from public.products where id = v_product_id) then
        raise exception 'A linked product no longer exists. Choose another product or the full collection';
      end if;
    end if;
  end loop;

  update public.storefront_content
  set content = p_content, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where id and revision = p_expected_revision
  returning jsonb_build_object('content', content, 'revision', revision, 'updatedAt', updated_at) into v_result;
  if v_result is null then
    raise exception 'CONTENT_CONFLICT: Another administrator updated these images. Reload the published version before saving';
  end if;
  return v_result;
end;
$$;
revoke all on function public.admin_save_storefront_content_v1(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.admin_save_storefront_content_v1(jsonb, bigint) to authenticated;

-- Daily browser visits survive the 24-hour live-presence cleanup. No IP,
-- user-agent, email, or user ID is copied into this history.
create table public.storefront_analytics_start (
  id boolean primary key default true check (id),
  started_at timestamptz not null default now()
);
insert into public.storefront_analytics_start default values;
create table public.storefront_daily_visitors (
  visit_date date not null,
  browser_id uuid not null,
  first_seen_at timestamptz not null default now(),
  primary key (visit_date, browser_id)
);
alter table public.storefront_analytics_start enable row level security;
alter table public.storefront_daily_visitors enable row level security;
revoke all on public.storefront_analytics_start, public.storefront_daily_visitors from public, anon, authenticated;

create function public.record_storefront_daily_visit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'Africa/Lagos')::date;
begin
  -- Run after the existing heartbeat's validation, throttling and rate limit.
  if new.current_path ~* '/admin(\.html)?/?$' then return new; end if;
  if tg_op = 'UPDATE' then
    if (old.last_seen_at at time zone 'Africa/Lagos')::date = v_day
       and old.current_path !~* '/admin(\.html)?/?$'
       and exists (select 1 from public.storefront_daily_visitors
                   where visit_date = v_day and browser_id = new.session_id) then
      return new;
    end if;
  end if;
  insert into public.storefront_daily_visitors (visit_date, browser_id)
  values (v_day, new.session_id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.record_storefront_daily_visit() from public, anon, authenticated;
create trigger visitor_presence_daily_history
after insert or update on public.visitor_presence
for each row execute function public.record_storefront_daily_visit();

create function public.admin_audience_metrics_v1(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_from date := v_today - (v_days - 1);
  v_started timestamptz;
  v_registered bigint;
  v_banned bigint;
  v_visitors bigint;
  v_today_visitors bigint;
  v_online bigint;
  v_series jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select started_at into v_started from public.storefront_analytics_start where id;
  select count(*), count(*) filter (where banned_until > now())
  into v_registered, v_banned from auth.users
  where deleted_at is null and not coalesce(is_anonymous, false);
  select count(distinct browser_id), count(*) filter (where visit_date = v_today)
  into v_visitors, v_today_visitors from public.storefront_daily_visitors
  where visit_date between v_from and v_today;
  select count(*) into v_online from public.visitor_presence
  where last_seen_at >= now() - interval '30 seconds'
    and current_path !~* '/admin(\.html)?/?$';

  with days as (
    select v_from + d as day from generate_series(0, v_days - 1) d
  ), visits as (
    select visit_date, count(*) as total from public.storefront_daily_visitors
    where visit_date between v_from and v_today group by visit_date
  ), registrations as (
    select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as total
    from auth.users where deleted_at is null and not coalesce(is_anonymous, false)
      and created_at >= (v_from::timestamp at time zone 'Africa/Lagos')
      and created_at < ((v_today + 1)::timestamp at time zone 'Africa/Lagos')
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'date', d.day,
    'visitors', case when d.day < (v_started at time zone 'Africa/Lagos')::date then null else coalesce(v.total, 0) end,
    'registrations', coalesce(r.total, 0)
  ) order by d.day) into v_series
  from days d left join visits v on v.visit_date = d.day left join registrations r on r.day = d.day;

  return jsonb_build_object(
    'days', v_days, 'timezone', 'Africa/Lagos', 'generatedAt', now(),
    'trackingStartedAt', v_started, 'visitors', v_visitors, 'visitorsToday', v_today_visitors,
    'onlineNow', v_online, 'registeredAccounts', v_registered, 'bannedAccounts', v_banned,
    'series', v_series
  );
end;
$$;
revoke all on function public.admin_audience_metrics_v1(integer) from public, anon, authenticated;
grant execute on function public.admin_audience_metrics_v1(integer) to authenticated;

commit;
