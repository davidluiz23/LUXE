-- WhatsApp-first commerce workflow, admin fulfilment and real sales signals.

alter table public.orders
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists payment_provider text not null default 'whatsapp',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_reference text,
  add column if not exists currency text not null default 'USD',
  add column if not exists estimated_delivery_min_days integer,
  add column if not exists estimated_delivery_max_days integer,
  add column if not exists waybill_url text,
  add column if not exists admin_seen_at timestamptz,
  add column if not exists admin_notified_at timestamptz,
  add column if not exists customer_notified_at timestamptz,
  add column if not exists whatsapp_opt_in_at timestamptz,
  add column if not exists idempotency_key uuid,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);
create index if not exists orders_admin_unseen_idx
  on public.orders (admin_seen_at, created_at desc);
create unique index if not exists orders_payment_reference_idx
  on public.orders (payment_reference)
  where payment_reference is not null;
create unique index if not exists orders_user_idempotency_idx
  on public.orders (user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);
create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc);
create index if not exists order_items_order_idx
  on public.order_items (order_id);
create index if not exists order_items_product_idx
  on public.order_items (product_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_image_https_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_image_https_check
      check (image ~* '^https://') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_hover_image_https_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_hover_image_https_check
      check (hover_image is null or hover_image = '' or hover_image ~* '^https://') not valid;
  end if;
end;
$$;

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
where id = 'luxe-uploads';

drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin"
on public.orders for select to authenticated
using ((select public.is_admin()));

drop policy if exists "order_items_select_admin" on public.order_items;
create policy "order_items_select_admin"
on public.order_items for select to authenticated
using ((select public.is_admin()));

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'update',
  title text not null,
  message text not null,
  order_id uuid references public.orders(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);
create index if not exists user_notifications_unread_idx
  on public.user_notifications (user_id, read_at)
  where read_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists "notifications_select_own" on public.user_notifications;
create policy "notifications_select_own"
on public.user_notifications for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notifications_update_own" on public.user_notifications;
create policy "notifications_update_own"
on public.user_notifications for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.user_notifications from anon;
grant select, update on table public.user_notifications to authenticated;

create or replace function public.create_welcome_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_notifications (user_id, kind, title, message)
  values (
    new.id,
    'welcome',
    'Welcome to LUXE',
    'Your account is ready. Save your contact details, discover the collection, and track every order here.'
  );
  return new;
end;
$$;

drop trigger if exists profiles_create_welcome_notification on public.profiles;
create trigger profiles_create_welcome_notification
after insert on public.profiles
for each row execute function public.create_welcome_notification();

create or replace function public.notify_users_of_site_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active then
    insert into public.user_notifications (user_id, kind, title, message)
    select p.id, 'update', new.title, new.message
    from public.profiles p;
  end if;
  return new;
end;
$$;

drop trigger if exists site_updates_notify_users on public.site_updates;
create trigger site_updates_notify_users
after insert on public.site_updates
for each row execute function public.notify_users_of_site_update();

create or replace function public.notify_customer_of_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eta text := '';
begin
  if new.estimated_delivery_min_days is not null then
    v_eta := format(
      ' Estimated arrival: %s%s day(s).',
      new.estimated_delivery_min_days,
      case
        when new.estimated_delivery_max_days is not null
          and new.estimated_delivery_max_days <> new.estimated_delivery_min_days
        then '–' || new.estimated_delivery_max_days
        else ''
      end
    );
  end if;

  if new.status is distinct from old.status
     or new.waybill_url is distinct from old.waybill_url
     or new.estimated_delivery_min_days is distinct from old.estimated_delivery_min_days
     or new.estimated_delivery_max_days is distinct from old.estimated_delivery_max_days
  then
    insert into public.user_notifications (user_id, kind, title, message, order_id)
    values (
      new.user_id,
      'order',
      'Order ' || new.order_number || ' updated',
      'Your order is now ' || replace(new.status, '_', ' ') || '.' || v_eta,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists orders_notify_customer_of_change on public.orders;
create trigger orders_notify_customer_of_change
after update on public.orders
for each row execute function public.notify_customer_of_order_change();

create or replace function public.create_order_secure_v2(
  p_items jsonb,
  p_shipping_address jsonb default '{}'::jsonb,
  p_contact jsonb default '{}'::jsonb,
  p_payment_provider text default 'whatsapp',
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_product_id bigint;
  v_quantity integer;
  v_product public.products%rowtype;
  v_name text := trim(coalesce(p_contact->>'name', ''));
  v_email text := lower(trim(coalesce(p_contact->>'email', '')));
  v_phone text := regexp_replace(coalesce(p_contact->>'phone', ''), '[^0-9+]', '', 'g');
  v_provider text := lower(trim(coalesce(p_payment_provider, 'whatsapp')));
  v_whatsapp_opt_in boolean := coalesce((p_contact->>'whatsappOptIn') = 'true', false);
  v_existing public.orders%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'A checkout request ID is required'; end if;

  -- Serialize retries for this checkout key, then return the original order.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing
  from public.orders
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'id', v_existing.id, 'order_number', v_existing.order_number,
      'subtotal', v_existing.subtotal, 'shipping', v_existing.shipping,
      'tax', v_existing.tax, 'total', v_existing.total,
      'status', v_existing.status, 'payment_provider', v_existing.payment_provider,
      'payment_status', v_existing.payment_status, 'currency', v_existing.currency,
      'duplicate_prevented', true
    );
  end if;

  if (
    select count(*) from public.orders
    where user_id = v_user_id and created_at > now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'Too many recent checkout attempts. Please wait a few minutes.';
  end if;
  if jsonb_typeof(coalesce(p_shipping_address, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_contact, '{}'::jsonb)) <> 'object'
  then raise exception 'Invalid checkout details'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Cart contains too many line items'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Enter a valid contact name'; end if;
  if length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address'; end if;
  if v_phone !~ '^\+?[0-9]{7,15}$' then raise exception 'Enter a valid WhatsApp phone number'; end if;
  if not v_whatsapp_opt_in then raise exception 'WhatsApp order-update consent is required'; end if;
  if v_provider not in ('whatsapp', 'paystack') then raise exception 'Unsupported payment provider'; end if;

  if length(trim(coalesce(p_shipping_address->>'address', ''))) < 5
     or length(trim(coalesce(p_shipping_address->>'city', ''))) < 2
     or length(trim(coalesce(p_shipping_address->>'state', ''))) < 2
  then raise exception 'Enter a complete delivery address'; end if;

  if length(coalesce(p_shipping_address->>'address', '')) > 250
     or length(coalesce(p_shipping_address->>'city', '')) > 100
     or length(coalesce(p_shipping_address->>'state', '')) > 100
     or length(coalesce(p_shipping_address->>'zip', '')) > 30
  then raise exception 'Shipping address is too long'; end if;

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
  v_tax := round(v_subtotal * 0.08, 2);
  v_total := v_subtotal + v_shipping + v_tax;
  v_order_number := 'LX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.orders (
    user_id, order_number, subtotal, shipping, tax, total, status,
    shipping_address, contact_name, contact_email, contact_phone,
    payment_provider, payment_status, currency, whatsapp_opt_in_at,
    idempotency_key
  ) values (
    v_user_id, v_order_number, v_subtotal, v_shipping, v_tax, v_total,
    case when v_provider = 'paystack' then 'awaiting_payment' else 'pending_confirmation' end,
    jsonb_build_object(
      'address', trim(p_shipping_address->>'address'),
      'city', trim(p_shipping_address->>'city'),
      'state', trim(p_shipping_address->>'state'),
      'zip', trim(coalesce(p_shipping_address->>'zip', ''))
    ), v_name, v_email, v_phone,
    v_provider, 'pending', 'USD', now(), p_idempotency_key
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::bigint;
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = v_product_id;
    insert into public.order_items (order_id, product_id, product_name, price, quantity, image_url)
    values (v_order_id, v_product.id::text, v_product.name, v_product.price, v_quantity, v_product.image);
  end loop;

  insert into public.user_notifications (user_id, kind, title, message, order_id)
  values (
    v_user_id,
    'order',
    'Order received',
    'Order ' || v_order_number || ' is in your account. We will share fulfilment updates here and on WhatsApp.',
    v_order_id
  );

  return jsonb_build_object(
    'id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal,
    'shipping', v_shipping, 'tax', v_tax, 'total', v_total,
    'status', case when v_provider = 'paystack' then 'awaiting_payment' else 'pending_confirmation' end,
    'payment_provider', v_provider, 'payment_status', 'pending', 'currency', 'USD'
  );
end;
$$;

revoke all on function public.create_order_secure_v2(jsonb, jsonb, jsonb, text, uuid) from public;
grant execute on function public.create_order_secure_v2(jsonb, jsonb, jsonb, text, uuid) to authenticated;

create or replace function public.admin_update_order(
  p_order_id uuid,
  p_status text,
  p_estimated_min_days integer default null,
  p_estimated_max_days integer default null,
  p_waybill_url text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_status not in ('pending_confirmation', 'awaiting_payment', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Invalid order status';
  end if;
  if p_estimated_min_days is not null and (p_estimated_min_days < 1 or p_estimated_min_days > 90) then
    raise exception 'Invalid minimum delivery estimate';
  end if;
  if p_estimated_max_days is not null and (p_estimated_max_days < coalesce(p_estimated_min_days, 1) or p_estimated_max_days > 120) then
    raise exception 'Invalid maximum delivery estimate';
  end if;
  if length(coalesce(p_waybill_url, '')) > 1000 then raise exception 'Waybill URL is too long'; end if;
  if nullif(trim(coalesce(p_waybill_url, '')), '') is not null
     and trim(p_waybill_url) !~* '^https?://'
  then raise exception 'Waybill URL must start with http:// or https://'; end if;

  update public.orders set
    updated_at = case
      when status is distinct from p_status
        or estimated_delivery_min_days is distinct from p_estimated_min_days
        or estimated_delivery_max_days is distinct from p_estimated_max_days
        or waybill_url is distinct from nullif(trim(coalesce(p_waybill_url, '')), '')
      then now()
      else updated_at
    end,
    status = p_status,
    estimated_delivery_min_days = p_estimated_min_days,
    estimated_delivery_max_days = p_estimated_max_days,
    waybill_url = nullif(trim(coalesce(p_waybill_url, '')), ''),
    admin_seen_at = coalesce(admin_seen_at, now())
  where id = p_order_id
  returning * into v_order;

  if not found then raise exception 'Order not found'; end if;
  return v_order;
end;
$$;

revoke all on function public.admin_update_order(uuid, text, integer, integer, text) from public;
grant execute on function public.admin_update_order(uuid, text, integer, integer, text) to authenticated;

create or replace function public.admin_mark_all_orders_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  update public.orders set admin_seen_at = now() where admin_seen_at is null;
end;
$$;

revoke all on function public.admin_mark_all_orders_seen() from public;
grant execute on function public.admin_mark_all_orders_seen() to authenticated;

create or replace function public.admin_unseen_order_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  return (select count(*) from public.orders where admin_seen_at is null);
end;
$$;

revoke all on function public.admin_unseen_order_count() from public;
grant execute on function public.admin_unseen_order_count() to authenticated;

create or replace function public.get_trending_products(
  p_limit integer default 8,
  p_days integer default 30
)
returns table(product_id bigint, units_sold bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select oi.product_id::bigint, sum(oi.quantity)::bigint
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id ~ '^[0-9]+$'
    and o.status in ('processing', 'confirmed', 'shipped', 'delivered')
    and o.created_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
  group by oi.product_id::bigint
  order by sum(oi.quantity) desc, max(o.created_at) desc
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.get_trending_products(integer, integer) from public;
grant execute on function public.get_trending_products(integer, integer) to anon, authenticated;
