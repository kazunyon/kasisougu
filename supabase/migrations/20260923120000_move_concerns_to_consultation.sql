-- Keep existing concerns and allow new ones without a usage record.
begin;

alter table public.kasi_usage_record_concerns
  add column user_orthosis_id uuid;

update public.kasi_usage_record_concerns concern
set user_orthosis_id = record.user_orthosis_id
from public.kasi_usage_records record
where concern.usage_record_id = record.id;

alter table public.kasi_usage_record_concerns
  alter column user_orthosis_id set not null,
  alter column usage_record_id drop not null;

alter table public.kasi_usage_record_concerns
  add constraint kasi_concerns_orthosis_owner_fk
  foreign key (user_orthosis_id, owner_id)
  references public.kasi_user_orthoses(id, owner_id)
  on delete cascade;

create index kasi_concerns_orthosis_idx
  on public.kasi_usage_record_concerns(owner_id, user_orthosis_id, noted_on desc)
  where deleted_at is null;

create or replace function public.kasi_restore_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  backup_id_value uuid;
  backup_data jsonb;
  item jsonb;
  collection_name text;
  inserted_count integer;
  total_rows integer := 0;
begin
  if current_user_id is null then
    raise exception 'ログインしてください。';
  end if;
  if jsonb_typeof(p_backup) is distinct from 'object'
     or p_backup->>'format' is distinct from 'kasisougu-complete-backup'
     or (p_backup->>'version')::integer is distinct from 1 then
    raise exception 'バックアップ形式を確認できません。';
  end if;

  backup_id_value := (p_backup->>'backup_id')::uuid;
  backup_data := p_backup->'data';
  if jsonb_typeof(backup_data) is distinct from 'object' then
    raise exception 'バックアップデータの形式が不正です。';
  end if;

  foreach collection_name in array array[
    'orthoses','needs','usage_records','observations','concerns','media','consultation_sheets',
    'personal_links','candidate_facilities','sheet_orthoses','sheet_records','sheet_needs'
  ] loop
    if jsonb_typeof(backup_data->collection_name) is distinct from 'array'
       or jsonb_array_length(backup_data->collection_name) > 10000 then
      raise exception '%の形式または件数が不正です。', collection_name;
    end if;
    total_rows := total_rows + jsonb_array_length(backup_data->collection_name);
  end loop;

  insert into private.kasi_backup_restores(owner_id, backup_id, exported_at)
  values (current_user_id, backup_id_value, nullif(p_backup->>'exported_at','')::timestamptz)
  on conflict (owner_id, backup_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    -- A repeated restore must not duplicate rows. User-facing deletion is soft deletion,
    -- so reactivate any rows from this backup that were deleted after the first restore.
    update public.kasi_user_orthoses set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'orthoses'));
    update public.kasi_usage_records set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'usage_records'));
    update public.kasi_user_needs set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'needs'));
    update public.kasi_usage_record_observations set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'observations'));
    update public.kasi_usage_record_concerns set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'concerns'));
    update public.kasi_consultation_sheets set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'consultation_sheets'));
    update public.kasi_personal_links set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'personal_links'));
    update public.kasi_candidate_facilities set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'candidate_facilities'));
    update public.kasi_user_media set is_representative = false
      where owner_id = current_user_id and is_representative
        and usage_record_id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'usage_records'))
        and id not in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'media'));
    update public.kasi_user_media set deleted_at = null
      where owner_id = current_user_id and id in (select (value->>'id')::uuid from jsonb_array_elements(backup_data->'media'));
    if jsonb_typeof(backup_data->'profile') = 'object' then
      update public.kasi_profiles set
        display_name = nullif(backup_data->'profile'->>'display_name',''),
        nearby_address = nullif(backup_data->'profile'->>'nearby_address',''),
        text_scale = coalesce((backup_data->'profile'->>'text_scale')::smallint,100),
        timezone_name = coalesce(nullif(backup_data->'profile'->>'timezone_name',''),'Asia/Tokyo'),
        device_storage_enabled = false,
        deleted_at = null
      where user_id = current_user_id;
    end if;
    return jsonb_build_object('already_restored', true, 'backup_id', backup_id_value);
  end if;

  for item in select * from jsonb_array_elements(backup_data->'orthoses') loop
    insert into public.kasi_user_orthoses(
      id, owner_id, nickname, side_code, orthosis_type_code, ownership_status, manufactured_on,
      manufactured_year, manufacturer_name, price_yen, funding_system_code, self_payment_rate,
      usage_scene, catalog_item_id, created_at, updated_at
    ) values (
      (item->>'id')::uuid, current_user_id, item->>'nickname', item->>'side_code', item->>'orthosis_type_code',
      item->>'ownership_status', nullif(item->>'manufactured_on','')::date, nullif(item->>'manufactured_year','')::smallint,
      nullif(item->>'manufacturer_name',''), nullif(item->>'price_yen','')::bigint,
      nullif(item->>'funding_system_code',''), nullif(item->>'self_payment_rate','')::smallint,
      nullif(item->>'usage_scene',''),
      (select id from public.kasi_catalog_items where id = nullif(item->>'catalog_item_id','')::uuid limit 1),
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'usage_records') loop
    insert into public.kasi_usage_records(
      id, owner_id, user_orthosis_id, recorded_on, footwear, usage_setting, assistance_level,
      duration_minutes, distance_meters, overall_note, record_kind, created_at, updated_at
    ) values (
      (item->>'id')::uuid, current_user_id, (item->>'user_orthosis_id')::uuid, (item->>'recorded_on')::date,
      nullif(item->>'footwear',''), nullif(item->>'usage_setting',''), item->>'assistance_level',
      nullif(item->>'duration_minutes','')::integer, nullif(item->>'distance_meters','')::integer,
      nullif(item->>'overall_note',''), coalesce(nullif(item->>'record_kind',''),'current'),
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'needs') loop
    insert into public.kasi_user_needs(
      id, owner_id, user_orthosis_id, need_type, category_code, description, priority, status_code, created_at, updated_at
    ) values (
      (item->>'id')::uuid, current_user_id, nullif(item->>'user_orthosis_id','')::uuid,
      item->>'need_type', item->>'category_code', nullif(item->>'description',''),
      nullif(item->>'priority','')::smallint, item->>'status_code',
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'observations') loop
    insert into public.kasi_usage_record_observations(
      id, owner_id, usage_record_id, category_code, result_code, rating, note, created_at, updated_at
    ) values (
      (item->>'id')::uuid, current_user_id, (item->>'usage_record_id')::uuid, item->>'category_code',
      item->>'result_code', nullif(item->>'rating','')::smallint, nullif(item->>'note',''),
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'concerns') loop
    insert into public.kasi_usage_record_concerns(
      id, owner_id, user_orthosis_id, usage_record_id, noted_on, category_code, description, occurred_timing,
      status_code, action_note, resolved_on, created_at, updated_at
    ) values (
      (item->>'id')::uuid, current_user_id,
      coalesce(nullif(item->>'user_orthosis_id','')::uuid,
        (select user_orthosis_id from public.kasi_usage_records
         where id = nullif(item->>'usage_record_id','')::uuid and owner_id = current_user_id)),
      nullif(item->>'usage_record_id','')::uuid, (item->>'noted_on')::date,
      item->>'category_code', item->>'description', nullif(item->>'occurred_timing',''), item->>'status_code',
      nullif(item->>'action_note',''), nullif(item->>'resolved_on','')::date,
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'consultation_sheets') loop
    insert into public.kasi_consultation_sheets(
      id, owner_id, title, consultation_on, display_name, question_text, include_photos, status_code,
      snapshot_json, snapshot_version, finalized_at, created_at, updated_at
    ) values (
      (item->>'id')::uuid, current_user_id, item->>'title', nullif(item->>'consultation_on','')::date,
      nullif(item->>'display_name',''), nullif(item->>'question_text',''), coalesce((item->>'include_photos')::boolean,false),
      item->>'status_code', case when jsonb_typeof(item->'snapshot_json') = 'object' then item->'snapshot_json' else null end,
      coalesce((item->>'snapshot_version')::integer,1),
      nullif(item->>'finalized_at','')::timestamptz,
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'personal_links') loop
    insert into public.kasi_personal_links(id, owner_id, title, url, note, created_at, updated_at)
    values (
      (item->>'id')::uuid, current_user_id, item->>'title', item->>'url', nullif(item->>'note',''),
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'candidate_facilities') loop
    insert into public.kasi_candidate_facilities(
      id, owner_id, name, facility_type, address, phone, google_maps_url, consultation_topic,
      note, checked_on, latitude, longitude, created_at, updated_at
    ) values (
      (item->>'id')::uuid, current_user_id, item->>'name', item->>'facility_type', nullif(item->>'address',''),
      nullif(item->>'phone',''), nullif(item->>'google_maps_url',''), nullif(item->>'consultation_topic',''),
      nullif(item->>'note',''), (item->>'checked_on')::date, nullif(item->>'latitude','')::numeric,
      nullif(item->>'longitude','')::numeric,
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'media') loop
    insert into public.kasi_user_media(
      id, owner_id, user_orthosis_id, usage_record_id, storage_path, original_filename, mime_type,
      byte_size, width_px, height_px, caption, sort_order, is_representative, exif_removed,
      validation_status, created_at, updated_at
    ) values (
      (item->>'id')::uuid, current_user_id, nullif(item->>'user_orthosis_id','')::uuid,
      nullif(item->>'usage_record_id','')::uuid, item->>'storage_path', nullif(item->>'original_filename',''),
      item->>'mime_type', (item->>'byte_size')::bigint, nullif(item->>'width_px','')::integer,
      nullif(item->>'height_px','')::integer, nullif(item->>'caption',''), coalesce((item->>'sort_order')::smallint,0),
      coalesce((item->>'is_representative')::boolean,false), coalesce((item->>'exif_removed')::boolean,false),
      coalesce(nullif(item->>'validation_status',''),'pending'),
      coalesce(nullif(item->>'created_at','')::timestamptz, now()), coalesce(nullif(item->>'updated_at','')::timestamptz, now())
    );
  end loop;

  for item in select * from jsonb_array_elements(backup_data->'sheet_orthoses') loop
    insert into public.kasi_consultation_sheet_orthoses(owner_id, consultation_sheet_id, user_orthosis_id, sort_order)
    values (current_user_id, (item->>'consultation_sheet_id')::uuid, (item->>'user_orthosis_id')::uuid, coalesce((item->>'sort_order')::smallint,0));
  end loop;
  for item in select * from jsonb_array_elements(backup_data->'sheet_records') loop
    insert into public.kasi_consultation_sheet_records(owner_id, consultation_sheet_id, usage_record_id, sort_order)
    values (current_user_id, (item->>'consultation_sheet_id')::uuid, (item->>'usage_record_id')::uuid, coalesce((item->>'sort_order')::smallint,0));
  end loop;
  for item in select * from jsonb_array_elements(backup_data->'sheet_needs') loop
    insert into public.kasi_consultation_sheet_needs(owner_id, consultation_sheet_id, user_need_id, sort_order)
    values (current_user_id, (item->>'consultation_sheet_id')::uuid, (item->>'user_need_id')::uuid, coalesce((item->>'sort_order')::smallint,0));
  end loop;

  if jsonb_typeof(backup_data->'profile') = 'object' then
    insert into public.kasi_profiles(user_id, display_name, nearby_address, text_scale, timezone_name, device_storage_enabled, deleted_at)
    values (
      current_user_id, nullif(backup_data->'profile'->>'display_name',''),
      nullif(backup_data->'profile'->>'nearby_address',''),
      coalesce((backup_data->'profile'->>'text_scale')::smallint,100),
      coalesce(nullif(backup_data->'profile'->>'timezone_name',''),'Asia/Tokyo'), false, null
    )
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      nearby_address = excluded.nearby_address,
      text_scale = excluded.text_scale,
      timezone_name = excluded.timezone_name,
      device_storage_enabled = false,
      deleted_at = null;
  end if;

  insert into private.kasi_audit_events(actor_user_id, event_type, target_table, target_id, details)
  values (current_user_id, 'backup_restore', 'kasi_backup_restores', backup_id_value::text,
          jsonb_build_object('restored_rows', total_rows));

  return jsonb_build_object('already_restored', false, 'backup_id', backup_id_value, 'restored_rows', total_rows);
end;
$$;

revoke all on function public.kasi_restore_backup(jsonb) from public, anon;
grant execute on function public.kasi_restore_backup(jsonb) to authenticated;


notify pgrst, 'reload schema';
commit;
