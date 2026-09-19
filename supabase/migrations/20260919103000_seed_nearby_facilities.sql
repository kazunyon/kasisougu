-- 既存の「近くで探す」で案内していた、公式情報で確認済みの埼玉県内候補を施設マスタへ移行する。
begin;

insert into public.kasi_nearby_facilities
  (name, address, prefecture, municipality, latitude, longitude, purpose_codes, phone, website_url)
select * from (values
  ('埼玉県総合リハビリテーションセンター', '埼玉県上尾市西貝塚148-1', '埼玉県', '上尾市', 35.938351::numeric, 139.553391::numeric, array['manufacture','repair','fitting','rehabilitation','consultation']::text[], '048-781-2222', 'https://www.pref.saitama.lg.jp/rihasen/'),
  ('国立障害者リハビリテーションセンター病院', '埼玉県所沢市並木4丁目1番地', '埼玉県', '所沢市', 35.807959::numeric, 139.463485::numeric, array['manufacture','fitting','rehabilitation']::text[], '04-2995-3100', 'https://www.rehab.go.jp/hospital/'),
  ('さいたま市障害者総合支援センター', '埼玉県さいたま市中央区鈴谷7丁目5番7号', '埼玉県', 'さいたま市中央区', 35.874199::numeric, 139.624756::numeric, array['consultation','rehabilitation']::text[], '048-859-7255', 'https://www.city.saitama.lg.jp/006/015/050/003/p054196.html')
) as source(name, address, prefecture, municipality, latitude, longitude, purpose_codes, phone, website_url)
where not exists (
  select 1 from public.kasi_nearby_facilities target
  where target.name = source.name and target.address = source.address
);

commit;
