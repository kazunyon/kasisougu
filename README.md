# 下肢装具サポートPWA

下肢装具を使う本人が、装具、使用時の様子、相談内容を整理するための個人用PWAです。装具の適合や処方、歩行可否を判断する機能は含みません。

公開URL: https://kazunyon.github.io/kasisougu/

## 構成

| 役割 | 使用サービス |
| --- | --- |
| 画面公開 | GitHub Pages |
| 認証・データ保存 | Supabase Auth / PostgreSQL / Storage |
| Supabaseプロジェクト | `zvuknqikqbumoswbhjau` |

Google Cloud VM、Flask、独自サーバーは使用しません。ブラウザはSupabaseの公開用キーと利用者のログインセッションだけで接続し、行レベルセキュリティ（RLS）により本人のデータだけを扱います。

## 実装済み画面

ログイン後は全画面共通のメニューから、ホーム・装具図鑑・使用記録・相談シート・リンク集・設定へ直接移動できます。PCは左側メニュー、画面幅760px以下は下部メニューです。「自分の装具」はPCの左メニュー下、スマートフォンの画面上部から開けます。緑を基調に、使用記録は広い画面で一覧と詳細を並べて表示します。

画面を切り替えても、開いている入力フォームは同じログイン中のページ内に保持されます。再読み込みやログアウトをまたぐ下書きの自動保存ではありません。相談シートの印刷には共通メニューを含めません。

| 画面 | 内容 |
| --- | --- |
| S01 | メールアドレスとパスワードによるログイン |
| S02 | ホーム、登録済み装具と使用記録の確認 |
| S03 / F02 | 複数装具の一覧・追加・編集、装具別の困りごと・希望、写真の保存・表示・並べ替え・削除 |
| S04 / F03 | 公開済み図鑑の分類・キーワード検索、詳細、最大3件の項目別比較 |
| S05 / F04 | 使用記録の一覧・詳細・編集、8項目評価、同条件での2件比較、記録別の写真保存・表示・説明・削除 |
| S06 / F05 | 掲載内容の選択、相談シートの下書き保存・再編集、内容と写真の確定、A4印刷。外部への自動送信はしない |
| S07 / F01 | 表示名・文字倍率・端末保存設定の本人専用DB保存と再読込、書き出し、確認付き端末下書き削除、ログアウト |

装具と使用記録の写真はJPEG・PNG・WebP、1枚10MB以下、それぞれ最大10枚までを画面で受け付けます。本人専用の非公開Supabase Storageバケットに保存し、ログイン済みの本人だけが閲覧できます。上限は画面側の制御であり、複数端末から同時に追加する場合のDB側上限は未設定です。

F01の本人設定は `kasi_profiles` に表示名・文字倍率・端末保存設定を保存します。設定画面で変更後に「本人設定を保存」を押すとDBへ反映され、再ログイン時に読み込みます。表示名は相談シートを新規作成するときの本人名の初期値になり、確定済みシートの内容は変更しません。端末の下書き削除はDBの本人設定を消しません。端末保存の許可設定は保存されますが、下書きの自動保存機能はまだありません。

F04は `kasi_usage_records`、`kasi_usage_record_observations`、`kasi_user_media` を使用します。比較時は靴・場所・介助・使用時間を並べ、条件が異なる場合は注意を表示します。装具の優劣や医学的評価は判定しません。

記録の「関連する装具」は種類名ではなく、F02で登録した実際の装具を参照します。記録画面では長下肢装具・短下肢装具・その他から種類を選び、その種類の登録済み装具を選択します。未登録なら同じ画面から装具登録へ進み、登録後は記録へ戻って新しい装具を選べます。

F03の分類は `kasi_catalog_terms` の `support_scope.code` を使い、表示名の部分一致では判定しません。検索は公開済み記事の装具名・製品名・概要と5分類のラベル・説明を対象とし、分類フィルターと併用できます。詳細と比較では未登録の値を「未確認」と表示し、重さ・着脱・靴との相性などを概要文から推測しません。出典の確認日は `kasi_catalog_sources.checked_on` を表示します。比較は最大3件で、優劣や適合性の判定はしません。素材・継手・足元構造・特徴はコンテンツ管理者が編集でき、支える範囲・注意点・専門家に確認したいことは `kasi_catalog_items` の編集項目として保存します。編集には既存の `private.kasi_is_content_admin()` による管理者RLSが適用されます。

