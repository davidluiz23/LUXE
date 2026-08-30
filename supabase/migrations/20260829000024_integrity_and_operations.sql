-- End-to-end commerce integrity and operational hardening.
--
-- Inventory backfill policy: the legacy catalog exposed only an in_stock
-- boolean. Existing rows marked in stock are therefore initialized to ONE
-- sellable unit, while out-of-stock rows are initialized to zero. This is
-- deliberately conservative: administrators must enter real quantities after
-- this migration rather than risk overselling inventory that was never counted.

begin;

-- ---------------------------------------------------------------------------
-- Catalog media lifecycle and explicit inventory
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists stock_quantity integer,
  add column if not exists image_public_id text,
  add column if not exists hover_image_public_id text;

update public.products
set stock_quantity = case when in_stock then 1 else 0 end
where stock_quantity is null;

alter table public.products
  alter column stock_quantity set default 1,
  alter column stock_quantity set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_quantity_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_quantity_check
      check (stock_quantity between 0 and 1000000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_image_public_id_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_image_public_id_check
      check (
        image_public_id is null or (
          length(image_public_id) between 1 and 255
          and image_public_id ~ '^[A-Za-z0-9][A-Za-z0-9_./-]{0,254}$'
          and image_public_id !~ '(^|/)\.\.(/|$)'
          and image_public_id !~ '[[:cntrl:]]'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_hover_image_public_id_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_hover_image_public_id_check
      check (
        hover_image_public_id is null or (
          length(hover_image_public_id) between 1 and 255
          and hover_image_public_id ~ '^[A-Za-z0-9][A-Za-z0-9_./-]{0,254}$'
          and hover_image_public_id !~ '(^|/)\.\.(/|$)'
          and hover_image_public_id !~ '[[:cntrl:]]'
        )
      );
  end if;
end;
$$;

create or replace function public.sync_product_inventory_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not coalesce(new.in_stock, true) then
      new.stock_quantity := 0;
    end if;
    new.stock_quantity := coalesce(new.stock_quantity, 1);
    new.in_stock := new.stock_quantity > 0;
    return new;
  end if;

  if new.stock_quantity is distinct from old.stock_quantity then
    new.in_stock := new.stock_quantity > 0;
  elsif new.in_stock is distinct from old.in_stock then
    if new.in_stock then
      new.stock_quantity := greatest(old.stock_quantity, 1);
    else
      new.stock_quantity := 0;
    end if;
  else
    new.in_stock := new.stock_quantity > 0;
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_inventory_state on public.products;
create trigger products_sync_inventory_state
before insert or update of stock_quantity, in_stock on public.products
for each row execute function public.sync_product_inventory_state();

create table if not exists public.cloudinary_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (
    length(public_id) between 1 and 255
    and public_id ~ '^[A-Za-z0-9][A-Za-z0-9_./-]{0,254}$'
    and public_id !~ '(^|/)\.\.(/|$)'
  ),
  product_id bigint,
  reason text not null check (reason in ('image_replaced', 'product_deleted')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists cloudinary_deletion_queue_work_idx
  on public.cloudinary_deletion_queue (status, next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');

alter table public.cloudinary_deletion_queue enable row level security;
revoke all on table public.cloudinary_deletion_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.cloudinary_deletion_queue to service_role;

create or replace function public.queue_replaced_cloudinary_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_public_id text;
  v_candidates text[];
  v_reason text := case when tg_op = 'DELETE' then 'product_deleted' else 'image_replaced' end;
begin
  -- DELETE has no NEW row. Branch before referring to NEW so PostgreSQL never
  -- evaluates an unassigned trigger record.
  if tg_op = 'DELETE' then
    v_candidates := array[old.image_public_id, old.hover_image_public_id];
  else
    v_candidates := array[
      case
        when old.image_public_id is distinct from new.image_public_id
         and old.image_public_id is distinct from new.hover_image_public_id
        then old.image_public_id
      end,
      case
        when old.hover_image_public_id is distinct from new.image_public_id
         and old.hover_image_public_id is distinct from new.hover_image_public_id
        then old.hover_image_public_id
      end
    ];
  end if;

  foreach v_public_id in array v_candidates
  loop
    continue when v_public_id is null;
    insert into public.cloudinary_deletion_queue (
      public_id, product_id, reason, status, attempts, claim_token,
      claimed_at, next_attempt_at, last_error, completed_at
    ) values (
      v_public_id, old.id, v_reason, 'pending', 0, null,
      null, now(), null, null
    )
    on conflict (public_id) do update set
      product_id = excluded.product_id,
      reason = excluded.reason,
      status = 'pending',
      attempts = 0,
      claim_token = null,
      claimed_at = null,
      next_attempt_at = now(),
      last_error = null,
      completed_at = null;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists products_queue_cloudinary_cleanup on public.products;
create trigger products_queue_cloudinary_cleanup
after update of image_public_id, hover_image_public_id or delete on public.products
for each row execute function public.queue_replaced_cloudinary_media();

create or replace function public.service_claim_cloudinary_deletions(
  p_limit integer default 20
)
returns table (id uuid, public_id text, claim_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Service permission required';
  end if;

  -- Reclaim work from an interrupted invocation, and keep completed metadata
  -- for only 30 days.
  update public.cloudinary_deletion_queue q
  set status = 'retry', claim_token = null, claimed_at = null,
      next_attempt_at = now()
  where q.status = 'processing'
    and q.claimed_at < now() - interval '5 minutes';

  delete from public.cloudinary_deletion_queue q
  where q.status = 'completed'
    and q.completed_at < now() - interval '30 days';

  return query
  with candidates as (
    select q.id
    from public.cloudinary_deletion_queue q
    where q.status in ('pending', 'retry')
      and q.next_attempt_at <= now()
      and not exists (
        select 1 from public.products p
        where p.image_public_id = q.public_id
           or p.hover_image_public_id = q.public_id
      )
    order by q.created_at
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.cloudinary_deletion_queue q
    set status = 'processing', attempts = q.attempts + 1,
        claim_token = gen_random_uuid(), claimed_at = now()
    from candidates c
    where q.id = c.id
    returning q.id, q.public_id, q.claim_token
  )
  select c.id, c.public_id, c.claim_token from claimed c;
end;
$$;

revoke all on function public.service_claim_cloudinary_deletions(integer) from public;
grant execute on function public.service_claim_cloudinary_deletions(integer) to service_role;

create or replace function public.service_finish_cloudinary_deletion(
  p_claim_token uuid,
  p_succeeded boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Service permission required';
  end if;

  update public.cloudinary_deletion_queue q
  set status = case
        when p_succeeded then 'completed'
        when q.attempts >= 10 then 'failed'
        else 'retry'
      end,
      completed_at = case when p_succeeded then now() else null end,
      next_attempt_at = case
        when p_succeeded then q.next_attempt_at
        else now() + make_interval(secs => least(3600, 30 * (2 ^ least(q.attempts, 7))))
      end,
      last_error = case when p_succeeded then null else left(coalesce(p_error, 'Unknown provider error'), 500) end,
      claim_token = null,
      claimed_at = null
  where q.claim_token = p_claim_token and q.status = 'processing';
end;
$$;

revoke all on function public.service_finish_cloudinary_deletion(uuid, boolean, text) from public;
grant execute on function public.service_finish_cloudinary_deletion(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Orders, variants and inventory reservations
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists selected_size text,
  add column if not exists selected_color text;

alter table public.orders
  add column if not exists inventory_reserved_at timestamptz,
  add column if not exists inventory_released_at timestamptz,
  add column if not exists inventory_reservation_expires_at timestamptz,
  add column if not exists payment_authorization_url text,
  add column if not exists payment_access_code text,
  add column if not exists payment_initialized_at timestamptz;

create index if not exists orders_inventory_reservation_expiry_idx
  on public.orders (inventory_reservation_expires_at, created_at)
  where inventory_reserved_at is not null
    and inventory_released_at is null
    and status in ('pending_confirmation', 'awaiting_payment');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_selected_size_check'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_selected_size_check
      check (selected_size is null or length(selected_size) between 1 and 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_selected_color_check'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_selected_color_check
      check (selected_color is null or length(selected_color) between 1 and 80);
  end if;
end;
$$;

create or replace function public.release_cancelled_order_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and new.inventory_reserved_at is not null
     and new.inventory_released_at is null
  then
    for v_item in
      select oi.product_id::bigint as product_id, sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id = new.id and oi.product_id ~ '^[0-9]+$'
      group by oi.product_id::bigint
      order by oi.product_id::bigint
    loop
      update public.products
      set stock_quantity = least(1000000, stock_quantity + v_item.quantity),
          updated_at = now()
      where id = v_item.product_id;
    end loop;

    update public.orders
    set inventory_released_at = now()
    where id = new.id and inventory_released_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_release_cancelled_inventory on public.orders;
create trigger orders_release_cancelled_inventory
after update of status on public.orders
for each row execute function public.release_cancelled_order_inventory();

-- Release abandoned checkout reservations in small, lock-safe batches. This is
-- service-only and is intended to be called by the commerce-maintenance Edge
-- Function on a schedule. Moving the order to cancelled reuses the trigger
-- above, so inventory is restored exactly once.
create or replace function public.service_release_expired_order_inventory(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_released integer := 0;
begin
  with candidates as (
    select o.id
    from public.orders o
    where o.inventory_reserved_at is not null
      and o.inventory_released_at is null
      and o.inventory_reservation_expires_at <= now()
      and o.payment_status <> 'paid'
      and o.status in ('pending_confirmation', 'awaiting_payment')
    order by o.inventory_reservation_expires_at, o.created_at
    for update skip locked
    limit v_limit
  ), released as (
    update public.orders o
    set status = 'cancelled',
        payment_status = case
          when o.payment_status = 'pending' then 'expired'
          else o.payment_status
        end,
        updated_at = now()
    from candidates c
    where o.id = c.id
    returning o.id
  )
  select count(*)::integer into v_released from released;

  return v_released;
end;
$$;

revoke all on function public.service_release_expired_order_inventory(integer) from public;
grant execute on function public.service_release_expired_order_inventory(integer) to service_role;

-- Claim one Paystack initialization before making the provider request. The
-- row lock makes browser retries and concurrent tabs converge on one reference.
create or replace function public.service_prepare_payment_initialization(
  p_order_id uuid,
  p_user_id uuid,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_reference text := trim(coalesce(p_reference, ''));
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  if length(v_reference) not between 8 and 160
     or v_reference !~ '^[A-Za-z0-9._:-]+$'
  then raise exception 'Invalid payment reference'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_order.user_id <> p_user_id or v_order.payment_provider <> 'paystack' then
    raise exception 'Order not found';
  end if;
  if v_order.payment_status = 'paid' then
    return jsonb_build_object('state', 'paid', 'initialize', false);
  end if;
  if v_order.status = 'cancelled' or v_order.inventory_released_at is not null then
    return jsonb_build_object('state', 'cancelled', 'initialize', false);
  end if;
  if v_order.inventory_reservation_expires_at is not null
     and v_order.inventory_reservation_expires_at <= now()
  then
    update public.orders
    set status = 'cancelled', payment_status = 'expired', updated_at = now()
    where id = v_order.id;
    return jsonb_build_object('state', 'expired', 'initialize', false);
  end if;
  if v_order.payment_authorization_url is not null then
    return jsonb_build_object(
      'state', 'ready', 'initialize', false,
      'reference', v_order.payment_reference,
      'authorizationUrl', v_order.payment_authorization_url,
      'accessCode', v_order.payment_access_code
    );
  end if;
  if v_order.payment_reference is not null
     and v_order.payment_initialized_at > now() - interval '2 minutes'
  then
    return jsonb_build_object(
      'state', 'initializing', 'initialize', false,
      'reference', v_order.payment_reference
    );
  end if;

  update public.orders
  set payment_reference = v_reference,
      payment_authorization_url = null,
      payment_access_code = null,
      payment_initialized_at = now(),
      updated_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'state', 'claimed', 'initialize', true, 'reference', v_reference
  );
end;
$$;

revoke all on function public.service_prepare_payment_initialization(uuid, uuid, text) from public;
grant execute on function public.service_prepare_payment_initialization(uuid, uuid, text) to service_role;

create or replace function public.service_finish_payment_initialization(
  p_order_id uuid,
  p_reference text,
  p_authorization_url text default null,
  p_access_code text default null,
  p_succeeded boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := nullif(trim(coalesce(p_authorization_url, '')), '');
  v_access_code text := nullif(trim(coalesce(p_access_code, '')), '');
begin
  if p_succeeded then
    if v_url is null or v_url !~* '^https://'
       or length(v_url) > 2000
       or v_access_code is null or length(v_access_code) > 500
    then raise exception 'Invalid payment initialization response'; end if;

    update public.orders
    set payment_authorization_url = v_url,
        payment_access_code = v_access_code,
        updated_at = now()
    where id = p_order_id
      and payment_reference = p_reference
      and payment_status <> 'paid'
      and status <> 'cancelled'
      and inventory_released_at is null;
  else
    update public.orders
    set payment_reference = null,
        payment_authorization_url = null,
        payment_access_code = null,
        payment_initialized_at = null,
        updated_at = now()
    where id = p_order_id
      and payment_reference = p_reference
      and payment_status <> 'paid';
  end if;

  return found;
end;
$$;

revoke all on function public.service_finish_payment_initialization(uuid, text, text, text, boolean) from public;
grant execute on function public.service_finish_payment_initialization(uuid, text, text, text, boolean) to service_role;

-- Apply a verified provider result while the order row is locked. A payment
-- that arrives after inventory was released is retained for manual review and
-- never silently reopens the cancelled order.
create or replace function public.service_mark_order_paid_v1(
  p_order_id uuid,
  p_reference text,
  p_amount numeric,
  p_currency text,
  p_channel text default null,
  p_method_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_state text;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then return jsonb_build_object('state', 'not_found'); end if;
  if v_order.payment_provider <> 'paystack'
     or v_order.payment_reference is distinct from p_reference
     or round(v_order.total, 2) is distinct from round(p_amount, 2)
     or upper(v_order.currency) is distinct from upper(trim(coalesce(p_currency, '')))
  then return jsonb_build_object('state', 'mismatch'); end if;
  if v_order.payment_status = 'paid' then
    return jsonb_build_object('state', 'already_paid', 'order', to_jsonb(v_order));
  end if;
  if v_order.payment_status = 'review_required' then
    return jsonb_build_object('state', 'already_review_required', 'order', to_jsonb(v_order));
  end if;

  if v_order.status = 'cancelled'
     or v_order.inventory_released_at is not null
     or (
       v_order.inventory_reservation_expires_at is not null
       and v_order.inventory_reservation_expires_at <= now()
     )
  then
    update public.orders
    set status = 'cancelled',
        payment_status = 'review_required',
        payment_channel = nullif(left(trim(coalesce(p_channel, '')), 30), ''),
        payment_method_label = nullif(left(trim(coalesce(p_method_label, '')), 140), ''),
        admin_seen_at = null,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
    v_state := 'review_required';
  else
    update public.orders
    set payment_status = 'paid',
        status = case
          when status in ('pending_confirmation', 'awaiting_payment') then 'processing'
          else status
        end,
        payment_channel = nullif(left(trim(coalesce(p_channel, '')), 30), ''),
        payment_method_label = nullif(left(trim(coalesce(p_method_label, '')), 140), ''),
        inventory_reservation_expires_at = null,
        admin_seen_at = null,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
    v_state := 'paid';
  end if;

  return jsonb_build_object('state', v_state, 'order', to_jsonb(v_order));
end;
$$;

revoke all on function public.service_mark_order_paid_v1(uuid, text, numeric, text, text, text) from public;
grant execute on function public.service_mark_order_paid_v1(uuid, text, numeric, text, text, text) to service_role;

-- Quote the exact cart that checkout will validate. Variant selections do not
-- change the current product-level price, but they are mandatory whenever the
-- product publishes variant choices.
create or replace function public.order_quote_secure_v1(
  p_items jsonb,
  p_promo_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id bigint;
  v_quantity integer;
  v_selected_size text;
  v_selected_color text;
  v_requested jsonb := '{}'::jsonb;
  v_requested_quantity integer;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_code text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_promo public.promotions%rowtype;
  v_total_uses bigint := 0;
  v_user_uses bigint := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Cart contains too many line items'; end if;

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

    select * into v_product from public.products where id = v_product_id;
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

    v_requested_quantity := coalesce((v_requested->>v_product_id::text)::integer, 0) + v_quantity;
    if not v_product.in_stock or v_product.stock_quantity < v_requested_quantity then
      raise exception 'Only % unit(s) of "%" are available', v_product.stock_quantity, v_product.name;
    end if;
    v_requested := jsonb_set(
      v_requested, array[v_product_id::text], to_jsonb(v_requested_quantity), true
    );
    v_subtotal := v_subtotal + round(v_product.price * v_quantity, 2);
  end loop;

  v_shipping := case when v_subtotal > 200 then 0 else 15 end;

  if v_code is not null then
    select * into v_promo from public.promotions where code = v_code;
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

  return jsonb_build_object(
    'subtotal', v_subtotal, 'shipping', v_shipping, 'discount', v_discount,
    'tax', v_tax, 'total', v_total, 'currency', 'USD',
    'promotionCode', case when v_promo.id is null then null else v_promo.code end,
    'percentOff', case when v_promo.id is null then null else v_promo.percent_off end
  );
end;
$$;

revoke all on function public.order_quote_secure_v1(jsonb, text) from public;
grant execute on function public.order_quote_secure_v1(jsonb, text) to authenticated;

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
  if not v_whatsapp_opt_in then raise exception 'WhatsApp order-update consent is required'; end if;
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
  v_order_number := 'LX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

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
    v_name, v_email, v_phone, v_provider, 'pending', 'USD', now(),
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
    'Order ' || v_order_number || ' is in your account. We will share fulfilment updates here and on WhatsApp.',
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

-- Remove checkout paths that predate quantity reservations. The storefront has
-- used v3 since migration 00012; leaving these executable would allow a stale or
-- malicious client to bypass the new inventory invariant.
revoke execute on function public.create_order_secure_v2(jsonb, jsonb, jsonb, text, uuid) from authenticated;
revoke execute on function public.create_order_secure(jsonb, jsonb) from authenticated;

-- Preserve the reliable v3 write path (audit log, order-admin state and
-- optimistic concurrency) while enforcing HTTPS and terminal-state safety.
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
  v_old_rank integer;
  v_new_rank integer;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_status not in (
    'pending_confirmation', 'awaiting_payment', 'processing', 'confirmed',
    'shipped', 'delivered', 'cancelled'
  ) then raise exception 'Invalid order status'; end if;
  if p_estimated_min_days is not null
     and (p_estimated_min_days < 1 or p_estimated_min_days > 90)
  then raise exception 'Invalid minimum delivery estimate'; end if;
  if p_estimated_max_days is not null
     and (
       p_estimated_max_days < coalesce(p_estimated_min_days, 1)
       or p_estimated_max_days > 120
     )
  then raise exception 'Invalid maximum delivery estimate'; end if;
  if length(coalesce(p_waybill_url, '')) > 1000 then
    raise exception 'Waybill URL is too long';
  end if;
  if v_waybill is not null and v_waybill !~* '^https://' then
    raise exception 'Waybill URL must use HTTPS';
  end if;

  select * into v_old from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_expected_version is not null and v_old.admin_version <> p_expected_version then
    raise exception 'ORDER_CONFLICT: This order was changed by another administrator. Refresh before saving.';
  end if;
  if v_old.status = 'cancelled' and p_status <> 'cancelled' then
    raise exception 'A cancelled order cannot be reopened because its inventory was released';
  end if;
  if v_old.status = 'delivered' and p_status <> 'delivered' then
    raise exception 'A delivered order is terminal';
  end if;
  if v_old.status in ('shipped', 'delivered') and p_status = 'cancelled' then
    raise exception 'A shipped order cannot be cancelled through inventory fulfilment';
  end if;
  if v_old.payment_status = 'paid' and p_status = 'cancelled' then
    raise exception 'A paid order requires an explicit refund workflow before cancellation';
  end if;

  v_old_rank := case v_old.status
    when 'pending_confirmation' then 0
    when 'awaiting_payment' then 0
    when 'processing' then 1
    when 'confirmed' then 2
    when 'shipped' then 3
    when 'delivered' then 4
    else null
  end;
  v_new_rank := case p_status
    when 'pending_confirmation' then 0
    when 'awaiting_payment' then 0
    when 'processing' then 1
    when 'confirmed' then 2
    when 'shipped' then 3
    when 'delivered' then 4
    else null
  end;
  if p_status <> 'cancelled'
     and v_old_rank is not null
     and v_new_rank is not null
     and v_new_rank < v_old_rank
  then raise exception 'Order status cannot move backwards'; end if;

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
  ) values (
    p_order_id, auth.uid(), v_admin_email, v_action, now()
  )
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

  return jsonb_build_object(
    'changed', true,
    'order', to_jsonb(v_order)
  );
end;
$$;

revoke all on function public.admin_update_order_v3(uuid, text, integer, integer, text, bigint) from public;
grant execute on function public.admin_update_order_v3(uuid, text, integer, integer, text, bigint) to authenticated;
revoke execute on function public.admin_update_order(uuid, text, integer, integer, text) from authenticated;
revoke execute on function public.admin_update_order_v2(uuid, text, integer, integer, text, timestamptz) from authenticated;

create or replace function public.admin_list_orders_v3(
  p_search text default '',
  p_status text default null,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(trim(coalesce(p_search, '')));
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if length(v_search) > 120 then raise exception 'Search is too long'; end if;
  if v_status is not null and v_status not in (
    'pending_confirmation', 'awaiting_payment', 'processing', 'confirmed',
    'shipped', 'delivered', 'cancelled'
  ) then raise exception 'Invalid order status'; end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Both cursor fields are required';
  end if;

  with candidates as (
    select o.*
    from public.orders o
    where (v_status is null or o.status = v_status)
      and (
        p_before_created_at is null
        or (o.created_at, o.id) < (p_before_created_at, p_before_id)
      )
      and (
        v_search = ''
        or position(v_search in lower(coalesce(o.order_number, ''))) > 0
        or position(v_search in lower(coalesce(o.payment_reference, ''))) > 0
        or position(v_search in lower(coalesce(o.contact_name, ''))) > 0
        or position(v_search in lower(coalesce(o.contact_email, ''))) > 0
        or position(v_search in lower(coalesce(o.contact_phone, ''))) > 0
        or exists (
          select 1 from public.order_items oi
          where oi.order_id = o.id
            and (
              position(v_search in lower(coalesce(oi.product_name, ''))) > 0
              or position(v_search in lower(coalesce(oi.product_id, ''))) > 0
            )
        )
      )
    order by o.created_at desc, o.id desc
    limit v_limit + 1
  ), page as (
    select * from candidates
    order by created_at desc, id desc
    limit v_limit
  ), payload as (
    select coalesce(jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'order_items', coalesce((
          select jsonb_agg(to_jsonb(oi) order by oi.id)
          from public.order_items oi where oi.order_id = o.id
        ), '[]'::jsonb),
        'last_admin_email', s.admin_email,
        'last_admin_action', s.action,
        'last_admin_changed_at', s.changed_at
      ) order by o.created_at desc, o.id desc
    ), '[]'::jsonb) as orders
    from page o
    left join public.order_admin_state s on s.order_id = o.id
  )
  select jsonb_build_object(
    'orders', payload.orders,
    'hasMore', (select count(*) > v_limit from candidates),
    'nextCursor', case when (select count(*) > v_limit from candidates) then (
      select jsonb_build_object('createdAt', p.created_at, 'id', p.id)
      from page p order by p.created_at asc, p.id asc limit 1
    ) else null end
  ) into v_result
  from payload;

  return coalesce(v_result, jsonb_build_object('orders', '[]'::jsonb, 'hasMore', false, 'nextCursor', null));
end;
$$;

revoke all on function public.admin_list_orders_v3(text, text, integer, timestamptz, uuid) from public;
grant execute on function public.admin_list_orders_v3(text, text, integer, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public inboxes: RPC-only writes, validated and rate-limited
-- ---------------------------------------------------------------------------

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved', 'spam')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);
create index if not exists contact_messages_email_created_idx
  on public.contact_messages (email, created_at desc);

alter table public.contact_messages enable row level security;
revoke all on table public.contact_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.contact_messages to service_role;

create table if not exists public.newsletter_subscriptions (
  email text primary key,
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'storefront',
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed')),
  subscribed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists newsletter_subscriptions_updated_idx
  on public.newsletter_subscriptions (updated_at desc);

alter table public.newsletter_subscriptions enable row level security;
revoke all on table public.newsletter_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.newsletter_subscriptions to service_role;

create table if not exists public.newsletter_request_rate_limits (
  email text primary key,
  request_count integer not null default 0 check (request_count between 0 and 10),
  window_started_at timestamptz not null default now(),
  last_request_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.newsletter_request_rate_buckets (
  bucket_start timestamptz primary key,
  request_count integer not null default 0 check (request_count between 0 and 501)
);

alter table public.newsletter_request_rate_limits enable row level security;
alter table public.newsletter_request_rate_buckets enable row level security;
revoke all on table public.newsletter_request_rate_limits from public, anon, authenticated;
revoke all on table public.newsletter_request_rate_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.newsletter_request_rate_limits to service_role;
grant select, insert, update, delete on table public.newsletter_request_rate_buckets to service_role;

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := nullif(regexp_replace(trim(coalesce(p_phone, '')), '[^0-9+ ()-]', '', 'g'), '');
  v_subject text := regexp_replace(trim(coalesce(p_subject, '')), '[[:space:]]+', ' ', 'g');
  v_message text := trim(coalesce(p_message, ''));
begin
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Enter a valid name'; end if;
  if length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if v_phone is not null and regexp_replace(v_phone, '[^0-9]', '', 'g') !~ '^[0-9]{7,15}$' then
    raise exception 'Enter a valid phone number';
  end if;
  if length(v_subject) < 2 or length(v_subject) > 160 then raise exception 'Enter a valid subject'; end if;
  if length(v_message) < 10 or length(v_message) > 5000 then raise exception 'Message must be 10-5000 characters'; end if;

  perform pg_advisory_xact_lock(hashtextextended('contact:' || v_email, 0));
  if (
    select count(*) from public.contact_messages c
    where c.email = v_email and c.created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'Too many recent messages. Please wait before trying again.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('contact-global', 0));
  if (
    select count(*) from public.contact_messages c
    where c.created_at > now() - interval '10 minutes'
  ) >= 250 then
    raise exception 'Contact service is temporarily busy. Please try again later.';
  end if;

  insert into public.contact_messages (user_id, name, email, phone, subject, message)
  values (auth.uid(), v_name, v_email, v_phone, v_subject, v_message);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text) to anon, authenticated;

create or replace function public.subscribe_newsletter(
  p_email text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_source text := lower(trim(coalesce(p_source, 'storefront')));
  v_now timestamptz := now();
  v_bucket timestamptz := date_trunc('minute', now());
  v_limit public.newsletter_request_rate_limits%rowtype;
  v_request_count integer := 1;
  v_window_started_at timestamptz := now();
  v_global_count integer;
begin
  if length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if v_source !~ '^[a-z0-9_-]{2,40}$' then v_source := 'storefront'; end if;

  perform pg_advisory_xact_lock(hashtextextended('newsletter:' || v_email, 0));
  select * into v_limit
  from public.newsletter_request_rate_limits
  where email = v_email
  for update;
  if found then
    if v_limit.last_request_at > v_now - interval '10 seconds' then
      raise exception 'Please wait before trying again.';
    end if;
    if v_limit.window_started_at > v_now - interval '1 hour' then
      if v_limit.request_count >= 10 then
        raise exception 'Too many newsletter requests. Please try again later.';
      end if;
      v_request_count := v_limit.request_count + 1;
      v_window_started_at := v_limit.window_started_at;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('newsletter-global', 0));
  delete from public.newsletter_request_rate_buckets
  where bucket_start < v_now - interval '24 hours';
  delete from public.newsletter_request_rate_limits
  where updated_at < v_now - interval '24 hours' and email <> v_email;
  select coalesce(sum(request_count), 0)::integer into v_global_count
  from public.newsletter_request_rate_buckets
  where bucket_start > v_now - interval '1 hour';
  if v_global_count >= 5000 then
    raise exception 'Newsletter signup is temporarily busy. Please try again later.';
  end if;

  insert into public.newsletter_request_rate_buckets (bucket_start, request_count)
  values (v_bucket, 1)
  on conflict (bucket_start) do update
  set request_count = least(public.newsletter_request_rate_buckets.request_count + 1, 501)
  returning request_count into v_global_count;
  if v_global_count > 500 then
    raise exception 'Newsletter signup is temporarily busy. Please try again later.';
  end if;

  insert into public.newsletter_request_rate_limits (
    email, request_count, window_started_at, last_request_at, updated_at
  ) values (
    v_email, v_request_count, v_window_started_at, v_now, v_now
  )
  on conflict (email) do update set
    request_count = excluded.request_count,
    window_started_at = excluded.window_started_at,
    last_request_at = excluded.last_request_at,
    updated_at = excluded.updated_at;

  insert into public.newsletter_subscriptions (
    email, user_id, source, status, subscribed_at, updated_at
  ) values (
    v_email, auth.uid(), v_source, 'subscribed', now(), now()
  )
  on conflict (email) do update set
    user_id = coalesce(excluded.user_id, public.newsletter_subscriptions.user_id),
    source = excluded.source,
    status = 'subscribed',
    subscribed_at = case
      when public.newsletter_subscriptions.status = 'unsubscribed' then now()
      else public.newsletter_subscriptions.subscribed_at
    end,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;

-- Browser users can update only the read marker; titles, bodies, kinds,
-- ownership and order associations remain immutable from the client.
revoke update on table public.user_notifications from authenticated;
grant update (read_at) on table public.user_notifications to authenticated;

-- Serialize signup-email issuance and enforce both per-address and global
-- budgets before any provider email is sent.
create index if not exists pending_signups_expires_idx
  on public.pending_signups (expires_at);

create table if not exists public.signup_email_send_buckets (
  bucket_start timestamptz primary key,
  send_count integer not null default 0 check (send_count between 0 and 101)
);

alter table public.signup_email_send_buckets enable row level security;
revoke all on table public.signup_email_send_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.signup_email_send_buckets to service_role;

create table if not exists public.signup_email_address_limits (
  email text primary key,
  send_count integer not null default 1 check (send_count between 1 and 5),
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.signup_email_address_limits enable row level security;
revoke all on table public.signup_email_address_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.signup_email_address_limits to service_role;

insert into public.signup_email_address_limits (
  email, send_count, window_started_at, last_sent_at, updated_at
)
select
  lower(email), least(5, greatest(1, send_count)), window_started_at,
  last_sent_at, last_sent_at
from public.pending_signups
on conflict (email) do nothing;

create or replace function public.service_store_pending_signup_v1(
  p_email text,
  p_full_name text,
  p_token_hash text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_code_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := regexp_replace(trim(coalesce(p_full_name, '')), '[[:space:]]+', ' ', 'g');
  v_limit public.signup_email_address_limits%rowtype;
  v_now timestamptz := now();
  v_bucket timestamptz := date_trunc('minute', now());
  v_hour_sends integer;
  v_send_count integer := 1;
  v_window_started_at timestamptz := now();
begin
  if length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_name) not between 2 and 100
     or p_token_hash !~ '^[a-f0-9]{64}$'
     or p_code_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at not between v_now + interval '5 minutes' and v_now + interval '20 minutes'
     or p_code_expires_at not between v_now + interval '5 minutes' and v_now + interval '20 minutes'
  then raise exception 'Invalid pending signup'; end if;

  perform pg_advisory_xact_lock(hashtextextended('signup-email:' || v_email, 0));
  select * into v_limit
  from public.signup_email_address_limits
  where email = v_email
  for update;

  if found then
    if v_limit.last_sent_at > v_now - interval '60 seconds' then
      return jsonb_build_object('allowed', false, 'reason', 'cooldown');
    end if;
    if v_limit.window_started_at > v_now - interval '1 hour' then
      if v_limit.send_count >= 5 then
        return jsonb_build_object('allowed', false, 'reason', 'email_limit');
      end if;
      v_send_count := v_limit.send_count + 1;
      v_window_started_at := v_limit.window_started_at;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('signup-email-global', 0));
  delete from public.signup_email_send_buckets
  where bucket_start < v_now - interval '24 hours';
  delete from public.signup_email_address_limits
  where updated_at < v_now - interval '24 hours' and email <> v_email;
  select coalesce(sum(send_count), 0)::integer into v_hour_sends
  from public.signup_email_send_buckets
  where bucket_start > v_now - interval '1 hour';
  if v_hour_sends >= 1000 then
    return jsonb_build_object('allowed', false, 'reason', 'global_limit');
  end if;

  insert into public.signup_email_send_buckets (bucket_start, send_count)
  values (v_bucket, 1)
  on conflict (bucket_start) do update
  set send_count = least(public.signup_email_send_buckets.send_count + 1, 101)
  returning send_count into v_hour_sends;
  if v_hour_sends > 100 then
    return jsonb_build_object('allowed', false, 'reason', 'minute_limit');
  end if;

  insert into public.signup_email_address_limits (
    email, send_count, window_started_at, last_sent_at, updated_at
  ) values (
    v_email, v_send_count, v_window_started_at, v_now, v_now
  )
  on conflict (email) do update set
    send_count = excluded.send_count,
    window_started_at = excluded.window_started_at,
    last_sent_at = excluded.last_sent_at,
    updated_at = excluded.updated_at;

  insert into public.pending_signups (
    email, full_name, token_hash, code_hash, code_expires_at,
    failed_code_attempts, expires_at, last_sent_at, send_count,
    window_started_at
  ) values (
    v_email, v_name, p_token_hash, p_code_hash, p_code_expires_at,
    0, p_expires_at, v_now, v_send_count, v_window_started_at
  )
  on conflict (email) do update set
    full_name = excluded.full_name,
    token_hash = excluded.token_hash,
    code_hash = excluded.code_hash,
    code_expires_at = excluded.code_expires_at,
    failed_code_attempts = 0,
    expires_at = excluded.expires_at,
    last_sent_at = excluded.last_sent_at,
    send_count = excluded.send_count,
    window_started_at = excluded.window_started_at;

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.service_store_pending_signup_v1(text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.service_store_pending_signup_v1(text, text, text, text, timestamptz, timestamptz) to service_role;

-- Store at most ten Web Push endpoints per account. The service function is
-- serialized per user so concurrent tabs cannot bypass the cap.
create or replace function public.service_save_push_subscription_v1(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text,
  p_expiration_time bigint default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null
     or length(p_endpoint) not between 20 and 2048
     or p_endpoint !~ '^https://'
     or length(p_p256dh) not between 20 and 512
     or length(p_auth_secret) not between 8 and 512
     or (p_expiration_time is not null and p_expiration_time < 0)
  then raise exception 'Invalid push subscription'; end if;

  perform pg_advisory_xact_lock(hashtextextended('push-subscription:' || p_user_id::text, 0));

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth_secret, expiration_time, user_agent,
    failure_count, disabled_at, updated_at
  ) values (
    p_user_id, p_endpoint, p_p256dh, p_auth_secret, p_expiration_time,
    nullif(left(trim(coalesce(p_user_agent, '')), 500), ''), 0, null, now()
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    expiration_time = excluded.expiration_time,
    user_agent = excluded.user_agent,
    failure_count = 0,
    disabled_at = null,
    updated_at = now();

  delete from public.push_subscriptions s
  where s.user_id = p_user_id
    and s.id in (
      select old.id
      from public.push_subscriptions old
      where old.user_id = p_user_id
      order by old.updated_at desc, old.id desc
      offset 10
    );
end;
$$;

revoke all on function public.service_save_push_subscription_v1(uuid, text, text, text, bigint, text) from public;
grant execute on function public.service_save_push_subscription_v1(uuid, text, text, text, bigint, text) to service_role;

-- Site-wide browser-push updates are queued durably. The request-facing Edge
-- Function only snapshots the active subscription audience; the scheduled
-- commerce-maintenance worker claims and delivers a bounded batch at a time.
create table if not exists public.push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (length(title) between 3 and 100),
  message text not null check (length(message) between 3 and 1000),
  target_url text not null default 'index.html#site-updates'
    check (length(target_url) between 1 and 1000),
  tag text not null check (length(tag) between 1 and 120),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'completed_with_errors', 'failed')),
  audience_count integer not null default 0 check (audience_count >= 0),
  attempted_count integer not null default 0 check (attempted_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  expired_count integer not null default 0 check (expired_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists push_broadcasts_status_created_idx
  on public.push_broadcasts (status, created_at)
  where status in ('queued', 'processing');
create index if not exists push_broadcasts_retention_idx
  on public.push_broadcasts (status, completed_at)
  where status in ('completed', 'completed_with_errors', 'failed');

create table if not exists public.push_broadcast_deliveries (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.push_broadcasts(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'failed', 'expired', 'invalid')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (broadcast_id, subscription_id)
);

create index if not exists push_broadcast_deliveries_work_idx
  on public.push_broadcast_deliveries (status, next_attempt_at, created_at)
  where status in ('pending', 'processing', 'retry');

alter table public.push_broadcasts enable row level security;
alter table public.push_broadcast_deliveries enable row level security;
revoke all on table public.push_broadcasts from public, anon, authenticated;
revoke all on table public.push_broadcast_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.push_broadcasts to service_role;
grant select, insert, update, delete on table public.push_broadcast_deliveries to service_role;

create or replace function public.service_enqueue_push_broadcast_v1(
  p_admin_user_id uuid,
  p_title text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := regexp_replace(trim(coalesce(p_title, '')), '[[:space:]]+', ' ', 'g');
  v_message text := trim(coalesce(p_message, ''));
  v_broadcast_id uuid := gen_random_uuid();
  v_audience integer := 0;
  v_status text;
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = p_admin_user_id and a.role in ('owner', 'admin')
  ) then raise exception 'Admin permission required'; end if;
  if length(v_title) not between 3 and 100
     or length(v_message) not between 3 and 1000
  then raise exception 'Invalid site update'; end if;

  insert into public.push_broadcasts (
    id, created_by, title, message, target_url, tag, data
  ) values (
    v_broadcast_id, p_admin_user_id, v_title, v_message,
    'index.html#site-updates',
    'site-update-' || replace(v_broadcast_id::text, '-', ''),
    jsonb_build_object('notificationKind', 'site_update')
  );

  insert into public.push_broadcast_deliveries (broadcast_id, subscription_id)
  select v_broadcast_id, s.id
  from public.push_subscriptions s
  where s.disabled_at is null
    and (
      s.expiration_time is null
      or s.expiration_time > floor(extract(epoch from now()) * 1000)::bigint
    )
  on conflict do nothing;
  get diagnostics v_audience = row_count;
  v_status := case when v_audience = 0 then 'completed' else 'queued' end;

  update public.push_broadcasts
  set audience_count = v_audience,
      status = v_status,
      completed_at = case when v_audience = 0 then now() else null end,
      updated_at = now()
  where id = v_broadcast_id;

  insert into public.admin_action_log (
    admin_user_id, action, target_type, target_id, details
  ) values (
    p_admin_user_id, 'push_broadcast_queued', 'push_broadcast',
    v_broadcast_id::text,
    jsonb_build_object('title', v_title, 'audienceCount', v_audience)
  );

  return jsonb_build_object(
    'id', v_broadcast_id,
    'status', v_status,
    'audienceCount', v_audience,
    'createdAt', now()
  );
end;
$$;

revoke all on function public.service_enqueue_push_broadcast_v1(uuid, text, text) from public;
grant execute on function public.service_enqueue_push_broadcast_v1(uuid, text, text) to service_role;

create or replace function public.service_claim_push_broadcast_deliveries_v1(
  p_limit integer default 25
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  broadcast_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  failure_count integer,
  title text,
  message text,
  target_url text,
  tag text,
  data jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  update public.push_broadcast_deliveries d
  set status = case when d.attempts >= 10 then 'failed' else 'retry' end,
      claim_token = null,
      claimed_at = null,
      next_attempt_at = now(),
      completed_at = case when d.attempts >= 10 then now() else null end,
      last_error = case
        when d.attempts >= 10 then coalesce(d.last_error, 'Delivery claim expired repeatedly')
        else d.last_error
      end,
      updated_at = now()
  where d.status = 'processing'
    and d.claimed_at < now() - interval '5 minutes';

  return query
  with candidates as (
    select d.id
    from public.push_broadcast_deliveries d
    join public.push_broadcasts b on b.id = d.broadcast_id
    join public.push_subscriptions s on s.id = d.subscription_id
    where d.status in ('pending', 'retry')
      and d.next_attempt_at <= now()
      and d.attempts < 10
      and b.status in ('queued', 'processing')
      and s.disabled_at is null
    order by d.created_at, d.id
    for update of d skip locked
    limit v_limit
  ), claimed as (
    update public.push_broadcast_deliveries d
    set status = 'processing', attempts = d.attempts + 1,
        claim_token = gen_random_uuid(), claimed_at = now(), updated_at = now()
    from candidates c
    where d.id = c.id
    returning d.id, d.claim_token, d.broadcast_id, d.subscription_id
  ), mark_jobs as (
    update public.push_broadcasts b
    set status = 'processing', updated_at = now()
    where b.id in (select distinct c.broadcast_id from claimed c)
      and b.status = 'queued'
    returning b.id
  )
  select
    c.id, c.claim_token, c.broadcast_id, c.subscription_id,
    s.endpoint, s.p256dh, s.auth_secret, s.failure_count,
    b.title, b.message, b.target_url, b.tag, b.data
  from claimed c
  join public.push_subscriptions s on s.id = c.subscription_id
  join public.push_broadcasts b on b.id = c.broadcast_id;
end;
$$;

revoke all on function public.service_claim_push_broadcast_deliveries_v1(integer) from public;
grant execute on function public.service_claim_push_broadcast_deliveries_v1(integer) to service_role;

create or replace function public.service_finish_push_broadcast_deliveries_v1(
  p_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_claim_token uuid;
  v_outcome text;
  v_error text;
  v_delivery public.push_broadcast_deliveries%rowtype;
  v_broadcast_ids uuid[] := '{}'::uuid[];
  v_updated integer := 0;
begin
  if p_results is null or jsonb_typeof(p_results) <> 'array'
     or jsonb_array_length(p_results) > 100
  then raise exception 'Invalid broadcast results'; end if;

  for v_result in select value from jsonb_array_elements(p_results)
  loop
    if jsonb_typeof(v_result) <> 'object' then
      raise exception 'Invalid broadcast result';
    end if;
    begin
      v_claim_token := (v_result->>'claim_token')::uuid;
    exception when others then raise exception 'Invalid broadcast result token'; end;
    if v_claim_token is null then raise exception 'Invalid broadcast result token'; end if;
    v_outcome := lower(trim(coalesce(v_result->>'result', '')));
    if v_outcome not in ('sent', 'expired', 'failed', 'invalid') then
      raise exception 'Invalid broadcast delivery result';
    end if;
    v_error := nullif(left(trim(coalesce(v_result->>'error', '')), 500), '');

    select * into v_delivery
    from public.push_broadcast_deliveries d
    where d.claim_token = v_claim_token and d.status = 'processing'
    for update;
    continue when not found;

    update public.push_broadcast_deliveries d
    set status = case
          when v_outcome = 'sent' then 'sent'
          when v_outcome = 'expired' then 'expired'
          when v_outcome = 'invalid' then 'invalid'
          when d.attempts >= 10 then 'failed'
          else 'retry'
        end,
        completed_at = case
          when v_outcome in ('sent', 'expired', 'invalid') or d.attempts >= 10 then now()
          else null
        end,
        next_attempt_at = case
          when v_outcome = 'failed' and d.attempts < 10
            then now() + make_interval(secs => least(3600, 15 * (2 ^ least(d.attempts, 8))))
          else d.next_attempt_at
        end,
        last_error = case when v_outcome = 'sent' then null else coalesce(v_error, 'Push delivery failed') end,
        claim_token = null,
        claimed_at = null,
        updated_at = now()
    where d.id = v_delivery.id;

    if not v_delivery.broadcast_id = any(v_broadcast_ids) then
      v_broadcast_ids := array_append(v_broadcast_ids, v_delivery.broadcast_id);
    end if;
    v_updated := v_updated + 1;
  end loop;

  if cardinality(v_broadcast_ids) > 0 then
    with totals as (
      select
        d.broadcast_id,
        count(*)::integer as audience_count,
        count(*) filter (where d.attempts > 0)::integer as attempted_count,
        count(*) filter (where d.status = 'sent')::integer as sent_count,
        count(*) filter (where d.status in ('failed', 'invalid'))::integer as failed_count,
        count(*) filter (where d.status = 'expired')::integer as expired_count,
        count(*) filter (where d.status in ('pending', 'processing', 'retry'))::integer as remaining_count
      from public.push_broadcast_deliveries d
      where d.broadcast_id = any(v_broadcast_ids)
      group by d.broadcast_id
    )
    update public.push_broadcasts b
    set audience_count = t.audience_count,
        attempted_count = t.attempted_count,
        sent_count = t.sent_count,
        failed_count = t.failed_count,
        expired_count = t.expired_count,
        status = case
          when t.remaining_count > 0 then 'processing'
          when t.failed_count = 0 then 'completed'
          when t.sent_count > 0 or t.expired_count > 0 then 'completed_with_errors'
          else 'failed'
        end,
        completed_at = case when t.remaining_count = 0 then coalesce(b.completed_at, now()) else null end,
        updated_at = now()
    from totals t
    where b.id = t.broadcast_id;
  end if;

  return jsonb_build_object('updated', v_updated);
end;
$$;

revoke all on function public.service_finish_push_broadcast_deliveries_v1(jsonb) from public;
grant execute on function public.service_finish_push_broadcast_deliveries_v1(jsonb) to service_role;

create table if not exists public.order_notification_claims (
  order_id uuid not null references public.orders(id) on delete cascade,
  event_key text not null check (length(event_key) between 1 and 160),
  channel text not null check (
    channel in ('admin_whatsapp', 'customer_whatsapp', 'admin_push', 'customer_push')
  ),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (order_id, event_key, channel)
);

create index if not exists order_notification_claims_work_idx
  on public.order_notification_claims (status, next_attempt_at)
  where status in ('pending', 'processing', 'retry');
create index if not exists order_notification_claims_retention_idx
  on public.order_notification_claims (status, completed_at, created_at)
  where status in ('sent', 'failed', 'pending', 'retry');

alter table public.order_notification_claims enable row level security;
revoke all on table public.order_notification_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.order_notification_claims to service_role;

create or replace function public.service_claim_order_notification_v1(
  p_order_id uuid,
  p_event_key text,
  p_channel text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if length(coalesce(p_event_key, '')) not between 1 and 160
     or p_channel not in ('admin_whatsapp', 'customer_whatsapp', 'admin_push', 'customer_push')
  then raise exception 'Invalid notification claim'; end if;

  insert into public.order_notification_claims (order_id, event_key, channel)
  values (p_order_id, p_event_key, p_channel)
  on conflict do nothing;

  update public.order_notification_claims c
  set status = 'retry', claim_token = null, claimed_at = null,
      next_attempt_at = now()
  where c.order_id = p_order_id
    and c.event_key = p_event_key
    and c.channel = p_channel
    and c.status = 'processing'
    and c.claimed_at < now() - interval '2 minutes';

  update public.order_notification_claims c
  set status = 'processing',
      attempts = c.attempts + 1,
      claim_token = gen_random_uuid(),
      claimed_at = now()
  where c.order_id = p_order_id
    and c.event_key = p_event_key
    and c.channel = p_channel
    and c.status in ('pending', 'retry')
    and c.attempts < 10
    and c.next_attempt_at <= now()
  returning c.claim_token into v_token;

  return v_token;
end;
$$;

revoke all on function public.service_claim_order_notification_v1(uuid, text, text) from public;
grant execute on function public.service_claim_order_notification_v1(uuid, text, text) to service_role;

create or replace function public.service_finish_order_notification_v1(
  p_claim_token uuid,
  p_succeeded boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.order_notification_claims c
  set status = case
        when p_succeeded then 'sent'
        when c.attempts >= 10 then 'failed'
        else 'retry'
      end,
      completed_at = case when p_succeeded then now() else null end,
      next_attempt_at = case
        when p_succeeded then c.next_attempt_at
        else now() + make_interval(secs => least(3600, 15 * (2 ^ least(c.attempts, 8))))
      end,
      last_error = case
        when p_succeeded then null
        else left(coalesce(p_error, 'Notification delivery failed'), 500)
      end,
      claim_token = null,
      claimed_at = null
  where c.claim_token = p_claim_token and c.status = 'processing';
end;
$$;

revoke all on function public.service_finish_order_notification_v1(uuid, boolean, text) from public;
grant execute on function public.service_finish_order_notification_v1(uuid, boolean, text) to service_role;

create or replace function public.service_cleanup_commerce_operations_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orphaned_push integer := 0;
  v_disabled_push integer := 0;
  v_notification_claims integer := 0;
  v_broadcasts integer := 0;
begin
  -- A subscription may disappear after a broadcast snapshots its audience.
  -- Retain and close that delivery row so the job can still reach a terminal
  -- state with auditable counts.
  update public.push_broadcast_deliveries d
  set status = 'expired', completed_at = now(), updated_at = now(),
      claim_token = null, claimed_at = null,
      last_error = coalesce(d.last_error, 'Subscription was removed before delivery')
  where d.subscription_id is null
    and d.status in ('pending', 'processing', 'retry');
  get diagnostics v_orphaned_push = row_count;

  update public.push_broadcast_deliveries d
  set status = 'failed', completed_at = now(), updated_at = now(),
      claim_token = null, claimed_at = null,
      last_error = coalesce(d.last_error, 'Push subscription was disabled after repeated failures')
  from public.push_subscriptions s
  where s.id = d.subscription_id
    and s.disabled_at is not null
    and d.status in ('pending', 'processing', 'retry');
  get diagnostics v_disabled_push = row_count;

  -- Recover interrupted notification work, then bound the retained history.
  update public.order_notification_claims c
  set status = case when c.attempts >= 10 then 'failed' else 'retry' end,
      claim_token = null,
      claimed_at = null,
      next_attempt_at = now(),
      completed_at = case when c.attempts >= 10 then now() else null end,
      last_error = case
        when c.attempts >= 10 then coalesce(c.last_error, 'Notification claim expired repeatedly')
        else c.last_error
      end
  where c.status = 'processing'
    and c.claimed_at < now() - interval '5 minutes';

  delete from public.order_notification_claims c
  where (c.status = 'sent' and c.completed_at < now() - interval '30 days')
     or (c.status in ('failed', 'pending', 'retry') and c.created_at < now() - interval '90 days');
  get diagnostics v_notification_claims = row_count;

  -- Refresh all active broadcast summaries, including jobs whose entire
  -- audience unsubscribed before a worker could claim it.
  with totals as (
    select
      b.id as broadcast_id,
      count(d.id)::integer as audience_count,
      count(d.id) filter (where d.attempts > 0)::integer as attempted_count,
      count(d.id) filter (where d.status = 'sent')::integer as sent_count,
      count(d.id) filter (where d.status in ('failed', 'invalid'))::integer as failed_count,
      count(d.id) filter (where d.status = 'expired')::integer as expired_count,
      count(d.id) filter (where d.status in ('pending', 'processing', 'retry'))::integer as remaining_count
    from public.push_broadcasts b
    left join public.push_broadcast_deliveries d on d.broadcast_id = b.id
    where b.status in ('queued', 'processing')
    group by b.id
  )
  update public.push_broadcasts b
  set audience_count = greatest(b.audience_count, t.audience_count),
      attempted_count = t.attempted_count,
      sent_count = t.sent_count,
      failed_count = t.failed_count,
      expired_count = t.expired_count,
      status = case
        when t.remaining_count > 0 then b.status
        when t.failed_count = 0 then 'completed'
        when t.sent_count > 0 or t.expired_count > 0 then 'completed_with_errors'
        else 'failed'
      end,
      completed_at = case when t.remaining_count = 0 then coalesce(b.completed_at, now()) else null end,
      updated_at = now()
  from totals t
  where b.id = t.broadcast_id;

  delete from public.push_broadcasts b
  where (b.status in ('completed', 'completed_with_errors') and b.completed_at < now() - interval '30 days')
     or (b.status = 'failed' and b.completed_at < now() - interval '90 days');
  get diagnostics v_broadcasts = row_count;

  return jsonb_build_object(
    'orphanedPushDeliveriesClosed', v_orphaned_push,
    'disabledPushDeliveriesClosed', v_disabled_push,
    'notificationClaimsDeleted', v_notification_claims,
    'broadcastsDeleted', v_broadcasts
  );
end;
$$;

revoke all on function public.service_cleanup_commerce_operations_v1() from public;
grant execute on function public.service_cleanup_commerce_operations_v1() to service_role;

-- ---------------------------------------------------------------------------
-- Bounded, privacy-light visitor presence
-- ---------------------------------------------------------------------------

create table if not exists public.visitor_presence_rate_buckets (
  bucket_start timestamptz primary key,
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.visitor_presence_rate_buckets enable row level security;
revoke all on table public.visitor_presence_rate_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.visitor_presence_rate_buckets to service_role;

create or replace function public.touch_visitor_presence(
  p_session_id uuid,
  p_current_path text default '/'
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seen_at timestamptz := now();
  v_bucket timestamptz := date_trunc('minute', now());
  v_bucket_count integer;
  v_path text := left(coalesce(nullif(trim(p_current_path), ''), '/'), 160);
begin
  if p_session_id is null then raise exception 'A session ID is required'; end if;
  if v_path !~ '^/[A-Za-z0-9/_.-]*$' then v_path := '/'; end if;

  insert into public.visitor_presence_rate_buckets (bucket_start, request_count)
  values (v_bucket, 1)
  on conflict (bucket_start) do update
  set request_count = public.visitor_presence_rate_buckets.request_count + 1
  returning request_count into v_bucket_count;

  if v_bucket_count > 5000 then
    raise exception 'Presence service is temporarily busy';
  end if;

  -- The first request in each minute performs bounded retention cleanup.
  if v_bucket_count = 1 then
    delete from public.visitor_presence where last_seen_at < now() - interval '24 hours';
    delete from public.visitor_presence_rate_buckets where bucket_start < now() - interval '24 hours';
  end if;

  insert into public.visitor_presence (
    session_id, user_id, current_path, started_at, last_seen_at
  ) values (
    p_session_id, auth.uid(), v_path, v_seen_at, v_seen_at
  )
  on conflict (session_id) do update
  set user_id = auth.uid(),
      current_path = case
        when public.visitor_presence.last_seen_at <= v_seen_at - interval '10 seconds'
          then excluded.current_path
        else public.visitor_presence.current_path
      end,
      started_at = case
        when public.visitor_presence.last_seen_at < v_seen_at - interval '2 minutes'
          then v_seen_at
        else public.visitor_presence.started_at
      end,
      last_seen_at = case
        when public.visitor_presence.last_seen_at <= v_seen_at - interval '10 seconds'
          then excluded.last_seen_at
        else public.visitor_presence.last_seen_at
      end;

  return v_seen_at;
end;
$$;

revoke all on function public.touch_visitor_presence(uuid, text) from public;
grant execute on function public.touch_visitor_presence(uuid, text) to anon, authenticated;

commit;
