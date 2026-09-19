# 施設マスタ（旧「登録施設から探す」）

「登録施設から探す」画面は廃止され、現在の「近くで探す」はGoogle Maps検索専用です。この文書は既に構築済みの施設マスタを保守する場合の履歴資料です。現行画面から施設マスタは参照しません。

検索対象は public.kasi_nearby_facilities の有効な登録データです。Google Maps上の施設を自動取得する機能ではありません。

## 運営者の登録手順

1. Supabase の対象プロジェクトで Table Editor → kasi_nearby_facilities を開きます。
2. 公式情報で施設名、所在地、対応内容を確認します。既存行がないか施設名と住所で確認してから Insert row を選びます。
3. 以下を入力し、保存します。id、created_at、updated_at、row_version は既定値を使用します。
4. SQLまたはSupabase管理画面で登録内容を確認します。

| 列 | 内容 |
| --- | --- |
| name | 施設の正式名称 |
| address | 都道府県からの住所 |
| prefecture / municipality | 都道府県、市区町村（政令市は区まで） |
| latitude / longitude | 施設の緯度・経度。町域の代表点を施設位置と混同しない |
| purpose_codes | 確認済みの対応目的を配列で指定 |
| phone / website_url | 電話、公式URL（任意、httpまたはhttps） |
| is_active | 表示するならtrue。閉鎖・非掲載はfalse |

目的は manufacture（装具製作）、repair（修理）、fitting（適合確認）、rehabilitation（リハビリ）、consultation（制度相談）です。例：["manufacture","repair"]。
病院だから製作可能、支援センターだから医療リハビリ可能とは判断せず、施設が公表する対応内容で分類してください。

一般利用者の権限は閲覧のみです。管理者による登録・更新にはSupabase管理画面を使用し、管理用のキーをアプリへ埋め込まないでください。既存施設の更新は該当行を編集し、削除する代わりにis_active=falseで非掲載にできます。
