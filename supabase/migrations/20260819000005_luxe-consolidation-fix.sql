-- =====================================================================
-- LUXE — CONSOLIDATION FIX
-- Run this ONCE in Supabase SQL Editor. Do NOT re-run
-- 20260818000001/000002/000003/000004 — this file supersedes all of
-- them and is safe to run regardless of which of those partially
-- succeeded or failed.
--
-- WHAT THIS FIXES:
-- Two different "who's an admin" systems got created on top of each
-- other (mine, checking email; a second one from another edit,
-- checking a UUID via an admin_users table + is_admin() function).
-- They collided — some CREATE POLICY statements almost certainly
-- errored out because a policy with that name already existed.
--
-- This file settles on ONE system: the UUID-based one
-- (admin_users + is_admin()), since that's what you asked for and
-- it's the more robust choice — email can be changed by a user,
-- a UUID tied to auth.users can't be spoofed the same way.
--
-- It also finishes wiring up secure order creation
-- (create_order_secure) so checkout.js actually uses it — right now
-- nothing calls that function, so if the policies that used to allow
-- direct order inserts were already dropped, checkout is currently
-- broken. This fixes both sides (see the matching supabase-client.js
-- / checkout.js changes in this same delivery).
--
-- >>> Replace 'owner@example.com' near the bottom with YOUR real
-- login email <<< (appears once, used only to look up your account's
-- UUID automatically — you don't need to copy/paste any UUID by hand)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. CORE TABLES  (safe no-ops if they already exist)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id bigint primary key,
  name text not null,
  brand text not null default 'Luxe',
  category text not null default 'Men',
  subcategory text not null default 'General',
  price numeric(10,2) not null default 0,
  old_price numeric(10,2),
  image text,
  hover_image text,
  rating numeric(2,1) not null default 5.0,
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

-- Defensive: add value-sanity constraints if they're not already
-- there (older table versions may not have them). Wrapped so it
-- can't error out on a rerun.
do $$
begin
  begin
    alter table public.products add constraint products_price_check check (price >= 0);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.products add constraint products_old_price_check check (old_price is null or old_price >= 0);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.products add constraint products_rating_check check (rating >= 0 and rating <= 5);
  exception when duplicate_object then null;
  end;
end $$;


-- ---------------------------------------------------------------------
-- 2. ADMIN SYSTEM — standardized on UUID (admin_users + is_admin())
-- Drops the old email-based `admins` table entirely so there is only
-- ONE admin system going forward, not two half-wired ones.
-- ---------------------------------------------------------------------
drop table if exists public.admins cascade;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
-- No SELECT policy on this table on purpose — browsers never query it
-- directly. All reads/writes go through the functions below, which
-- run with elevated privilege and do their own admin check.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Lets the Team tab show a real name + email per admin (browsers
-- can't query auth.users directly — this function can, safely,
-- because it only returns rows for people who are already admins).
create or replace function public.list_admins()
returns table (user_id uuid, email text, full_name text, added_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, u.email::text, p.full_name, a.added_at
  from public.admin_users a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  where public.is_admin()
  order by a.added_at asc;
$$;

revoke all on function public.list_admins() from public;
grant execute on function public.list_admins() to authenticated;

-- Add a teammate by email — looks up their account for you so no one
-- has to copy/paste a UUID from the dashboard by hand. Requires that
-- person to already have a LUXE account (they sign up normally first).
create or replace function public.admin_add_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(p_email);

  if v_user_id is null then
    raise exception 'No account found for that email — they need to sign up first.';
  end if;

  insert into public.admin_users (user_id) values (v_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.admin_add_by_email(text) from public;
grant execute on function public.admin_add_by_email(text) to authenticated;

create or replace function public.admin_remove(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  delete from public.admin_users where user_id = p_user_id;
end;
$$;

revoke all on function public.admin_remove(uuid) from public;
grant execute on function public.admin_remove(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. PRODUCTS / SITE UPDATES RLS — rebuilt clean against is_admin()
-- Every DROP below is safe even if the policy never existed or was
-- already renamed by an earlier partial run.
-- ---------------------------------------------------------------------
drop policy if exists "products_select_public" on public.products;
drop policy if exists "products_insert_owner" on public.products;
drop policy if exists "products_update_owner" on public.products;
drop policy if exists "products_delete_owner" on public.products;
drop policy if exists "products_insert_admin" on public.products;
drop policy if exists "products_update_admin" on public.products;
drop policy if exists "products_delete_admin" on public.products;

create policy "products_select_public" on public.products
  for select to anon, authenticated using (true);

create policy "products_insert_admin" on public.products
  for insert to authenticated with check ((select public.is_admin()));

create policy "products_update_admin" on public.products
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "products_delete_admin" on public.products
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "updates_select_public" on public.site_updates;
drop policy if exists "updates_insert_owner" on public.site_updates;
drop policy if exists "updates_delete_owner" on public.site_updates;
drop policy if exists "updates_insert_admin" on public.site_updates;
drop policy if exists "updates_delete_admin" on public.site_updates;

create policy "updates_select_public" on public.site_updates
  for select to anon, authenticated using (true);

create policy "updates_insert_admin" on public.site_updates
  for insert to authenticated with check ((select public.is_admin()));

create policy "updates_delete_admin" on public.site_updates
  for delete to authenticated using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 4. PRODUCT ID SEQUENCE — server-assigned ids for new products
-- (avoids two admins racing to compute the same "max id + 1")
-- ---------------------------------------------------------------------
create sequence if not exists public.products_id_seq;

select setval(
  'public.products_id_seq',
  greatest(coalesce((select max(id) from public.products), 0) + 1, 1),
  false
);

alter table public.products alter column id set default nextval('public.products_id_seq');
alter sequence public.products_id_seq owned by public.products.id;

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
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 5. ORDERS — server-computed pricing, no direct browser inserts
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "orders_select_own" on public.orders;
drop policy if exists "orders_insert_own" on public.orders;

create policy "orders_select_own" on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);

-- Deliberately no INSERT policy — orders can only be created through
-- create_order_secure() below, so prices always come from the real
-- products table, never from whatever the browser sends.

drop policy if exists "order_items_select_own" on public.order_items;
drop policy if exists "order_items_insert_own" on public.order_items;

create policy "order_items_select_own" on public.order_items
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = (select auth.uid())
    )
  );

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

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Cart contains too many line items';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_product_id := (v_item ->> 'product_id')::bigint;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Invalid cart item';
    end;

    if v_product_id is null or v_product_id <= 0 then
      raise exception 'Invalid product ID';
    end if;
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'Invalid quantity';
    end if;

    select * into v_product from public.products where id = v_product_id;

    if not found then
      raise exception 'Product % no longer exists', v_product_id;
    end if;
    if not v_product.in_stock then
      raise exception 'Product "%" is out of stock', v_product.name;
    end if;

    v_subtotal := v_subtotal + round(v_product.price * v_quantity, 2);
  end loop;

  v_shipping := case when v_subtotal > 200 then 0 else 15 end;
  v_tax := round(v_subtotal * 0.08, 2);
  v_total := v_subtotal + v_shipping + v_tax;

  v_order_number := 'LX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.orders (user_id, order_number, subtotal, shipping, tax, total, status, shipping_address)
  values (v_user_id, v_order_number, v_subtotal, v_shipping, v_tax, v_total, 'processing', coalesce(p_shipping_address, '{}'::jsonb))
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;

    select * into v_product from public.products where id = v_product_id;

    insert into public.order_items (order_id, product_id, product_name, price, quantity, image_url)
    values (v_order_id, v_product.id::text, v_product.name, v_product.price, v_quantity, v_product.image);
  end loop;

  return jsonb_build_object(
    'id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal,
    'shipping', v_shipping, 'tax', v_tax, 'total', v_total, 'status', 'processing'
  );
end;
$$;

revoke all on function public.create_order_secure(jsonb, jsonb) from public;
grant execute on function public.create_order_secure(jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 6. STORAGE  (product photo + avatar uploads — now keyed to is_admin())
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('luxe-uploads', 'luxe-uploads', true)
on conflict (id) do nothing;

drop policy if exists "luxe_uploads_public_read" on storage.objects;
drop policy if exists "luxe_uploads_admin_insert_products" on storage.objects;
drop policy if exists "luxe_uploads_admin_update_products" on storage.objects;
drop policy if exists "luxe_uploads_admin_delete_products" on storage.objects;
drop policy if exists "luxe_uploads_own_avatar_insert" on storage.objects;
drop policy if exists "luxe_uploads_own_avatar_update" on storage.objects;
drop policy if exists "luxe_uploads_own_avatar_delete" on storage.objects;

create policy "luxe_uploads_public_read" on storage.objects
  for select using (bucket_id = 'luxe-uploads');

create policy "luxe_uploads_admin_insert_products" on storage.objects
  for insert with check (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'products'
    and public.is_admin()
  );

create policy "luxe_uploads_admin_update_products" on storage.objects
  for update using (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'products'
    and public.is_admin()
  );

create policy "luxe_uploads_admin_delete_products" on storage.objects
  for delete using (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'products'
    and public.is_admin()
  );

create policy "luxe_uploads_own_avatar_insert" on storage.objects
  for insert with check (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "luxe_uploads_own_avatar_update" on storage.objects
  for update using (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "luxe_uploads_own_avatar_delete" on storage.objects
  for delete using (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

commit;

-- ---------------------------------------------------------------------
-- 7. SEED YOUR OWN ACCOUNT AS THE FIRST ADMIN
-- This looks your account up by email and inserts its real UUID —
-- you never have to copy/paste a UUID by hand.
-- >>> Replace the email below with your real login email <<<
-- ---------------------------------------------------------------------
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('ambrosebishop26@gmail.com')
on conflict (user_id) do nothing;

-- If that inserted 0 rows, it means no account exists yet with that
-- email — sign up at signup.html with that email first, then re-run
-- just this last statement.

-- =====================================================================
-- Done. Log into admin.html with that account. Add teammates from the
-- Team tab (they need their own LUXE account first).
-- =====================================================================
