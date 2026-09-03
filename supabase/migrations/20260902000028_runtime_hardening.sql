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
  v_attempt integer;
begin
  for v_attempt in 1..32 loop
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

revoke all on function public.generate_internal_package_id_v1()
  from public, anon, authenticated;

commit;
