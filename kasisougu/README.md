# 下肢装具 相談ノート・初版

個人1人用の相談メモPWAです。Google Cloudの既存VM・PostgreSQLを使います。

## できること

- 困りごとを大きなボタンで選択。希望・装具名・質問を入力。
- 専用パスワードでログインし、1件のメモをPostgreSQLに保存・再表示。
- 画面の内容を印刷（ブラウザーの印刷画面からPDF保存も可能）。
- HTTPS公開後にホーム画面へ追加。通信がなくても画面を開いて入力可能。

入力内容は自動保存しません。オフラインではサーバー保存できず、閉じると未保存の入力は失われます。端末の永続ストレージへメモやパスワードを保存しません。PWAキャッシュは画面用ファイルのみです。

## 現状

このZIPは配置用です。Google Cloudへのアップロード、実DB接続、HTTPS公開はまだ行っていません。既存DB・バックアップ設定はそのまま利用します。利用者を増やす場合は個別アカウントとデータ分離を別途実装する必要があります。

## 次に行うこと（Cloud Shell）

1. ZIPをパソコンへダウンロード。
2. Cloud Shellの「︙」→「アップロード」でZIPをアップロード。
3. Cloud Shellで、サーバーへコピー：

```bash
gcloud compute scp kasisougu-pwa.zip kasisougu-server:~/ --project=kasisougu --zone=us-west1-b
gcloud compute ssh kasisougu-server --project=kasisougu --zone=us-west1-b
```

4. SSH接続後、次を実行。インストール前に `install.sh` を読んで確認できます。

```bash
sudo apt-get install -y unzip
unzip -n kasisougu-pwa.zip
cd kasisougu
sudo bash install.sh
```

DBのパスワードと、新しいアプリ用パスワードを対話式で入力します。文字は表示されません。チャットには送らないでください。パスワードを間違えた場合は、エラーを確認して同じinstallコマンドを再実行できます。

設定は `/etc/kasisougu/config.json`（root所有・アプリグループのみ読取）、プログラムは `/opt/kasisougu` です。既存設定がある場合は再利用します。既存DBの内容を削除せず、専用テーブル `consultation_memo` を作ります。

## 外部公開の続き

インストール直後は **127.0.0.1:8000でのみ待受**。このままではスマートフォンからアクセスできません。
次に利用するドメインを決め、DNS、HTTPSリバースプロキシ、必要なWeb用ファイアウォールを設定します。DBの5432番ポートは公開しません。HTTPS用Cookieを有効にしてあるため、通常のHTTPアクセスではログインできません。設定を弱めずHTTPSを用意してください。

VMの外部IPは一時IPです。停止・起動で変わります。DNS設定前に現在値を確認し、必要に応じて固定します。ドメイン費用などは現在のVM費用に別途加わり得ます。

```bash
gcloud compute instances describe kasisougu-server --project=kasisougu --zone=us-west1-b --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

## 配置後の確認

```bash
sudo systemctl status kasisougu-web --no-pager
curl --fail http://127.0.0.1:8000/api/session
```

HTTPS公開後、ログイン→テスト文を保存→再読み込み→同じ内容の表示→ログアウトの順に確認します。スマートフォンでホーム画面追加も確認します。
既存の毎日バックアップはDB全体を対象とするので、このテーブルも次回から含まれます。実際の復元テストは未実施です。

## 保守

1ワーカー・2スレッドで稼働します。ログイン失敗を5分間で5回に制限します（単一プロセス内、再起動でリセット）。複数ワーカーに増やす場合は制限を共有化してください。Cookieは8時間有効、HttpOnly/SameSite=Strict/Secureを指定。更新APIはCSRFトークンを検証し、同時編集の上書きは409で停止します。

アプリは1人用で、同じパスワードを共有すると同じメモへアクセスします。公開前に独自ドメイン・HTTPS、実DB保存、バックアップからの復元を確認してください。複数患者の情報管理を想定したシステムではありません。

ログ確認：`sudo journalctl -u kasisougu-web -n 30 --no-pager`

装具の呼称の参考：[脳卒中の下肢装具 第3版・目次](https://webview.isho.jp/book/detail/abs/10.11477/9784260624886)。装具の選択や適合を判定する機能はありません。
