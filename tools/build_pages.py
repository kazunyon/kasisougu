"""Build the static GitHub Pages shell that uses Supabase Auth and Data API."""
import json
import os
import shutil
from pathlib import Path
from urllib.parse import urlparse

root = Path(__file__).resolve().parents[1]
source = root / 'kasisougu' / 'static'
target = root / 'dist' / 'pages'
api_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
publishable_key = os.environ.get('SUPABASE_PUBLISHABLE_KEY', '')
parsed = urlparse(api_url)
if parsed.scheme != 'https' or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
    raise SystemExit('SUPABASE_URL must be an HTTPS origin')
if not publishable_key.startswith('sb_publishable_'):
    raise SystemExit('SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key')

shutil.copytree(source, target, dirs_exist_ok=True)
index = (target / 'index.html').read_text(encoding='utf-8')
index = index.replace('href="/static/', 'href="./').replace('src="/static/', 'src="./')
index = index.replace('href="/"', 'href="./"')
index = index.replace('<script defer src="./app.js"></script>', '<script src="./pages-config.js"></script><script defer src="./app.js"></script>')
(target / 'index.html').write_text(index, encoding='utf-8')
(target / 'pages-config.js').write_text('window.KASISOUGU_SUPABASE_CONFIG = ' + json.dumps({'url': api_url, 'publishableKey': publishable_key}) + ';\n', encoding='utf-8')

manifest = json.loads((target / 'manifest.webmanifest').read_text(encoding='utf-8'))
manifest['id'] = './'
manifest['start_url'] = './'
manifest['scope'] = './'
for icon in manifest['icons']:
    icon['src'] = './' + Path(icon['src']).name
(target / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')

(target / 'sw.js').write_text('''const CACHE = 'kasisougu-pages-shell-v14';
const FILES = ['./', './index.html', './style.css', './s03-s04.css', './f04-f05.css', './redesign.css', './pages-config.js', './app.js', './catalog.js', './records.js', './consultation.js', './manifest.webmanifest', './brand-mark.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kasisougu-pages-shell-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !FILES.some(file => new URL(file, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const clone = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, clone))); }
    return response;
  }).catch(() => caches.match(event.request)));
});
''', encoding='utf-8')
(target / '.nojekyll').touch()
print(target)
