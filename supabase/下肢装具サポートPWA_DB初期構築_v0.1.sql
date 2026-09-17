-- 下肢装具サポートPWA DB初期構築 v0.1（共有スキーマ向け kasi_ 接頭辞版）
-- 対象: Supabase / PostgreSQL 17
-- 範囲: MVP（F01～F08）。施設検索（F09）と候補整理（F10）は未実装。
-- 注意: 接続先プロジェクト確定後、開発環境で検証してから適用すること。

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 共通関数
-- ---------------------------------------------------------------------------

create or replace function private.kasi_set_updated_at_and_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create table if not exists private.kasi_app_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null check (role_code in ('content_admin', 'system_operator')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role_code)
);

create or replace function private.kasi_is_content_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from private.kasi_app_user_roles r
       where r.user_id = (select auth.uid())
         and r.role_code = 'content_admin'
     );
$$;

revoke all on schema private from public, anon, authenticated;
revoke execute on function private.kasi_is_content_admin() from public, anon;
revoke execute on function private.kasi_set_updated_at_and_version() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.kasi_is_content_admin() to authenticated;
grant execute on function private.kasi_set_updated_at_and_version() to authenticated;

-- ---------------------------------------------------------------------------
-- 本人設定・本人データ
-- ---------------------------------------------------------------------------

create table public.kasi_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  text_scale smallint not null default 100 check (text_scale between 100 and 200),
  device_storage_enabled boolean not null default false,
  timezone_name text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  check (display_name is null or char_length(display_name) between 1 and 80)
);

create table public.kasi_personal_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  url text not null check (char_length(url) between 1 and 2048 and url ~ '^https?://'),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz
);

create table public.kasi_user_orthoses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null,
  side_code text not null default 'unknown'
    check (side_code in ('left', 'right', 'bilateral', 'not_applicable', 'unknown')),
  orthosis_type_code text not null default 'unknown'
    check (orthosis_type_code in ('afo', 'kafo', 'foot_orthosis', 'orthopedic_shoe', 'other', 'unknown')),
  ownership_status text not null default 'owned'
    check (ownership_status in ('owned', 'trial', 'past')),
  manufactured_on date,
  manufactured_year smallint check (manufactured_year between 1900 and 2200),
  manufacturer_name text,
  price_yen bigint check (price_yen >= 0),
  funding_system_code text check (funding_system_code in ('medical_insurance', 'disability_support', 'other')),
  self_payment_rate smallint check (self_payment_rate in (1, 2, 3)),
  usage_scene text,
  catalog_item_id uuid,
  client_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  unique (id, owner_id),
  check (char_length(nickname) between 1 and 100),
  check (manufactured_on is null or manufactured_year is null
         or extract(year from manufactured_on)::smallint = manufactured_year)
);

create table public.kasi_user_needs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_orthosis_id uuid,
  need_type text not null check (need_type in ('problem', 'goal')),
  category_code text not null check (category_code in (
    'heavy', 'hard_to_put_on', 'hard_to_wear_shoes', 'pain_or_pressure',
    'fatigue', 'stability', 'mobility', 'daily_activity', 'other'
  )),
  description text,
  priority smallint check (priority between 1 and 5),
  status_code text not null default 'active' check (status_code in ('active', 'resolved', 'archived')),
  client_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  unique (id, owner_id),
  constraint kasi_user_needs_orthosis_owner_fk
    foreign key (user_orthosis_id, owner_id)
    references public.kasi_user_orthoses(id, owner_id)
    on delete cascade
);

create table public.kasi_usage_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_orthosis_id uuid not null,
  recorded_on date not null,
  footwear text,
  usage_setting text,
  assistance_level text not null default 'not_evaluated'
    check (assistance_level in ('independent', 'partial_assistance', 'full_assistance', 'not_evaluated')),
  duration_minutes integer check (duration_minutes between 0 and 1440),
  distance_meters integer check (distance_meters >= 0),
  overall_note text,
  client_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  unique (id, owner_id),
  constraint kasi_usage_records_orthosis_owner_fk
    foreign key (user_orthosis_id, owner_id)
    references public.kasi_user_orthoses(id, owner_id)
    on delete restrict
);

