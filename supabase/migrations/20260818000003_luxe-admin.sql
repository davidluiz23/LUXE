-- =====================================================================
-- LUXE admin backend — run this ONCE in Supabase:
-- Dashboard → SQL Editor → New query → paste all of this → Run
--
-- This adds two things:
--   1. A real `products` table (right now your products only live in
--      Frontend/js/products.js — hardcoded in code, same for every
--      visitor, and the only "add product" code that existed before
--      this saved to localStorage, so it only worked in the one
--      browser that clicked it. This fixes that.)
--   2. A `site_updates` table for the admin panel's "post an update /
--      delete an update" feature (a little announcement banner).
--
-- SECURITY MODEL (read this):
-- Anyone can READ products/updates (it's a public storefront).
-- Only YOU can INSERT/UPDATE/DELETE them. That check happens here,
-- in the database, using your email — NOT in the frontend JS. This
-- matters: frontend checks can always be bypassed by editing JS in
-- devtools, but Postgres Row Level Security cannot be bypassed by
-- anyone who doesn't hold your actual login session.
--
-- >>> Replace 'owner@example.com' below with YOUR real login email <<<
-- (search this file for that string — it appears 4 times)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PRODUCTS
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

alter table public.products enable row level security;

-- Everyone (including logged-out shoppers) can read the catalog.
create policy "products_select_public" on public.products
  for select using (true);

-- Only you can add/edit/remove products. This is the real gate —
-- it checks the email on your logged-in session token, server-side.
create policy "products_insert_owner" on public.products
  for insert with check (auth.jwt() ->> 'email' = 'ambrosebishop26@gmail.com');

create policy "products_update_owner" on public.products
  for update using (auth.jwt() ->> 'email' = 'ambrosebishop26@gmail.com');

create policy "products_delete_owner" on public.products
  for delete using (auth.jwt() ->> 'email' = 'ambrosebishop26@gmail.com');

-- Keep updated_at fresh automatically on every edit.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. SITE UPDATES  (the little announcement banner admin can post)
-- ---------------------------------------------------------------------
create table if not exists public.site_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.site_updates enable row level security;

create policy "updates_select_public" on public.site_updates
  for select using (true);

create policy "updates_insert_owner" on public.site_updates
  for insert with check (auth.jwt() ->> 'email' = 'ambrosebishop26@gmail.com');

create policy "updates_delete_owner" on public.site_updates
  for delete using (auth.jwt() ->> 'email' = 'ambrosebishop26@gmail.com');

-- =====================================================================
-- Done. Two things left:
-- 1. Replace 'owner@example.com' above with your real email, THEN run
--    this whole file in Supabase SQL editor.
-- 2. Open Frontend/js/admin.js and set the same email in ADMIN_EMAIL
--    at the top of the file. (The DB check above is what actually
--    keeps everyone else out — the JS one just makes the panel
--    redirect non-admins instantly instead of showing errors.)
-- =====================================================================
