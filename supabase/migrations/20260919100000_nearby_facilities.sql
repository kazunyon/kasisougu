-- 「近くで探す」用の公開施設マスタ。登録・更新は運営者が管理画面またはSQLで行う。
begin;

create table if not exists public.kasi_nearby_facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  prefecture text not null check (char_length(btrim(prefecture)) between 1 and 20),
  municipality text not null check (char_length(btrim(municipality)) between 1 and 80),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  purpose_codes text[] not null check (cardinality(purpose_codes) > 0 and purpose_codes <@ array['manufacture','repair','fitting','rehabilitation','consultation']::text[]),
  phone text check (phone is null or char_length(phone) <= 40),
  website_url text check (website_url is null or (char_length(website_url) <= 2048 and website_url ~ '^https?://')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0)
);

create index if not exists kasi_nearby_facilities_search_idx on public.kasi_nearby_facilities (prefecture, municipality, name) where is_active;
create index if not exists kasi_nearby_facilities_purposes_idx on public.kasi_nearby_facilities using gin (purpose_codes);
alter table public.kasi_nearby_facilities enable row level security;
revoke all on table public.kasi_nearby_facilities from anon, authenticated;
grant select on table public.kasi_nearby_facilities to authenticated;
create policy kasi_nearby_facilities_read_active on public.kasi_nearby_facilities for select to authenticated using (is_active);
create trigger kasi_trg_kasi_nearby_facilities_updated before update on public.kasi_nearby_facilities for each row execute function private.kasi_set_updated_at_and_version();

commit;
