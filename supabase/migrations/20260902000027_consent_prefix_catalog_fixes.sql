begin;

-- The storefront already reads and renders products.review_count, but the
-- column was never created in the schema. Add it with a safe default so the
-- live catalog query and rating summaries work.
alter table public.products
  add column if not exists review_count integer not null default 0;

alter table public.products
  drop constraint if exists products_review_count_nonnegative;
alter table public.products
  add constraint products_review_count_nonnegative
  check (review_count >= 0);

-- Re-issued create_order_secure_v3 with:
--  * consent required only for WhatsApp-channel orders,
--  * whatsapp_opt_in_at recorded only when consent was actually given,
--  * ALK- order number prefix (matches alk-#### product refs / ALK-PKG- ids),
--  * provider-aware customer notification copy.
create or replace function public.create_order_secure_v3(
  p_items jsonb,
  p_shipping_address jsonb default '{}'::jsonb,
  p_contact jsonb default '{}'::jsonb,
  p_payment_provider text default 'whatsapp',
  p_idempotency_key uuid default null,
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id bigint;
  v_quantity integer;
  v_selected_size text;
  v_selected_color text;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_name text := trim(coalesce(p_contact->>'name', ''));
  v_email text := lower(trim(coalesce(p_contact->>'email', '')));
  v_phone text := regexp_replace(coalesce(p_contact->>'phone', ''), '[^0-9+]', '', 'g');
  v_provider text := lower(trim(coalesce(p_payment_provider, 'whatsapp')));
  v_whatsapp_opt_in boolean := coalesce((p_contact->>'whatsappOptIn') = 'true', false);
  v_code text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_promo public.promotions%rowtype;
  v_total_uses bigint := 0;
  v_user_uses bigint := 0;
  v_existing public.orders%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'A checkout request ID is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing
  from public.orders
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'order_number', v_existing.order_number,
      'subtotal', v_existing.subtotal,
      'shipping', v_existing.shipping,
      'discount', v_existing.discount_amount,
      'tax', v_existing.tax,
      'total', v_existing.total,
      'status', v_existing.status,
      'payment_provider', v_existing.payment_provider,
      'payment_status', v_existing.payment_status,
      'currency', v_existing.currency,
      'promotionCode', v_existing.promotion_code,
      'duplicate_prevented', true
    );
  end if;

  if (
    select count(*) from public.orders
    where user_id = v_user_id and created_at > now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'Too many recent checkout attempts. Please wait a few minutes.';
  end if;
  if jsonb_typeof(coalesce(p_shipping_address, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_contact, '{}'::jsonb)) <> 'object'
  then raise exception 'Invalid checkout details'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Cart contains too many line items'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Enter a valid contact name'; end if;
  if length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if v_phone !~ '^\+?[0-9]{7,15}$' then raise exception 'Enter a valid WhatsApp phone number'; end if;
  if v_provider = 'whatsapp' and not v_whatsapp_opt_in then
    raise exception 'WhatsApp order-update consent is required';
  end if;
  if v_provider not in ('whatsapp', 'paystack') then raise exception 'Unsupported payment provider'; end if;

  if length(trim(coalesce(p_shipping_address->>'address', ''))) < 5
     or length(trim(coalesce(p_shipping_address->>'city', ''))) < 2
     or length(trim(coalesce(p_shipping_address->>'state', ''))) < 2
  then raise exception 'Enter a complete delivery address'; end if;
  if length(coalesce(p_shipping_address->>'address', '')) > 250
     or length(coalesce(p_shipping_address->>'city', '')) > 100
     or length(coalesce(p_shipping_address->>'state', '')) > 100
     or length(coalesce(p_shipping_address->>'zip', '')) > 30
  then raise exception 'Shipping address is too long'; end if;

  -- Lock and decrement as each line is validated. Any later exception rolls the
  -- entire transaction back, including every decrement.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Invalid cart item'; end if;
    begin
      v_product_id := (v_item->>'product_id')::bigint;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then raise exception 'Invalid cart item'; end;
    if v_product_id is null or v_product_id <= 0 or v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'Invalid cart item';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id
    for update;
    if not found then raise exception 'Product % no longer exists', v_product_id; end if;

    v_selected_size := nullif(trim(coalesce(v_item->>'size', '')), '');
    if cardinality(v_product.sizes) > 0 then
      if v_selected_size is null then raise exception 'Select a size for "%"', v_product.name; end if;
      select option into v_selected_size
      from unnest(v_product.sizes) option
      where lower(trim(option)) = lower(v_selected_size)
      limit 1;
      if not found then raise exception 'The selected size is not available for "%"', v_product.name; end if;
    elsif v_selected_size is not null then
      raise exception 'This product does not offer a size selection';
    end if;

    v_selected_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    if cardinality(v_product.colors) > 0 then
      if v_selected_color is null then raise exception 'Select a color for "%"', v_product.name; end if;
      select option into v_selected_color
      from unnest(v_product.colors) option
      where lower(trim(option)) = lower(v_selected_color)
      limit 1;
      if not found then raise exception 'The selected color is not available for "%"', v_product.name; end if;
    elsif v_selected_color is not null then
      raise exception 'This product does not offer a color selection';
    end if;

    if not v_product.in_stock or v_product.stock_quantity < v_quantity then
      raise exception 'Only % unit(s) of "%" are available', v_product.stock_quantity, v_product.name;
    end if;

    update public.products
    set stock_quantity = stock_quantity - v_quantity,
        updated_at = now()
    where id = v_product_id;
    v_subtotal := v_subtotal + round(v_product.price * v_quantity, 2);
  end loop;

  v_shipping := case when v_subtotal > 200 then 0 else 15 end;

  if v_code is not null then
    select * into v_promo from public.promotions where code = v_code for update;
    if not found or not v_promo.active then raise exception 'Promo code is invalid or inactive'; end if;
    if v_promo.starts_at is not null and now() < v_promo.starts_at then raise exception 'Promo code is not active yet'; end if;
    if v_promo.ends_at is not null and now() >= v_promo.ends_at then raise exception 'Promo code has expired'; end if;
    if v_subtotal < v_promo.minimum_subtotal then
      raise exception 'This promo requires a minimum subtotal of $%', trim(to_char(v_promo.minimum_subtotal, '999999990.00'));
    end if;
    select count(*) into v_total_uses
    from public.promotion_redemptions r
    join public.orders o on o.id = r.order_id
    where r.promotion_id = v_promo.id and o.status <> 'cancelled';
    select count(*) into v_user_uses
    from public.promotion_redemptions r
    join public.orders o on o.id = r.order_id
    where r.promotion_id = v_promo.id and r.user_id = v_user_id and o.status <> 'cancelled';
    if v_promo.max_redemptions is not null and v_total_uses >= v_promo.max_redemptions then
      raise exception 'Promo code has reached its redemption limit';
    end if;
    if v_user_uses >= v_promo.per_user_limit then raise exception 'You have already used this promo code'; end if;
    v_discount := round(v_subtotal * v_promo.percent_off / 100, 2);
  end if;

  v_tax := round((v_subtotal - v_discount) * 0.08, 2);
  v_total := v_subtotal - v_discount + v_shipping + v_tax;
  v_order_number := 'ALK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.orders (
    user_id, order_number, subtotal, shipping, discount_amount, tax, total,
    status, shipping_address, contact_name, contact_email, contact_phone,
    payment_provider, payment_status, currency, whatsapp_opt_in_at,
    idempotency_key, promotion_id, promotion_code, inventory_reserved_at,
    inventory_reservation_expires_at
  ) values (
    v_user_id, v_order_number, v_subtotal, v_shipping, v_discount, v_tax, v_total,
    case when v_provider = 'paystack' then 'awaiting_payment' else 'pending_confirmation' end,
    jsonb_build_object(
      'address', trim(p_shipping_address->>'address'),
      'city', trim(p_shipping_address->>'city'),
      'state', trim(p_shipping_address->>'state'),
      'zip', trim(coalesce(p_shipping_address->>'zip', ''))
    ),
    v_name, v_email, v_phone, v_provider, 'pending', 'USD',
    case when v_provider = 'whatsapp' and v_whatsapp_opt_in then now() else null end,
    p_idempotency_key, v_promo.id, v_promo.code, now(),
    case when v_provider = 'paystack' then now() + interval '30 minutes'
         else now() + interval '24 hours' end
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::bigint;
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = v_product_id;

    v_selected_size := nullif(trim(coalesce(v_item->>'size', '')), '');
    if cardinality(v_product.sizes) > 0 then
      select option into v_selected_size
      from unnest(v_product.sizes) option
      where lower(trim(option)) = lower(v_selected_size)
      limit 1;
    else
      v_selected_size := null;
    end if;

    v_selected_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    if cardinality(v_product.colors) > 0 then
      select option into v_selected_color
      from unnest(v_product.colors) option
      where lower(trim(option)) = lower(v_selected_color)
      limit 1;
    else
      v_selected_color := null;
    end if;

    insert into public.order_items (
      order_id, product_id, product_name, price, quantity, image_url,
      selected_size, selected_color
    ) values (
      v_order_id, v_product.id::text, v_product.name, v_product.price,
      v_quantity, v_product.image, v_selected_size, v_selected_color
    );
  end loop;

  if v_promo.id is not null then
    insert into public.promotion_redemptions (
      promotion_id, order_id, user_id, discount_amount
    ) values (v_promo.id, v_order_id, v_user_id, v_discount);
  end if;

  insert into public.user_notifications (user_id, kind, title, message, order_id)
  values (
    v_user_id, 'order', 'Order received',
    'Order ' || v_order_number || ' is in your account.' ||
    case when v_provider = 'whatsapp'
      then ' We will share fulfilment updates here and on WhatsApp.'
      else ' We will share fulfilment updates here as your order progresses.' end,
    v_order_id
  );

  return jsonb_build_object(
    'id', v_order_id, 'order_number', v_order_number,
    'subtotal', v_subtotal, 'shipping', v_shipping,
    'discount', v_discount, 'tax', v_tax, 'total', v_total,
    'status', case when v_provider = 'paystack' then 'awaiting_payment' else 'pending_confirmation' end,
    'payment_provider', v_provider, 'payment_status', 'pending',
    'currency', 'USD',
    'promotionCode', case when v_promo.id is null then null else v_promo.code end,
    'percentOff', case when v_promo.id is null then null else v_promo.percent_off end
  );
end;
$$;

revoke all on function public.create_order_secure_v3(jsonb, jsonb, jsonb, text, uuid, text) from public;
grant execute on function public.create_order_secure_v3(jsonb, jsonb, jsonb, text, uuid, text) to authenticated;

commit;
