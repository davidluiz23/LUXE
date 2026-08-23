-- Reliable admin order writes and separate protected commerce histories.

alter table public.orders
  add column if not exists admin_version bigint not null default 0;

create or replace function public.bump_order_admin_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     or new.payment_status is distinct from old.payment_status
     or new.payment_reference is distinct from old.payment_reference
     or new.payment_channel is distinct from old.payment_channel
     or new.payment_method_label is distinct from old.payment_method_label
     or new.estimated_delivery_min_days is distinct from old.estimated_delivery_min_days
     or new.estimated_delivery_max_days is distinct from old.estimated_delivery_max_days
     or new.waybill_url is distinct from old.waybill_url
  then
    new.admin_version := old.admin_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_bump_admin_version on public.orders;
create trigger orders_bump_admin_version
before update on public.orders
for each row execute function public.bump_order_admin_version();

create or replace function public.admin_update_order_v3(
  p_order_id uuid,
  p_status text,
  p_estimated_min_days integer default null,
  p_estimated_max_days integer default null,
  p_waybill_url text default null,
  p_expected_version bigint default null
)
returns jsonb
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
  if p_estimated_min_days is not null and (p_estimated_min_days < 1 or p_estimated_min_days > 90) then
    raise exception 'Invalid minimum delivery estimate';
  end if;
  if p_estimated_max_days is not null and (p_estimated_max_days < coalesce(p_estimated_min_days, 1) or p_estimated_max_days > 120) then
    raise exception 'Invalid maximum delivery estimate';
  end if;
  if length(coalesce(p_waybill_url, '')) > 1000 then raise exception 'Waybill URL is too long'; end if;
  if v_waybill is not null and v_waybill !~* '^https?://' then
    raise exception 'Waybill URL must start with http:// or https://';
  end if;

  select * into v_old
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if p_expected_version is not null and v_old.admin_version <> p_expected_version then
    raise exception 'ORDER_CONFLICT: This order was changed by another administrator. Refresh before saving.';
  end if;

  if v_old.status is not distinct from p_status
     and v_old.estimated_delivery_min_days is not distinct from p_estimated_min_days
     and v_old.estimated_delivery_max_days is not distinct from p_estimated_max_days
     and v_old.waybill_url is not distinct from v_waybill
  then
    return jsonb_build_object('changed', false, 'order', to_jsonb(v_old));
  end if;

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
    admin_seen_at = coalesce(admin_seen_at, now()),
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_admin_state (
    order_id, admin_user_id, admin_email, action, changed_at
  ) values (p_order_id, auth.uid(), v_admin_email, v_action, now())
  on conflict (order_id) do update set
    admin_user_id = excluded.admin_user_id,
    admin_email = excluded.admin_email,
    action = excluded.action,
    changed_at = excluded.changed_at;

  insert into public.admin_action_log (
    admin_user_id, action, target_type, target_id, details
  ) values (
    auth.uid(), v_action, 'order', p_order_id::text,
    jsonb_build_object(
      'orderNumber', v_old.order_number,
      'fromStatus', v_old.status,
      'toStatus', p_status,
      'estimatedMinDays', p_estimated_min_days,
      'estimatedMaxDays', p_estimated_max_days,
      'waybillChanged', v_old.waybill_url is distinct from v_waybill,
      'version', v_order.admin_version
    )
  );

  return jsonb_build_object('changed', true, 'order', to_jsonb(v_order));
end;
$$;

revoke all on function public.admin_update_order_v3(uuid, text, integer, integer, text, bigint) from public;
grant execute on function public.admin_update_order_v3(uuid, text, integer, integer, text, bigint) to authenticated;

create or replace function public.admin_customer_commerce_history(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_orders jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Customer account not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'orderNumber', o.order_number,
    'status', o.status,
    'currency', o.currency,
    'subtotal', o.subtotal,
    'discountAmount', o.discount_amount,
    'shipping', o.shipping,
    'tax', o.tax,
    'total', o.total,
    'promotionCode', o.promotion_code,
    'estimatedMinDays', o.estimated_delivery_min_days,
    'estimatedMaxDays', o.estimated_delivery_max_days,
    'waybillUrl', o.waybill_url,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productName', oi.product_name,
        'quantity', oi.quantity,
        'unitPrice', oi.price
      ) order by oi.id)
      from public.order_items oi
      where oi.order_id = o.id
    ), '[]'::jsonb)
  ) order by o.created_at desc), '[]'::jsonb)
  into v_orders
  from public.orders o
  where o.user_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', o.id,
    'orderNumber', o.order_number,
    'provider', o.payment_provider,
    'channel', o.payment_channel,
    'methodLabel', o.payment_method_label,
    'status', o.payment_status,
    'reference', o.payment_reference,
    'currency', o.currency,
    'amount', o.total,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at
  ) order by o.created_at desc), '[]'::jsonb)
  into v_transactions
  from public.orders o
  where o.user_id = p_user_id;

  return jsonb_build_object(
    'orderHistory', v_orders,
    'transactionHistory', v_transactions
  );
end;
$$;

revoke all on function public.admin_customer_commerce_history(uuid) from public;
grant execute on function public.admin_customer_commerce_history(uuid) to authenticated;

