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
| S03 / F02 | 複数装具の一覧・追加・編集、装具別の困りごと・希望、写真の保存・表示・並べ替え・削除 |
| S04 | 専門職レビュー済み記事だけを表示する装具図鑑 |
| S05 | 使用日、靴、場面、介助、時間、感想、項目評価の記録 |
| S06 | 相談内容のプレビューと印刷。外部への自動送信はしない |
| S07 | 文字倍率、端末下書き保存、書き出し、確認付き削除、ログアウト |

装具の写真はJPEG・PNG・WebP、1枚10MB以下、装具ごとに最大10枚までを画面で受け付けます。本人専用の非公開Supabase Storageバケットに保存し、ログイン済みの本人だけが閲覧できます。使用記録の写真は今後の対応です。

F02は初期構築SQLに含まれる `kasi_user_orthoses`、`kasi_user_needs`、`kasi_user_media` と `kasi_user-media` バケットを使用します。既存の `zvuknqikqbumoswbhjau` 環境ではテーブルと本人限定RLSは存在し、[F02 Storage追加マイグレーション](supabase/migrations/20260913224759_f02_user_media_storage.sql) で非公開写真バケットとStorageポリシーを追加しました。写真の上限は画面側の制御であり、同じ装具へ複数端末から同時に追加する場合のDB側上限は未設定です。写真には撮影位置などのEXIF情報が残り得るため、共有前に確認してください。

適用後は、本人Aの装具へ写真を保存・表示でき、本人Bのセッションでは同じ `storage_path` の認証付きダウンロードと `kasi_user_media` 行の参照が拒否されることを確認します。公開URLで写真が取得できないことも確認してください。テスト用データは実利用者の写真を使わず、検証用アカウントと画像を使用します。

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
