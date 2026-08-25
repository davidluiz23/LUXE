-- Browser push subscriptions and precise admin order lookup.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  expiration_time bigint,
  user_agent text,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(endpoint) between 20 and 2048),
  check (endpoint ~ '^https://'),
  check (length(p256dh) between 20 and 512),
  check (length(auth_secret) between 8 and 512)
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, updated_at desc)
  where disabled_at is null;

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

-- A subscription endpoint and its encryption keys are capability secrets. They
-- are intentionally available only to the service-role Edge Functions.

alter table public.orders
  add column if not exists admin_push_notified_at timestamptz,
  add column if not exists customer_push_notified_at timestamptz;

alter table public.admin_message_deliveries
  add column if not exists push_status text not null default 'not_requested';

create or replace function public.admin_search_orders_v1(p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(trim(coalesce(p_search, '')));
  v_digits text := regexp_replace(lower(trim(coalesce(p_search, ''))), '[^0-9]', '', 'g');
  v_product_id text;
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if length(v_search) > 120 then
    raise exception 'Search is too long';
  end if;

  if v_search ~ '^(alk[ -]?)?[0-9]+$' then
    v_product_id := ltrim(v_digits, '0');
    if v_product_id = '' then v_product_id := '0'; end if;
  end if;

  return (
    with matching_orders as (
      select o.*
      from public.orders o
      where v_search = ''
        or position(v_search in lower(coalesce(o.order_number, ''))) > 0
        or position(v_search in lower(coalesce(o.payment_reference, ''))) > 0
        or position(v_search in lower(coalesce(o.contact_name, ''))) > 0
        or position(v_search in lower(coalesce(o.contact_email, ''))) > 0
        or position(v_search in lower(coalesce(o.contact_phone, ''))) > 0
        or position(v_search in lower(o.id::text)) > 0
        or exists (
          select 1
          from public.order_items oi
          where oi.order_id = o.id
            and (
              position(v_search in lower(coalesce(oi.product_name, ''))) > 0
              or position(v_search in lower(coalesce(oi.product_id, ''))) > 0
              or (
                oi.product_id ~ '^[0-9]+$'
                and position(
                  v_search in lower('ALK-' || lpad(oi.product_id, 4, '0'))
                ) > 0
              )
              or (
                v_product_id is not null
                and ltrim(coalesce(oi.product_id, ''), '0') = v_product_id
              )
            )
        )
      order by o.created_at desc
      limit 250
    )
    select coalesce(jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'order_items', coalesce((
          select jsonb_agg(
            to_jsonb(oi) || jsonb_build_object(
              'product_reference', case
                when oi.product_id ~ '^[0-9]+$'
                  then 'ALK-' || lpad(oi.product_id, 4, '0')
                else upper(oi.product_id)
              end
            ) order by oi.id
          )
          from public.order_items oi
          where oi.order_id = o.id
        ), '[]'::jsonb),
        'last_admin_email', s.admin_email,
        'last_admin_action', s.action,
        'last_admin_changed_at', s.changed_at
      ) order by o.created_at desc
    ), '[]'::jsonb)
    from matching_orders o
    left join public.order_admin_state s on s.order_id = o.id
  );
end;
$$;

revoke all on function public.admin_search_orders_v1(text) from public;
grant execute on function public.admin_search_orders_v1(text) to authenticated;
