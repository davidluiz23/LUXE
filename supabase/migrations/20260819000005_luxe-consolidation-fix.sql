-- =====================================================================
-- LUXE — CONSOLIDATION FIX / MASTER OWNER EDITION
-- File: 20260819000005_luxe-consolidation-fix.sql
--
-- This is the ONLY pending consolidation migration that should be pushed.
-- 00003 and 00004 were intentionally marked applied because this file
-- supersedes them and rebuilds their useful features safely.
--
-- SECURITY MODEL
--   owner  = permanent master account; manages admins + store
--   admin  = manages products, uploads and site updates
--
-- IMPORTANT:
-- - No owner email is stored in this migration.
-- - The existing oldest row in public.admin_users is promoted to owner.
--   This is designed for the current LUXE database where 00002 already
--   inserted the original owner UUID.
-- - If admin_users is empty, the migration still succeeds; add the owner
--   UUID manually afterward using the statement at the bottom.
-- =====================================================================

begin;

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

do $$
begin
  begin
    alter table public.products
      add constraint products_price_check check (price >= 0);
  exception when duplicate_object then null;
  end;

  begin
    alter table public.products
      add constraint products_old_price_check
      check (old_price is null or old_price >= 0);
  exception when duplicate_object then null;
  end;

  begin
    alter table public.products
      add constraint products_rating_check
      check (rating >= 0 and rating <= 5);
  exception when duplicate_object then null;
  end;
end
$$;

drop table if exists public.admins cascade;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  role text not null default 'admin'
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_users'
      and column_name = 'created_at'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_users'
      and column_name = 'added_at'
  )
  then
    alter table public.admin_users
      rename column created_at to added_at;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_users'
      and column_name = 'added_at'
  )
  then
    alter table public.admin_users
      add column added_at timestamptz not null default now();
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_users'
      and column_name = 'role'
  )
  then
    alter table public.admin_users
      add column role text not null default 'admin';
  end if;
end
$$;

do $$
begin
  begin
    alter table public.admin_users
      add constraint admin_users_role_check
      check (role in ('owner', 'admin'));
  exception when duplicate_object then null;
  end;
end
$$;

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from public.admin_users where role = 'owner'
  )
  then
    update public.admin_users
    set role = 'owner'
    where user_id = (
      select user_id
      from public.admin_users
      order by added_at asc, user_id asc
      limit 1
    );
  end if;
end
$$;

create unique index if not exists admin_users_single_owner_idx
  on public.admin_users (role)
  where role = 'owner';

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

create or replace function public.is_owner()
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
      and role = 'owner'
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.admin_users
  where user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.current_admin_role() from public;
grant execute on function public.current_admin_role() to authenticated;

create or replace function public.list_admins()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  added_at timestamptz
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
    a.added_at
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

create or replace function public.admin_add_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not public.is_owner() then
    raise exception 'Owner permission required';
  end if;

  select id
  into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception
      'No LUXE account found for that email. They need to sign up first.';
  end if;

  insert into public.admin_users (user_id, role)
  values (v_user_id, 'admin')
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
declare
  v_target_role text;
begin
  if not public.is_owner() then
    raise exception 'Owner permission required';
  end if;

  select role
  into v_target_role
  from public.admin_users
  where user_id = p_user_id;

  if v_target_role is null then
    raise exception 'Admin account not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'The master owner cannot be removed';
  end if;

  delete from public.admin_users
  where user_id = p_user_id
    and role = 'admin';
end;
$$;

revoke all on function public.admin_remove(uuid) from public;
grant execute on function public.admin_remove(uuid) to authenticated;

drop policy if exists "products_select_public" on public.products;
drop policy if exists "products_insert_owner" on public.products;
drop policy if exists "products_update_owner" on public.products;
drop policy if exists "products_delete_owner" on public.products;
drop policy if exists "products_insert_admin" on public.products;
drop policy if exists "products_update_admin" on public.products;
drop policy if exists "products_delete_admin" on public.products;

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

drop policy if exists "updates_select_public" on public.site_updates;
drop policy if exists "updates_insert_owner" on public.site_updates;
drop policy if exists "updates_delete_owner" on public.site_updates;
drop policy if exists "updates_insert_admin" on public.site_updates;
drop policy if exists "updates_delete_admin" on public.site_updates;

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

grant usage, select on sequence public.products_id_seq to authenticated;

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
for each row
execute function public.set_updated_at();

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
    from public.orders o
    where o.id = order_id
      and o.user_id = (select auth.uid())
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

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
  then
    raise exception 'Cart is empty';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Cart contains too many line items';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
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
      v_subtotal + round(v_product.price * v_quantity, 2);
  end loop;

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

  for v_item in
    select value from jsonb_array_elements(p_items)
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

create policy "luxe_uploads_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'luxe-uploads');

create policy "luxe_uploads_admin_insert_products"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'luxe-uploads'
  and (storage.foldername(name))[1] = 'products'
  and (select public.is_admin())
);

create policy "luxe_uploads_admin_update_products"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'luxe-uploads'
  and (storage.foldername(name))[1] = 'products'
  and (select public.is_admin())
)
with check (
  bucket_id = 'luxe-uploads'
  and (storage.foldername(name))[1] = 'products'
  and (select public.is_admin())
);

create policy "luxe_uploads_admin_delete_products"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'luxe-uploads'
  and (storage.foldername(name))[1] = 'products'
  and (select public.is_admin())
);

create policy "luxe_uploads_own_avatar_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'luxe-uploads'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy "luxe_uploads_own_avatar_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'luxe-uploads'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'luxe-uploads'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy "luxe_uploads_own_avatar_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'luxe-uploads'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

commit;

-- If admin_users is empty after this migration, bootstrap the owner manually:
--
-- insert into public.admin_users (user_id, role)
-- values ('PASTE-OWNER-AUTH-UUID-HERE', 'owner')
-- on conflict (user_id)
-- do update set role = 'owner';
--
-- Never put the owner UUID or owner email in frontend JavaScript.
