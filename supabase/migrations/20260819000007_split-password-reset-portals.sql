-- =====================================================================
-- LUXE — SPLIT PASSWORD RESET PORTALS
-- Migration: 20260819000007_split-password-reset-portals.sql
--
-- Provides a service-role-only helper used by the password-reset Edge
-- Function. Browser roles cannot call this helper, preventing direct
-- email/account-type discovery through the Data API.
-- =====================================================================

begin;

create or replace function public.password_reset_account_type(
  p_email text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.id is null then 'none'
    when a.user_id is not null then 'admin'
    else 'customer'
  end
  from (values (lower(trim(p_email)))) as input(email)
  left join auth.users u
    on lower(u.email) = input.email
  left join public.admin_users a
    on a.user_id = u.id
  limit 1;
$$;

revoke all
on function public.password_reset_account_type(text)
from public, anon, authenticated;

grant execute
on function public.password_reset_account_type(text)
to service_role;

commit;
