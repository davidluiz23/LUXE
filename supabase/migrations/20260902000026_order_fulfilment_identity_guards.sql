-- Follow-up guards for the lifecycle email/package migration.
--
-- Package identity creation belongs to the order transition itself so provider
-- driven transitions (for example a verified Paystack payment) receive the
-- same private reference as an admin-driven transition.

begin;

create or replace function public.generate_internal_package_id_v1()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate text;
  v_attempts integer := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    v_candidate := 'ALK-PKG-' || upper(
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    );

    if not exists (
      select 1
      from public.order_admin_state s
      where s.internal_package_id = v_candidate
    ) then
      return v_candidate;
    end if;

    if v_attempts >= 32 then
      raise exception 'A unique package identity could not be generated';
    end if;
  end loop;
end;
$$;

revoke all on function public.generate_internal_package_id_v1()
  from public, anon, authenticated;

create or replace function public.ensure_internal_package_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
begin
  if new.status not in ('processing', 'confirmed', 'shipped', 'delivered') then
    return new;
  end if;

  select u.email::text into v_actor_email
  from auth.users u
  join public.admin_users a on a.user_id = u.id
  where u.id = v_actor
    and a.role in ('owner', 'admin');

  insert into public.order_admin_state as current_state (
    order_id, admin_user_id, admin_email, action, changed_at,
    internal_package_id, package_assigned_at
  ) values (
    new.id,
    case when v_actor_email is null then null else v_actor end,
    coalesce(v_actor_email, 'system@alkebulan.internal'),
    'order_package_assigned_automatically',
    now(),
    public.generate_internal_package_id_v1(),
    now()
  )
  on conflict (order_id) do update set
    internal_package_id = coalesce(
      current_state.internal_package_id,
      excluded.internal_package_id
    ),
    package_assigned_at = coalesce(
      current_state.package_assigned_at,
      excluded.package_assigned_at
    )
  where current_state.internal_package_id is null;

  return new;
end;
$$;

revoke all on function public.ensure_internal_package_identity_v1()
  from public, anon, authenticated;

drop trigger if exists orders_assign_internal_package_on_insert on public.orders;
create trigger orders_assign_internal_package_on_insert
after insert on public.orders
for each row execute function public.ensure_internal_package_identity_v1();

drop trigger if exists orders_assign_internal_package_on_status on public.orders;
create trigger orders_assign_internal_package_on_status
after update of status on public.orders
for each row execute function public.ensure_internal_package_identity_v1();

create or replace function public.enforce_paid_before_fulfilment_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(coalesce(new.payment_provider, '')) = 'paystack'
     and new.status in ('processing', 'confirmed', 'shipped', 'delivered')
     and lower(coalesce(new.payment_status, '')) <> 'paid'
  then
    raise exception 'Payment must be confirmed before fulfilment can begin';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_paid_before_fulfilment_v1()
  from public, anon, authenticated;

drop trigger if exists orders_require_payment_before_fulfilment on public.orders;
create trigger orders_require_payment_before_fulfilment
before update of status on public.orders
for each row execute function public.enforce_paid_before_fulfilment_v1();

drop trigger if exists orders_require_payment_before_fulfilment_insert on public.orders;
create trigger orders_require_payment_before_fulfilment_insert
before insert on public.orders
for each row execute function public.enforce_paid_before_fulfilment_v1();

-- Assign an identity to orders that had already entered fulfilment before this
-- trigger was installed. Existing identities and attribution remain unchanged.
insert into public.order_admin_state as current_state (
  order_id, admin_user_id, admin_email, action, changed_at,
  internal_package_id, package_assigned_at
)
select
  o.id,
  null,
  'system@alkebulan.internal',
  'order_package_assigned_backfill',
  now(),
  public.generate_internal_package_id_v1(),
  now()
from public.orders o
left join public.order_admin_state s on s.order_id = o.id
where o.status in ('processing', 'confirmed', 'shipped', 'delivered')
  and s.internal_package_id is null
on conflict (order_id) do update set
  internal_package_id = coalesce(
    current_state.internal_package_id,
    excluded.internal_package_id
  ),
  package_assigned_at = coalesce(
    current_state.package_assigned_at,
    excluded.package_assigned_at
  )
where current_state.internal_package_id is null;

commit;
