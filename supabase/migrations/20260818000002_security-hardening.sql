-- =====================================================================
-- LUXE SECURITY HARDENING
-- File: supabase/migrations/20260818000002_security-hardening.sql
--
-- Run AFTER the original LUXE DB migration.
--
-- This migration:
--   1. Removes email-based admin authorization.
--   2. Adds admin_users keyed by auth.users UUID.
--   3. Adds public.is_admin().
--   4. Hardens product + site update RLS.
--   5. Makes product IDs database-generated.
--   6. Removes direct browser order INSERT permissions.
--   7. Adds create_order_secure() so prices are calculated server-side
--      and order + line items are created atomically.
--
-- IMPORTANT AFTER RUNNING:
-- Add your own auth user UUID to public.admin_users from the Supabase
-- SQL editor. A ready-to-edit statement is at the bottom of this file.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PRODUCTS / SITE UPDATES
-- Create them if Claude's previous admin migration has not been run.
-- ---------------------------------------------------------------------

create table if not exists public.products (
  id bigint primary key,
  name text not null,
  brand text not null default 'Luxe',
  category text not null default 'Men',
  subcategory text not null default 'General',
  price numeric(10,2) not null default 0 check (price >= 0),
  old_price numeric(10,2) check (old_price is null or old_price >= 0),
  image text,
  hover_image text,
  rating numeric(2,1) not null default 5.0 check (rating >= 0 and rating <= 5),
  discount boolean not null default false,
  description text default '',
  sizes text[] not null default '{}',
  colors text[] not null default '{}',
  in_stock boolean not null default true,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.site_updates enable row level security;

-- ---------------------------------------------------------------------
-- ADMIN USERS
-- Admin identity is a UUID, not an email hardcoded in JavaScript.
-- ---------------------------------------------------------------------

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- No direct SELECT policy is intentionally added.
-- Browsers do not need a list of admins.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- PRODUCT ID SEQUENCE
-- Existing starter IDs are preserved, but new products use nextval().
-- ---------------------------------------------------------------------

create sequence if not exists public.products_id_seq;

select setval(
  'public.products_id_seq',
  greatest(coalesce((select max(id) from public.products), 0) + 1, 1),
  false
);

alter table public.products
  alter column id set default nextval('public.products_id_seq');

alter sequence public.products_id_seq
  owned by public.products.id;

create or replace function public.sync_products_id_sequence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  perform setval(
    'public.products_id_seq',
    greatest(coalesce((select max(id) from public.products), 0) + 1, 1),
    false
  );
end;
$$;

revoke all on function public.sync_products_id_sequence() from public;
grant execute on function public.sync_products_id_sequence() to authenticated;

-- ---------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;

create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- REMOVE CLAUDE'S EMAIL-BASED POLICIES
-- ---------------------------------------------------------------------

drop policy if exists "products_select_public" on public.products;
drop policy if exists "products_insert_owner" on public.products;
drop policy if exists "products_update_owner" on public.products;
drop policy if exists "products_delete_owner" on public.products;

drop policy if exists "products_insert_admin" on public.products;
drop policy if exists "products_update_admin" on public.products;
drop policy if exists "products_delete_admin" on public.products;

drop policy if exists "updates_select_public" on public.site_updates;
drop policy if exists "updates_insert_owner" on public.site_updates;
drop policy if exists "updates_delete_owner" on public.site_updates;

drop policy if exists "updates_insert_admin" on public.site_updates;
drop policy if exists "updates_delete_admin" on public.site_updates;

-- ---------------------------------------------------------------------
-- PRODUCT RLS
-- ---------------------------------------------------------------------

create policy "products_select_public"
on public.products
for select
to anon, authenticated
using (true);

create policy "products_insert_admin"
on public.products
for insert
to authenticated
with check ((select public.is_admin()));

create policy "products_update_admin"
on public.products
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "products_delete_admin"
on public.products
for delete
to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- SITE UPDATE RLS
-- ---------------------------------------------------------------------

create policy "updates_select_public"
on public.site_updates
for select
to anon, authenticated
using (true);

create policy "updates_insert_admin"
on public.site_updates
for insert
to authenticated
with check ((select public.is_admin()));

create policy "updates_delete_admin"
on public.site_updates
for delete
to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- PROFILE / ORDER READ RLS CLEANUP
-- Recreate with explicit authenticated role.
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "orders_select_own" on public.orders;
drop policy if exists "orders_insert_own" on public.orders;

create policy "orders_select_own"
on public.orders
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "order_items_select_own" on public.order_items;
drop policy if exists "order_items_insert_own" on public.order_items;

create policy "order_items_select_own"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders as orders_for_user
    where orders_for_user.id = order_id
      and orders_for_user.user_id = (select auth.uid())
  )
);