F03の既存環境には [図鑑詳細編集マイグレーション](supabase/migrations/20260914190000_f03_catalog_editable_details.sql) を適用します。適用前も公開図鑑は閲覧できますが、支える範囲・注意点・専門家に確認したいことの編集欄は表示されません。マイグレーション適用後、コンテンツ管理者でログインすると「内容を編集」が利用できます。

F05は `kasi_consultation_sheets.snapshot_json` に選択対象と表示内容を保存します。確定時には選択写真を本人専用Storage内の相談シート用パスへコピーするため、元の記録・困りごと・写真を後から変更しても、確定済みの表示は変わりません。確定済みシートは画面から再編集できませんが、内容を引き継ぐ「追記の下書き」を新規作成し、相談日・相談先・質問などを編集できます。元の確定版はそのまま残ります。追記の下書きでは、引き継いだ装具・困りごと・記録・写真の選択は変更できません。印刷はブラウザーのA4縦用CSSを使用します。既存の関連テーブルは、選択内容の保持には使用していません。

F02は初期構築SQLに含まれる `kasi_user_orthoses`、`kasi_user_needs`、`kasi_user_media` と `kasi_user-media` バケットを使用します。既存の `zvuknqikqbumoswbhjau` 環境ではテーブルと本人限定RLSは存在し、[F02 Storage追加マイグレーション](supabase/migrations/20260913224759_f02_user_media_storage.sql) で非公開写真バケットとStorageポリシーを追加しました。写真の上限は画面側の制御であり、同じ装具へ複数端末から同時に追加する場合のDB側上限は未設定です。写真には撮影位置などのEXIF情報が残り得るため、共有前に確認してください。

適用後は、本人Aの装具へ写真を保存・表示でき、本人Bのセッションでは同じ `storage_path` の認証付きダウンロードと `kasi_user_media` 行の参照が拒否されることを確認します。公開URLで写真が取得できないことも確認してください。テスト用データは実利用者の写真を使わず、検証用アカウントと画像を使用します。

## リンク集

「埼玉県」装具のお役立ち情報サイト（https://sougu.saitama-pt.or.jp/）と、注目記事「両側金属支柱付き短下肢装具の足部の種類の選び方と活用方法」を掲載しています。PCの広い画面では2件を横並びに、スマートフォンでは縦に表示します。共通メニューから開き、外部サイトは新しいタブで表示します。掲載内容は `kasisougu/static/index.html` の `links-page` で管理します。

## 初回設定

1. Supabase SQL Editorで [初期構築SQL](supabase/下肢装具サポートPWA_DB初期構築_v0.1.sql) を適用します。
2. Supabase Dashboardの Authentication → Users で利用者を作成します。メールアドレス、パスワードを入力し、`Auto confirm user?` を有効にします。
3. GitHubリポジトリの Settings → Secrets and variables → Actions → Variables に、次の変数を登録します。

```text
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`sb_secret_...`、`service_role`、データベース接続文字列は登録・公開しません。

4. GitHub Settings → Pages で公開元を **GitHub Actions** にします。`main` へマージすると、[Publish GitHub Pages](.github/workflows/pages.yml) が公開用ファイルを生成してデプロイします。

## ディレクトリ

```text
.github/workflows/pages.yml   GitHub Pages公開
kasisougu/static/             PWA画面・スタイル・Service Worker
supabase/                     Supabase初期構築SQL
tools/build_pages.py          Pages配信用ファイルの生成
```

## ローカル確認

画面変更のブラウザ確認は、Pagesビルドをローカルで配信し、Playwright CLIで実行できます。`tools/check_redesign.js` はAPIを架空のテストデータに差し替え、画面移動・入力保持・選択表示・印刷・各画面幅・文字200%・ログアウトを確認します。実データには接続しません。スクリーンショットは `output/playwright/` に保存します。

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory dist/pages
# 別のターミナルで実行
npx --yes --package @playwright/cli playwright-cli -s=green-redesign open http://127.0.0.1:8765 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=green-redesign run-code --filename tools/check_redesign.js
npx --yes --package @playwright/cli playwright-cli -s=green-redesign run-code --filename tools/check_redesign_flows.js
npx --yes --package @playwright/cli playwright-cli -s=green-redesign run-code --filename tools/check_redesign_layout.js
```

PowerShellで公開用ファイルを生成できます。

```powershell
$env:SUPABASE_URL='https://zvuknqikqbumoswbhjau.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='sb_publishable_...'
python tools/build_pages.py
```

生成先は `dist/pages/` です。公開用キーはブラウザで使用する前提のキーですが、実データへのアクセスはSupabase AuthとRLSで制御されます。
