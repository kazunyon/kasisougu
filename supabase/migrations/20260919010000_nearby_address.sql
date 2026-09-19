-- 近くで探すの出発地として使う任意住所を、本人専用設定に保存する。
begin;

alter table public.kasi_profiles
  add column if not exists nearby_address text;

alter table public.kasi_profiles
  drop constraint if exists kasi_profiles_nearby_address_length;

alter table public.kasi_profiles
  add constraint kasi_profiles_nearby_address_length
  check (nearby_address is null or char_length(nearby_address) between 1 and 200);

commit;
