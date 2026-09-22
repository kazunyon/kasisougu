-- 利用者本人が追加・編集・論理削除できる自分用の装具図鑑
begin;

create table public.kasi_personal_catalog_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  category_code text not null default 'other' check (category_code in ('afo','kafo','foot_orthosis','orthopedic_shoe','other')),
  summary text not null check (char_length(btrim(summary)) between 1 and 4000),
  material text check (material is null or char_length(material) <= 500),
  joint_text text check (joint_text is null or char_length(joint_text) <= 500),
  foot_structure text check (foot_structure is null or char_length(foot_structure) <= 500),
  feature_text text check (feature_text is null or char_length(feature_text) <= 2000),
  caution_text text check (caution_text is null or char_length(caution_text) <= 2000),
  reference_url text check (reference_url is null or (char_length(reference_url) <= 2048 and reference_url ~ '^https://')),
  image_url text check (image_url is null or (char_length(image_url) <= 2048 and image_url ~ '^https://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz
);

create index kasi_personal_catalog_items_owner_updated_idx
  on public.kasi_personal_catalog_items(owner_id, updated_at desc) where deleted_at is null;

alter table public.kasi_personal_catalog_items enable row level security;
revoke all on table public.kasi_personal_catalog_items from anon, authenticated;
grant select, insert, update on table public.kasi_personal_catalog_items to authenticated;

create policy kasi_personal_catalog_items_select_own on public.kasi_personal_catalog_items
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy kasi_personal_catalog_items_insert_own on public.kasi_personal_catalog_items
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy kasi_personal_catalog_items_update_own on public.kasi_personal_catalog_items
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create trigger kasi_trg_kasi_personal_catalog_items_updated
  before update on public.kasi_personal_catalog_items
  for each row execute function private.kasi_set_updated_at_and_version();

create or replace function public.kasi_restore_personal_catalog_items(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  current_user_id uuid := (select auth.uid());
  items jsonb;
  item jsonb;
  restored_count integer := 0;
begin
  if current_user_id is null then raise exception 'ログインしてください。'; end if;
  if jsonb_typeof(p_backup) is distinct from 'object'
     or p_backup->>'format' is distinct from 'kasisougu-complete-backup'
     or (p_backup->>'version')::integer is distinct from 1 then
    raise exception 'バックアップ形式を確認できません。';
  end if;
  items := coalesce(p_backup->'data'->'personal_catalog_items', '[]'::jsonb);
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) > 10000 then
    raise exception 'personal_catalog_itemsの形式または件数が不正です。';
  end if;

  for item in select * from jsonb_array_elements(items) loop
    insert into public.kasi_personal_catalog_items(
      id, owner_id, title, category_code, summary, material, joint_text, foot_structure,
      feature_text, caution_text, reference_url, image_url, created_at, updated_at, deleted_at
    ) values (
      (item->>'id')::uuid, current_user_id, item->>'title', coalesce(nullif(item->>'category_code',''),'other'),
      item->>'summary', nullif(item->>'material',''), nullif(item->>'joint_text',''),
      nullif(item->>'foot_structure',''), nullif(item->>'feature_text',''), nullif(item->>'caution_text',''),
      nullif(item->>'reference_url',''), nullif(item->>'image_url',''),
      coalesce(nullif(item->>'created_at','')::timestamptz, now()),
      coalesce(nullif(item->>'updated_at','')::timestamptz, now()), null
    )
    on conflict (id) do update set
      title = excluded.title, category_code = excluded.category_code, summary = excluded.summary,
      material = excluded.material, joint_text = excluded.joint_text, foot_structure = excluded.foot_structure,
      feature_text = excluded.feature_text, caution_text = excluded.caution_text,
      reference_url = excluded.reference_url, image_url = excluded.image_url, deleted_at = null
    where kasi_personal_catalog_items.owner_id = current_user_id;
    restored_count := restored_count + 1;
  end loop;
  return jsonb_build_object('restored_rows', restored_count);
end;
$$;

revoke all on function public.kasi_restore_personal_catalog_items(jsonb) from public, anon;
grant execute on function public.kasi_restore_personal_catalog_items(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
