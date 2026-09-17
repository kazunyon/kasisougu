-- Optional public-system category and self-payment rate for each user's orthosis.
-- Existing records remain valid and display these fields as "未記入" until edited.
alter table public.kasi_user_orthoses
  add column if not exists funding_system_code text,
  add column if not exists self_payment_rate smallint;

alter table public.kasi_user_orthoses
  drop constraint if exists kasi_user_orthoses_funding_system_code_check,
  drop constraint if exists kasi_user_orthoses_self_payment_rate_check;

alter table public.kasi_user_orthoses
  add constraint kasi_user_orthoses_funding_system_code_check
  check (funding_system_code is null or funding_system_code in ('medical_insurance', 'disability_support', 'other')),
  add constraint kasi_user_orthoses_self_payment_rate_check
  check (self_payment_rate is null or self_payment_rate in (1, 2, 3));