create table public.kasi_usage_record_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  usage_record_id uuid not null,
  category_code text not null check (category_code in (
    'weight', 'fatigue', 'pain', 'ease_of_putting_on', 'shoe_fit',
    'stability', 'comfort', 'other'
  )),
  result_code text not null check (result_code in ('not_evaluated', 'no_issue', 'issue')),
  rating smallint check (rating between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  unique (id, owner_id),
  unique (usage_record_id, category_code),
  constraint kasi_observations_record_owner_fk
    foreign key (usage_record_id, owner_id)
    references public.kasi_usage_records(id, owner_id)
    on delete cascade,
  check ((result_code = 'not_evaluated' and rating is null)
      or (result_code <> 'not_evaluated'))
);

-- ---------------------------------------------------------------------------
-- 図鑑・根拠・権利情報
-- ---------------------------------------------------------------------------

create table public.kasi_catalog_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  product_name text,
  summary text not null,
  support_scope_text text,
  caution_text text,
  expert_questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(expert_questions) = 'array'),
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'in_review', 'published', 'suspended')),
  content_version integer not null default 1 check (content_version > 0),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  check (char_length(title) between 1 and 150),
  check (char_length(summary) between 1 and 4000),
  check (publication_status <> 'published'
         or (reviewed_by is not null and reviewed_at is not null and published_at is not null))
);

alter table public.kasi_user_orthoses
  add constraint kasi_user_orthoses_catalog_item_fk
  foreign key (catalog_item_id) references public.kasi_catalog_items(id) on delete set null;

create table public.kasi_catalog_terms (
  id uuid primary key default gen_random_uuid(),
  term_group text not null check (term_group in (
    'support_scope', 'material', 'joint', 'foot_structure', 'feature'
  )),
  code text not null,
  label_ja text not null,
  description text,
  parent_id uuid references public.kasi_catalog_terms(id) on delete restrict,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  unique (term_group, code)
);

create table public.kasi_catalog_item_terms (
  catalog_item_id uuid not null references public.kasi_catalog_items(id) on delete cascade,
  catalog_term_id uuid not null references public.kasi_catalog_terms(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (catalog_item_id, catalog_term_id)
);

create table public.kasi_catalog_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('official_site', 'manufacturer', 'paper', 'expert_review', 'other')),
  publisher_name text not null,
  title text not null,
  source_url text,
  checked_on date not null,
  reviewed_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  check (source_url is null or source_url ~ '^https://')
);

create table public.kasi_catalog_item_sources (
  catalog_item_id uuid not null references public.kasi_catalog_items(id) on delete cascade,
  catalog_source_id uuid not null references public.kasi_catalog_sources(id) on delete restrict,
  citation_note text,
  primary key (catalog_item_id, catalog_source_id)
);

-- ---------------------------------------------------------------------------
-- 画像メタデータ（画像本体はSupabase Storage）
-- ---------------------------------------------------------------------------

create table public.kasi_user_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_orthosis_id uuid,
  usage_record_id uuid,
  storage_bucket text not null default 'kasi_user-media' check (storage_bucket = 'kasi_user-media'),
  storage_path text not null,
  original_filename text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  width_px integer check (width_px > 0),
  height_px integer check (height_px > 0),
  caption text,
  sort_order smallint not null default 0 check (sort_order between 0 and 99),
  exif_removed boolean not null default false,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'accepted', 'rejected')),
  client_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  unique (id, owner_id),
  unique (storage_bucket, storage_path),
  constraint kasi_user_media_orthosis_owner_fk
    foreign key (user_orthosis_id, owner_id)
    references public.kasi_user_orthoses(id, owner_id)
    on delete cascade,
  constraint kasi_user_media_record_owner_fk
    foreign key (usage_record_id, owner_id)
    references public.kasi_usage_records(id, owner_id)
    on delete cascade,
  check (num_nonnulls(user_orthosis_id, usage_record_id) = 1),
  check (storage_path like owner_id::text || '/%')
);

