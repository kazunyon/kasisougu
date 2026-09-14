-- F03: 図鑑詳細の編集可能な本文を追加する。
-- 公開・更新は既存の kasi_is_content_admin() と管理者RLSに従う。
alter table public.kasi_catalog_items
  add column if not exists support_scope_text text,
  add column if not exists caution_text text,
  add column if not exists expert_questions jsonb not null default '[]'::jsonb;

alter table public.kasi_catalog_items
  drop constraint if exists kasi_catalog_items_expert_questions_array;

alter table public.kasi_catalog_items
  add constraint kasi_catalog_items_expert_questions_array
  check (jsonb_typeof(expert_questions) = 'array');
