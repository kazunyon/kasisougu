
create or replace function private.kasi_is_content_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from private.kasi_app_user_roles r
       where r.user_id = (select auth.uid())
         and r.role_code = 'content_admin'
     );
$$;

create or replace function private.kasi_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.kasi_profiles(user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
;
