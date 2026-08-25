-- Remove the retired working name from customer-visible database content.

alter table public.products
  alter column brand set default 'ALKEBULAN';

update public.products
set brand = regexp_replace(brand, 'LUXE', 'ALKEBULAN', 'gi')
where brand ~* 'LUXE';

update public.site_updates
set
  title = regexp_replace(title, 'LUXE', 'ALKEBULAN', 'gi'),
  message = regexp_replace(message, 'LUXE', 'ALKEBULAN', 'gi')
where title ~* 'LUXE' or message ~* 'LUXE';

update public.user_notifications
set
  title = regexp_replace(title, 'LUXE', 'ALKEBULAN', 'gi'),
  message = regexp_replace(message, 'LUXE', 'ALKEBULAN', 'gi')
where title ~* 'LUXE' or message ~* 'LUXE';

update public.admin_message_deliveries
set
  title = regexp_replace(title, 'LUXE', 'ALKEBULAN', 'gi'),
  message = regexp_replace(message, 'LUXE', 'ALKEBULAN', 'gi')
where title ~* 'LUXE' or message ~* 'LUXE';

create or replace function public.create_welcome_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_notifications (user_id, kind, title, message)
  values (
    new.id,
    'welcome',
    'Welcome to ALKEBULAN',
    'Your account is ready. Save your contact details, discover the collection, and track every order here.'
  );
  return new;
end;
$$;

create or replace function public.service_record_account_suspension(
  p_admin_user_id uuid,
  p_user_id uuid,
  p_suspended boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  v_customer_name text;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Service permission required';
  end if;
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = p_admin_user_id and a.role in ('owner', 'admin')
  ) then raise exception 'Admin permission required'; end if;
  if p_admin_user_id = p_user_id then raise exception 'Administrators cannot suspend themselves'; end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user_id) then
    raise exception 'Admin accounts must be managed through Team Management';
  end if;
  if length(v_reason) < 5 or length(v_reason) > 300 then
    raise exception 'A reason between 5 and 300 characters is required';
  end if;

  select p.full_name into v_customer_name from public.profiles p where p.id = p_user_id;
  if not found then raise exception 'Customer profile not found'; end if;

  insert into public.customer_account_state (
    user_id, account_status, suspended_at, suspended_by,
    suspension_reason, updated_at
  ) values (
    p_user_id, case when p_suspended then 'suspended' else 'active' end,
    case when p_suspended then now() else null end,
    case when p_suspended then p_admin_user_id else null end,
    case when p_suspended then v_reason else null end, now()
  )
  on conflict (user_id) do update set
    account_status = excluded.account_status,
    suspended_at = excluded.suspended_at,
    suspended_by = excluded.suspended_by,
    suspension_reason = excluded.suspension_reason,
    updated_at = excluded.updated_at;

  insert into public.admin_action_log (admin_user_id, action, target_type, target_id, details)
  values (p_admin_user_id,
    case when p_suspended then 'customer_suspended' else 'customer_reactivated' end,
    'customer', p_user_id::text,
    jsonb_build_object('reason', v_reason, 'customerName', v_customer_name));

  insert into public.user_notifications (user_id, kind, title, message)
  values (p_user_id, 'account',
    case when p_suspended then 'Account access suspended' else 'Account access restored' end,
    case when p_suspended
      then 'Your ALKEBULAN account access has been suspended. Contact customer care if you need help.'
      else 'Your ALKEBULAN account access has been restored.'
    end);
end;
$$;

revoke all on function public.service_record_account_suspension(uuid, uuid, boolean, text) from public;
grant execute on function public.service_record_account_suspension(uuid, uuid, boolean, text) to service_role;

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
      'No ALKEBULAN account found for that email. They need to sign up first.';
  end if;

  insert into public.admin_users (user_id, role)
  values (v_user_id, 'admin')
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.admin_add_by_email(text) from public;
grant execute on function public.admin_add_by_email(text) to authenticated;
