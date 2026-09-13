import json
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from werkzeug.security import generate_password_hash

CONFIG = {'secret_key':'unit-test-only-not-for-deployment',
          'password_hash':generate_password_hash('local-test-password'),
          'secure_cookie':False, 'database':{'dbname':'not-used-by-unit-tests'}}

class MemoryDB:
    def __init__(self):
        self.content = None; self.revision = 0; self.row = None
        self.orthosis = None; self.orthosis_revision = 0
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def execute(self, sql, args=None):
        if sql.startswith('SELECT content'):
            self.row = (self.content, self.revision, datetime.now(timezone.utc)) if self.content else None
        elif sql.startswith('SELECT name, side'):
            self.row = (*self.orthosis, self.orthosis_revision, datetime.now(timezone.utc)) if self.orthosis else None
        elif sql.startswith('SELECT revision FROM current_orthosis'):
            self.row = (self.orthosis_revision,) if self.orthosis else None
        elif sql.startswith('SELECT revision'):
            self.row = (self.revision,) if self.revision else None
        elif sql.startswith('INSERT INTO current_orthosis'):
            self.orthosis = (*args[:3], date.fromisoformat(args[3]) if args[3] else None, *args[4:])
            self.orthosis_revision += 1
            self.row = (self.orthosis_revision, datetime.now(timezone.utc))
        elif sql.startswith('INSERT'):
            self.content = args[0].obj; self.revision += 1
            self.row = (self.revision, datetime.now(timezone.utc))
        return self
    def fetchone(self): return self.row

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CONFIG); self.client = self.app.test_client()
        self.csrf = self.client.get('/api/session').json['csrf']
        self.db = MemoryDB()
        self.mock = patch('app.psycopg.connect', return_value=self.db); self.mock.start()
    def tearDown(self): self.mock.stop()
    def login(self):
        r = self.client.post('/api/login', json={'password':'local-test-password'}, headers={'X-CSRF-Token':self.csrf})
        self.assertEqual(r.status_code,200); self.csrf = r.json['csrf']
    def test_authentication_and_csrf(self):
        self.assertEqual(self.client.get('/api/memo').status_code,401)
        self.assertEqual(self.client.post('/api/login', json={'password':'x'}).status_code,403)
        self.login()
        self.assertEqual(self.client.put('/api/memo',json={}).status_code,403)
    def test_save_reload_conflict_and_logout(self):
        self.login(); headers={'X-CSRF-Token':self.csrf}
        content={'concerns':['歩きにくい'],'wishes':'動作確認','questions':'','device':''}
        r=self.client.put('/api/memo',json={'content':content,'revision':0},headers=headers)
        self.assertEqual(r.status_code,200); self.assertEqual(r.json['revision'],1)
        read=self.client.get('/api/memo'); self.assertEqual(read.json['content'],content)
        self.assertEqual(read.headers['Cache-Control'],'no-store')
        self.assertEqual(self.client.put('/api/memo',json={'content':content,'revision':0},headers=headers).status_code,409)
        self.assertEqual(self.client.post('/api/logout',json={},headers=headers).status_code,200)
        self.assertEqual(self.client.get('/api/memo').status_code,401)
    def test_invalid_input_and_limiter(self):
        self.login(); headers={'X-CSRF-Token':self.csrf}
        self.assertEqual(self.client.put('/api/memo',json={'revision':0,'content':{}},headers=headers).status_code,400)
        self.client.post('/api/logout',json={},headers=headers)
        csrf=self.client.get('/api/session').json['csrf']
        for _ in range(5): self.assertEqual(self.client.post('/api/login',json={'password':'wrong'},headers={'X-CSRF-Token':csrf}).status_code,401)
        self.assertEqual(self.client.post('/api/login',json={'password':'wrong'},headers={'X-CSRF-Token':csrf}).status_code,429)

    def test_orthosis_save_reload_and_conflict(self):
        self.login(); headers={'X-CSRF-Token':self.csrf}
        item={'name':'短下肢装具','side':'left','orthosis_type':'afo',
              'manufactured_date':'2025-01-01','manufactured_year':None,'maker':'テスト製作所','revision':0}
        saved=self.client.put('/api/orthosis',json=item,headers=headers)
        self.assertEqual(saved.status_code,200); self.assertEqual(saved.json['revision'],1)
        read=self.client.get('/api/orthosis').json
        self.assertEqual(read['orthosis']['name'],'短下肢装具')
        self.assertEqual(read['orthosis']['side'],'left')
        self.assertEqual(self.client.put('/api/orthosis',json=item,headers=headers).status_code,409)
        invalid={**item, 'revision':1, 'orthosis_type':'invalid'}
        self.assertEqual(self.client.put('/api/orthosis',json=invalid,headers=headers).status_code,400)

if __name__=='__main__': unittest.main()
