'use strict';
const $ = id => document.getElementById(id);
let csrf = '', authenticated = false, revision = 0, dirty = false, loaded = false;
let editVersion = 0;
const message = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };
function content() {
  return { concerns: [...document.querySelectorAll('[name=concerns]:checked')].map(x => x.value),
    wishes: $('wishes').value, questions: $('questions').value, device: $('device').value };
}
function populate(data) {
  const value = data || { concerns: [], wishes: '', questions: '', device: '' };
  document.querySelectorAll('[name=concerns]').forEach(x => { x.checked = value.concerns.includes(x.value); });
  for (const key of ['wishes', 'questions', 'device']) $(key).value = value[key];
}
function savedAt(value) { $('saved-at').textContent = value ? new Date(value).toLocaleString('ja-JP') : 'まだ保存していません'; }
function authView() { $('login-area').hidden = authenticated; $('signed-in').hidden = !authenticated; }
async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch('/api/' + path, { method, cache: 'no-store', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  } catch { throw new Error('通信できません。入力はこの画面に残っています。接続後にもう一度お試しください。'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('サーバーの応答を確認できません。時間をおいてお試しください。'); }
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') { authenticated = false; loaded = false; authView(); }
    throw new Error(result.error || '処理できませんでした。もう一度お試しください。');
  }
  return result;
}
async function loadMemo() {
  const versionAtStart = editVersion;
  const result = await api('memo');
  revision = result.revision;
  loaded = true;
  savedAt(result.updated_at);
  if (!dirty && editVersion === versionAtStart) {
    populate(result.content);
    message(result.content ? '保存したメモを読み込みました。' : '困りごとや希望を書いてみましょう。');
  } else {
    // Keep in-progress text and require an explicit save to replace a stored memo.
    message('入力中の内容を残しました。「メモを保存」でサーバーのメモを更新します。');
  }
}
async function start() {
  try {
    const result = await api('session'); csrf = result.csrf; authenticated = result.authenticated; authView();
    if (authenticated) await loadMemo();
    else $('saved-at').textContent = 'ログイン後に表示';
  } catch (error) { message(error.message, true); }
}
$('memo-form').addEventListener('input', () => { dirty = true; editVersion++; message('変更があります。まだ保存していません。'); });
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true; $('auth-status').textContent = 'ログインしています…';
  try {
    if (!csrf) { const initial = await api('session'); csrf = initial.csrf; }
    const result = await api('login', 'POST', { password: $('password').value });
    $('password').value = ''; csrf = result.csrf; authenticated = true; authView();
    $('auth-status').textContent = 'ログインしました。'; await loadMemo();
  } catch (error) { $('auth-status').textContent = error.message; }
  finally { button.disabled = false; }
});
$('memo-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!authenticated) { message('右側（スマートフォンでは下）のパスワード欄からログインしてください。'); $('password').focus(); return; }
  if (!loaded) { message('保存済みメモをまだ読み込めていません。再度ログインしてから保存してください。', true); return; }
  const versionAtStart = editVersion; $('save').disabled = true; message('保存しています…');
  try {
    const result = await api('memo', 'PUT', { content: content(), revision });
    revision = result.revision; savedAt(result.updated_at);
    dirty = editVersion !== versionAtStart;
    message(dirty ? '送信した内容は保存しました。その後の変更は未保存です。' : 'メモを保存しました。');
  } catch (error) { message(error.message, true); }
  finally { $('save').disabled = false; }
});
$('logout').addEventListener('click', async () => {
  if (dirty && !confirm('保存していない内容があります。入力を消してログアウトしますか？')) return;
  try {
    await api('logout', 'POST', {}); authenticated = false; loaded = false; dirty = false; revision = 0;
    populate(null); $('printout').replaceChildren(); $('saved-at').textContent = 'ログイン後に表示'; authView();
    $('auth-status').textContent = 'ログアウトしました。'; message('保存するにはログインしてください。');
    const result = await api('session'); csrf = result.csrf;
  } catch (error) { message(error.message, true); }
});
function showPage(guide) {
  $('memo-page').hidden = guide; $('guide-page').hidden = !guide;
  $('memo-tab').setAttribute('aria-pressed', String(!guide)); $('guide-tab').setAttribute('aria-pressed', String(guide));
}
$('memo-tab').addEventListener('click', () => showPage(false));
$('guide-tab').addEventListener('click', () => showPage(true));
$('back-memo').addEventListener('click', () => { showPage(false); $('memo-tab').focus(); });
function buildPrint() {
  const out = $('printout'); out.replaceChildren(); const h = document.createElement('h1'); h.textContent = '装具についての相談メモ'; out.append(h);
  const date = document.createElement('p'); date.textContent = '作成日：' + new Date().toLocaleDateString('ja-JP') + (dirty ? '（画面の入力内容・未保存の変更を含む）' : ''); out.append(date);
  const data = content();
  for (const [title, value] of [['困っていること', data.concerns.join('、')], ['希望すること', data.wishes], ['使っている装具', data.device], ['聞きたいこと', data.questions]]) {
    const section = document.createElement('section'), heading = document.createElement('h2'), p = document.createElement('p');
    heading.textContent = title; p.textContent = value || '記入なし'; section.append(heading, p); out.append(section);
  }
}
$('print').addEventListener('click', () => { buildPrint(); window.print(); });
window.addEventListener('beforeprint', buildPrint);
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('offline', () => message('オフラインです。保存にはインターネット接続が必要です。この画面を閉じると未保存の内容は消えます。', true));
window.addEventListener('online', () => message('接続が戻りました。未保存の内容は、保存ボタンを押してください。'));
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install').hidden = false; });
$('install').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('install').hidden = true; } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* Core online functionality remains available. */ });
start();
