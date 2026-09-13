#!/bin/bash
# Execute on kasisougu-server, not in Cloud Shell.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo 'sudo bash install.sh で実行してください。'; exit 1
fi
if [ "$(hostname -s)" != 'kasisougu-server' ]; then
  echo 'この手順は kasisougu-server 専用です。SSH接続後に実行してください。'; exit 1
fi
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
apt-get update
apt-get install -y python3-venv
if ! id kasisougu-web >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /opt/kasisougu --shell /usr/sbin/nologin kasisougu-web
fi
install -d -m 755 /opt/kasisougu /opt/kasisougu/static
install -d -m 750 -o root -g kasisougu-web /etc/kasisougu
install -m 644 app.py requirements.txt configure.py /opt/kasisougu/
install -m 644 static/* /opt/kasisougu/static/
python3 -m venv /opt/kasisougu/venv
/opt/kasisougu/venv/bin/pip install -r /opt/kasisougu/requirements.txt
/opt/kasisougu/venv/bin/python /opt/kasisougu/configure.py
cd /opt/kasisougu
runuser -u kasisougu-web -- /opt/kasisougu/venv/bin/flask --app app:create_app init-db
cat > /etc/systemd/system/kasisougu-web.service <<'UNIT'
[Unit]
Description=Kasisougu consultation notebook
After=network.target postgresql.service
Requires=postgresql.service
[Service]
User=kasisougu-web
Group=kasisougu-web
WorkingDirectory=/opt/kasisougu
Environment=KASISOUGU_CONFIG=/etc/kasisougu/config.json
ExecStart=/opt/kasisougu/venv/bin/gunicorn --bind 127.0.0.1:8000 --workers 1 --threads 2 --timeout 30 app:create_app()
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
MemoryMax=300M
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now kasisougu-web
systemctl restart kasisougu-web
systemctl is-active kasisougu-web
echo 'アプリを配置しました。外部公開・HTTPSの設定は次の手順です。'
