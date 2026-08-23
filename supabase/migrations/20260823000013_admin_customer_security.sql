-- Customer security intelligence, reversible account suspension and
-- attributable admin operations.

create table if not exists public.customer_account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended')),
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  suspension_reason text,
  updated_at timestamptz not null default now()
);

create index if not exists customer_account_state_status_idx
  on public.customer_account_state (account_status, updated_at desc);

alter table public.customer_account_state enable row level security;
revoke all on table public.customer_account_state from anon, authenticated;

alter table public.orders
  add column if not exists payment_channel text,
  add column if not exists payment_method_label text;

create table if not exists public.order_admin_state (
  order_id uuid primary key references public.orders(id) on delete cascade,
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text not null,
  action text not null,
  changed_at timestamptz not null default now()
);

alter table public.order_admin_state enable row level security;
revoke all on table public.order_admin_state from anon, authenticated;

create index if not exists admin_action_log_target_created_idx
  on public.admin_action_log (target_type, target_id, created_at desc);

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
      then 'Your LUXE account access has been suspended. Contact customer care if you need help.'
      else 'Your LUXE account access has been restored.'
    end);
end;
$$;

revoke all on function public.service_record_account_suspension(uuid, uuid, boolean, text) from public;
grant execute on function public.service_record_account_suspension(uuid, uuid, boolean, text) to service_role;

-- A suspended user's existing JWT may remain valid briefly. This database
-- guard blocks new orders even before that token expires.
create or replace function public.prevent_suspended_customer_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.customer_account_state s
    where s.user_id = new.user_id and s.account_status = 'suspended'
  ) or exists (
    select 1 from auth.users u
    where u.id = new.user_id and u.banned_until is not null and u.banned_until > now()
  ) then
    raise exception 'This account is suspended and cannot place orders';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_prevent_suspended_customer on public.orders;
create trigger orders_prevent_suspended_customer
before insert on public.orders
for each row execute function public.prevent_suspended_customer_order();

-- Filter customers before aggregating their orders so search stays responsive
-- as transaction volume grows.
drop function if exists public.admin_list_customers(text, integer);
create function public.admin_list_customers(
  p_search text default '',
  p_limit integer default 100
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  whatsapp_phone text,
  email_updates boolean,
  whatsapp_updates boolean,
  account_status text,
  order_count bigint,
  total_spent numeric,
  payment_methods text[],
  last_order_at timestamptz,
  last_sign_in_at timestamptz,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(trim(coalesce(p_search, '')));
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if length(v_search) > 100 then raise exception 'Search is too long'; end if;

  return query
  with candidates as (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
      p.full_name, p.whatsapp_phone, p.whatsapp_verified_at,
      p.email_updates_opt_in_at, p.whatsapp_updates_opt_in_at,
      case when u.banned_until is not null and u.banned_until > now()
        then 'suspended' else coalesce(s.account_status, 'active') end as account_status
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.customer_account_state s on s.user_id = u.id
    where v_search = ''
       or position(v_search in lower(coalesce(u.email::text, ''))) > 0
       or position(v_search in lower(coalesce(p.full_name, ''))) > 0
       or position(v_search in lower(coalesce(p.whatsapp_phone, p.phone, ''))) > 0
       or exists (
         select 1 from public.orders so
         where so.user_id = u.id
           and position(v_search in lower(so.order_number)) > 0
       )
    order by u.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 100))
  )
  select c.id, c.email::text, c.full_name,
    case when c.whatsapp_verified_at is not null then c.whatsapp_phone else null end,
    c.email_updates_opt_in_at is not null,
    c.whatsapp_updates_opt_in_at is not null,
    c.account_status,
    coalesce(stats.order_count, 0), coalesce(stats.total_spent, 0),
    coalesce(stats.payment_methods, array[]::text[]), stats.last_order_at,
    c.last_sign_in_at, c.created_at
  from candidates c
  left join lateral (
    select count(o.id) as order_count,
      coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as total_spent,
      array_agg(distinct coalesce(o.payment_method_label, o.payment_channel, o.payment_provider))
        filter (where o.payment_provider is not null) as payment_methods,
      max(o.created_at) as last_order_at
    from public.orders o where o.user_id = c.id
  ) stats on true
  order by stats.last_order_at desc nulls last, c.created_at desc;
