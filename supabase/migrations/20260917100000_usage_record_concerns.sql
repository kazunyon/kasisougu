-- Multiple dated concerns/changes can be attached to one usage record.
-- Existing daily notes stay in kasi_usage_records.overall_note and are shown as "その日の感想".
begin;

create table if not exists public.kasi_usage_record_concerns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  usage_record_id uuid not null,
  noted_on date not null,
  category_code text not null check (category_code in (
    'pain_pressure', 'fit', 'putting_on', 'walking_stability', 'damage_wear', 'other'
  )),
  description text not null check (char_length(description) between 1 and 2000),
  occurred_timing text check (occurred_timing is null or char_length(occurred_timing) <= 200),
  status_code text not null default 'open'
    check (status_code in ('open', 'planned', 'adjusted', 'resolved')),
  action_note text check (action_note is null or char_length(action_note) <= 2000),
  resolved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  unique (id, owner_id),
  constraint kasi_record_concerns_record_owner_fk
    foreign key (usage_record_id, owner_id)
    references public.kasi_usage_records(id, owner_id)
    on delete cascade,
  check (resolved_on is null or status_code = 'resolved')
);

create index if not exists kasi_record_concerns_owner_status_idx
  on public.kasi_usage_record_concerns(owner_id, status_code, noted_on desc) where deleted_at is null;
create index if not exists kasi_record_concerns_record_idx
  on public.kasi_usage_record_concerns(usage_record_id, noted_on desc) where deleted_at is null;

drop trigger if exists kasi_trg_kasi_usage_record_concerns_updated on public.kasi_usage_record_concerns;
create trigger kasi_trg_kasi_usage_record_concerns_updated
before update on public.kasi_usage_record_concerns
for each row execute function private.kasi_set_updated_at_and_version();

alter table public.kasi_usage_record_concerns enable row level security;
revoke all on table public.kasi_usage_record_concerns from anon, authenticated;
grant select, insert, update on table public.kasi_usage_record_concerns to authenticated;

drop policy if exists kasi_usage_record_concerns_select_own on public.kasi_usage_record_concerns;
drop policy if exists kasi_usage_record_concerns_insert_own on public.kasi_usage_record_concerns;
drop policy if exists kasi_usage_record_concerns_update_own on public.kasi_usage_record_concerns;
create policy kasi_usage_record_concerns_select_own on public.kasi_usage_record_concerns
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy kasi_usage_record_concerns_insert_own on public.kasi_usage_record_concerns
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy kasi_usage_record_concerns_update_own on public.kasi_usage_record_concerns
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

notify pgrst, 'reload schema';
commit;
