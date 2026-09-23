# 招待制の新規利用登録を設定する

この機能は、6桁キーが一致した申込者へ招待メールを送る。ブラウザからSupabase Authの通常サインアップは呼び出さない。運用開始前に、DBマイグレーション、Edge Function、Supabase Auth設定、招待キー、招待メールをすべて設定する。

## 仕組み

1. 利用者がアプリでメールアドレスと6桁キーを入力する。
2. `request-invitation` Edge Functionがキーを照合し、IPとメールアドレスごとの回数制限を適用する。
3. キーが正しい場合だけ、Auth Admin APIから招待メールを送る。
4. 招待リンクでメールを確認し、パスワードを設定するとアプリへログインする。

Supabase Authの通常メール登録を無効にする。Edge Functionだけを招待発行口とし、サービス用キーはサーバー側に置く。6桁キーは共有鍵であり、利用者の本人確認にはならない。誤入力はIPごとに15分で5回まで、招待申込は同一メールで1時間に3回、同一IPで1時間に10回までを初期値とする。共有回線による誤制限を検証してから本番に適用する。

## 初回導入

最初に検証用Supabaseプロジェクトで一通り動かし、問題がないことを確認してから本番プロジェクトにも同じ設定を行う。以下のCLIコマンドは、リポジトリのルートフォルダー（`supabase`フォルダーがある場所）で実行する。

### 検証用プロジェクト

1. Supabase Dashboardで**検証用プロジェクト**を開く。`Authentication` → `Sign In / Providers` → `Email`で、一般利用者の新規登録を無効にする。画面上の設定名が異なる場合は、「新しい利用者の登録を許可する」設定を無効にする。既存利用者のログイン設定は変更しない。
2. CLIを検証用プロジェクトへ接続する。`<検証用project-ref>`はDashboardに表示されるプロジェクトIDに置き換える。

   ```bash
   supabase link --project-ref <検証用project-ref>
   ```

3. 適用されるマイグレーションを確認してからDBへ反映する。

   ```bash
   supabase db push --dry-run
   supabase db push
   ```

   `20260923130000_invitation_registration.sql`が適用対象に含まれていることを確認する。この処理で、登録キーのHMACを置く非公開テーブルと、申込回数を制限する処理が作られる。メールアドレスとIPアドレスそのものは記録せず、HMAC値を一時的に保存する。

4. 登録キーとEdge Function用の秘密値を準備する。

   ```bash
   python tools/prepare_invitation_key.py
   ```

   案内に従って、運営担当者が利用者へ知らせる6桁キーを2回入力する。入力中、キーは画面に表示されない。初回は照合用の秘密値も作られ、`supabase/.invitation-secrets.env`に保存される。ツールはキーそのものではなく、DB登録用のHMAC値とSQLを表示する。この環境ファイルはGit管理対象外だが、削除せず、信頼できる秘密情報保管場所にも保管する。

5. Dashboardの`SQL Editor`を開き、ツールが表示したSQLを実行する。これで検証用プロジェクトに有効な6桁キーのHMACが登録される。6桁キーは利用対象者にだけ、安全な方法で伝える。

6. CLIが検証用プロジェクトに接続されていることを確認し、Edge Function用の秘密値を登録する。

   ```bash
   supabase secrets set --env-file supabase/.invitation-secrets.env
   ```

   このファイルに入っているのは照合用などのpepper（HMAC計算用秘密値）です。`SUPABASE_URL`とAuth管理用キーはSupabaseが関数へ提供するため、自分でファイルへ追加したり、HTML・JavaScript・GitHub Pagesへ置いたりしないでください。

7. 招待申込用のEdge Functionを検証用プロジェクトへ配置する。

   ```bash
   supabase functions deploy request-invitation
   ```

   関数のJWT検証は無効にしてあります。申込者はログイン前に利用するためです。関数内では、キー照合、接続元の確認、DBによる申込回数制限を行います。

8. 検証用プロジェクトの`Authentication` → `URL Configuration`を開き、次のURLを設定する。

   - **Site URL**：`https://kazunyon.github.io/kasisougu/`
   - **許可するRedirect URL**：`https://kazunyon.github.io/kasisougu/invitation.html`

9. `Authentication` → `Email Templates`で招待メール（Invite User）の内容を設定する。送信元とSMTPも設定し、招待メールが受信できることを確かめる。招待リンクの期限切れなどでメールが届かない場合に、運営担当者が再招待できる手順も決める。

10. 検証環境で、登録キーの誤り・正解、申込回数制限、メール受信、招待リンクからのパスワード設定、ログインまでを確認する。通常サインアップAPIからは登録できず、通常サインアップを無効にした状態でも招待メールを送れることも確認する。

### 本番プロジェクト

検証環境で確認できたら、本番用のproject-refにCLIを接続し直し、手順1〜10と同じ設定を本番プロジェクトにも行う。本番でも通常のメール新規登録を無効にし、登録キーのSQL、秘密値、Edge Functionは本番プロジェクトへ個別に適用する。CLIの接続先を間違えないよう、各コマンドの前に対象プロジェクトを確認する。

アプリのコード変更は、Supabase側の準備とは別にGitHub Pagesへ公開する必要がある。Supabaseの設定とアプリ公開の両方が済むまでは、招待制登録は利用できない。

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