create table public.kasi_catalog_media (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.kasi_catalog_items(id) on delete cascade,
  storage_bucket text not null default 'kasi_catalog-media' check (storage_bucket = 'kasi_catalog-media'),
  storage_path text not null,
  alt_text text not null,
  rights_status text not null check (rights_status in ('owned', 'licensed', 'permission_obtained', 'external_reference')),
  rights_note text not null,
  source_url text,
  sort_order smallint not null default 0 check (sort_order between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  unique (storage_bucket, storage_path),
  check (source_url is null or source_url ~ '^https://')
);

-- ---------------------------------------------------------------------------
-- 相談シート
-- ---------------------------------------------------------------------------

create table public.kasi_consultation_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '相談シート',
  consultation_on date,
  display_name text,
  question_text text,
  include_photos boolean not null default false,
  status_code text not null default 'draft' check (status_code in ('draft', 'finalized')),
  snapshot_json jsonb,
  snapshot_version integer not null default 1 check (snapshot_version > 0),
  finalized_at timestamptz,
  client_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  unique (id, owner_id),
  check (snapshot_json is null or jsonb_typeof(snapshot_json) = 'object'),
  check (status_code <> 'finalized' or (snapshot_json is not null and finalized_at is not null))
);

create table public.kasi_consultation_sheet_orthoses (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  consultation_sheet_id uuid not null,
  user_orthosis_id uuid not null,
  sort_order smallint not null default 0,
  primary key (consultation_sheet_id, user_orthosis_id),
  constraint kasi_sheet_orthoses_sheet_owner_fk
    foreign key (consultation_sheet_id, owner_id)
    references public.kasi_consultation_sheets(id, owner_id) on delete cascade,
  constraint kasi_sheet_orthoses_orthosis_owner_fk
    foreign key (user_orthosis_id, owner_id)
    references public.kasi_user_orthoses(id, owner_id) on delete restrict
);

create table public.kasi_consultation_sheet_records (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  consultation_sheet_id uuid not null,
  usage_record_id uuid not null,
  sort_order smallint not null default 0,
  primary key (consultation_sheet_id, usage_record_id),
  constraint kasi_sheet_records_sheet_owner_fk
    foreign key (consultation_sheet_id, owner_id)
    references public.kasi_consultation_sheets(id, owner_id) on delete cascade,
  constraint kasi_sheet_records_record_owner_fk
    foreign key (usage_record_id, owner_id)
    references public.kasi_usage_records(id, owner_id) on delete restrict
);

create table public.kasi_consultation_sheet_needs (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  consultation_sheet_id uuid not null,
  user_need_id uuid not null,
  sort_order smallint not null default 0,
  primary key (consultation_sheet_id, user_need_id),
  constraint kasi_sheet_needs_sheet_owner_fk
    foreign key (consultation_sheet_id, owner_id)
    references public.kasi_consultation_sheets(id, owner_id) on delete cascade,
  constraint kasi_sheet_needs_need_owner_fk
    foreign key (user_need_id, owner_id)
    references public.kasi_user_needs(id, owner_id) on delete restrict
);

-- 操作IDを全体で一意にし、オフライン再送の重複処理を防ぐ。
create table private.kasi_idempotency_keys (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  operation_type text not null,
  result_resource_id uuid,
  result_code text not null,
  processed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (owner_id, operation_id)
);

create table private.kasi_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_table text not null,
  target_id text not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(details) = 'object')
);

-- ---------------------------------------------------------------------------
-- 索引
-- ---------------------------------------------------------------------------

create unique index kasi_user_orthoses_owner_operation_uidx
  on public.kasi_user_orthoses(owner_id, client_operation_id)
  where client_operation_id is not null;
create index kasi_user_orthoses_owner_updated_idx
  on public.kasi_user_orthoses(owner_id, updated_at desc) where deleted_at is null;
