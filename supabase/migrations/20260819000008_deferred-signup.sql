-- =====================================================================
-- LUXE — DEFERRED SIGNUP
-- Migration: 20260819000008_deferred-signup.sql
--
-- Goal:
-- - No auth.users row is created when "Create Account" is clicked.
-- - A short-lived pending signup stores only name/email + a HASHED token.
-- - The real Auth user is created only after the email link is opened
--   and the user chooses a password.
-- =====================================================================

begin;

create table if not exists public.pending_signups (
  email text primary key,
  full_name text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  send_count integer not null default 1 check (send_count >= 0),
  window_started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.pending_signups enable row level security;

-- Browser clients never read/write pending registrations directly.
revoke all on table public.pending_signups
from public, anon, authenticated;

grant select, insert, update, delete
on table public.pending_signups
to service_role;

-- Server-only helper for checking whether an Auth account already exists.
-- auth.users is not exposed to the browser/Data API.
create or replace function public.deferred_signup_email_exists(
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(p_email))
  );
$$;

revoke all
on function public.deferred_signup_email_exists(text)
from public, anon, authenticated;

grant execute
on function public.deferred_signup_email_exists(text)
to service_role;

commit;
