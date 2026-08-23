-- Customer operations: targeted notifications, communication consent,
-- promotion codes, redemption limits and an admin audit trail.

alter table public.profiles
  add column if not exists email_updates_opt_in_at timestamptz,
  add column if not exists whatsapp_updates_opt_in_at timestamptz;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  percent_off numeric(5,2) not null check (percent_off between 1 and 95),
  minimum_subtotal numeric(10,2) not null default 0 check (minimum_subtotal >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_user_limit integer not null default 1 check (per_user_limit between 1 and 100),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.orders
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists promotion_id uuid references public.promotions(id),
  add column if not exists promotion_code text;

alter table public.orders
  drop constraint if exists orders_discount_amount_nonnegative;
alter table public.orders
  add constraint orders_discount_amount_nonnegative
  check (discount_amount >= 0 and discount_amount <= subtotal)
  not valid;

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  discount_amount numeric(10,2) not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists promotion_redemptions_promo_created_idx
  on public.promotion_redemptions (promotion_id, created_at desc);
create index if not exists promotion_redemptions_user_promo_idx
  on public.promotion_redemptions (user_id, promotion_id);

create table if not exists public.admin_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  requested_channels text[] not null default array['in_app']::text[],
  in_app_status text not null default 'pending',
  email_status text not null default 'not_requested',
  whatsapp_status text not null default 'not_requested',
  provider_references jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (requested_channels <@ array['in_app', 'email', 'whatsapp']::text[])
);

create index if not exists admin_message_deliveries_admin_created_idx
  on public.admin_message_deliveries (admin_user_id, created_at desc);
create index if not exists admin_message_deliveries_user_created_idx
  on public.admin_message_deliveries (user_id, created_at desc);

create table if not exists public.admin_action_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_log_created_idx
  on public.admin_action_log (created_at desc);

alter table public.promotions enable row level security;
alter table public.promotion_redemptions enable row level security;
alter table public.admin_message_deliveries enable row level security;
alter table public.admin_action_log enable row level security;

revoke all on table public.promotions from anon, authenticated;
revoke all on table public.promotion_redemptions from anon, authenticated;
revoke all on table public.admin_message_deliveries from anon, authenticated;
revoke all on table public.admin_action_log from anon, authenticated;