create index kasi_personal_links_owner_updated_idx
  on public.kasi_personal_links(owner_id, updated_at desc) where deleted_at is null;
create index kasi_user_orthoses_catalog_idx
  on public.kasi_user_orthoses(catalog_item_id) where catalog_item_id is not null;

create unique index kasi_user_needs_owner_operation_uidx
  on public.kasi_user_needs(owner_id, client_operation_id)
  where client_operation_id is not null;
create index kasi_user_needs_owner_status_idx
  on public.kasi_user_needs(owner_id, status_code) where deleted_at is null;

create unique index kasi_usage_records_owner_operation_uidx
  on public.kasi_usage_records(owner_id, client_operation_id)
  where client_operation_id is not null;
create index kasi_usage_records_owner_date_idx
  on public.kasi_usage_records(owner_id, recorded_on desc) where deleted_at is null;
create index kasi_usage_records_orthosis_date_idx
  on public.kasi_usage_records(user_orthosis_id, recorded_on desc) where deleted_at is null;

create index kasi_observations_owner_idx on public.kasi_usage_record_observations(owner_id);
create index kasi_observations_record_idx on public.kasi_usage_record_observations(usage_record_id);

create index kasi_catalog_items_status_updated_idx
  on public.kasi_catalog_items(publication_status, updated_at desc) where deleted_at is null;
create index kasi_catalog_terms_group_sort_idx on public.kasi_catalog_terms(term_group, sort_order);
create index kasi_catalog_item_terms_term_idx on public.kasi_catalog_item_terms(catalog_term_id);
create index kasi_catalog_item_sources_source_idx on public.kasi_catalog_item_sources(catalog_source_id);

create unique index kasi_user_media_owner_operation_uidx
  on public.kasi_user_media(owner_id, client_operation_id)
  where client_operation_id is not null;
create index kasi_user_media_owner_idx on public.kasi_user_media(owner_id) where deleted_at is null;
create index kasi_user_media_orthosis_idx on public.kasi_user_media(user_orthosis_id) where user_orthosis_id is not null;
create index kasi_user_media_record_idx on public.kasi_user_media(usage_record_id) where usage_record_id is not null;
create index kasi_catalog_media_item_idx on public.kasi_catalog_media(catalog_item_id, sort_order);

create unique index kasi_consultation_sheets_owner_operation_uidx
  on public.kasi_consultation_sheets(owner_id, client_operation_id)
  where client_operation_id is not null;
create index kasi_consultation_sheets_owner_updated_idx
  on public.kasi_consultation_sheets(owner_id, updated_at desc) where deleted_at is null;
create index kasi_sheet_orthoses_owner_idx on public.kasi_consultation_sheet_orthoses(owner_id);
create index kasi_sheet_records_owner_idx on public.kasi_consultation_sheet_records(owner_id);
create index kasi_sheet_needs_owner_idx on public.kasi_consultation_sheet_needs(owner_id);
create index kasi_audit_events_target_idx on private.kasi_audit_events(target_table, target_id, created_at desc);
create index kasi_audit_events_actor_idx on private.kasi_audit_events(actor_user_id, created_at desc);
create index kasi_idempotency_keys_expiry_idx on private.kasi_idempotency_keys(expires_at);

-- ---------------------------------------------------------------------------
-- 更新日時・更新版トリガー
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'kasi_profiles', 'kasi_personal_links', 'kasi_user_orthoses', 'kasi_user_needs', 'kasi_usage_records',
    'kasi_usage_record_observations', 'kasi_catalog_items', 'kasi_catalog_terms',
    'kasi_catalog_sources', 'kasi_user_media', 'kasi_catalog_media', 'kasi_consultation_sheets'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.kasi_set_updated_at_and_version()',
      'kasi_trg_' || table_name || '_updated', table_name
    );
  end loop;
end;
$$;

