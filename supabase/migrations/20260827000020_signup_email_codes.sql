-- Add a short-lived, hashed six-digit code alongside the existing signup link.
-- Browser clients still have no direct access to pending signup records.

begin;

alter table public.pending_signups
  add column if not exists code_hash text,
  add column if not exists failed_code_attempts integer not null default 0;

alter table public.pending_signups
  drop constraint if exists pending_signups_failed_code_attempts_check;

alter table public.pending_signups
  add constraint pending_signups_failed_code_attempts_check
  check (failed_code_attempts between 0 and 10);

create or replace function public.increment_pending_signup_code_attempts(
  p_email text
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.pending_signups
  set failed_code_attempts = least(failed_code_attempts + 1, 10)
  where email = lower(trim(p_email));
$$;

revoke all
on function public.increment_pending_signup_code_attempts(text)
from public, anon, authenticated;

grant execute
on function public.increment_pending_signup_code_attempts(text)
to service_role;

commit;
