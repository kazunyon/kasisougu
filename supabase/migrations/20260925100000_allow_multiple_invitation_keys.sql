-- Keep previously issued invitation keys valid when issuing another key.
begin;

drop index if exists private.kasi_invitation_codes_one_active_idx;
alter table private.kasi_invitation_codes
  add column if not exists memo text not null default '' check (char_length(memo) <= 100);

create or replace function public.kasi_admin_key_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'status', case when count(*) filter (where status = 'active' and (expires_at is null or expires_at > now())) > 0
      then 'active' else 'none' end,
    'active_count', count(*) filter (where status = 'active' and (expires_at is null or expires_at > now())),
    'expires_at', min(expires_at) filter (where status = 'active' and (expires_at is null or expires_at > now())),
    'keys', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'memo', memo, 'created_at', created_at, 'expires_at', expires_at)
        order by created_at desc)
      from private.kasi_invitation_codes
      where status = 'active' and (expires_at is null or expires_at > now())
    ), '[]'::jsonb)
  )
  from private.kasi_invitation_codes;
$$;

drop function if exists public.kasi_admin_rotate_key(uuid, text);
create function public.kasi_admin_rotate_key(p_actor_id uuid, p_code_hmac text, p_memo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_code_hmac !~ '^[0-9a-f]{64}$' or p_memo is null
     or pg_catalog.char_length(pg_catalog.btrim(p_memo)) not between 1 and 100 then
    raise exception 'invalid key or memo';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kasi-admin-key', 0));
  insert into private.kasi_invitation_codes (code_hmac, memo, expires_at)
  values (p_code_hmac, pg_catalog.btrim(p_memo), now() + interval '90 days');
  insert into private.kasi_admin_audit (actor_id, action) values (p_actor_id, 'key_rotate');
  select public.kasi_admin_key_status() into v_result;
  return v_result;
end;
$$;

revoke all on function public.kasi_admin_rotate_key(uuid,text,text) from public, anon, authenticated;
grant execute on function public.kasi_admin_rotate_key(uuid,text,text) to service_role;

commit;
