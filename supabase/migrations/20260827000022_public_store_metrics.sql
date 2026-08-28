-- Public, aggregate-only storefront metrics. No customer or order details are
-- exposed; the About page receives four counts calculated from live data.

create or replace function public.public_store_metrics_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'availablePieces', (
      select count(*) from public.products where in_stock
    ),
    'designersCurated', (
      select count(distinct lower(trim(brand)))
      from public.products
      where in_stock and nullif(trim(brand), '') is not null
    ),
    'collections', (
      select count(distinct lower(trim(category)))
      from public.products
      where in_stock and nullif(trim(category), '') is not null
    ),
    'deliveredOrders', (
      select count(*) from public.orders where status = 'delivered'
    )
  );
$$;

revoke all on function public.public_store_metrics_v1() from public;
grant execute on function public.public_store_metrics_v1() to anon, authenticated;