end;
$$;

revoke all on function public.admin_list_customers(text, integer) from public;
grant execute on function public.admin_list_customers(text, integer) to authenticated;

create or replace function public.admin_customer_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_payment_methods jsonb := '[]'::jsonb;
  v_admin_activity jsonb := '[]'::jsonb;
  v_login_history jsonb := '[]'::jsonb;
  v_auth_audit_available boolean := false;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;

  select jsonb_build_object(
    'userId', u.id, 'email', u.email, 'fullName', p.full_name,
    'phone', p.phone, 'whatsappPhone', case when p.whatsapp_verified_at is not null then p.whatsapp_phone end,
    'whatsappVerifiedAt', p.whatsapp_verified_at,
    'emailUpdates', p.email_updates_opt_in_at is not null,
    'whatsappUpdates', p.whatsapp_updates_opt_in_at is not null,
    'accountStatus', case when u.banned_until is not null and u.banned_until > now()
      then 'suspended' else coalesce(s.account_status, 'active') end,
    'suspendedAt', s.suspended_at, 'suspensionReason', s.suspension_reason,
    'suspendedByEmail', suspender.email,
    'joinedAt', u.created_at, 'lastSignInAt', u.last_sign_in_at,
    'emailConfirmedAt', u.email_confirmed_at,
    'orderCount', (select count(*) from public.orders co where co.user_id = u.id),
    'totalSpent', (select coalesce(sum(co.total), 0) from public.orders co where co.user_id = u.id and co.status <> 'cancelled')
  ) into v_customer
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.customer_account_state s on s.user_id = u.id
  left join auth.users suspender on suspender.id = s.suspended_by
  where u.id = p_user_id;

  if v_customer is null then raise exception 'Customer account not found'; end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb)
  into v_orders
  from (
    select o.id, o.order_number, o.status, o.payment_provider,
      o.payment_status, o.payment_reference, o.payment_channel,
      o.payment_method_label, o.currency, o.subtotal,
      o.discount_amount, o.shipping, o.tax, o.total, o.promotion_code,
      o.created_at, o.updated_at, s.admin_email as last_admin_email,
      s.action as last_admin_action, s.changed_at as last_admin_changed_at
    from public.orders o
    left join public.order_admin_state s on s.order_id = o.id
    where o.user_id = p_user_id
    order by o.created_at desc
    limit 50
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', q.payment_provider, 'channel', q.payment_channel,
    'label', q.payment_method_label, 'orders', q.order_count,
    'successfulOrders', q.successful_count, 'total', q.total,
    'lastUsedAt', q.last_used_at
  ) order by q.last_used_at desc), '[]'::jsonb)
  into v_payment_methods
  from (
    select o.payment_provider, o.payment_channel, o.payment_method_label, count(*) as order_count,
      count(*) filter (where o.payment_status = 'paid') as successful_count,
      coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as total,
      max(o.created_at) as last_used_at
    from public.orders o where o.user_id = p_user_id
    group by o.payment_provider, o.payment_channel, o.payment_method_label
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'adminEmail', q.admin_email, 'action', q.action,
    'targetType', q.target_type, 'details', q.details, 'createdAt', q.created_at
  ) order by q.created_at desc), '[]'::jsonb)
  into v_admin_activity
  from (
    select l.id, au.email::text as admin_email, l.action,
      l.target_type, l.details, l.created_at
    from public.admin_action_log l
    join auth.users au on au.id = l.admin_user_id
    where (l.target_type = 'customer' and l.target_id = p_user_id::text)
       or (l.target_type = 'order' and exists (
         select 1 from public.orders o
         where o.id::text = l.target_id and o.user_id = p_user_id
       ))
    order by l.created_at desc
    limit 50
  ) q;

  -- Auth audit storage is optional and its table is owned by the auth schema.
  -- Dynamic SQL keeps this function deployable when database audit storage is off.
  if to_regclass('auth.audit_log_entries') is not null then
    begin
      execute $audit$
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'action', q.action, 'ipAddress', q.ip_address,
          'userAgent', q.user_agent, 'createdAt', q.created_at
        ) order by q.created_at desc), '[]'::jsonb)
        from (
          select id::text,
            coalesce(payload->>'action', 'auth_event') as action,
            coalesce(nullif(ip_address::text, ''), 'Unknown') as ip_address,
            coalesce(payload->>'user_agent', payload->'traits'->>'user_agent', 'Unknown') as user_agent,
            created_at
          from auth.audit_log_entries
          where (payload->>'actor_id' = $1 or payload->>'user_id' = $1)
            and coalesce(payload->>'action', '') in ('login', 'mfa_code_login', 'user_signedup')
          order by created_at desc
          limit 50
        ) q
      $audit$ into v_login_history using p_user_id::text;
      v_auth_audit_available := true;
    exception when others then
      v_login_history := '[]'::jsonb;
      v_auth_audit_available := false;
    end;
  end if;

  return jsonb_build_object(
    'customer', v_customer, 'orders', v_orders,
    'paymentMethods', v_payment_methods,
    'loginHistory', v_login_history,
    'authAuditAvailable', v_auth_audit_available,
    'adminActivity', v_admin_activity
  );
