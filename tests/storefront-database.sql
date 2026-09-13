-- Run inside the rollback-only transaction in scripts/check-storefront-db.cjs.
do $$
declare
  v_admin uuid;
  v_content jsonb;
  v_metrics jsonb;
  v_before bigint;
  v_after bigint;
  v_day date := (now() at time zone 'Africa/Lagos')::date;
  v_browser uuid := gen_random_uuid();
  v_other_browser uuid := gen_random_uuid();
  v_admin_browser uuid := gen_random_uuid();
  v_total bigint;
  v_banned bigint;
begin
  if has_table_privilege('anon', 'public.storefront_daily_visitors', 'select')
     or has_table_privilege('authenticated', 'public.storefront_daily_visitors', 'select')
     or has_table_privilege('authenticated', 'public.storefront_content', 'update') then
    raise exception 'Private tables are directly accessible';
  end if;
  if has_function_privilege('anon', 'public.admin_audience_metrics_v1(integer)', 'execute')
     or has_function_privilege('anon', 'public.admin_save_storefront_content_v1(jsonb,bigint)', 'execute') then
    raise exception 'Anonymous callers have admin function privileges';
  end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.admin_audience_metrics_v1(30);
    raise exception 'Non-admin analytics access was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_save_storefront_content_v1('{}', 1);
    raise exception 'Non-admin content writes were allowed';
  exception when insufficient_privilege then null;
  end;

  select user_id into v_admin from public.admin_users where role = 'owner' limit 1;
  if v_admin is null then raise exception 'This verification needs the existing store owner role'; end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  v_content := public.get_storefront_content_v1();
  if v_content ? 'updated_by' or v_content ? 'updatedBy' then raise exception 'Public content leaked editor identity'; end if;
  perform public.admin_save_storefront_content_v1(v_content->'content', (v_content->>'revision')::bigint);
  begin
    perform public.admin_save_storefront_content_v1(v_content->'content', (v_content->>'revision')::bigint);
    raise exception 'Concurrent content changes were overwritten';
  exception when others then
    if sqlerrm not like 'CONTENT_CONFLICT:%' then raise; end if;
  end;
  v_content := public.get_storefront_content_v1();
  begin
    perform public.admin_save_storefront_content_v1(jsonb_set(v_content->'content', '{slides}', '[]'), (v_content->>'revision')::bigint);
    raise exception 'An empty slideshow was accepted';
  exception when others then
    if sqlerrm <> 'Keep between 1 and 12 slideshow images' then raise; end if;
  end;
  begin
    perform public.admin_save_storefront_content_v1(jsonb_set(v_content->'content', '{detail,image}', '"javascript:alert(1)"'), (v_content->>'revision')::bigint);
    raise exception 'An unsafe image was accepted';
  exception when others then
    if sqlerrm <> 'Choose an uploaded image or a secure https image URL' then raise; end if;
  end;

  v_metrics := public.admin_audience_metrics_v1(30);
  v_before := (v_metrics->>'visitors')::bigint;
  select count(*), count(*) filter (where banned_until > now()) into v_total, v_banned
  from auth.users where deleted_at is null and not coalesce(is_anonymous, false);
  if (v_metrics->>'registeredAccounts')::bigint <> v_total or (v_metrics->>'bannedAccounts')::bigint <> v_banned then
    raise exception 'Account totals disagree with the authentication database';
  end if;
  if jsonb_array_length(public.admin_audience_metrics_v1(7)->'series') <> 7
     or jsonb_array_length(public.admin_audience_metrics_v1(90)->'series') <> 90 then
    raise exception 'Chart ranges are incomplete';
  end if;
  if exists (select 1 from jsonb_array_elements(v_metrics->'series') row
    where (row->>'date')::date < ((v_metrics->>'trackingStartedAt')::timestamptz at time zone 'Africa/Lagos')::date
      and row->'visitors' <> 'null'::jsonb) then
    raise exception 'Unrecorded history was reported as zero';
  end if;

  -- Repeated pages/tabs and heartbeats from one browser must count once.
  perform public.touch_visitor_presence(v_browser, '/index.html');
  perform public.touch_visitor_presence(v_browser, '/men.html');
  update public.visitor_presence set last_seen_at = now() - interval '20 seconds' where session_id = v_browser;
  perform public.touch_visitor_presence(v_browser, '/women.html');
  if (select count(*) from public.storefront_daily_visitors where browser_id = v_browser and visit_date = v_day) <> 1 then
    raise exception 'Repeated visits inflated daily traffic';
  end if;
  perform public.touch_visitor_presence(v_other_browser, '/shop.html');
  perform public.touch_visitor_presence(v_admin_browser, '/admin.html');
  if exists (select 1 from public.storefront_daily_visitors where browser_id = v_admin_browser) then
    raise exception 'An admin page was counted as storefront traffic';
  end if;
  v_after := (public.admin_audience_metrics_v1(30)->>'visitors')::bigint;
  if v_after <> v_before + 2 then raise exception 'Distinct browser total is incorrect'; end if;

  -- Daily history survives live-presence deletion and a return on another day
  -- counts in that day without inflating the whole-period unique total.
  insert into public.storefront_daily_visitors (visit_date, browser_id, first_seen_at)
  values (v_day - 1, v_browser, now() - interval '1 day');
  delete from public.visitor_presence where session_id = v_browser;
  perform public.touch_visitor_presence(v_browser, '/index.html');
  if (public.admin_audience_metrics_v1(30)->>'visitors')::bigint <> v_after then
    raise exception 'Return visits inflated the period total';
  end if;
  if (select count(*) from public.storefront_daily_visitors where browser_id = v_browser) <> 2 then
    raise exception 'Live-presence cleanup removed history';
  end if;
end;
$$;
