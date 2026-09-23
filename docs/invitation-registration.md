# 招待制の新規利用登録を設定する

この機能は、6桁キーが一致した申込者へ招待メールを送る。ブラウザからSupabase Authの通常サインアップは呼び出さない。運用開始前に、DBマイグレーション、Edge Function、Supabase Auth設定、招待キー、招待メールをすべて設定する。

## 仕組み

1. 利用者がアプリでメールアドレスと6桁キーを入力する。
2. `request-invitation` Edge Functionがキーを照合し、IPとメールアドレスごとの回数制限を適用する。
3. キーが正しい場合だけ、Auth Admin APIから招待メールを送る。
4. 招待リンクでメールを確認し、パスワードを設定するとアプリへログインする。

Supabase Authの通常メール登録を無効にする。Edge Functionだけを招待発行口とし、サービス用キーはサーバー側に置く。6桁キーは共有鍵であり、利用者の本人確認にはならない。誤入力はIPごとに15分で5回まで、招待申込は同一メールで1時間に3回、同一IPで1時間に10回までを初期値とする。共有回線による誤制限を検証してから本番に適用する。

## 初回導入

1. 本番Supabaseで通常のメール新規登録が有効なら、先に無効にする。既存利用者のログインに影響しないことを確認する。機能導入中にAuthの通常サインアップAPIが開いた状態を残さない。
2. Supabase CLIを使い、まず検証環境へlinkする。
3. `supabase db push`で`20260923130000_invitation_registration.sql`を適用する。`private.kasi_invitation_codes`には有効なコードのHMACだけを置く。`private.kasi_invitation_attempts`はメールアドレスとIPのHMAC値だけを保管し、24時間より古い記録を削除する。
4. `python tools/prepare_invitation_key.py`を実行する。6桁キーは入力時に表示されない。初回はEdge Function用の秘密値を`supabase/.invitation-secrets.env`へ生成し、照合用HMACとSQLを表示する。この環境ファイルはGit管理対象外にし、信頼できる秘密情報保管場所へ保管する。
5. 手順4で表示されたSQLをSupabase SQL Editorで実行し、有効なキーを登録する。コードを変更するときは同じツールを実行し、表示されるSQLで旧キーを失効して新しいHMACを登録する。6桁キーは対象者へ安全な経路でだけ伝える。
6. 秘密値を対象プロジェクトへ設定する。

   ```text
   supabase secrets set --env-file supabase/.invitation-secrets.env
   ```

   Supabase Edge Runtimeが提供する`SUPABASE_URL`と管理用キー（`SUPABASE_SECRET_KEYS`の`default`。互換用に`SUPABASE_SECRET_KEY`または`SUPABASE_SERVICE_ROLE_KEY`も読み取る）を関数内で使う。これらをHTML、JavaScript、GitHub Pagesの公開設定へ置かない。秘密値の登録対象は上記の2つのpepperで、管理用キーを自分でEdge Functionへ複製しない。

7. `supabase functions deploy request-invitation`でEdge Functionを配置する。`supabase/config.toml`でこの関数のJWT検証を無効にしているため、関数内のコード照合、CORS、試行制限が必ず実行される。
8. 検証環境で、通常サインアップAPIが拒否されることと、Auth Adminの招待APIは通常サインアップ無効時も動くことを確かめる。
9. URL ConfigurationのSite URLを`https://kazunyon.github.io/kasisougu/`にし、許可Redirect URLsへ`https://kazunyon.github.io/kasisougu/invitation.html`を追加する。
10. AuthのInvite Userメールテンプレート、送信元、SMTPを設定する。招待メールの到達を検証し、期限切れメールの再招待を運営担当者が行えるようにする。

## 受入確認

- 正しいキーで申込むと、入力したメールアドレスだけに招待メールが届く。
- 誤ったキー、期限切れキー、停止したキーでは招待メールも利用者アカウントも作成されない。
- Authの通常サインアップAPIを直接呼んでも新規アカウントを作成できない。
- 失敗回数の上限、IP・メール単位の上限が同時アクセス時にも迂回されない。
- 招待URLの許可リストが一致し、リンクからパスワード設定画面へ戻る。
- 招待を承諾する前に本人データを読めない。設定後はログインでき、`kasi_profiles`が作成される。
- 登録キーや秘密キーがブラウザ資材、URL、エラー表示、ログ、`auth.users.user_metadata`へ残らない。
- privateテーブルとRPCをanon/authenticatedから直接読めず、通常利用者にDashboardの管理権限がない。

Supabase Dashboardからの手動ユーザー追加はこの招待キー経路を通らない管理者用の例外経路である。権限を持つ運営担当者を限定し、追加理由と日時を記録する。
