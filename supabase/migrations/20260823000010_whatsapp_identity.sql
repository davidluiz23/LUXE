-- One verified WhatsApp identity per customer account.

alter table public.profiles
  add column if not exists whatsapp_phone text,
  add column if not exists whatsapp_verified_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_whatsapp_phone_format;

alter table public.profiles
  add constraint profiles_whatsapp_phone_format
  check (whatsapp_phone is null or whatsapp_phone ~ '^\+[1-9][0-9]{6,14}$')
  not valid;

create unique index if not exists profiles_verified_whatsapp_phone_idx
  on public.profiles (whatsapp_phone)
  where whatsapp_phone is not null and whatsapp_verified_at is not null;

-- Verification fields can only be written by the service-role Edge Function.
revoke update on table public.profiles from authenticated;
grant update (full_name, phone, avatar_url, updated_at)
  on table public.profiles to authenticated;

create table if not exists public.commerce_settings (
  singleton boolean primary key default true check (singleton),
  whatsapp_verification_required boolean not null default false,
  whatsapp_default_country_code text not null default '234'
    check (whatsapp_default_country_code ~ '^[1-9][0-9]{0,3}$'),
  updated_at timestamptz not null default now()
);

insert into public.commerce_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.commerce_settings enable row level security;
revoke all on table public.commerce_settings from anon, authenticated;

create or replace function public.commerce_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'whatsappVerificationRequired', coalesce(s.whatsapp_verification_required, false),
    'whatsappDefaultCountryCode', coalesce(s.whatsapp_default_country_code, '234')
  )
  from public.commerce_settings s
  where s.singleton = true;
$$;

revoke all on function public.commerce_public_settings() from public;
grant execute on function public.commerce_public_settings() to anon, authenticated;

create table if not exists public.whatsapp_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  code_hash text not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_challenges_user_created_idx
  on public.whatsapp_verification_challenges (user_id, created_at desc);

create index if not exists whatsapp_challenges_phone_created_idx
  on public.whatsapp_verification_challenges (phone, created_at desc);

create unique index if not exists whatsapp_challenges_one_active_user_idx
  on public.whatsapp_verification_challenges (user_id)
  where consumed_at is null;

create unique index if not exists whatsapp_challenges_one_active_phone_idx
  on public.whatsapp_verification_challenges (phone)
  where consumed_at is null;

alter table public.whatsapp_verification_challenges enable row level security;
revoke all on table public.whatsapp_verification_challenges from anon, authenticated;

create or replace function public.normalize_whatsapp_phone(
  p_phone text,
  p_default_country_code text default '234'
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_country text := regexp_replace(coalesce(p_default_country_code, '234'), '[^0-9]', '', 'g');
begin
  if left(v_phone, 2) = '00' then
    v_phone := substr(v_phone, 3);
  elsif left(v_phone, 1) = '0' then
    v_phone := v_country || substr(v_phone, 2);
  end if;

  if v_phone !~ '^[1-9][0-9]{6,14}$' then
    return null;
  end if;

  return '+' || v_phone;
end;
$$;

revoke all on function public.normalize_whatsapp_phone(text, text) from public;

create or replace function public.enforce_order_whatsapp_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required boolean := false;
  v_country text := '234';
  v_verified_phone text;
  v_verified_at timestamptz;
  v_order_phone text;
begin
  select s.whatsapp_verification_required, s.whatsapp_default_country_code
    into v_required, v_country
  from public.commerce_settings s
  where s.singleton = true;

  v_order_phone := public.normalize_whatsapp_phone(new.contact_phone, v_country);
  if v_order_phone is null then
    raise exception 'Enter a valid WhatsApp phone number';
  end if;

  if coalesce(v_required, false) then
    select p.whatsapp_phone, p.whatsapp_verified_at
      into v_verified_phone, v_verified_at
    from public.profiles p
    where p.id = new.user_id;

    if v_verified_at is null or v_verified_phone is distinct from v_order_phone then
      raise exception 'Verify this WhatsApp number in your account before ordering';
    end if;
  end if;

  new.contact_phone := v_order_phone;
  return new;
end;
$$;

drop trigger if exists orders_enforce_whatsapp_identity on public.orders;
create trigger orders_enforce_whatsapp_identity
before insert on public.orders
for each row execute function public.enforce_order_whatsapp_identity();

-- Keep verification optional until the Meta template and function secrets are
-- configured. Enable it with the command documented in COMMERCE_SETUP.md.
