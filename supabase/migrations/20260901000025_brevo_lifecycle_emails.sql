-- Durable Brevo lifecycle email delivery and private fulfilment identities.
--
-- Email work is committed in the same transaction as the business event, then
-- claimed by service-role Edge Functions. Customer-facing order rows never
-- contain the private package identifier.

begin;

-- ---------------------------------------------------------------------------
-- Private, durable email queue
-- ---------------------------------------------------------------------------

create table if not exists public.email_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique
    check (
      length(dedupe_key) between 8 and 200
      and dedupe_key ~ '^[a-z0-9:_-]+$'
    ),
  kind text not null
    check (kind in ('order', 'site_update')),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  site_update_id uuid references public.site_updates(id) on delete cascade,
  template_key text not null
    check (
      template_key in (
        'order_received', 'order_processing', 'order_confirmed',
        'order_shipped', 'order_delivered', 'order_cancelled',
        'site_update'
      )
    ),
  recipient_email text not null
    check (
      length(recipient_email) between 3 and 254
      and recipient_email = lower(trim(recipient_email))
      and recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  recipient_name text not null default 'Customer'
    check (length(recipient_name) between 1 and 120),
  payload jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(payload) = 'object'
      and octet_length(payload::text) <= 16384
    ),
  priority smallint not null default 10
    check (priority between 0 and 100),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'failed', 'suppressed')),
  attempts smallint not null default 0
    check (attempts between 0 and 10),
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text
    check (provider_message_id is null or length(provider_message_id) between 1 and 500),
  last_error text
    check (last_error is null or length(last_error) between 1 and 500),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (kind = 'order' and order_id is not null and site_update_id is null
      and template_key like 'order\_%' escape '\')
    or
    (kind = 'site_update' and order_id is null and site_update_id is not null
      and template_key = 'site_update')
  ),
  check (
    (status = 'processing' and claim_token is not null and claimed_at is not null)
    or
    (status <> 'processing' and claim_token is null and claimed_at is null)
  ),
  check (
    (status in ('sent', 'failed', 'suppressed') and completed_at is not null)
    or
    (status in ('pending', 'processing', 'retry') and completed_at is null)
  ),
  check (expires_at > created_at),
  check (updated_at >= created_at)
);

create index if not exists email_delivery_queue_work_idx
  on public.email_delivery_queue (priority desc, next_attempt_at, created_at, id)
  where status in ('pending', 'processing', 'retry');

create index if not exists email_delivery_queue_order_work_idx
  on public.email_delivery_queue (order_id, created_at, id)
  where kind = 'order' and status in ('pending', 'processing', 'retry');

create index if not exists email_delivery_queue_broadcast_daily_idx
  on public.email_delivery_queue (completed_at, claimed_at)
  where kind = 'site_update' and status in ('processing', 'sent');

create index if not exists email_delivery_queue_retention_idx
  on public.email_delivery_queue (status, completed_at, created_at);

create unique index if not exists email_delivery_queue_claim_token_uidx
  on public.email_delivery_queue (claim_token)
  where claim_token is not null;

alter table public.email_delivery_queue enable row level security;
revoke all on table public.email_delivery_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.email_delivery_queue to service_role;

-- ---------------------------------------------------------------------------
-- Admin-only immutable package identity
-- ---------------------------------------------------------------------------

