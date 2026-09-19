-- Google Maps等で見つけた施設を、利用者本人の候補として保存する。
begin;

create table if not exists public.kasi_candidate_facilities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  facility_type text not null check (char_length(btrim(facility_type)) between 1 and 80),
  address text check (address is null or char_length(btrim(address)) between 1 and 300),
  phone text check (phone is null or char_length(phone) <= 40),
  google_maps_url text check (google_maps_url is null or (char_length(google_maps_url) <= 2048 and google_maps_url ~ '^https?://')),
  consultation_topic text check (consultation_topic is null or char_length(consultation_topic) <= 1000),
  note text check (note is null or char_length(note) <= 2000),
  checked_on date not null,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  check ((latitude is null) = (longitude is null))
);
create index if not exists kasi_candidate_facilities_owner_updated_idx on public.kasi_candidate_facilities(owner_id, updated_at desc) where deleted_at is null;
alter table public.kasi_candidate_facilities enable row level security;
revoke all on table public.kasi_candidate_facilities from anon, authenticated;
grant select, insert, update on table public.kasi_candidate_facilities to authenticated;
create policy kasi_candidate_facilities_select_own on public.kasi_candidate_facilities for select to authenticated using ((select auth.uid()) = owner_id);
create policy kasi_candidate_facilities_insert_own on public.kasi_candidate_facilities for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy kasi_candidate_facilities_update_own on public.kasi_candidate_facilities for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create trigger kasi_trg_kasi_candidate_facilities_updated before update on public.kasi_candidate_facilities for each row execute function private.kasi_set_updated_at_and_version();

commit;
