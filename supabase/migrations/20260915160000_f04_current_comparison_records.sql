-- Apply before deploying the current/comparison record UI. Existing rows remain normal records.
begin;
alter table public.kasi_usage_records add column if not exists record_kind text not null default 'current'
  check (record_kind in ('current', 'comparison'));

create or replace function public.kasi_save_usage_record(
  p_id uuid, p_version bigint, p_comparison boolean, p_record jsonb, p_observations jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  base public.kasi_usage_records;
  saved public.kasi_usage_records;
  item jsonb;
begin
  if auth.uid() is null then raise exception 'ログインしてください。'; end if;
  if p_comparison is null then raise exception '保存方法が指定されていません。'; end if;
  if jsonb_typeof(p_observations) is distinct from 'array' then raise exception '評価の形式が不正です。'; end if;
  if jsonb_array_length(p_observations) <> 8 or
     (select count(distinct x->>'category_code') from jsonb_array_elements(p_observations) x) <> 8 then
    raise exception '8項目の評価が必要です。';
  end if;
  if p_id is not null then
    select * into base from public.kasi_usage_records
      where id = p_id and owner_id = auth.uid() and deleted_at is null for update;
    if not found or base.row_version is distinct from p_version then
      raise exception '記録が別の画面で更新されています。画面を再読み込みしてください。';
    end if;
  elsif p_comparison then
    raise exception '先に現在の記録を保存してください。';
  end if;
  if p_id is null or p_comparison then
    insert into public.kasi_usage_records(user_orthosis_id, recorded_on, footwear, usage_setting,
      assistance_level, duration_minutes, overall_note, record_kind)
    values ((p_record->>'user_orthosis_id')::uuid, (p_record->>'recorded_on')::date,
      p_record->>'footwear', p_record->>'usage_setting', p_record->>'assistance_level',
      (p_record->>'duration_minutes')::integer, p_record->>'overall_note',
      case when p_comparison then 'comparison' else 'current' end)
    returning * into saved;
  else
    update public.kasi_usage_records set
      user_orthosis_id = (p_record->>'user_orthosis_id')::uuid,
      recorded_on = (p_record->>'recorded_on')::date,
      footwear = p_record->>'footwear', usage_setting = p_record->>'usage_setting',
      assistance_level = p_record->>'assistance_level',
      duration_minutes = (p_record->>'duration_minutes')::integer,
      overall_note = p_record->>'overall_note'
      where id = base.id and owner_id = auth.uid() returning * into saved;
  end if;
  for item in select * from jsonb_array_elements(p_observations) loop
    insert into public.kasi_usage_record_observations(usage_record_id, category_code, result_code, rating, note)
    values(saved.id, item->>'category_code', item->>'result_code', (item->>'rating')::smallint, item->>'note')
    on conflict (usage_record_id, category_code) do update set
      result_code = excluded.result_code, rating = excluded.rating, note = excluded.note, deleted_at = null;
  end loop;
  return jsonb_build_object('id', saved.id, 'row_version', saved.row_version);
end;
$$;
revoke all on function public.kasi_save_usage_record(uuid,bigint,boolean,jsonb,jsonb) from public, anon;
grant execute on function public.kasi_save_usage_record(uuid,bigint,boolean,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
