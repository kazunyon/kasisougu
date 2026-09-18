# 下肢装具サポートPWA

下肢装具を使う本人が、自分の装具、使用記録、困りごと・希望を整理し、専門職に見せる相談シートを作る個人用アプリです。装具の適合・処方・歩行可否を判定する機能はありません。

[アプリを開く](https://kazunyon.github.io/kasisougu/)

本書は2026年9月16日時点の `main` の実装（基準コミット `d4b1d379b5b7d056929fafd6d55c163c90b6c1c6`）を説明します。過去の設計案より、このリポジトリのコード・SQLを優先します。コードの存在は、本番DBへの適用や実機での動作確認を保証するものではありません。

## システム構成

| 役割 | 現在の実装 |
| --- | --- |
| 画面 | HTML・CSS・JavaScript。ページ内で画面を切り替える |
| 公開 | GitHub Pages。GitHub Actionsで静的ファイルを生成・公開 |
| 認証 | Supabase Authのメールアドレス・パスワード認証 |
| 保存 | ブラウザからSupabase Data API、RPC、Storageへ直接接続 |
| 権限 | PostgreSQLのRLSとStorageポリシー |
| PWA | Manifest、アイコン、Service Workerによる画面資材のキャッシュ |

Flask・Google Cloud VM・独自の業務APIサーバーは現行構成に含みません。公開ワークフローの接続先は `https://zvuknqikqbumoswbhjau.supabase.co` です。

## 画面と操作

ログイン後の共通メニューは、ホーム・装具図鑑・使用記録・相談シート・リンク集・設定です。PCでは左側、幅760px以下では下部に表示します。「自分の装具」はPCの左メニュー下、スマートフォンの上部から開きます。

| 画面 | できること |
| --- | --- |
| ログイン | 登録済みメールアドレスとパスワードで認証 |
| ホーム | 装具を過去使用・現在使用中・試用中に分けて表示。最近の使用記録と相談シートへの入口 |
| 自分の装具 | 複数装具の登録・編集、左右・種類・作製日または年・製作所・価格・制度／自己負担分、写真の追加・並べ替え・削除 |
| 装具図鑑 | 公開記事の検索、AFO・KAFO・足底装具・靴型装具による絞り込み、詳細、2～3件比較、既存記事の編集フォーム |
| 使用記録 | 日付・関連装具・靴・場所や訓練内容・介助・時間・その日の感想、8項目評価、日付別の「気になったこと・変化」、写真、2件比較、記録の削除 |
| 困りごと・希望 | **使用記録画面内**で選択中の装具に対して登録・編集。分類・説明・優先度・対応状態を管理 |
| 相談シート | 掲載する装具・困りごと・記録・写真の選択、下書き保存、確定、確定版からの再編集、削除、印刷 |
| リンク集 | 埼玉県の装具情報サイトと紹介記事を別タブで開く |
| 設定 | 表示名・文字倍率100～200%・端末保存許可の保存、装具一覧のJSON書き出し、端末下書きキーの削除、ログアウト |

### 使用記録

- 関連装具は「自分の装具」に登録した実物を選びます。種類を選択してから装具を選び、未登録なら装具登録へ移動して戻れます。
- 最初は現在使用中の装具に紐づく最新の通常記録を優先します。「開く記録」では過去分・比較用に加え、記録がない装具も「記録未入力」として選べます。同名装具には番号を付けて区別します。
- 「記録を保存」は選択中の記録を更新します。新規入力は通常記録（`record_kind=current`）を作成します。
- 「比較用として別に保存」は入力内容と8項目評価を別の記録（`record_kind=comparison`）として保存します。写真は複製しません。
- 評価は重さ・疲れやすさ・痛み／圧迫・着け外し・靴との相性・安定性・快適さ・その他。「未評価」「問題なし」「気になる」を区別します。
- 「その日の感想」は使用記録ごとの自由記入です。「気になったこと・変化」は同じ記録に複数追加でき、気づいた日・分類・発生時期・対応状況・対応内容・解決日を別々に管理します。
- 相談シートでは、未解決の「気になったこと・変化」を選んで掲載できます。
- 2件比較では靴・場所・介助・時間と評価を並べ、条件が異なる場合に注意を表示します。適合性や優劣は判定しません。
- 保存済み記録の削除は記録の論理削除で、装具・評価・写真の物理削除はしません。**「記録未入力」の削除は装具そのものの論理削除**です。確認画面と直前の記録有無確認があります。

### 装具図鑑

分類は `kasi_catalog_terms` の `support_scope.code` で判定します。検索は装具名・製品名・概要と5分類のラベル・説明を対象とします。未登録値は原則「未確認」で表示し、専門家への質問には未登録時の定型例があります。出典の確認日は `kasi_catalog_sources.checked_on` です。

追加列が取得できる環境では「内容を編集」が表示されます。**ボタンの表示自体は管理者判定ではありません。** 保存権限は `private.kasi_app_user_roles` の `content_admin` と `private.kasi_is_content_admin()` によるRLSで制御します。新規記事作成・レビュー・公開切替を一通り行う管理画面は未実装です。

### 相談シート

下書きと確定版は `kasi_consultation_sheets.snapshot_json` に掲載対象・内容を保存します。SQLにある選択用関連3テーブルは現行画面では使いません。相談先もスナップショット内に保持します。

確定時には選んだ写真を本人専用Storageの `<userId>/consultations/<sheetId>/` 配下へ複製します。元データを変更しても確定版の内容を維持する方式です。「内容を編集する」は確定版を残して新しい下書きを作り、装具・記録・写真等を選び直せます。編集画面から追加した写真は指定した装具の写真として保存され、そのシートにも選択されます。

削除はシートの論理削除と、そのシート用の複製写真の削除です。複製写真を先に削除するため、後続処理が失敗すると写真だけ失われる場合があります。DBとStorageをまたぐ一括トランザクションではありません。

印刷はブラウザの印刷機能とA4縦向けCSSを使用します。PDF保存はブラウザ側の機能です。ページ数の固定、PDF生成API、外部への自動送信はありません。

## 保存・認証・画像の注意点

- 保存はオンラインでの手動操作が基本です。画面切替中のフォームはページ内に保持しますが、再読み込みをまたぐ自動下書き保存ではありません。
- 端末保存許可はDBへ設定値を保存するだけです。オフライン保存・再送キュー・自動同期・競合内容の選択画面は未実装です。
- 更新時は主に `row_version` で競合を検出し、更新できなければ再読み込みを案内します。使用記録と8項目評価はRPC `kasi_save_usage_record` で同じトランザクションに保存します。
- ログインのアクセストークンはページのメモリに保持します。セッション復元・自動更新・新規登録・パスワード再設定の画面はありません。ログアウトは画面とメモリをリセットし、AuthのログアウトAPIは呼びません。
- Service Workerは画面資材のみをネットワーク優先でキャッシュします。Supabase API応答・本人画像はキャッシュ対象外です。オフラインで本人データを使えることは保証しません。
- 本人画像は非公開の `kasi_user-media` に保存し、認証付き取得で表示します。JPEG・PNG・WebP、1枚10MiB以下、装具ごと／記録ごとに最大10枚を画面で確認します。枚数のDB側同時実行制約、EXIF除去、画像変換、ウイルス検査は未実装です。
- 「データを書き出す」は読み込み済みの装具一覧と書き出し日時だけを `kasisougu-export.json` に出力します。記録・評価・困りごと・写真・相談シート・設定を含む完全バックアップではありません。
- 「端末の下書きを削除」は確認後に `localStorage` の `kasi_record_draft` を削除します。DBデータ・本人設定の削除やアカウント削除ではありません。

## リンク集

「埼玉県」装具のお役立ち情報サイト、注目記事、価格相場の記事は「固定のお役立ち情報」として掲載し、利用者側では変更できません。別の「自分で追加したリンク」では、名前・URL・メモを本人専用に保存し、後から編集・削除できます。外部サイトは新しいタブで開きます。本人用リンクには [リンクメモ用マイグレーション](supabase/migrations/20260917090000_personal_links.sql) の適用が必要です。
## 構築と公開

### DB

新規環境では[初期構築SQL](supabase/下肢装具サポートPWA_DB初期構築_v0.1.sql)を適用し、その後に次のマイグレーションを時刻順で確認・適用します。初期SQLは既存テーブルへの繰り返し適用を前提としていません。既存環境では適用履歴とスキーマを確認し、不足分のみ適用します。

| 順序 | ファイル | 内容 |
| --- | --- | --- |
| 1 | [20260913224759_f02_user_media_storage.sql](supabase/migrations/20260913224759_f02_user_media_storage.sql) | 既存環境の本人写真バケット・Storageポリシー補完 |
| 2 | [20260914190000_f03_catalog_editable_details.sql](supabase/migrations/20260914190000_f03_catalog_editable_details.sql) | 図鑑の支える範囲・注意点・質問の列を追加 |
| 3 | [20260915160000_f04_current_comparison_records.sql](supabase/migrations/20260915160000_f04_current_comparison_records.sql) | 通常／比較用の区分、記録と評価を保存するRPC |
| 4 | [20260917090000_personal_links.sql](supabase/migrations/20260917090000_personal_links.sql) | 本人専用のリンクメモ、RLS、論理削除 |
| 5 | [20260917093000_orthosis_price.sql](supabase/migrations/20260917093000_orthosis_price.sql) | 本人装具の任意価格（円）を追加 |
| 6 | [20260917094000_orthosis_funding_system.sql](supabase/migrations/20260917094000_orthosis_funding_system.sql) | 本人装具の制度・自己負担分を追加 |
| 7 | [20260917100000_usage_record_concerns.sql](supabase/migrations/20260917100000_usage_record_concerns.sql) | 使用記録ごとの「気になったこと・変化」と対応履歴を追加 |

F03の追加列がない場合は従来列で閲覧を試みます。F04のRPC未適用では現行の記録保存はできません。初期SQLの図鑑データは代表分類だけで、公開記事本文は別途登録が必要です。

Supabase側でログイン用の利用者を用意します。アプリ内に利用者登録画面はありません。図鑑編集者には管理された手順で `content_admin` を付与します。本人データの分離、匿名アクセス拒否、管理者権限は実DBで確認してください。

### GitHub Pages

1. リポジトリのActions変数に `SUPABASE_PUBLISHABLE_KEY`（`sb_publishable_...`）を設定します。
2. 接続先を変更する場合は `.github/workflows/pages.yml` の `SUPABASE_URL` も変更します。
3. Pagesの公開元をGitHub Actionsにします。
4. `main` へのpushまたは手動実行で `Publish GitHub Pages` を実行します。キーが空の場合はジョブをスキップします。

`tools/build_pages.py` は相対パスへの変換、`pages-config.js`、Manifest、Pages用Service Worker、`.nojekyll` を生成し、`dist/pages/` を公開します。公開用キーはブラウザに渡す値です。secret key、`service_role`、DB接続文字列は埋め込みません。

### ローカル確認

PythonでPages用ファイルを生成してから配信します。PowerShellの例です。

```powershell
$env:SUPABASE_URL='https://zvuknqikqbumoswbhjau.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='sb_publishable_...'
python tools/build_pages.py
python -m http.server 8765 --bind 127.0.0.1 --directory dist/pages
```

通常のログイン操作は設定先のSupabaseへ接続します。検証用環境を使ってください。以下の既存画面テストはAPIを架空データへ置き換えます。Node.jsとPlaywright CLI・Chromeを用意し、別ターミナルで実行します。

```powershell
npx --yes --package @playwright/cli playwright-cli -s=green-redesign open http://127.0.0.1:8765 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=green-redesign run-code --filename tools/check_redesign.js
npx --yes --package @playwright/cli playwright-cli -s=green-redesign run-code --filename tools/check_current_records.js
```

ほかに `check_redesign_flows.js`、`check_redesign_layout.js`、`check_unrecorded_orthoses.js`、`check_record_deletion.js`、`check_consultation_editable.js`、`check_consultation_delete.js`、`check_expired_session.js`、`check_strikethrough.js` があります。各テストの前提データをそろえるため、個別確認では `check_redesign.js` を先に実行します。これらは実DBのRLS、SQL適用、Storage、復元の試験を代替しません。

## ファイル構成

| パス | 役割 |
| --- | --- |
| `kasisougu/static/index.html` | 全画面の構造、入力欄、リンク集 |
| `kasisougu/static/app.js` | 認証、画面遷移、本人設定、装具、困りごと、装具写真 |
| `kasisougu/static/catalog.js` | 図鑑の検索・比較・編集 |
| `kasisougu/static/records.js` | 使用記録、評価、比較、削除、記録写真 |
| `kasisougu/static/consultation.js` | 相談シート、スナップショット、写真複製、印刷 |
| `kasisougu/static/*.css` | 共通・機能別・印刷・レスポンシブの表示 |
| `supabase/` | 初期SQLと追加マイグレーション |
| `.github/workflows/pages.yml` / `tools/build_pages.py` | 公開処理と静的ファイル生成 |
| `tools/check_*.js` | 画面検証スクリプト |

`tools/build_basic_design.py` は旧v0.1設計書の生成スクリプトです。現行実装の仕様やv0.2を再生成する手順としては使いません。

## 未実装・今後の確認

オフライン下書きと自動再送、完全書き出し・取込復元・アカウント削除、記事レビュー／公開管理、施設検索、条件による候補整理は未実装です。監査・再送管理用テーブルがあっても現行画面からは利用していません。

図鑑の複数API更新や相談シートのDB／Storage操作は途中失敗があり得ます。確定版の変更禁止は主に画面の制御で、DBの本人UPDATE権限による直接変更まで禁止するものではありません。バックアップ頻度・保持期間・復旧時間はリポジトリだけでは確定できません。
