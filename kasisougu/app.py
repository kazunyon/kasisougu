"""Single-owner consultation notebook. PostgreSQL only; no production demo mode."""
import hmac
import json
import os
import secrets
import threading
import time
from datetime import timedelta
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb
from flask import Flask, jsonify, request, session
from werkzeug.security import check_password_hash

ROOT = Path(__file__).parent
CHOICES = ['歩きにくい', 'つまずく', '痛みがある', '装具が重い', '着けにくい', 'その他']

def create_app(config=None):
    if config is None:
        config = json.loads(Path(os.environ.get('KASISOUGU_CONFIG', '/etc/kasisougu/config.json')).read_text())
    app = Flask(__name__, static_url_path='/static')
    app.config.update(SECRET_KEY=config['secret_key'], MAX_CONTENT_LENGTH=16384,
                      SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Strict',
                      SESSION_COOKIE_SECURE=config.get('secure_cookie', True),
                      PERMANENT_SESSION_LIFETIME=timedelta(hours=8))
    failures = []
    lock = threading.Lock()

    def db():
        return psycopg.connect(**config['database'], connect_timeout=5)

    @app.cli.command('init-db')
    def init_db():
        with db() as conn:
            conn.execute('''CREATE TABLE IF NOT EXISTS consultation_memo (
                id integer PRIMARY KEY CHECK (id = 1),
                content jsonb NOT NULL,
                revision integer NOT NULL DEFAULT 1,
                updated_at timestamptz NOT NULL DEFAULT now())''')
        print('Database ready')

    @app.before_request
    def protect():
        if not request.path.startswith('/api/'):
            return
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            token = request.headers.get('X-CSRF-Token', '')
            expected = session.get('csrf', '')
            if not expected or not hmac.compare_digest(token.encode(), expected.encode()):
                return jsonify(error='画面を開き直して、もう一度お試しください。'), 403
        if request.path not in ('/api/session', '/api/login') and not session.get('owner'):
            return jsonify(error='保存するにはログインしてください。'), 401

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        response.headers['Cache-Control'] = 'no-store' if request.path.startswith('/api/') else 'no-cache'
        return response

    @app.errorhandler(psycopg.Error)
    def db_error(_error):
        # No exception content: connection errors may contain private configuration.
        app.logger.error('Database operation failed')
        return jsonify(error='データベースに接続できません。入力を残したまま、後でもう一度保存してください。'), 503

    @app.get('/')
    def index():
        return app.send_static_file('index.html')

    @app.get('/sw.js')
    def worker():
        return app.send_static_file('sw.js')

    @app.get('/api/session')
    def session_info():
        if 'csrf' not in session:
            session['csrf'] = secrets.token_urlsafe(32)
        return jsonify(authenticated=bool(session.get('owner')), csrf=session['csrf'])

    @app.post('/api/login')
    def login():
        data = request.get_json(silent=True)
        password = data.get('password') if isinstance(data, dict) else None
        if not isinstance(password, str) or len(password) > 1024:
            return jsonify(error='パスワードを入力してください。'), 400
        with lock:
            now = time.monotonic()
            failures[:] = [v for v in failures if now - v < 300]
            if len(failures) >= 5:
                return jsonify(error='しばらく待ってから、もう一度お試しください（最大5分）。'), 429
            if not check_password_hash(config['password_hash'], password):
                failures.append(now)
                return jsonify(error='パスワードを確認してください。'), 401
            failures.clear()
        session.clear()
        session.update(owner=True, csrf=secrets.token_urlsafe(32))
        session.permanent = True
        return jsonify(authenticated=True, csrf=session['csrf'])

    @app.post('/api/logout')
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.get('/api/memo')
    def get_memo():
        with db() as conn:
            row = conn.execute('SELECT content, revision, updated_at FROM consultation_memo WHERE id=1').fetchone()
        return jsonify(content=row[0] if row else None, revision=row[1] if row else 0,
                       updated_at=row[2].isoformat() if row else None)

    @app.put('/api/memo')
    def put_memo():
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or type(data.get('revision')) is not int or data['revision'] < 0:
            return jsonify(error='入力内容を確認してください。'), 400
        content = data.get('content')
        if not isinstance(content, dict) or set(content) != {'concerns', 'wishes', 'questions', 'device'}:
            return jsonify(error='入力内容を確認してください。'), 400
        concerns = content['concerns']
        if (not isinstance(concerns, list) or len(concerns) > len(CHOICES)
            or any(not isinstance(x, str) or x not in CHOICES for x in concerns)
            or any(not isinstance(content[k], str) or len(content[k]) > 2000 for k in ('wishes', 'questions', 'device'))):
            return jsonify(error='入力内容が長すぎるか、形式が違います。'), 400
        with db() as conn:
            # Serialize the single-owner notebook, including first-save races.
            conn.execute('SELECT pg_advisory_xact_lock(7081601)')
            row = conn.execute('SELECT revision FROM consultation_memo WHERE id=1').fetchone()
            if (row[0] if row else 0) != data['revision']:
                return jsonify(error='別の画面で更新されています。入力を印刷などで控えてから、画面を開き直してください。'), 409
            saved = conn.execute('''INSERT INTO consultation_memo (id, content) VALUES (1, %s)
                ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content,
                revision=consultation_memo.revision+1, updated_at=now()
                RETURNING revision, updated_at''', (Jsonb(content),)).fetchone()
        return jsonify(revision=saved[0], updated_at=saved[1].isoformat())

    return app
