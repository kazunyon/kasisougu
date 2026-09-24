# 招待制登録の検証環境への自動配置

[招待制の設定手順](invitation-registration.md)のうち、データベースのマイグレーションと`request-invitation` Edge Functionの配置を、GitHub Actionsの`invitation-test.yml`で自動化します。

## 最初の1回：kazunyon/kasisougu にGitHub Actions用の秘密値を登録する

GitHubの`kazunyon/kasisougu`で`Settings → Secrets and variables → Actions → New repository secret`を開き、次の2つを登録します。値はチャットやコミットに貼り付けません。

| 名前 | 値 |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboardのアカウント設定で発行するCLI用アクセストークン |
| `SUPABASE_TEST_DB_PASSWORD` | 検証用Supabaseプロジェクト`zvuknqikqbumoswbhjau`のデータベースパスワード |

これは`supabase/.invitation-secrets.env`とは別の認証情報です。データベースパスワードの代わりにpublishable keyやservice role keyを設定しないでください。GitHub Actionsの画面に値を表示したり、ログに出したりしないでください。

## 自動で実行される処理

`kazunyon/kasisougu`の`main`で、`supabase/migrations/`、招待用Edge Function、`supabase/config.toml`、またはワークフローを変更すると、以下が順に実行されます。

1. 検証用の`zvuknqikqbumoswbhjau`に接続する。
2. `supabase db push --dry-run`で適用予定をログに表示する。
3. `supabase db push`で未適用マイグレーションを反映する。
4. `request-invitation`を配置する。

`Actions → Deploy invitation backend to test → Run workflow`から手動でも実行できます。実行結果は同じActions画面で確認します。GitHub Actionsの秘密値が未登録なら、最初の確認で停止し、データベースを変更しません。

このワークフローは**検証用だけ**です。本番プロジェクトと`softventure-company/kasisougu`へは配置しません。会社側のリポジトリ同期は別の作業です。

## 引き続き人が行う設定と確認

- `Authentication`の通常登録禁止、Site URL、Redirect URL、招待メール、SMTPの設定。
- `python tools/prepare_invitation_key.py`を使う6桁キーの準備。表示されたSQLを対象プロジェクトのSQL Editorで実行し、生成された秘密値を`supabase secrets set --env-file supabase/.invitation-secrets.env`で登録する。キーの更新時にも実施する。キーやpepperをGitHub Actionsのログへ出さない。
- 検証用のアプリが検証用Supabaseプロジェクトを向いていること、メールの到着、リンクからのパスワード設定、ログイン、誤ったキーの拒否、回数制限を確認する。
- 検証後、本番用プロジェクトに[設定手順](invitation-registration.md)の「3. 本番プロジェクトに設定する」を適用する。

自動配置はメールの受信や登録の成功を保証しません。上記の動作確認を終えるまで、本番への適用を判断しないでください。