alter table public.order_admin_state
  add column if not exists internal_package_id text,
  add column if not exists package_assigned_at timestamptz;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_admin_state'::regclass
      and conname = 'order_admin_state_package_pair_check'
  ) then
    alter table public.order_admin_state
      add constraint order_admin_state_package_pair_check
      check (
        (internal_package_id is null and package_assigned_at is null)
        or
        (internal_package_id is not null and package_assigned_at is not null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_admin_state'::regclass
      and conname = 'order_admin_state_package_format_check'
  ) then
    alter table public.order_admin_state
      add constraint order_admin_state_package_format_check
      check (
        internal_package_id is null
        or internal_package_id ~ '^ALK-PKG-[0-9A-F]{12}$'
      );
  end if;
end;
$migration$;

create unique index if not exists order_admin_state_internal_package_id_uidx
  on public.order_admin_state (internal_package_id)
  where internal_package_id is not null;

alter table public.order_admin_state enable row level security;
revoke all on table public.order_admin_state from public, anon, authenticated;
grant select, insert, update, delete on table public.order_admin_state to service_role;

create or replace function public.generate_internal_package_id_v1()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate text;
  v_attempt integer;
begin
  for v_attempt in 1..32 loop
    -- gen_random_uuid() is cryptographically random. Twelve hexadecimal
    -- characters provide the requested opaque 48-bit admin reference.
    v_candidate := 'ALK-PKG-' || upper(
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    );
    exit when not exists (
      select 1
      from public.order_admin_state s
      where s.internal_package_id = v_candidate
    );
  end loop;

  if v_candidate is null or exists (
    select 1
    from public.order_admin_state s
    where s.internal_package_id = v_candidate
  ) then
    raise exception 'A unique package identity could not be generated';
  end if;
  return v_candidate;
end;
$$;

revoke all on function public.generate_internal_package_id_v1() from public, anon, authenticated;

create or replace function public.protect_internal_package_identity_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.internal_package_id is not null and (
    new.internal_package_id is distinct from old.internal_package_id
    or new.package_assigned_at is distinct from old.package_assigned_at
  ) then
    raise exception 'The internal package identity is immutable once assigned';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_internal_package_identity_v1() from public, anon, authenticated;

drop trigger if exists order_admin_state_protect_package_identity
  on public.order_admin_state;
create trigger order_admin_state_protect_package_identity
before update of internal_package_id, package_assigned_at
on public.order_admin_state
for each row execute function public.protect_internal_package_identity_v1();

-- ---------------------------------------------------------------------------
-- Atomic queue producers
-- ---------------------------------------------------------------------------

create or replace function public.queue_order_received_email_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(new.contact_email, '')));
  v_name text := left(coalesce(nullif(trim(new.contact_name), ''), 'Customer'), 120);
  v_event_key text := 'created:' || coalesce(new.created_at::text, new.id::text);
begin
  -- Checkout already validates this address. The guard keeps a legacy or
  -- privileged malformed insert from making the order transaction fail.
  if length(v_email) > 254
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return new;
  end if;

  insert into public.email_delivery_queue (
    dedupe_key, kind, user_id, order_id, template_key,
    recipient_email, recipient_name, payload, priority, expires_at
  ) values (
    'order:' || new.id::text || ':received',
    'order', new.user_id, new.id, 'order_received',
    v_email, v_name,
    jsonb_build_object(
      'status', 'received',
      'admin_version', coalesce(new.admin_version, 0),
      'eventKey', v_event_key,
      'order_number', new.order_number,
      'total', new.total,
      'currency', new.currency,
      'payment_status', new.payment_status,
      'estimated_delivery_min_days', new.estimated_delivery_min_days,
      'estimated_delivery_max_days', new.estimated_delivery_max_days,
      'waybill_url', new.waybill_url
    ),
    100,
    now() + interval '14 days'
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_order_received_email_v1() from public, anon, authenticated;

drop trigger if exists orders_queue_received_email on public.orders;
create trigger orders_queue_received_email
after insert on public.orders
for each row execute function public.queue_order_received_email_v1();

create or replace function public.queue_order_status_email_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(new.contact_email, '')));
  v_name text := left(coalesce(nullif(trim(new.contact_name), ''), 'Customer'), 120);
  v_event_key text;
