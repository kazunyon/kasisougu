-- Allow one representative photo per usage record for the home screen.
begin;

alter table public.kasi_user_media
  add column if not exists is_representative boolean not null default false;

create unique index if not exists kasi_user_media_record_representative_uidx
  on public.kasi_user_media(usage_record_id)
  where usage_record_id is not null and is_representative and deleted_at is null;

create or replace function public.kasi_set_usage_record_representative_photo(
  p_usage_record_id uuid,
  p_media_id uuid
) returns public.kasi_user_media
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_media public.kasi_user_media;
begin
  if auth.uid() is null then
    raise exception 'ログインしてください。';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_usage_record_id::text, 0));

  select * into selected_media
    from public.kasi_user_media
    where id = p_media_id
      and usage_record_id = p_usage_record_id
      and owner_id = auth.uid()
      and deleted_at is null
    for update;

  if not found then
    raise exception '代表写真を確認できません。画面を再読み込みしてください。';
  end if;

  update public.kasi_user_media
    set is_representative = false
    where usage_record_id = p_usage_record_id
      and owner_id = auth.uid()
      and deleted_at is null
      and is_representative;

  update public.kasi_user_media
    set is_representative = true
    where id = p_media_id
      and usage_record_id = p_usage_record_id
      and owner_id = auth.uid()
      and deleted_at is null
    returning * into selected_media;

  return selected_media;
end;
$$;

revoke all on function public.kasi_set_usage_record_representative_photo(uuid, uuid) from public, anon;
grant execute on function public.kasi_set_usage_record_representative_photo(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
