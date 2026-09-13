const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const strip = (value) => value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#?[a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const items = [...html.matchAll(/<article class="product">([\s\S]*?)<\/article>/g)].map((match) => { const block = match[1]; return { title: strip((block.match(/<h2 class="productName">([\s\S]*?)<\/h2>/) || [])[1] || ''), imageUrl: (block.match(/background-image: url\(([^)]+)\)/) || [])[1] || '', summary: strip((block.match(/<div class="description">([\s\S]*?)<\/div>/) || [])[1] || '') }; });
const q = (value) => `'${value.replaceAll("'", "''")}'`;
const typeOf = (title, index) => index < 13 ? 'kafo' : title.includes('足底') ? 'foot_orthosis' : title.includes('靴型') ? 'orthopedic_shoe' : (title.includes('膝装具') || title === 'OAKB') ? 'other' : 'afo';
const rows = items.map((item, index) => `(${q(`${item.title}（掲載例${index + 1}）`)},${q(item.title)},${q(item.summary || '特徴は出典ページで確認してください。')},${q(typeOf(item.title, index))},${index + 1},${q(item.imageUrl)},${q(item.title)})`).join(',\n');

process.stdout.write(`begin;
create temporary table tamura_input (title text, product_name text, summary text, type_code text, sort_order integer, image_url text, alt_text text) on commit drop;
insert into tamura_input values\n${rows};

alter table public.kasi_catalog_media drop constraint if exists kasi_catalog_media_rights_status_check;
alter table public.kasi_catalog_media drop constraint if exists catalog_media_rights_status_check;
alter table public.kasi_catalog_media add constraint kasi_catalog_media_rights_status_check check (rights_status in ('owned','licensed','permission_obtained','external_reference'));

insert into public.kasi_catalog_items (title,product_name,summary,publication_status,reviewed_by,reviewed_at,published_at,created_by,updated_by)
select title,product_name,summary,'published','fb537b33-f81f-4300-9531-86d155a6dbac'::uuid,now(),now(),'fb537b33-f81f-4300-9531-86d155a6dbac'::uuid,'fb537b33-f81f-4300-9531-86d155a6dbac'::uuid from tamura_input;

insert into public.kasi_catalog_media (catalog_item_id,storage_path,alt_text,rights_status,rights_note,source_url,sort_order)
select i.id,'external-reference/tamura/' || t.sort_order,t.alt_text,'external_reference','田村義肢製作所の公式サイト上で参照する画像。Storageへ複製しない。',t.image_url,0 from tamura_input t join public.kasi_catalog_items i on i.title=t.title;

insert into public.kasi_catalog_sources (source_type,publisher_name,title,source_url,checked_on,notes)
select 'official_site','田村義肢製作所','下肢装具','https://www.po-tamura.com/users/kashi',current_date,'各掲載例の特徴と写真の公式出典。写真は公式サイト上の外部参照として表示する。'
where not exists (select 1 from public.kasi_catalog_sources where source_url='https://www.po-tamura.com/users/kashi');

insert into public.kasi_catalog_item_sources (catalog_item_id,catalog_source_id,citation_note)
select i.id,s.id,'特徴および写真の公式出典' from tamura_input t join public.kasi_catalog_items i on i.title=t.title cross join public.kasi_catalog_sources s where s.source_url='https://www.po-tamura.com/users/kashi' on conflict do nothing;

insert into public.kasi_catalog_item_terms (catalog_item_id,catalog_term_id,sort_order)
select i.id,term.id,0 from tamura_input t join public.kasi_catalog_items i on i.title=t.title join public.kasi_catalog_terms term on term.term_group='support_scope' and term.code=t.type_code where t.type_code <> 'other' on conflict do nothing;

update public.kasi_catalog_items set publication_status='suspended',updated_by='fb537b33-f81f-4300-9531-86d155a6dbac'::uuid where id='d16a23b6-0cf4-4868-8c3d-99b0aca35c6b'::uuid;
commit;
select count(*) as individual_items from public.kasi_catalog_items where title like '%（掲載例%' and deleted_at is null;
`);