begin
  if new.status is not distinct from old.status
     or new.status not in ('processing', 'confirmed', 'shipped', 'delivered', 'cancelled')
  then
    return new;
  end if;
  if length(v_email) > 254
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return new;
  end if;

  v_event_key := 'status:' || coalesce(new.admin_version, 0)::text || ':' || new.status;
  insert into public.email_delivery_queue (
    dedupe_key, kind, user_id, order_id, template_key,
    recipient_email, recipient_name, payload, priority, expires_at
  ) values (
    'order:' || new.id::text || ':status:' || new.status,
    'order', new.user_id, new.id, 'order_' || new.status,
    v_email, v_name,
    jsonb_build_object(
      'status', new.status,
      'previous_status', old.status,
      'admin_version', coalesce(new.admin_version, 0),
      'eventKey', v_event_key,
      'order_number', new.order_number,
      'total', new.total,
      'currency', new.currency,
      'payment_status', new.payment_status,
      'estimated_delivery_min_days', new.estimated_delivery_min_days,
      'estimated_delivery_max_days', new.estimated_delivery_max_days,
      'waybill_url', new.waybill_url
    ),
    100,
    now() + interval '14 days'
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_order_status_email_v1() from public, anon, authenticated;

drop trigger if exists orders_queue_status_email on public.orders;
create trigger orders_queue_status_email
after update of status on public.orders
for each row execute function public.queue_order_status_email_v1();

create or replace function public.queue_site_update_emails_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.active then return new; end if;

  insert into public.email_delivery_queue (
    dedupe_key, kind, user_id, site_update_id, template_key,
    recipient_email, recipient_name, payload, priority, expires_at
  )
  select
    'site-update:' || new.id::text || ':' || u.id::text,
    'site_update',
    u.id,
    new.id,
    'site_update',
    lower(trim(u.email::text)),
    left(coalesce(nullif(trim(p.full_name), ''), 'Customer'), 120),
    jsonb_build_object(
      'title', new.title,
      'message', new.message,
      'target_url', 'index.html#site-updates'
    ),
    10,
    now() + interval '72 hours'
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.customer_account_state a on a.user_id = u.id
  where p.email_updates_opt_in_at is not null
    and u.email is not null
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= now())
    and coalesce(a.account_status, 'active') = 'active'
    and length(trim(u.email::text)) <= 254
    and lower(trim(u.email::text)) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_site_update_emails_v1() from public, anon, authenticated;

drop trigger if exists site_updates_queue_email_broadcast on public.site_updates;
create trigger site_updates_queue_email_broadcast
after insert on public.site_updates
for each row execute function public.queue_site_update_emails_v1();

-- ---------------------------------------------------------------------------
-- Service-role queue preparation, claims, completion and retention
-- ---------------------------------------------------------------------------

create or replace function public.service_prepare_email_delivery_queue_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stale integer := 0;
  v_expired integer := 0;
  v_exhausted integer := 0;
  v_recipient_refreshed integer := 0;
  v_consent_suppressed integer := 0;