create or replace function private.kasi_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.kasi_profiles(user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function private.kasi_handle_new_auth_user() from public, anon, authenticated;

create trigger kasi_trg_auth_user_profile
after insert on auth.users
for each row execute function private.kasi_handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Row Level Security / Data API権限
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'kasi_profiles', 'kasi_personal_links', 'kasi_user_orthoses', 'kasi_user_needs', 'kasi_usage_records',
    'kasi_usage_record_observations', 'kasi_user_media', 'kasi_consultation_sheets',
    'kasi_consultation_sheet_orthoses', 'kasi_consultation_sheet_records',
    'kasi_consultation_sheet_needs', 'kasi_catalog_items', 'kasi_catalog_terms',
    'kasi_catalog_item_terms', 'kasi_catalog_sources', 'kasi_catalog_item_sources', 'kasi_catalog_media'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

-- 本人データ: SELECT/INSERT/UPDATEのみ。物理DELETEはバックエンド処理に限定。
grant select, insert, update on table
  public.kasi_profiles,
  public.kasi_personal_links,
  public.kasi_user_orthoses,
  public.kasi_user_needs,
  public.kasi_usage_records,
  public.kasi_usage_record_observations,
  public.kasi_user_media,
  public.kasi_consultation_sheets,
  public.kasi_consultation_sheet_orthoses,
  public.kasi_consultation_sheet_records,
  public.kasi_consultation_sheet_needs
to authenticated;

create policy kasi_profiles_select_own on public.kasi_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy kasi_profiles_insert_own on public.kasi_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy kasi_profiles_update_own on public.kasi_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'kasi_personal_links', 'kasi_user_orthoses', 'kasi_user_needs', 'kasi_usage_records', 'kasi_usage_record_observations',
    'kasi_user_media', 'kasi_consultation_sheets', 'kasi_consultation_sheet_orthoses',
    'kasi_consultation_sheet_records', 'kasi_consultation_sheet_needs'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',
      table_name || '_insert_own', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      table_name || '_update_own', table_name
    );
  end loop;
end;
$$;

-- 図鑑: 認証済み利用者は公開済みのみ閲覧。情報管理者は全操作可能。
grant select, insert, update, delete on table
  public.kasi_catalog_items,
  public.kasi_catalog_terms,
  public.kasi_catalog_item_terms,
  public.kasi_catalog_sources,
  public.kasi_catalog_item_sources,
  public.kasi_catalog_media
to authenticated;

create policy kasi_catalog_items_read on public.kasi_catalog_items for select to authenticated
  using ((publication_status = 'published' and deleted_at is null)
         or (select private.kasi_is_content_admin()));
create policy kasi_catalog_items_admin_insert on public.kasi_catalog_items for insert to authenticated
  with check ((select private.kasi_is_content_admin()));
create policy kasi_catalog_items_admin_update on public.kasi_catalog_items for update to authenticated
  using ((select private.kasi_is_content_admin())) with check ((select private.kasi_is_content_admin()));
create policy kasi_catalog_items_admin_delete on public.kasi_catalog_items for delete to authenticated
  using ((select private.kasi_is_content_admin()));

create policy kasi_catalog_terms_read on public.kasi_catalog_terms for select to authenticated
  using (is_active or (select private.kasi_is_content_admin()));
create policy kasi_catalog_terms_admin_all on public.kasi_catalog_terms for all to authenticated
  using ((select private.kasi_is_content_admin())) with check ((select private.kasi_is_content_admin()));

create policy kasi_catalog_item_terms_read on public.kasi_catalog_item_terms for select to authenticated
  using (exists (
    select 1 from public.kasi_catalog_items i
    where i.id = catalog_item_id
      and ((i.publication_status = 'published' and i.deleted_at is null)
           or (select private.kasi_is_content_admin()))
  ));
create policy kasi_catalog_item_terms_admin_all on public.kasi_catalog_item_terms for all to authenticated
  using ((select private.kasi_is_content_admin())) with check ((select private.kasi_is_content_admin()));

