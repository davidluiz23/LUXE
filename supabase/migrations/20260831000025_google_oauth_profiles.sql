-- Preserve useful Google identity fields when Supabase creates an OAuth user.
begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );
  v_avatar_url text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
  );
begin
  insert into public.profiles as existing_profile (id, full_name, avatar_url)
  values (new.id, v_full_name, v_avatar_url)
  on conflict (id) do update
  set full_name = coalesce(nullif(existing_profile.full_name, ''), excluded.full_name),
      avatar_url = coalesce(nullif(existing_profile.avatar_url, ''), excluded.avatar_url),
      updated_at = now();

  return new;
end;
$$;

-- Fill missing display fields for OAuth accounts created before this migration.
update public.profiles as profile
set full_name = coalesce(
      nullif(profile.full_name, ''),
      nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(auth_user.email, ''), '@', 1), '')
    ),
    avatar_url = coalesce(
      nullif(profile.avatar_url, ''),
      nullif(btrim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(auth_user.raw_user_meta_data ->> 'picture'), '')
    ),
    updated_at = now()
from auth.users as auth_user
where auth_user.id = profile.id
  and (
    auth_user.raw_app_meta_data ->> 'provider' = 'google'
    or coalesce(auth_user.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
  )
  and (
    nullif(profile.full_name, '') is null
    or nullif(profile.avatar_url, '') is null
  );

commit;
