-- Allow irreversible deletion of suspended accounts and remove unusable legacy keys.
begin;

alter table private.kasi_admin_audit drop constraint if exists kasi_admin_audit_action_check;
alter table private.kasi_admin_audit add constraint kasi_admin_audit_action_check
  check (action in (
    'bootstrap', 'key_rotate', 'key_stop', 'invite', 'invite_failed',
    'invite_resend', 'invite_resend_failed', 'user_suspend', 'user_resume',
    'user_delete', 'role_grant', 'role_revoke'
  ));

-- Blank-memo keys are not attributable and must no longer be redeemable.
delete from private.kasi_invitation_codes
 where memo is null or pg_catalog.char_length(pg_catalog.btrim(memo)) = 0;
alter table private.kasi_invitation_codes drop constraint if exists kasi_invitation_codes_memo_check;
alter table private.kasi_invitation_codes add constraint kasi_invitation_codes_memo_check
  check (pg_catalog.char_length(pg_catalog.btrim(memo)) between 1 and 100);

-- These linking rows belong to the same owner and should not block account deletion.
alter table public.kasi_consultation_sheet_orthoses
  drop constraint kasi_sheet_orthoses_orthosis_owner_fk;
alter table public.kasi_consultation_sheet_orthoses
  add constraint kasi_sheet_orthoses_orthosis_owner_fk
  foreign key (user_orthosis_id, owner_id)
  references public.kasi_user_orthoses(id, owner_id) on delete cascade;
alter table public.kasi_consultation_sheet_records
  drop constraint kasi_sheet_records_record_owner_fk;
alter table public.kasi_consultation_sheet_records
  add constraint kasi_sheet_records_record_owner_fk
  foreign key (usage_record_id, owner_id)
  references public.kasi_usage_records(id, owner_id) on delete cascade;
alter table public.kasi_consultation_sheet_needs
  drop constraint kasi_sheet_needs_need_owner_fk;
alter table public.kasi_consultation_sheet_needs
  add constraint kasi_sheet_needs_need_owner_fk
  foreign key (user_need_id, owner_id)
  references public.kasi_user_needs(id, owner_id) on delete cascade;

create or replace function public.kasi_admin_write_audit(
  p_actor_id uuid, p_action text, p_target_user_id uuid default null,
  p_target_email text default null, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('invite', 'invite_failed', 'invite_resend', 'invite_resend_failed',
    'user_suspend', 'user_resume', 'user_delete', 'role_grant', 'role_revoke') then
    raise exception 'invalid admin action';
  end if;
  insert into private.kasi_admin_audit (actor_id, action, target_user_id, target_email, detail)
  values (p_actor_id, p_action, p_target_user_id, p_target_email, coalesce(p_detail, '{}'::jsonb));
end;
$$;

commit;
