-- Let administrators correct or remove an individual active registration key.
begin;

alter table private.kasi_admin_audit drop constraint if exists kasi_admin_audit_action_check;
alter table private.kasi_admin_audit add constraint kasi_admin_audit_action_check
  check (action in (
    'bootstrap', 'key_rotate', 'key_update', 'key_delete', 'key_stop',
    'invite', 'invite_failed', 'invite_resend', 'invite_resend_failed',
    'user_suspend', 'user_resume', 'user_delete', 'role_grant', 'role_revoke'
  ));

create or replace function public.kasi_admin_key_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'status', case when count(*) filter (where status = 'active' and (expires_at is null or expires_at > now())) > 0
      then 'active' else 'none' end,
    'active_count', count(*) filter (where status = 'active' and (expires_at is null or expires_at > now())),
    'expires_at', min(expires_at) filter (where status = 'active' and (expires_at is null or expires_at > now())),
    'keys', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', id, 'memo', memo, 'created_at', created_at, 'expires_at', expires_at)
        order by created_at desc)
      from private.kasi_invitation_codes
      where status = 'active' and (expires_at is null or expires_at > now())
    ), '[]'::jsonb)
  )
  from private.kasi_invitation_codes;
$$;

create function public.kasi_admin_update_key(p_actor_id uuid, p_key_id uuid, p_memo text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_old_memo text;
begin
  if p_memo is null or pg_catalog.char_length(pg_catalog.btrim(p_memo)) not between 1 and 100 then
    raise exception 'invalid memo';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kasi-admin-key', 0));
  select memo into v_old_memo from private.kasi_invitation_codes
   where id = p_key_id and status = 'active' and (expires_at is null or expires_at > now())
   for update;
  if not found then return false; end if;
  update private.kasi_invitation_codes set memo = pg_catalog.btrim(p_memo) where id = p_key_id;
  insert into private.kasi_admin_audit (actor_id, action, detail)
  values (p_actor_id, 'key_update', pg_catalog.jsonb_build_object(
    'key_id', p_key_id, 'old_memo', v_old_memo, 'memo', pg_catalog.btrim(p_memo)));
  return true;
end;
$$;

create function public.kasi_admin_delete_key(p_actor_id uuid, p_key_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_memo text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kasi-admin-key', 0));
  delete from private.kasi_invitation_codes
   where id = p_key_id and status = 'active' and (expires_at is null or expires_at > now())
   returning memo into v_memo;
  if not found then return false; end if;
  insert into private.kasi_admin_audit (actor_id, action, detail)
  values (p_actor_id, 'key_delete', pg_catalog.jsonb_build_object('key_id', p_key_id, 'memo', v_memo));
  return true;
end;
$$;

revoke all on function public.kasi_admin_update_key(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.kasi_admin_delete_key(uuid,uuid) from public, anon, authenticated;
grant execute on function public.kasi_admin_update_key(uuid,uuid,text) to service_role;
grant execute on function public.kasi_admin_delete_key(uuid,uuid) to service_role;

commit;
