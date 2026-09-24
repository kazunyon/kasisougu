-- Administrator support: server-only roles, key lifecycle, and audit trail.
-- All public RPCs below are executable only by service_role. The Edge Function
-- authenticates the caller and checks their role before calling them.
begin;

alter table private.kasi_app_user_roles
  drop constraint if exists app_user_roles_role_code_check;
alter table private.kasi_app_user_roles
  drop constraint if exists kasi_app_user_roles_role_code_check;
alter table private.kasi_app_user_roles
  add constraint kasi_app_user_roles_role_code_check
  check (role_code in ('content_admin', 'system_operator', 'invitation_operator', 'audit_reader'));

create table if not exists private.kasi_admin_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'bootstrap', 'key_rotate', 'key_stop', 'invite', 'invite_failed',
    'invite_resend', 'invite_resend_failed',
    'user_suspend', 'user_resume', 'role_grant', 'role_revoke'
  )),
  target_user_id uuid,
  target_email text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists kasi_admin_audit_occurred_idx
  on private.kasi_admin_audit (occurred_at desc, id desc);
alter table private.kasi_admin_audit enable row level security;
revoke all on private.kasi_admin_audit from public, anon, authenticated;

create or replace function public.kasi_admin_roles(p_user_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(role_code order by role_code), array[]::text[])
  from private.kasi_app_user_roles where user_id = p_user_id;
$$;

create or replace function public.kasi_admin_bootstrap(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kasi-admin-bootstrap', 0));
  if exists (select 1 from private.kasi_app_user_roles where role_code = 'system_operator') then
    return false;
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    return false;
  end if;
  insert into private.kasi_app_user_roles (user_id, role_code, granted_by)
  values (p_user_id, 'system_operator', p_user_id);
  insert into private.kasi_admin_audit (actor_id, action, target_user_id)
  values (p_user_id, 'bootstrap', p_user_id);
  return true;
end;
$$;

create or replace function public.kasi_admin_key_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select pg_catalog.jsonb_build_object(
    'status', case when expires_at <= now() then 'expired' else status end,
    'created_at', created_at, 'expires_at', expires_at)
    from private.kasi_invitation_codes where status = 'active' limit 1),
    '{"status":"none"}'::jsonb);
$$;

create or replace function public.kasi_admin_rotate_key(p_actor_id uuid, p_code_hmac text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_code_hmac !~ '^[0-9a-f]{64}$' then raise exception 'invalid digest'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kasi-admin-key', 0));
  update private.kasi_invitation_codes set status = 'revoked', revoked_at = now()
   where status = 'active';
  insert into private.kasi_invitation_codes (code_hmac, expires_at)
  values (p_code_hmac, now() + interval '90 days');
  insert into private.kasi_admin_audit (actor_id, action) values (p_actor_id, 'key_rotate');
  select public.kasi_admin_key_status() into v_result;
  return v_result;
end;
$$;

create or replace function public.kasi_admin_stop_key(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kasi-admin-key', 0));
  update private.kasi_invitation_codes set status = 'revoked', revoked_at = now()
   where status = 'active';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into private.kasi_admin_audit (actor_id, action) values (p_actor_id, 'key_stop');
  end if;
  return pg_catalog.jsonb_build_object('status', 'none', 'changed', v_count > 0);
end;
$$;

create or replace function public.kasi_admin_write_audit(
  p_actor_id uuid, p_action text, p_target_user_id uuid default null,
  p_target_email text default null, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('invite', 'invite_failed', 'invite_resend', 'invite_resend_failed', 'user_suspend', 'user_resume', 'role_grant', 'role_revoke') then
    raise exception 'invalid admin action';
  end if;
  insert into private.kasi_admin_audit (actor_id, action, target_user_id, target_email, detail)
  values (p_actor_id, p_action, p_target_user_id, p_target_email, coalesce(p_detail, '{}'::jsonb));
end;
$$;

create or replace function public.kasi_admin_audit_page(p_offset integer default 0, p_limit integer default 50)
returns table (id bigint, occurred_at timestamptz, actor_id uuid, action text,
  target_user_id uuid, target_email text, detail jsonb)
language sql stable security definer set search_path = '' as $$
  select a.id, a.occurred_at, a.actor_id, a.action, a.target_user_id, a.target_email, a.detail
  from private.kasi_admin_audit a order by a.id desc
  limit least(greatest(p_limit, 1), 100) offset least(greatest(p_offset, 0), 100000);
$$;

create or replace function public.kasi_admin_change_role(
  p_actor_id uuid, p_target_id uuid, p_role text, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('invitation_operator', 'audit_reader') or p_actor_id = p_target_id then
    raise exception 'invalid role change';
  end if;
  if p_grant then
    insert into private.kasi_app_user_roles (user_id, role_code, granted_by)
    values (p_target_id, p_role, p_actor_id) on conflict do nothing;
  else
    delete from private.kasi_app_user_roles where user_id = p_target_id and role_code = p_role;
  end if;
  insert into private.kasi_admin_audit (actor_id, action, target_user_id, detail)
  values (p_actor_id, case when p_grant then 'role_grant' else 'role_revoke' end,
    p_target_id, pg_catalog.jsonb_build_object('role', p_role));
end;
$$;

revoke all on function public.kasi_admin_roles(uuid) from public, anon, authenticated;
revoke all on function public.kasi_admin_bootstrap(uuid) from public, anon, authenticated;
revoke all on function public.kasi_admin_key_status() from public, anon, authenticated;
revoke all on function public.kasi_admin_rotate_key(uuid,text) from public, anon, authenticated;
revoke all on function public.kasi_admin_stop_key(uuid) from public, anon, authenticated;
revoke all on function public.kasi_admin_write_audit(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.kasi_admin_audit_page(integer,integer) from public, anon, authenticated;
revoke all on function public.kasi_admin_change_role(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.kasi_admin_roles(uuid) to service_role;
grant execute on function public.kasi_admin_bootstrap(uuid) to service_role;
grant execute on function public.kasi_admin_key_status() to service_role;
grant execute on function public.kasi_admin_rotate_key(uuid,text) to service_role;
grant execute on function public.kasi_admin_stop_key(uuid) to service_role;
grant execute on function public.kasi_admin_write_audit(uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.kasi_admin_audit_page(integer,integer) to service_role;
grant execute on function public.kasi_admin_change_role(uuid,uuid,text,boolean) to service_role;
commit;
