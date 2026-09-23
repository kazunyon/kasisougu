-- Invite-only access control for the public request-invitation Edge Function.
-- The six-digit code is never stored here in plaintext. Store only its HMAC,
-- calculated with the private INVITATION_CODE_PEPPER Edge Function secret.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.kasi_invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hmac text not null check (code_hmac ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (expires_at is null or expires_at > valid_from)
);

create unique index if not exists kasi_invitation_codes_one_active_idx
  on private.kasi_invitation_codes (status)
  where status = 'active';

create table if not exists private.kasi_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  email_digest text not null check (email_digest ~ '^[0-9a-f]{64}$'),
  ip_digest text not null check (ip_digest ~ '^[0-9a-f]{64}$'),
  code_valid boolean not null,
  outcome text not null default 'pending'
    check (outcome in ('pending', 'rejected_key', 'invited', 'already_registered', 'auth_rejected')),
  created_at timestamptz not null default now()
);

create index if not exists kasi_invitation_attempts_ip_created_idx
  on private.kasi_invitation_attempts (ip_digest, created_at desc);
create index if not exists kasi_invitation_attempts_email_created_idx
  on private.kasi_invitation_attempts (email_digest, created_at desc);

alter table private.kasi_invitation_codes enable row level security;
alter table private.kasi_invitation_attempts enable row level security;
revoke all on private.kasi_invitation_codes from public, anon, authenticated;
revoke all on private.kasi_invitation_attempts from public, anon, authenticated;

-- This SECURITY DEFINER RPC is callable only with the Edge Function's
-- server-side service key. It serializes requests by IP and email to prevent
-- concurrent attempts from bypassing the limits.
create or replace function public.kasi_check_invitation_request(
  p_code_hmac text,
  p_email_digest text,
  p_ip_digest text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ip_lock bigint;
  v_email_lock bigint;
  v_recent_failures integer;
  v_email_requests integer;
  v_ip_requests integer;
  v_code_valid boolean := false;
  v_attempt_id uuid;
begin
  if p_code_hmac !~ '^[0-9a-f]{64}$'
     or p_email_digest !~ '^[0-9a-f]{64}$'
     or p_ip_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invitation request';
  end if;

  v_ip_lock := pg_catalog.hashtextextended('invite-ip:' || p_ip_digest, 0);
  v_email_lock := pg_catalog.hashtextextended('invite-email:' || p_email_digest, 0);
  perform pg_catalog.pg_advisory_xact_lock(least(v_ip_lock, v_email_lock));
  if v_ip_lock <> v_email_lock then
    perform pg_catalog.pg_advisory_xact_lock(greatest(v_ip_lock, v_email_lock));
  end if;

  delete from private.kasi_invitation_attempts
   where created_at < v_now - interval '24 hours';

  update private.kasi_invitation_codes
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at <= v_now;

  select exists (
    select 1 from private.kasi_invitation_codes
     where code_hmac = p_code_hmac
       and status = 'active'
       and valid_from <= v_now
       and (expires_at is null or expires_at > v_now)
  ) into v_code_valid;

  select count(*) into v_recent_failures
    from private.kasi_invitation_attempts
   where ip_digest = p_ip_digest
     and code_valid = false
     and created_at > v_now - interval '15 minutes';
  select count(*) into v_email_requests
    from private.kasi_invitation_attempts
   where email_digest = p_email_digest
     and created_at > v_now - interval '1 hour';
  select count(*) into v_ip_requests
    from private.kasi_invitation_attempts
   where ip_digest = p_ip_digest
     and created_at > v_now - interval '1 hour';

  if v_recent_failures >= 5 then
    return pg_catalog.jsonb_build_object('allowed', false, 'retry_after_seconds', 900);
  end if;
  if v_email_requests >= 3 or v_ip_requests >= 10 then
    return pg_catalog.jsonb_build_object('allowed', false, 'retry_after_seconds', 3600);
  end if;

  insert into private.kasi_invitation_attempts (email_digest, ip_digest, code_valid)
  values (p_email_digest, p_ip_digest, v_code_valid)
  returning id into v_attempt_id;

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'code_valid', v_code_valid,
    'attempt_id', v_attempt_id
  );
end;
$$;

create or replace function public.kasi_finish_invitation_request(
  p_attempt_id uuid,
  p_outcome text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('rejected_key', 'invited', 'already_registered', 'auth_rejected') then
    raise exception 'invalid invitation outcome';
  end if;
  update private.kasi_invitation_attempts
     set outcome = p_outcome
   where id = p_attempt_id
     and outcome = 'pending';
end;
$$;

revoke all on function public.kasi_check_invitation_request(text, text, text) from public, anon, authenticated;
revoke all on function public.kasi_finish_invitation_request(uuid, text) from public, anon, authenticated;
grant execute on function public.kasi_check_invitation_request(text, text, text) to service_role;
grant execute on function public.kasi_finish_invitation_request(uuid, text) to service_role;

comment on table private.kasi_invitation_codes is
  'Invite-only registration code HMACs and lifecycle history. The HMAC pepper exists only as a Supabase Edge Function secret.';
comment on table private.kasi_invitation_attempts is
  'Short-lived invitation request records. Email and IP are HMAC digests; rows older than 24 hours are purged by the check RPC.';
