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

| 画面 | 内容 |
| --- | --- |
| S01 | メールアドレスとパスワードによるログイン |
| S02 | ホーム、登録済み装具と使用記録の確認 |
| S03 | 装具名、左右、種類、作製情報、製作所の登録 |
| S04 | 専門職レビュー済み記事だけを表示する装具図鑑 |
| S05 | 使用日、靴、場面、介助、時間、感想、項目評価の記録 |
| S06 | 相談内容のプレビューと印刷。外部への自動送信はしない |
| S07 | 文字倍率、端末下書き保存、書き出し、確認付き削除、ログアウト |

写真はJPEG・PNG・WebP、10MBまでを対象にしています。写真本体のSupabase Storage保存は今後の対応です。

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

PowerShellで公開用ファイルを生成できます。

```powershell
$env:SUPABASE_URL='https://zvuknqikqbumoswbhjau.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='sb_publishable_...'
python tools/build_pages.py
```

生成先は `dist/pages/` です。公開用キーはブラウザで使用する前提のキーですが、実データへのアクセスはSupabase AuthとRLSで制御されます。