create or replace function public.update_communication_preferences(
  p_email_updates boolean,
  p_whatsapp_updates boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if p_whatsapp_updates and (
    v_profile.whatsapp_verified_at is null or v_profile.whatsapp_phone is null
  ) then
    raise exception 'Verify your WhatsApp number before enabling WhatsApp account updates';
  end if;

  update public.profiles
  set
    email_updates_opt_in_at = case when p_email_updates then coalesce(email_updates_opt_in_at, now()) else null end,
    whatsapp_updates_opt_in_at = case when p_whatsapp_updates then coalesce(whatsapp_updates_opt_in_at, now()) else null end,
    updated_at = now()
  where id = v_user_id
  returning * into v_profile;

  return jsonb_build_object(
    'emailUpdates', v_profile.email_updates_opt_in_at is not null,
    'whatsappUpdates', v_profile.whatsapp_updates_opt_in_at is not null
  );
end;
$$;

revoke all on function public.update_communication_preferences(boolean, boolean) from public;
grant execute on function public.update_communication_preferences(boolean, boolean) to authenticated;

create or replace function public.order_quote_secure_v1(
  p_items jsonb,
  p_promo_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id bigint;
  v_quantity integer;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_code text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_promo public.promotions%rowtype;
  v_total_uses bigint := 0;
  v_user_uses bigint := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Cart contains too many line items'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::bigint;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then raise exception 'Invalid cart item'; end;
    if v_product_id is null or v_product_id <= 0 or v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'Invalid cart item';
    end if;
    select * into v_product from public.products where id = v_product_id;
    if not found then raise exception 'Product % no longer exists', v_product_id; end if;
    if not v_product.in_stock then raise exception 'Product "%" is out of stock', v_product.name; end if;
    v_subtotal := v_subtotal + round(v_product.price * v_quantity, 2);
  end loop;

  v_shipping := case when v_subtotal > 200 then 0 else 15 end;

  if v_code is not null then
    select * into v_promo from public.promotions where code = v_code;
    if not found or not v_promo.active then raise exception 'Promo code is invalid or inactive'; end if;
    if v_promo.starts_at is not null and now() < v_promo.starts_at then raise exception 'Promo code is not active yet'; end if;
    if v_promo.ends_at is not null and now() >= v_promo.ends_at then raise exception 'Promo code has expired'; end if;
    if v_subtotal < v_promo.minimum_subtotal then
      raise exception 'This promo requires a minimum subtotal of $%', trim(to_char(v_promo.minimum_subtotal, '999999990.00'));
    end if;

    select count(*) into v_total_uses
    from public.promotion_redemptions r
    join public.orders o on o.id = r.order_id
    where r.promotion_id = v_promo.id and o.status <> 'cancelled';
    select count(*) into v_user_uses
    from public.promotion_redemptions r
    join public.orders o on o.id = r.order_id
    where r.promotion_id = v_promo.id and r.user_id = v_user_id and o.status <> 'cancelled';

    if v_promo.max_redemptions is not null and v_total_uses >= v_promo.max_redemptions then
      raise exception 'Promo code has reached its redemption limit';
    end if;
    if v_user_uses >= v_promo.per_user_limit then raise exception 'You have already used this promo code'; end if;
    v_discount := round(v_subtotal * v_promo.percent_off / 100, 2);
  end if;

  v_tax := round((v_subtotal - v_discount) * 0.08, 2);
  v_total := v_subtotal - v_discount + v_shipping + v_tax;

  return jsonb_build_object(
    'subtotal', v_subtotal, 'shipping', v_shipping, 'discount', v_discount,
    'tax', v_tax, 'total', v_total, 'currency', 'USD',
    'promotionCode', case when v_promo.id is null then null else v_promo.code end,
    'percentOff', case when v_promo.id is null then null else v_promo.percent_off end
  );
end;
$$;

revoke all on function public.order_quote_secure_v1(jsonb, text) from public;
grant execute on function public.order_quote_secure_v1(jsonb, text) to authenticated;

create or replace function public.create_order_secure_v3(
  p_items jsonb,
  p_shipping_address jsonb default '{}'::jsonb,
  p_contact jsonb default '{}'::jsonb,
  p_payment_provider text default 'whatsapp',
  p_idempotency_key uuid default null,
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_base jsonb;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_code text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_promo public.promotions%rowtype;
  v_total_uses bigint := 0;
  v_user_uses bigint := 0;
  v_discount numeric(10,2) := 0;
  v_tax numeric(10,2);
  v_total numeric(10,2);
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  v_base := public.create_order_secure_v2(
    p_items, p_shipping_address, p_contact, p_payment_provider, p_idempotency_key
  );
  v_order_id := (v_base->>'id')::uuid;
  select * into v_order from public.orders where id = v_order_id and user_id = v_user_id;
  if not found then raise exception 'Order could not be created'; end if;

  if coalesce((v_base->>'duplicate_prevented')::boolean, false) then
    return v_base || jsonb_build_object(
      'discount', v_order.discount_amount,
      'promotionCode', v_order.promotion_code
    );
  end if;

  if v_code is not null then
    select * into v_promo from public.promotions where code = v_code for update;
    if not found or not v_promo.active then raise exception 'Promo code is invalid or inactive'; end if;
    if v_promo.starts_at is not null and now() < v_promo.starts_at then raise exception 'Promo code is not active yet'; end if;
    if v_promo.ends_at is not null and now() >= v_promo.ends_at then raise exception 'Promo code has expired'; end if;
    if v_order.subtotal < v_promo.minimum_subtotal then
      raise exception 'This promo requires a minimum subtotal of $%', trim(to_char(v_promo.minimum_subtotal, '999999990.00'));
    end if;

    select count(*) into v_total_uses
    from public.promotion_redemptions r
    join public.orders o on o.id = r.order_id
    where r.promotion_id = v_promo.id and o.status <> 'cancelled';
    select count(*) into v_user_uses
    from public.promotion_redemptions r
    join public.orders o on o.id = r.order_id
    where r.promotion_id = v_promo.id and r.user_id = v_user_id and o.status <> 'cancelled';

    if v_promo.max_redemptions is not null and v_total_uses >= v_promo.max_redemptions then
      raise exception 'Promo code has reached its redemption limit';
    end if;
    if v_user_uses >= v_promo.per_user_limit then raise exception 'You have already used this promo code'; end if;

    v_discount := round(v_order.subtotal * v_promo.percent_off / 100, 2);
    v_tax := round((v_order.subtotal - v_discount) * 0.08, 2);
    v_total := v_order.subtotal - v_discount + v_order.shipping + v_tax;

    update public.orders
    set discount_amount = v_discount, tax = v_tax, total = v_total,
        promotion_id = v_promo.id, promotion_code = v_promo.code,
        updated_at = now()
    where id = v_order_id;

    insert into public.promotion_redemptions (
      promotion_id, order_id, user_id, discount_amount
    ) values (v_promo.id, v_order_id, v_user_id, v_discount);

    v_base := v_base || jsonb_build_object(
      'discount', v_discount, 'tax', v_tax, 'total', v_total,
      'promotionCode', v_promo.code, 'percentOff', v_promo.percent_off
    );
  else
    v_base := v_base || jsonb_build_object('discount', 0, 'promotionCode', null);
  end if;

  return v_base;
end;
$$;

revoke all on function public.create_order_secure_v3(jsonb, jsonb, jsonb, text, uuid, text) from public;
grant execute on function public.create_order_secure_v3(jsonb, jsonb, jsonb, text, uuid, text) to authenticated;

create or replace function public.admin_list_customers(
  p_search text default '',
  p_limit integer default 100
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  whatsapp_phone text,
  email_updates boolean,
  whatsapp_updates boolean,
  order_count bigint,
  total_spent numeric,
  last_order_at timestamptz,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(trim(coalesce(p_search, '')));
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if length(v_search) > 100 then raise exception 'Search is too long'; end if;

  return query
  select
    u.id,
    u.email::text,
    p.full_name,
    case when p.whatsapp_verified_at is not null then p.whatsapp_phone else null end,
    p.email_updates_opt_in_at is not null,
    p.whatsapp_updates_opt_in_at is not null,
    count(o.id),
    coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0),
    max(o.created_at),
    u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.orders o on o.user_id = u.id
  where v_search = ''
     or position(v_search in lower(coalesce(u.email::text, ''))) > 0
     or position(v_search in lower(coalesce(p.full_name, ''))) > 0
  group by u.id, u.email, p.full_name, p.whatsapp_phone,
    p.whatsapp_verified_at, p.email_updates_opt_in_at,
    p.whatsapp_updates_opt_in_at, u.created_at
  order by max(o.created_at) desc nulls last, u.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
end;
$$;

revoke all on function public.admin_list_customers(text, integer) from public;
grant execute on function public.admin_list_customers(text, integer) to authenticated;

create or replace function public.admin_list_promotions()
returns table (
  id uuid,
  code text,
  percent_off numeric,
  minimum_subtotal numeric,
  max_redemptions integer,
  per_user_limit integer,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean,
  redemption_count bigint,
  total_discount numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  return query
  select p.id, p.code, p.percent_off, p.minimum_subtotal,
    p.max_redemptions, p.per_user_limit, p.starts_at, p.ends_at,
    p.active,
    count(r.id) filter (where o.status is null or o.status <> 'cancelled'),
    coalesce(sum(r.discount_amount) filter (where o.status is null or o.status <> 'cancelled'), 0),
    p.created_at, p.updated_at
  from public.promotions p
  left join public.promotion_redemptions r on r.promotion_id = p.id
  left join public.orders o on o.id = r.order_id
  group by p.id
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_promotions() from public;
grant execute on function public.admin_list_promotions() to authenticated;

create or replace function public.admin_upsert_promotion(
  p_id uuid,
  p_code text,
  p_percent_off numeric,
  p_minimum_subtotal numeric,
  p_max_redemptions integer,
  p_per_user_limit integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if v_code !~ '^[A-Z0-9_-]{3,32}$' then raise exception 'Promo code must be 3-32 letters, numbers, hyphens or underscores'; end if;
  if p_percent_off is null or p_percent_off < 1 or p_percent_off > 95 then raise exception 'Discount must be between 1 and 95 percent'; end if;
  if coalesce(p_minimum_subtotal, 0) < 0 then raise exception 'Minimum subtotal cannot be negative'; end if;
  if p_max_redemptions is not null and p_max_redemptions < 1 then raise exception 'Maximum redemptions must be positive'; end if;
  if coalesce(p_per_user_limit, 1) < 1 or p_per_user_limit > 100 then raise exception 'Per-user limit must be between 1 and 100'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'End time must be after start time'; end if;

  if p_id is null then
    insert into public.promotions (
      code, percent_off, minimum_subtotal, max_redemptions,
      per_user_limit, starts_at, ends_at, active, created_by, updated_by
    ) values (
      v_code, p_percent_off, coalesce(p_minimum_subtotal, 0), p_max_redemptions,
      coalesce(p_per_user_limit, 1), p_starts_at, p_ends_at, coalesce(p_active, true),
      v_admin, v_admin
    ) returning id into v_id;
  else
    update public.promotions
    set code = v_code, percent_off = p_percent_off,
        minimum_subtotal = coalesce(p_minimum_subtotal, 0),
        max_redemptions = p_max_redemptions,
        per_user_limit = coalesce(p_per_user_limit, 1),
        starts_at = p_starts_at, ends_at = p_ends_at,
        active = coalesce(p_active, true), updated_by = v_admin, updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Promotion not found'; end if;
  end if;

  insert into public.admin_action_log (admin_user_id, action, target_type, target_id, details)
  values (
    v_admin,
    case when p_id is null then 'promotion_created' else 'promotion_updated' end,
    'promotion', v_id::text,
    jsonb_build_object('code', v_code, 'percentOff', p_percent_off, 'active', coalesce(p_active, true))
  );
  return v_id;
end;
$$;

revoke all on function public.admin_upsert_promotion(uuid, text, numeric, numeric, integer, integer, timestamptz, timestamptz, boolean) from public;
grant execute on function public.admin_upsert_promotion(uuid, text, numeric, numeric, integer, integer, timestamptz, timestamptz, boolean) to authenticated;

create or replace function public.admin_set_promotion_active(
  p_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  update public.promotions
  set active = p_active, updated_by = auth.uid(), updated_at = now()
  where id = p_id
  returning code into v_code;
  if v_code is null then raise exception 'Promotion not found'; end if;
  insert into public.admin_action_log (admin_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'promotion_status_changed', 'promotion', p_id::text,
    jsonb_build_object('code', v_code, 'active', p_active));
end;
$$;

revoke all on function public.admin_set_promotion_active(uuid, boolean) from public;
grant execute on function public.admin_set_promotion_active(uuid, boolean) to authenticated;

create or replace function public.admin_recent_activity(p_limit integer default 30)
returns table (
  id bigint,
  admin_email text,
  action text,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  return query
  select l.id, u.email::text, l.action, l.target_type, l.target_id, l.details, l.created_at
  from public.admin_action_log l
  join auth.users u on u.id = l.admin_user_id
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

revoke all on function public.admin_recent_activity(integer) from public;
grant execute on function public.admin_recent_activity(integer) to authenticated;
