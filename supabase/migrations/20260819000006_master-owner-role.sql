-- =====================================================================
-- LUXE — ADMIN ROLE CONVERGENCE PATCH
-- Migration: 20260819000006_master-owner-role.sql
--
-- WHY THIS EXISTS
-- 20260819000005 has already been recorded as applied remotely, but the
-- local 00005 file was later improved. Supabase migration history tracks
-- the VERSION, not a content hash, so changed contents of an already-
-- applied migration are never replayed automatically.
--
-- This 00006 safely converges either possible remote state:
--   A) older 00005: UUID admins, but no owner/admin role hierarchy
--   B) newer 00005: owner/admin hierarchy already present
--
-- It does NOT replay products, orders, storage or the full consolidation.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. NORMALIZE admin_users
-- ---------------------------------------------------------------------

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

do $$
begin
  -- 00002 originally used created_at.
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
      add column role text;
  end if;
end
$$;

-- Normalize unexpected/null role values before enforcing the constraint.
update public.admin_users
set role = 'admin'
where role is null
   or role not in ('owner', 'admin');

alter table public.admin_users
  alter column role set default 'admin';

alter table public.admin_users
  alter column role set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_role_check'
      and conrelid = 'public.admin_users'::regclass
  )
  then
    alter table public.admin_users
      add constraint admin_users_role_check
      check (role in ('owner', 'admin'));
  end if;
end
$$;

alter table public.admin_users enable row level security;

-- Browsers never manage this table directly. Team changes must go
-- through the SECURITY DEFINER functions below.
revoke all on table public.admin_users from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. ESTABLISH ONE MASTER OWNER
-- ---------------------------------------------------------------------
-- If the newer 00005 already created an owner, this is a no-op.
--
-- If the remote DB still has the older schema, the oldest admin row is
-- the original administrator that existed before teammates could be
-- added. That original row is promoted once.

do $$
begin
  if exists (
    select 1
    from public.admin_users
  )
  and not exists (
    select 1
    from public.admin_users
    where role = 'owner'
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

-- Never silently accept two owners.
do $$
declare
  v_owner_count integer;
begin
  select count(*)
  into v_owner_count
  from public.admin_users
  where role = 'owner';

  if v_owner_count > 1 then
    raise exception
      'More than one owner exists in admin_users. Resolve this before continuing.';
  end if;
end
$$;

create unique index if not exists admin_users_single_owner_idx
  on public.admin_users (role)
  where role = 'owner';

-- ---------------------------------------------------------------------
-- 3. ROLE CHECKS
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 4. OWNER-ONLY TEAM LIST
-- ---------------------------------------------------------------------
-- Older list_admins() versions returned a different table shape, so
-- DROP + CREATE is required; CREATE OR REPLACE cannot change RETURNS TABLE.

drop function if exists public.list_admins();

create function public.list_admins()
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
  join auth.users u
    on u.id = a.user_id
  left join public.profiles p
    on p.id = a.user_id
  order by
    case when a.role = 'owner' then 0 else 1 end,
    a.added_at asc;
end;
$$;

revoke all on function public.list_admins() from public;
grant execute on function public.list_admins() to authenticated;

-- ---------------------------------------------------------------------
-- 5. OWNER-ONLY TEAM CHANGES
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 6. CONVERGENCE FOR PRODUCT-ID SEQUENCE PERMISSION
-- ---------------------------------------------------------------------
-- Newer 00005 explicitly grants this. Add it here too in case the
-- remote database received the older 00005 version.

do $$
begin
  if to_regclass('public.products_id_seq') is not null then
    grant usage, select
    on sequence public.products_id_seq
    to authenticated;
  end if;
end
$$;

commit;

-- =====================================================================
-- POSTCHECK
--
-- In Supabase SQL Editor:
--
-- select
--   a.user_id,
--   u.email,
--   a.role,
--   a.added_at
-- from public.admin_users a
-- join auth.users u on u.id = a.user_id
-- order by a.added_at;
--
-- Expected:
-- - exactly one row with role = 'owner'
-- - every other team member has role = 'admin'
-- =====================================================================
