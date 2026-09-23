
alter table private.app_user_roles enable row level security;
alter table private.idempotency_keys enable row level security;
alter table private.audit_events enable row level security;

revoke all on table private.app_user_roles from public, anon, authenticated;
revoke all on table private.idempotency_keys from public, anon, authenticated;
revoke all on table private.audit_events from public, anon, authenticated;
;
