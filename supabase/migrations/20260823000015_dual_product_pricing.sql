-- Merchant-entered dual pricing. The existing price columns remain the
-- authoritative USD checkout values; NGN is stored independently so an
-- exchange rate is never guessed in the browser.

alter table public.products
  add column if not exists price_ngn numeric(14,2),
  add column if not exists old_price_ngn numeric(14,2);

alter table public.products
  drop constraint if exists products_price_ngn_nonnegative;
alter table public.products
  add constraint products_price_ngn_nonnegative
  check (price_ngn is null or price_ngn >= 0);

alter table public.products
  drop constraint if exists products_old_price_ngn_nonnegative;
alter table public.products
  add constraint products_old_price_ngn_nonnegative
  check (old_price_ngn is null or old_price_ngn >= 0);

