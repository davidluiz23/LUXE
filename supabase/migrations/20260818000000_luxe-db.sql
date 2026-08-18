-- =====================================================================
-- LUXE backend schema — run this ONCE in Supabase: 
-- Dashboard → SQL Editor → New query → paste all of this → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES
-- Supabase Auth already has a private `auth.users` table (email,
-- password hash, etc) that you can't touch directly. This `profiles`
-- table is the *public* extension of it — the stuff your app needs to
-- read/display, like full name and phone.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can only ever see/edit their OWN row. auth.uid() is the id
-- Supabase pulls out of the logged-in user's session token.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Whenever someone signs up, auth.users gets a new row automatically.
-- This trigger mirrors that into `profiles` for us — so the app never
-- has to manually insert a profile after signup (and can't be tricked
-- into creating one for the wrong id).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ---------------------------------------------------------------------
-- 2. ORDERS  (the "transactions")
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number text not null unique,
  subtotal numeric(10,2) not null,
  shipping numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  status text not null default 'processing',
  shipping_address jsonb,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

create policy "orders_insert_own" on public.orders
  for insert with check (auth.uid() = user_id);

-- Deliberately NO update/delete policy for regular users.
-- Once an order is placed, the customer shouldn't be able to edit or
-- erase it from the client — that's how you'd fake a refund or dodge
-- a charge. Only you (via the Supabase dashboard, using the secret
-- service_role key) can change order status.


-- ---------------------------------------------------------------------
-- 3. ORDER ITEMS  (line items within an order)
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  price numeric(10,2) not null,
  quantity int not null,
  image_url text
);

alter table public.order_items enable row level security;

-- These check "does the order this item belongs to belong to me?"
create policy "order_items_select_own" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

create policy "order_items_insert_own" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

-- =====================================================================
-- Done. After running this:
-- 1. Go to Authentication → Providers → make sure Email is enabled
-- 2. Go to Authentication → Emails → confirm "Confirm signup" template
--    is on (it sends the 6-digit code the frontend verifies)
-- =====================================================================