begin
  update public.email_delivery_queue q
  set status = case when q.attempts >= 10 then 'failed' else 'retry' end,
      claim_token = null,
      claimed_at = null,
      next_attempt_at = now(),
      completed_at = case when q.attempts >= 10 then now() else null end,
      last_error = case
        when q.attempts >= 10 then coalesce(q.last_error, 'Delivery claim expired repeatedly')
        else coalesce(q.last_error, 'Interrupted delivery will be retried')
      end,
      updated_at = now()
  where q.status = 'processing'
    and q.claimed_at < now() - interval '5 minutes';
  get diagnostics v_stale = row_count;

  update public.email_delivery_queue q
  set status = 'suppressed',
      claim_token = null,
      claimed_at = null,
      completed_at = now(),
      last_error = 'Delivery expired before it could be sent',
      updated_at = now()
  where q.status in ('pending', 'retry')
    and q.expires_at <= now();
  get diagnostics v_expired = row_count;

  update public.email_delivery_queue q
  set status = 'failed',
      claim_token = null,
      claimed_at = null,
      completed_at = now(),
      last_error = coalesce(q.last_error, 'Maximum delivery attempts reached'),
      updated_at = now()
  where q.status in ('pending', 'retry')
    and q.attempts >= 10;
  get diagnostics v_exhausted = row_count;

  -- Site updates use the account's current confirmed address and name. This
  -- also keeps queued PII current if the address changes before delivery.
  with valid_recipients as (
    select
      q.id,
      lower(trim(u.email::text)) as recipient_email,
      left(coalesce(nullif(trim(p.full_name), ''), 'Customer'), 120) as recipient_name
    from public.email_delivery_queue q
    join auth.users u on u.id = q.user_id
    join public.profiles p on p.id = q.user_id
    join public.site_updates su on su.id = q.site_update_id and su.active
    left join public.customer_account_state a on a.user_id = q.user_id
    where q.kind = 'site_update'
      and q.status in ('pending', 'retry')
      and p.email_updates_opt_in_at is not null
      and u.email is not null
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and coalesce(a.account_status, 'active') = 'active'
      and length(trim(u.email::text)) <= 254
      and lower(trim(u.email::text)) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
  update public.email_delivery_queue q
  set recipient_email = v.recipient_email,
      recipient_name = v.recipient_name,
      updated_at = now()
  from valid_recipients v
  where q.id = v.id
    and (
      q.recipient_email is distinct from v.recipient_email
      or q.recipient_name is distinct from v.recipient_name
    );
  get diagnostics v_recipient_refreshed = row_count;

  update public.email_delivery_queue q
  set status = 'suppressed',
      claim_token = null,
      claimed_at = null,
      completed_at = now(),
      last_error = 'Email-update consent or account eligibility is no longer active',
      updated_at = now()
  where q.kind = 'site_update'
    and q.status in ('pending', 'retry')
    and not exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      join public.site_updates su on su.id = q.site_update_id and su.active
      left join public.customer_account_state a on a.user_id = u.id
      where u.id = q.user_id
        and p.email_updates_opt_in_at is not null
        and u.email is not null
        and u.email_confirmed_at is not null
        and (u.banned_until is null or u.banned_until <= now())
        and coalesce(a.account_status, 'active') = 'active'
        and length(trim(u.email::text)) <= 254
        and lower(trim(u.email::text)) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    );
  get diagnostics v_consent_suppressed = row_count;

  return jsonb_build_object(
    'staleClaimsRecovered', v_stale,
    'expiredDeliveriesSuppressed', v_expired,
    'exhaustedDeliveriesFailed', v_exhausted,
    'siteRecipientsRefreshed', v_recipient_refreshed,
    'siteConsentSuppressed', v_consent_suppressed
  );
end;
$$;

revoke all on function public.service_prepare_email_delivery_queue_v1()
  from public, anon, authenticated;

