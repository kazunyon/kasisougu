-- F02: 既存環境で未作成だった本人専用写真バケットとStorage RLSを追加する。
-- 既存オブジェクト、本人データ、他バケットには触れない。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kasi_user-media', 'kasi_user-media', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'kasi_user-media' and public) then
    raise exception 'kasi_user-media must be a private bucket before F02 can be enabled';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kasi_user_media_storage_select') then
    create policy kasi_user_media_storage_select on storage.objects for select to authenticated
      using (bucket_id = 'kasi_user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kasi_user_media_storage_insert') then
    create policy kasi_user_media_storage_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'kasi_user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kasi_user_media_storage_update') then
    create policy kasi_user_media_storage_update on storage.objects for update to authenticated
      using (bucket_id = 'kasi_user-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'kasi_user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kasi_user_media_storage_delete') then
    create policy kasi_user_media_storage_delete on storage.objects for delete to authenticated
      using (bucket_id = 'kasi_user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end;
$$;