end;
$$;

revoke all on function public.admin_customer_detail(uuid) from public;
grant execute on function public.admin_customer_detail(uuid) to authenticated;

-- Order confirmations and fulfilment changes carry an administrator snapshot
-- for fast display and a detailed immutable audit entry.
create or replace function public.admin_update_order(
  p_order_id uuid,
  p_status text,
  p_estimated_min_days integer default null,
  p_estimated_max_days integer default null,
  p_waybill_url text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.orders%rowtype;
  v_order public.orders%rowtype;
  v_admin_email text;
  v_action text := 'order_updated';
  v_waybill text := nullif(trim(coalesce(p_waybill_url, '')), '');
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_status not in ('pending_confirmation', 'awaiting_payment', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Invalid order status';
  end if;
  if p_estimated_min_days is not null and (p_estimated_min_days < 1 or p_estimated_min_days > 90) then raise exception 'Invalid minimum delivery estimate'; end if;
  if p_estimated_max_days is not null and (p_estimated_max_days < coalesce(p_estimated_min_days, 1) or p_estimated_max_days > 120) then raise exception 'Invalid maximum delivery estimate'; end if;
  if length(coalesce(p_waybill_url, '')) > 1000 then raise exception 'Waybill URL is too long'; end if;
  if v_waybill is not null and v_waybill !~* '^https?://' then raise exception 'Waybill URL must start with http:// or https://'; end if;

  select * into v_old from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if v_old.status is not distinct from p_status
     and v_old.estimated_delivery_min_days is not distinct from p_estimated_min_days
     and v_old.estimated_delivery_max_days is not distinct from p_estimated_max_days
     and v_old.waybill_url is not distinct from v_waybill
  then return v_old; end if;

  select email::text into v_admin_email from auth.users where id = auth.uid();
  v_action := case p_status
    when 'confirmed' then 'order_confirmed'
    when 'shipped' then 'order_shipped'
    when 'delivered' then 'order_delivered'
    when 'cancelled' then 'order_cancelled'
    else 'order_updated'
  end;

  update public.orders set
    status = p_status,
    estimated_delivery_min_days = p_estimated_min_days,
    estimated_delivery_max_days = p_estimated_max_days,
    waybill_url = v_waybill,
    admin_seen_at = coalesce(admin_seen_at, now()), updated_at = now()
  where id = p_order_id returning * into v_order;

  insert into public.order_admin_state (
    order_id, admin_user_id, admin_email, action, changed_at
  ) values (p_order_id, auth.uid(), v_admin_email, v_action, now())
  on conflict (order_id) do update set
    admin_user_id = excluded.admin_user_id,
    admin_email = excluded.admin_email,
    action = excluded.action,
    changed_at = excluded.changed_at;

  insert into public.admin_action_log (admin_user_id, action, target_type, target_id, details)
  values (auth.uid(), v_action, 'order', p_order_id::text, jsonb_build_object(
    'orderNumber', v_old.order_number, 'fromStatus', v_old.status,
    'toStatus', p_status, 'estimatedMinDays', p_estimated_min_days,
    'estimatedMaxDays', p_estimated_max_days,
    'waybillChanged', v_old.waybill_url is distinct from v_waybill
  ));
  return v_order;
end;
$$;

revoke all on function public.admin_update_order(uuid, text, integer, integer, text) from public;
grant execute on function public.admin_update_order(uuid, text, integer, integer, text) to authenticated;

create or replace function public.admin_update_order_v2(
  p_order_id uuid,
  p_status text,
  p_estimated_min_days integer default null,
  p_estimated_max_days integer default null,
  p_waybill_url text default null,
  p_expected_updated_at timestamptz default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_updated_at timestamptz;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  select updated_at into v_current_updated_at
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_expected_updated_at is not null and v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'This order was changed by another administrator. Refresh before saving.';
  end if;
  return public.admin_update_order(
    p_order_id, p_status, p_estimated_min_days,
    p_estimated_max_days, p_waybill_url
  );
end;
$$;

revoke all on function public.admin_update_order_v2(uuid, text, integer, integer, text, timestamptz) from public;
grant execute on function public.admin_update_order_v2(uuid, text, integer, integer, text, timestamptz) to authenticated;

create or replace function public.admin_list_orders_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  return (
    select coalesce(jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'order_items', coalesce((
          select jsonb_agg(to_jsonb(oi) order by oi.id)
          from public.order_items oi where oi.order_id = o.id
        ), '[]'::jsonb),
        'last_admin_email', s.admin_email,
        'last_admin_action', s.action,
        'last_admin_changed_at', s.changed_at
      ) order by o.created_at desc
    ), '[]'::jsonb)
    from public.orders o
    left join public.order_admin_state s on s.order_id = o.id
  );
end;
$$;

revoke all on function public.admin_list_orders_v2() from public;
grant execute on function public.admin_list_orders_v2() to authenticated;

-- Automatically record direct catalog, update, and team changes made through
-- authenticated admin policies/RPCs without storing full customer/product data.
create or replace function public.audit_admin_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_actor uuid := auth.uid();
  v_target_id text;
  v_target_name text;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  if v_actor is null or not public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_target_id := coalesce(v_row->>'id', v_row->>'user_id');
  v_target_name := coalesce(v_row->>'name', v_row->>'title', v_row->>'email');
  insert into public.admin_action_log (admin_user_id, action, target_type, target_id, details)
  values (v_actor, lower(tg_table_name || '_' || tg_op), tg_table_name, v_target_id,
    jsonb_build_object('label', v_target_name));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists products_admin_audit on public.products;
create trigger products_admin_audit after insert or update or delete on public.products
for each row execute function public.audit_admin_table_change();

drop trigger if exists site_updates_admin_audit on public.site_updates;
create trigger site_updates_admin_audit after insert or update or delete on public.site_updates
for each row execute function public.audit_admin_table_change();

drop trigger if exists admin_users_admin_audit on public.admin_users;
create trigger admin_users_admin_audit after insert or update or delete on public.admin_users
for each row execute function public.audit_admin_table_change();