create or replace function public.service_claim_email_delivery_by_key_v1(
  p_dedupe_key text
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  kind text,
  order_id uuid,
  site_update_id uuid,
  template_key text,
  recipient_email text,
  recipient_name text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(coalesce(p_dedupe_key, '')) not between 8 and 200
     or p_dedupe_key !~ '^[a-z0-9:_-]+$'
  then raise exception 'Invalid email delivery key'; end if;

  perform public.service_prepare_email_delivery_queue_v1();

  return query
  with candidate as (
    select q.id
    from public.email_delivery_queue q
    where q.dedupe_key = p_dedupe_key
      and q.status in ('pending', 'retry')
      and q.next_attempt_at <= now()
      and q.expires_at > now()
      and q.attempts < 10
      and (
        q.kind <> 'order'
        or not exists (
          select 1
          from public.email_delivery_queue earlier
          where earlier.kind = 'order'
            and earlier.order_id = q.order_id
            and earlier.status in ('pending', 'processing', 'retry')
            and (earlier.created_at, earlier.id) < (q.created_at, q.id)
        )
      )
    for update of q skip locked
    limit 1
  ), claimed as (
    update public.email_delivery_queue q
    set status = 'processing',
        attempts = q.attempts + 1,
        claim_token = gen_random_uuid(),
        claimed_at = now(),
        updated_at = now()
    from candidate c
    where q.id = c.id
    returning q.*
  )
  select
    c.id, c.claim_token, c.kind, c.order_id, c.site_update_id,
    c.template_key, c.recipient_email, c.recipient_name, c.payload
  from claimed c;
end;
$$;

revoke all on function public.service_claim_email_delivery_by_key_v1(text)
  from public, anon, authenticated;
grant execute on function public.service_claim_email_delivery_by_key_v1(text)
  to service_role;

create or replace function public.service_claim_email_deliveries_v1(
  p_limit integer default 25,
  p_broadcast_daily_limit integer default 200
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  kind text,
  order_id uuid,
  site_update_id uuid,
  template_key text,
  recipient_email text,
  recipient_name text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_daily_limit integer := greatest(0, least(coalesce(p_broadcast_daily_limit, 200), 100000));
  v_claimed integer := 0;
  v_broadcast_used integer := 0;
  v_broadcast_remaining integer := 0;
  v_site_limit integer := 0;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  perform public.service_prepare_email_delivery_queue_v1();

  -- Always claim transactional order email first. Only the earliest live event
  -- for an order is eligible, preserving customer-visible lifecycle ordering.
  return query
  with candidates as (
    select q.id
    from public.email_delivery_queue q
    where q.kind = 'order'
      and q.status in ('pending', 'retry')
      and q.next_attempt_at <= now()
      and q.expires_at > now()
      and q.attempts < 10
      and not exists (
        select 1
        from public.email_delivery_queue earlier
        where earlier.kind = 'order'
          and earlier.order_id = q.order_id
          and earlier.status in ('pending', 'processing', 'retry')
          and (earlier.created_at, earlier.id) < (q.created_at, q.id)
      )
    order by q.priority desc, q.created_at, q.id
    for update of q skip locked
    limit v_limit
  ), claimed as (
    update public.email_delivery_queue q
    set status = 'processing',
        attempts = q.attempts + 1,
        claim_token = gen_random_uuid(),
        claimed_at = now(),
        updated_at = now()
    from candidates c
    where q.id = c.id
    returning q.*
  )
  select
    c.id, c.claim_token, c.kind, c.order_id, c.site_update_id,
    c.template_key, c.recipient_email, c.recipient_name, c.payload
  from claimed c;
  get diagnostics v_claimed = row_count;

  if v_claimed >= v_limit or v_daily_limit = 0 then return; end if;

  -- Serialize daily broadcast reservations. In-flight claims count against the
  -- cap so overlapping workers cannot collectively over-claim the allowance.
  perform pg_advisory_xact_lock(
    hashtextextended('brevo-site-update-email-daily-cap', 0)
  );
  select count(*)::integer into v_broadcast_used
  from public.email_delivery_queue q
  where q.kind = 'site_update'
    and (
      (q.status = 'sent' and q.completed_at >= v_day_start)
      or
      (q.status = 'processing' and q.claimed_at >= v_day_start)
    );

  v_broadcast_remaining := greatest(0, v_daily_limit - v_broadcast_used);
  v_site_limit := least(v_limit - v_claimed, v_broadcast_remaining);
  if v_site_limit <= 0 then return; end if;

  return query
  with candidates as (
    select q.id
    from public.email_delivery_queue q
    where q.kind = 'site_update'
      and q.status in ('pending', 'retry')
      and q.next_attempt_at <= now()
      and q.expires_at > now()
      and q.attempts < 10
    order by q.priority desc, q.created_at, q.id
    for update of q skip locked
    limit v_site_limit
  ), claimed as (
    update public.email_delivery_queue q
    set status = 'processing',
        attempts = q.attempts + 1,
        claim_token = gen_random_uuid(),
        claimed_at = now(),
        updated_at = now()
    from candidates c
    where q.id = c.id
    returning q.*
  )
  select
    c.id, c.claim_token, c.kind, c.order_id, c.site_update_id,
    c.template_key, c.recipient_email, c.recipient_name, c.payload
  from claimed c;
end;
$$;

revoke all on function public.service_claim_email_deliveries_v1(integer, integer)
  from public, anon, authenticated;
grant execute on function public.service_claim_email_deliveries_v1(integer, integer)
  to service_role;

create or replace function public.service_finish_email_delivery_v1(
  p_claim_token uuid,
  p_result text,
  p_provider_message_id text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result text := lower(trim(coalesce(p_result, '')));
  v_provider_message_id text := nullif(left(trim(coalesce(p_provider_message_id, '')), 500), '');
  v_error text := nullif(left(trim(coalesce(p_error, '')), 500), '');
  v_delivery public.email_delivery_queue%rowtype;
  v_final_status text;
  v_next_attempt timestamptz;
begin
  if p_claim_token is null or v_result not in ('sent', 'retry', 'failed', 'suppressed') then
    raise exception 'Invalid email delivery result';
  end if;

  select * into v_delivery
  from public.email_delivery_queue q
  where q.claim_token = p_claim_token and q.status = 'processing'
  for update;
  if not found then
    return jsonb_build_object('updated', false);
  end if;

  v_final_status := v_result;
  if v_result = 'retry' then
    if v_delivery.attempts >= 10 then
      v_final_status := 'failed';
      v_error := coalesce(v_error, 'Maximum delivery attempts reached');
    else
      v_next_attempt := now() + make_interval(
        secs => (
          least(21600, 30 * (2 ^ least(v_delivery.attempts, 9)))
          + floor(random() * 31)
        )::integer
      );
      if v_next_attempt >= v_delivery.expires_at then
        v_final_status := 'suppressed';
        v_error := coalesce(v_error, 'Delivery expired before its next retry');
      end if;
    end if;
  end if;

  if v_final_status = 'failed' then
    v_error := coalesce(v_error, 'Email delivery failed');
  elsif v_final_status = 'suppressed' then
    v_error := coalesce(v_error, 'Email delivery was suppressed');
  end if;

  update public.email_delivery_queue q
  set status = v_final_status,
      provider_message_id = case
        when v_final_status = 'sent' then v_provider_message_id
        else q.provider_message_id
      end,
      last_error = case when v_final_status = 'sent' then null else v_error end,
      next_attempt_at = case
        when v_final_status = 'retry' then v_next_attempt
        else q.next_attempt_at
      end,
      completed_at = case
        when v_final_status in ('sent', 'failed', 'suppressed') then now()
        else null
      end,
      claim_token = null,
      claimed_at = null,
      updated_at = now()
  where q.id = v_delivery.id;

  return jsonb_build_object(
    'updated', true,
    'deliveryId', v_delivery.id,
    'status', v_final_status,
    'attempts', v_delivery.attempts,
    'nextAttemptAt', case when v_final_status = 'retry' then v_next_attempt else null end
  );
end;
$$;

revoke all on function public.service_finish_email_delivery_v1(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.service_finish_email_delivery_v1(uuid, text, text, text)
  to service_role;

create or replace function public.service_cleanup_email_deliveries_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prepared jsonb;
  v_sent_deleted integer := 0;
  v_suppressed_deleted integer := 0;
  v_failed_deleted integer := 0;
begin
  select public.service_prepare_email_delivery_queue_v1() into v_prepared;

  delete from public.email_delivery_queue q
  where q.status = 'sent'
    and q.completed_at < now() - interval '30 days';
  get diagnostics v_sent_deleted = row_count;

  delete from public.email_delivery_queue q
  where q.status = 'suppressed'
    and q.completed_at < now() - interval '30 days';
  get diagnostics v_suppressed_deleted = row_count;

  delete from public.email_delivery_queue q
  where q.status = 'failed'
    and q.completed_at < now() - interval '90 days';
  get diagnostics v_failed_deleted = row_count;

  return jsonb_build_object(
    'prepared', v_prepared,
    'sentDeleted', v_sent_deleted,
    'suppressedDeleted', v_suppressed_deleted,
    'failedDeleted', v_failed_deleted
  );
end;
$$;

revoke all on function public.service_cleanup_email_deliveries_v1()
  from public, anon, authenticated;
grant execute on function public.service_cleanup_email_deliveries_v1()
  to service_role;

-- ---------------------------------------------------------------------------
-- Admin v4 order operations: private package assignment/search
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_order_v4(
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
  v_order_changed boolean := false;
  v_status_changed boolean := false;
  v_package_needed boolean := false;
  v_package_assigned_now boolean := false;
  v_package_id text;
  v_package_assigned_at timestamptz;
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

  select s.internal_package_id, s.package_assigned_at
  into v_package_id, v_package_assigned_at
  from public.order_admin_state s
  where s.order_id = p_order_id
  for update;

  v_status_changed := v_old.status is distinct from p_status;
  v_order_changed := v_status_changed
    or v_old.estimated_delivery_min_days is distinct from p_estimated_min_days
    or v_old.estimated_delivery_max_days is distinct from p_estimated_max_days
    or v_old.waybill_url is distinct from v_waybill;
  v_package_needed := p_status in ('confirmed', 'shipped', 'delivered')
    and v_package_id is null;

  if not v_order_changed and not v_package_needed then
    return jsonb_build_object(
      'changed', false,
      'order', to_jsonb(v_old) || jsonb_build_object(
        'internal_package_id', v_package_id,
        'package_assigned_at', v_package_assigned_at
      )
    );
  end if;

  select email::text into v_admin_email from auth.users where id = auth.uid();
  if v_admin_email is null then raise exception 'Administrator email is unavailable'; end if;
  v_action := case
    when not v_order_changed and v_package_needed then 'order_package_assigned'
    when v_status_changed and p_status = 'processing' then 'order_processing'
    when v_status_changed and p_status = 'confirmed' then 'order_confirmed'
    when v_status_changed and p_status = 'shipped' then 'order_shipped'
    when v_status_changed and p_status = 'delivered' then 'order_delivered'
    when v_status_changed and p_status = 'cancelled' then 'order_cancelled'
    else 'order_updated'
  end;

  if v_order_changed then
    update public.orders set
      status = p_status,
      estimated_delivery_min_days = p_estimated_min_days,
      estimated_delivery_max_days = p_estimated_max_days,
      waybill_url = v_waybill,
      admin_seen_at = coalesce(admin_seen_at, now()),
      updated_at = now()
    where id = p_order_id
    returning * into v_order;
  else
    v_order := v_old;
  end if;

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

  if v_package_needed then
    v_package_id := public.generate_internal_package_id_v1();
    update public.order_admin_state s
    set internal_package_id = v_package_id,
        package_assigned_at = now()
    where s.order_id = p_order_id
      and s.internal_package_id is null
    returning s.package_assigned_at into v_package_assigned_at;
    v_package_assigned_now := found;
  end if;

  select s.internal_package_id, s.package_assigned_at
  into v_package_id, v_package_assigned_at
  from public.order_admin_state s
  where s.order_id = p_order_id;

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
      'packageAssigned', v_package_assigned_now,
      'version', v_order.admin_version
    )
  );

  return jsonb_build_object(
    'changed', true,
    'order', to_jsonb(v_order) || jsonb_build_object(
      'internal_package_id', v_package_id,
      'package_assigned_at', v_package_assigned_at
    )
  );
end;
$$;

revoke all on function public.admin_update_order_v4(uuid, text, integer, integer, text, bigint)
  from public, anon;
grant execute on function public.admin_update_order_v4(uuid, text, integer, integer, text, bigint)
  to authenticated;

create or replace function public.admin_list_orders_v4(
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
    left join public.order_admin_state package_state
      on package_state.order_id = o.id
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
        or position(v_search in lower(coalesce(package_state.internal_package_id, ''))) > 0
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
        'last_admin_changed_at', s.changed_at,
        'internal_package_id', s.internal_package_id,
        'package_assigned_at', s.package_assigned_at
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

  return coalesce(
    v_result,
    jsonb_build_object('orders', '[]'::jsonb, 'hasMore', false, 'nextCursor', null)
  );
end;
$$;

revoke all on function public.admin_list_orders_v4(text, text, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.admin_list_orders_v4(text, text, integer, timestamptz, uuid)
  to authenticated;

commit;
