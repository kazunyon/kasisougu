-- Optional purchase price in Japanese yen for each user's orthosis.
-- Existing records remain valid and display the price as "未記入" until edited.
alter table public.kasi_user_orthoses
  add column if not exists price_yen bigint;

alter table public.kasi_user_orthoses
  drop constraint if exists kasi_user_orthoses_price_yen_check;

alter table public.kasi_user_orthoses
  add constraint kasi_user_orthoses_price_yen_check
  check (price_yen is null or price_yen >= 0);
