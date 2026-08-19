-- =====================================================================
-- LUXE admin v2 — run this ONCE in Supabase (after the two earlier
-- migrations already applied):
-- Dashboard → SQL Editor → New query → paste all of this → Run
--
-- This adds:
--   1. An `admins` table — so you can have MULTIPLE people managing
--      products/updates, not just one hardcoded email. Whoever is in
--      this table can use the admin panel; anyone already in the
--      table can add or remove others.
--   2. A public Storage bucket (`luxe-uploads`) so product photos and
--      profile pictures can be uploaded directly from a device,
--      instead of only pasting an external image URL.
--   3. Updated the products/site_updates write policies from
--      "check this exact hardcoded email" to "check the admins table"
--      — everything else about the security model is unchanged
--      (public read, DB-enforced writes).
--
-- >>> Replace 'owner@example.com' below with YOUR real login email <<<
-- (appears once — it seeds the very first admin row so you're not
-- locked out. Once logged into admin.html, add any teammates from
-- the Team tab — no more editing SQL after this.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ADMINS  (who is allowed to manage the store)
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email text primary key,
  full_name text,
  added_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Only people who are already admins can see the team list — this
-- also doubles as the "am I an admin?" check the panel runs on login
-- (a non-admin's query simply returns zero rows, which the frontend
-- reads as "not authorized").
create policy "admins_select_admins" on public.admins
  for select using (
    exists (select 1 from public.admins a2 where a2.email = auth.jwt() ->> 'email')
  );

create policy "admins_insert_admins" on public.admins
  for insert with check (
    exists (select 1 from public.admins a2 where a2.email = auth.jwt() ->> 'email')
  );

create policy "admins_delete_admins" on public.admins
  for delete using (
    exists (select 1 from public.admins a2 where a2.email = auth.jwt() ->> 'email')
  );

-- Seed the first admin so you're not locked out of your own panel.
insert into public.admins (email, full_name)
values ('ambrosebishop26@gmail.com', 'Owner')
on conflict (email) do nothing;


-- ---------------------------------------------------------------------
-- 2. SWITCH products/site_updates WRITE ACCESS TO THE ADMINS TABLE
-- ---------------------------------------------------------------------
drop policy if exists "products_insert_owner" on public.products;
drop policy if exists "products_update_owner" on public.products;
drop policy if exists "products_delete_owner" on public.products;

create policy "products_insert_admin" on public.products
  for insert with check (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

create policy "products_update_admin" on public.products
  for update using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

create policy "products_delete_admin" on public.products
  for delete using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

drop policy if exists "updates_insert_owner" on public.site_updates;
drop policy if exists "updates_delete_owner" on public.site_updates;

create policy "updates_insert_admin" on public.site_updates
  for insert with check (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

create policy "updates_delete_admin" on public.site_updates
  for delete using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );


-- ---------------------------------------------------------------------
-- 3. STORAGE  (product photo + avatar uploads, kept at full quality —
--    this is just object storage, nothing here compresses or resizes
--    the file; whatever bytes get uploaded are the bytes served back)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('luxe-uploads', 'luxe-uploads', true)
on conflict (id) do nothing;

-- Anyone can VIEW files in this bucket (product photos and avatars
-- are both meant to be publicly visible on the storefront).
create policy "luxe_uploads_public_read" on storage.objects
  for select using (bucket_id = 'luxe-uploads');

-- Only admins can upload/replace/remove files under products/*
create policy "luxe_uploads_admin_insert_products" on storage.objects
  for insert with check (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'products'
    and exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

create policy "luxe_uploads_admin_update_products" on storage.objects
  for update using (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'products'
    and exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

create policy "luxe_uploads_admin_delete_products" on storage.objects
  for delete using (
    bucket_id = 'luxe-uploads'
    and (storage.foldername(name))[1] = 'products'
    and exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

-- Any signed-in user can upload/replace/remove ONLY their own avatar
-- — the folder path must be avatars/<their own user id>/...
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

-- Note: public.profiles.avatar_url already exists from the very first
-- migration (20260818000000_luxe-db.sql) — nothing to add there.

-- =====================================================================
-- Done. Two things left:
-- 1. Replace 'owner@example.com' above with your real email, THEN run
--    this whole file in Supabase SQL editor.
-- 2. Log into admin.html — you'll land on the Team tab automatically
--    if you want to add anyone else. No more SQL editing after this;
--    admins can add/remove other admins straight from the panel.
-- =====================================================================
