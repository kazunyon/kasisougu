'use strict';
const $ = id => document.getElementById(id);
let csrf = '', orthosisRevision = 0, catalogItems = [];

function message(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function formatSavedAt(value) { return value ? new Date(value).toLocaleString('ja-JP') : 'まだ保存されていません'; }
function setAuthenticatedView(authenticated) {
  $('login-page').hidden = authenticated; $('home-page').hidden = !authenticated;
  $('logout').hidden = !authenticated; $('header-status').textContent = authenticated ? 'ログイン中' : 'ログインが必要です';
}
async function api(path, method = 'GET', data) {
  let response;
  try { response = await fetch('/api/' + path, {method, cache: 'no-store', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000)}); }
  catch { throw new Error('通信できません。接続を確認して、もう一度お試しください。'); }
  let result; try { result = await response.json(); } catch { throw new Error('サーバーの応答を確認できません。時間をおいてお試しください。'); }
  if (!response.ok) throw new Error(result.error || '処理できませんでした。もう一度お試しください。');
  return result;
}
function setScreen(name) {
  for (const page of document.querySelectorAll('.app-page')) page.hidden = true;
  $('home-page').hidden = name !== 'home';
  if (name === 'orthosis') $('orthosis-page').hidden = false;
  if (name === 'catalog') $('catalog-page').hidden = false;
  document.querySelectorAll('.primary-nav .screen-link').forEach(button => {
    const active = button.dataset.screen === name || (name === 'orthosis' && button.dataset.screen === 'home');
    button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  document.querySelector('main').scrollIntoView({block: 'start'});
}
function renderHome(memo, updatedAt, orthosis) {
  $('saved-at').textContent = formatSavedAt(updatedAt);
  const content = memo || {concerns: [], wishes: '', questions: '', device: ''};
  const name = orthosis?.name || content.device;
  $('orthosis-value').textContent = name || 'まだ登録されていません';
  $('orthosis-help').textContent = name ? '登録内容は「登録・編集」から確認・変更できます。' : '装具名が分からない場合も、次の画面で「不明」として登録できます。';
  const fragments = [];
  if (content.concerns.length) fragments.push(`困りごと：${content.concerns.join('、')}`);
  if (content.wishes) fragments.push(`希望：${content.wishes}`);
  if (content.questions) fragments.push(`聞きたいこと：${content.questions}`);
  $('record-summary').replaceChildren();
  for (const text of fragments.length ? fragments : ['保存された記録はありません。']) $('record-summary').append(Object.assign(document.createElement('p'), {textContent: text}));
}
async function loadHome() {
  message('home-status', 'ホームを読み込んでいます。');
  try { const [memo, orthosis] = await Promise.all([api('memo'), api('orthosis')]); renderHome(memo.content, memo.updated_at, orthosis.orthosis); message('home-status', memo.content || orthosis.orthosis ? '保存した内容を表示しています。' : 'まだ保存された内容はありません。'); }
  catch (error) { message('home-status', error.message, true); }
}
function populateOrthosis(item, revision) {
  const data = item || {name: '', side: 'unknown', orthosis_type: 'unknown', manufactured_date: '', manufactured_year: '', maker: ''};
  $('orthosis-name').value = data.name || ''; $('orthosis-side').value = data.side || 'unknown'; $('orthosis-type').value = data.orthosis_type || 'unknown';
  $('manufactured-date').value = data.manufactured_date || ''; $('manufactured-year').value = data.manufactured_year || ''; $('orthosis-maker').value = data.maker || '';
  orthosisRevision = revision;
}
async function loadOrthosis() {
  message('orthosis-status', '登録内容を読み込んでいます。');
  try { const result = await api('orthosis'); populateOrthosis(result.orthosis, result.revision); message('orthosis-status', result.orthosis ? '登録内容を表示しています。' : 'まだ登録されていません。'); }
  catch (error) { message('orthosis-status', error.message, true); }
}
function renderCatalog(filter = 'all') {
  const items = catalogItems.filter(item => filter === 'all' || item.type === filter);
  $('catalog-list').replaceChildren();
  if (!items.length) { $('catalog-list').append(Object.assign(document.createElement('p'), {className: 'empty-state', textContent: '公開済みの記事はありません。専門職レビュー後に、出典と確認日を付けて掲載します。'})); return; }
  for (const item of items) {
    const card = document.createElement('article'); card.className = 'catalog-card';
    card.innerHTML = `<p>${item.category}</p><h2>${item.name}</h2><dl><div><dt>素材</dt><dd>${item.material || '未確認'}</dd></div><div><dt>継手</dt><dd>${item.joint || '未確認'}</dd></div><div><dt>足元の構造</dt><dd>${item.foot || '未確認'}</dd></div></dl><footer>出典：${item.source}　確認日：${item.confirmed_at}</footer>`;
    $('catalog-list').append(card);
  }
}
async function loadCatalog() {
  message('catalog-status', '図鑑を読み込んでいます。');
  try { catalogItems = (await api('catalog')).items; renderCatalog(); message('catalog-status', catalogItems.length ? '公開済みの記事を表示しています。' : '公開済みの記事はありません。'); }
  catch (error) { message('catalog-status', error.message, true); }
}
async function start() {
  try { const session = await api('session'); csrf = session.csrf; setAuthenticatedView(session.authenticated); if (session.authenticated) await Promise.all([loadHome(), loadOrthosis(), loadCatalog()]); }
  catch (error) { message('auth-status', error.message, true); }
}
$('login-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; message('auth-status', 'ログインしています…'); try { if (!csrf) csrf = (await api('session')).csrf; const result = await api('login', 'POST', {password: $('password').value}); csrf = result.csrf; $('password').value = ''; setAuthenticatedView(true); await Promise.all([loadHome(), loadOrthosis(), loadCatalog()]); } catch (error) { message('auth-status', error.message, true); } finally { button.disabled = false; } });
$('logout').addEventListener('click', async () => { try { await api('logout', 'POST', {}); csrf = (await api('session')).csrf; setAuthenticatedView(false); message('auth-status', 'ログアウトしました。'); $('password').focus(); } catch (error) { message('home-status', error.message, true); } });
$('orthosis-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; const year = $('manufactured-year').value; button.disabled = true; message('orthosis-status', '装具情報を保存しています。'); try { const result = await api('orthosis', 'PUT', {name: $('orthosis-name').value, side: $('orthosis-side').value, orthosis_type: $('orthosis-type').value, manufactured_date: $('manufactured-date').value || null, manufactured_year: year ? Number(year) : null, maker: $('orthosis-maker').value, revision: orthosisRevision}); orthosisRevision = result.revision; message('orthosis-status', '装具情報を保存しました。'); await loadHome(); } catch (error) { message('orthosis-status', error.message, true); } finally { button.disabled = false; } });
$('orthosis-photo').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return message('photo-status', ''); const allowed = ['image/jpeg', 'image/png', 'image/webp']; message('photo-status', allowed.includes(file.type) && file.size <= 10 * 1024 * 1024 ? `${file.name} を確認しました。この試作版では保存しません。` : 'JPEG・PNG・WebPの10MB以下の写真を選んでください。', !(allowed.includes(file.type) && file.size <= 10 * 1024 * 1024)); });
document.querySelectorAll('.screen-link').forEach(button => button.addEventListener('click', async () => { const screen = button.dataset.screen; setScreen(screen); if (screen === 'orthosis') await loadOrthosis(); if (screen === 'catalog') await loadCatalog(); }));
document.querySelectorAll('.future-link').forEach(button => button.addEventListener('click', () => message('home-status', `${button.dataset.feature}は、次の画面実装で追加します。`)));
document.querySelectorAll('.catalog-filter-button').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.catalog-filter-button').forEach(item => item.classList.toggle('active', item === button)); renderCatalog(button.dataset.filter); }));
let installPrompt; window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install').hidden = false; }); $('install').addEventListener('click', async () => { if (!installPrompt) return; await installPrompt.prompt(); installPrompt = null; $('install').hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); start();
