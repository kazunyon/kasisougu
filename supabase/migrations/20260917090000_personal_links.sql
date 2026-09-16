-- 利用者本人が追加・編集・論理削除できるリンクメモ
begin;

create table if not exists public.kasi_personal_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  url text not null check (char_length(url) between 1 and 2048 and url ~ '^https?://'),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  deleted_at timestamptz
);
create index if not exists kasi_personal_links_owner_updated_idx on public.kasi_personal_links(owner_id, updated_at desc) where deleted_at is null;
alter table public.kasi_personal_links enable row level security;
revoke all on table public.kasi_personal_links from anon, authenticated;
grant select, insert, update on table public.kasi_personal_links to authenticated;
create policy kasi_personal_links_select_own on public.kasi_personal_links for select to authenticated using ((select auth.uid()) = owner_id);
create policy kasi_personal_links_insert_own on public.kasi_personal_links for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy kasi_personal_links_update_own on public.kasi_personal_links for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create trigger kasi_trg_kasi_personal_links_updated before update on public.kasi_personal_links for each row execute function private.kasi_set_updated_at_and_version();

commit;