-- NOTE:
-- There is intentionally NO direct INSERT policy for orders or
-- order_items anymore. Browser clients must use create_order_secure().
-- That prevents users from choosing their own persisted prices/totals.

-- ---------------------------------------------------------------------
-- SECURE ATOMIC ORDER CREATION
-- ---------------------------------------------------------------------

create or replace function public.create_order_secure(
  p_items jsonb,
  p_shipping_address jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
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
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Cart contains too many line items';
  end if;

  -- Validate every line and calculate from authoritative DB prices.
  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'product_id')::bigint;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when others then
        raise exception 'Invalid cart item';
    end;

    if v_product_id is null or v_product_id <= 0 then
      raise exception 'Invalid product ID';
    end if;

    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'Invalid quantity';
    end if;

    select *
    into v_product
    from public.products
    where id = v_product_id;

    if not found then
      raise exception 'Product % no longer exists', v_product_id;
    end if;

    if not v_product.in_stock then
      raise exception 'Product "%" is out of stock', v_product.name;
    end if;

    v_subtotal :=
      v_subtotal +
      round(v_product.price * v_quantity, 2);
  end loop;

  -- Keep these rules aligned with the storefront display estimate.
  v_shipping :=
    case when v_subtotal > 200 then 0 else 15 end;

  v_tax := round(v_subtotal * 0.08, 2);
  v_total := v_subtotal + v_shipping + v_tax;

  v_order_number :=
    'LX-' ||
    upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        10
      )
    );

  insert into public.orders (
    user_id,
    order_number,
    subtotal,
    shipping,
    tax,
    total,
    status,
    shipping_address
  )
  values (
    v_user_id,
    v_order_number,
    v_subtotal,
    v_shipping,
    v_tax,
    v_total,
    'processing',
    coalesce(p_shipping_address, '{}'::jsonb)
  )
  returning id into v_order_id;

  -- Insert line items using fresh DB product snapshots.
  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;

    select *
    into v_product
    from public.products
    where id = v_product_id;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      price,
      quantity,
      image_url
    )
    values (
      v_order_id,
      v_product.id::text,
      v_product.name,
      v_product.price,
      v_quantity,
      v_product.image
    );
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping', v_shipping,
    'tax', v_tax,
    'total', v_total,
    'status', 'processing'
  );
end;
$$;

revoke all on function public.create_order_secure(jsonb, jsonb) from public;
grant execute on function public.create_order_secure(jsonb, jsonb)
to authenticated;

commit;

-- =====================================================================
-- ONE MANUAL ADMIN STEP
-- =====================================================================
--
-- 1. In Supabase Dashboard → Authentication → Users
-- 2. Copy YOUR account's UUID.
-- 3. Run this separately after replacing the placeholder:
--
-- insert into public.admin_users (user_id)
-- values ('PASTE-YOUR-AUTH-USER-UUID-HERE')
-- on conflict (user_id) do nothing;
--
-- Do NOT put that UUID into admin.js. Keep authorization in Postgres.
-- =====================================================================
