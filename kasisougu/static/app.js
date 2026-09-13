'use strict';
const $ = id => document.getElementById(id);
let csrf = '';
function setHomeStatus(text, error = false) {$('home-status').textContent = text; $('home-status').classList.toggle('error', error);}
function formatSavedAt(value) {return value ? new Date(value).toLocaleString('ja-JP') : 'まだ保存されていません';}
function setAuthenticatedView(authenticated) {$('login-page').hidden = authenticated; $('home-page').hidden = !authenticated; $('logout').hidden = !authenticated; $('header-status').textContent = authenticated ? 'ログイン中' : 'ログインが必要です';}
async function api(path, method = 'GET', data) {
  let response;
  try {response = await fetch('/api/' + path, {method, cache: 'no-store', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000)});} catch {throw new Error('通信できません。接続を確認して、もう一度お試しください。');}
  let result; try {result = await response.json();} catch {throw new Error('サーバーの応答を確認できません。時間をおいてお試しください。');}
  if (!response.ok) throw new Error(result.error || '処理できませんでした。もう一度お試しください。');
  return result;
}
function renderHome(memo, updatedAt) {
  $('saved-at').textContent = formatSavedAt(updatedAt);
  const content = memo || {concerns: [], wishes: '', questions: '', device: ''};
  $('orthosis-value').textContent = content.device || 'まだ登録されていません';
  $('orthosis-help').textContent = content.device ? '現在は試作版の相談メモから表示しています。装具の詳細な登録・編集は次の画面で追加します。' : '装具名が分からない場合も、次の画面で「不明」として登録できます。';
  const fragments = [];
  if (content.concerns.length) fragments.push(`困りごと：${content.concerns.join('、')}`);
  if (content.wishes) fragments.push(`希望：${content.wishes}`);
  if (content.questions) fragments.push(`聞きたいこと：${content.questions}`);
  $('record-summary').replaceChildren();
  if (!fragments.length) {$('record-summary').append(Object.assign(document.createElement('p'), {textContent: '保存された記録はありません。'})); return;}
  for (const text of fragments) $('record-summary').append(Object.assign(document.createElement('p'), {textContent: text}));
}
async function loadHome() {setHomeStatus('ホームを読み込んでいます。'); try {const memo = await api('memo'); renderHome(memo.content, memo.updated_at); setHomeStatus(memo.content ? '保存した内容を表示しています。' : 'まだ保存された内容はありません。');} catch (error) {setHomeStatus(error.message, true);}}
async function start() {try {const session = await api('session'); csrf = session.csrf; setAuthenticatedView(session.authenticated); if (session.authenticated) await loadHome();} catch (error) {$('auth-status').textContent = error.message;}}
$('login-form').addEventListener('submit', async event => {event.preventDefault(); const button = event.submitter; button.disabled = true; $('auth-status').textContent = 'ログインしています…'; try {if (!csrf) csrf = (await api('session')).csrf; const result = await api('login', 'POST', {password: $('password').value}); csrf = result.csrf; $('password').value = ''; setAuthenticatedView(true); await loadHome();} catch (error) {$('auth-status').textContent = error.message;} finally {button.disabled = false;}});
$('logout').addEventListener('click', async () => {try {await api('logout', 'POST', {}); const session = await api('session'); csrf = session.csrf; setAuthenticatedView(false); $('auth-status').textContent = 'ログアウトしました。'; $('password').focus();} catch (error) {setHomeStatus(error.message, true);}});
document.querySelectorAll('.future-link').forEach(button => button.addEventListener('click', () => setHomeStatus(`${button.dataset.feature}は、次の画面実装で追加します。`)));
let installPrompt; window.addEventListener('beforeinstallprompt', event => {event.preventDefault(); installPrompt = event; $('install').hidden = false;}); $('install').addEventListener('click', async () => {if (!installPrompt) return; await installPrompt.prompt(); installPrompt = null; $('install').hidden = true;});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); start();
