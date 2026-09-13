"""Run once on the target VM as root. Secrets are entered interactively."""
import getpass
import grp
import json
import os
import secrets
from pathlib import Path
import psycopg
from werkzeug.security import generate_password_hash

path = Path('/etc/kasisougu/config.json')
if path.exists():
    print('既存の設定を使用します。パスワードは変更しません。')
    raise SystemExit(0)
database = dict(host='127.0.0.1', port=5432, dbname='kasisougu', user='kasisougu_app')
database['password'] = getpass.getpass('先ほど作ったDBのパスワード：')
try:
    with psycopg.connect(**database, connect_timeout=5) as conn:
        conn.execute('SELECT 1')
except psycopg.Error:
    raise SystemExit('DBに接続できませんでした。パスワードとDBの起動状態を確認してください。')
password = getpass.getpass('相談ノート専用の新しいパスワード（12文字以上）：')
if len(password) < 12 or len(password) > 1024:
    raise SystemExit('パスワードは12〜1024文字にしてください。')
if password != getpass.getpass('同じパスワードをもう一度：'):
    raise SystemExit('一致しませんでした。もう一度実行してください。')
config = dict(secret_key=secrets.token_urlsafe(48), password_hash=generate_password_hash(password),
              secure_cookie=True, database=database)
os.umask(0o077)
path.write_text(json.dumps(config), encoding='utf-8')
os.chown(path, 0, grp.getgrnam('kasisougu-web').gr_gid)
path.chmod(0o640)
print('設定を保存しました。パスワードはチャットに送らず、手元に保管してください。')