create policy kasi_catalog_sources_read on public.kasi_catalog_sources for select to authenticated
  using ((select private.kasi_is_content_admin()) or exists (
    select 1
    from public.kasi_catalog_item_sources x
    join public.kasi_catalog_items i on i.id = x.catalog_item_id
    where x.catalog_source_id = kasi_catalog_sources.id
      and i.publication_status = 'published' and i.deleted_at is null
  ));
create policy kasi_catalog_sources_admin_all on public.kasi_catalog_sources for all to authenticated
  using ((select private.kasi_is_content_admin())) with check ((select private.kasi_is_content_admin()));

create policy kasi_catalog_item_sources_read on public.kasi_catalog_item_sources for select to authenticated
  using (exists (
    select 1 from public.kasi_catalog_items i
    where i.id = catalog_item_id
      and i.publication_status = 'published' and i.deleted_at is null
  ) or (select private.kasi_is_content_admin()));
create policy kasi_catalog_item_sources_admin_all on public.kasi_catalog_item_sources for all to authenticated
  using ((select private.kasi_is_content_admin())) with check ((select private.kasi_is_content_admin()));

create policy kasi_catalog_media_read on public.kasi_catalog_media for select to authenticated
  using (exists (
    select 1 from public.kasi_catalog_items i
    where i.id = catalog_item_id
      and i.publication_status = 'published' and i.deleted_at is null
  ) or (select private.kasi_is_content_admin()));
create policy kasi_catalog_media_admin_all on public.kasi_catalog_media for all to authenticated
  using ((select private.kasi_is_content_admin())) with check ((select private.kasi_is_content_admin()));

-- ---------------------------------------------------------------------------
-- StorageバケットとStorage RLS
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kasi_user-media', 'kasi_user-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('kasi_catalog-media', 'kasi_catalog-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy kasi_user_media_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'kasi_user-media'
     and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy kasi_user_media_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'kasi_user-media'
          and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy kasi_user_media_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'kasi_user-media'
     and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'kasi_user-media'
          and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy kasi_user_media_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'kasi_user-media'
     and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy kasi_catalog_media_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'kasi_catalog-media' and (
    (select private.kasi_is_content_admin())
    or exists (
      select 1
      from public.kasi_catalog_media m
      join public.kasi_catalog_items i on i.id = m.catalog_item_id
      where m.storage_path = name
        and i.publication_status = 'published'
        and i.deleted_at is null
    )
  ));
create policy kasi_catalog_media_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'kasi_catalog-media' and (select private.kasi_is_content_admin()));
create policy kasi_catalog_media_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'kasi_catalog-media' and (select private.kasi_is_content_admin()))
  with check (bucket_id = 'kasi_catalog-media' and (select private.kasi_is_content_admin()));
create policy kasi_catalog_media_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'kasi_catalog-media' and (select private.kasi_is_content_admin()));

-- 代表的な初期分類。医学・製品説明は専門職レビュー後にkasi_catalog_itemsへ登録する。
insert into public.kasi_catalog_terms (term_group, code, label_ja, description, sort_order)
values
  ('support_scope', 'afo', '短下肢装具（AFO）', '下腿から足部を支える分類。', 10),
  ('support_scope', 'kafo', '長下肢装具（KAFO）', '膝を含めて下肢を支える分類。', 20),
  ('support_scope', 'foot_orthosis', '足底装具', '足底部を中心に支える分類。', 30),
  ('support_scope', 'orthopedic_shoe', '靴型装具', '靴の形で足部を支える分類。', 40)
on conflict (term_group, code) do nothing;

commit;

-- 適用後の必須確認:
-- 1. anonでpublicテーブルを取得できないこと。
-- 2. 利用者Aから利用者Bの本人データ・user-mediaを取得できないこと。
-- 3. 未公開図鑑を一般利用者が取得できず、content_adminだけが更新できること。
-- 4. 同じclient_operation_idの再送が一意制約で拒否されること。
-- 5. Supabase Security/Performance Advisorsを実行し、警告を確認すること。


