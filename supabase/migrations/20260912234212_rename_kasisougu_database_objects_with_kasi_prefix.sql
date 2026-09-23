
alter function private.set_updated_at_and_version() rename to kasi_set_updated_at_and_version;
alter function private.is_content_admin() rename to kasi_is_content_admin;
alter function private.handle_new_auth_user() rename to kasi_handle_new_auth_user;

alter trigger trg_profiles_updated on public.kasi_profiles rename to kasi_trg_profiles_updated;
alter trigger trg_user_orthoses_updated on public.kasi_user_orthoses rename to kasi_trg_user_orthoses_updated;
alter trigger trg_user_needs_updated on public.kasi_user_needs rename to kasi_trg_user_needs_updated;
alter trigger trg_usage_records_updated on public.kasi_usage_records rename to kasi_trg_usage_records_updated;
alter trigger trg_usage_record_observations_updated on public.kasi_usage_record_observations rename to kasi_trg_usage_record_observations_updated;
alter trigger trg_catalog_items_updated on public.kasi_catalog_items rename to kasi_trg_catalog_items_updated;
alter trigger trg_catalog_terms_updated on public.kasi_catalog_terms rename to kasi_trg_catalog_terms_updated;
alter trigger trg_catalog_sources_updated on public.kasi_catalog_sources rename to kasi_trg_catalog_sources_updated;
alter trigger trg_user_media_updated on public.kasi_user_media rename to kasi_trg_user_media_updated;
alter trigger trg_catalog_media_updated on public.kasi_catalog_media rename to kasi_trg_catalog_media_updated;
alter trigger trg_consultation_sheets_updated on public.kasi_consultation_sheets rename to kasi_trg_consultation_sheets_updated;

do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name, p.polname as policy_name
    from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname like 'kasi\_%' escape '\'
      and p.polname not like 'kasi\_%' escape '\'
  loop
    execute format('alter policy %I on %I.%I rename to %I',r.policy_name,r.schema_name,r.table_name,'kasi_'||r.policy_name);
  end loop;
end;
$$;
;
