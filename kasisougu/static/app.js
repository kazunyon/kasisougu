'use strict';
const $ = id => document.getElementById(id);
const config = window.KASISOUGU_SUPABASE_CONFIG || {};
let token = '', userId = '', orthosis = null, orthoses = [], editingOrthosis = null;
let needs = [], editingNeed = null, needOrthosisId = '', photos = [], photoUrls = [], photoRenderId = 0;
let profile = null, profileLoaded = false;
let personalLinks = [], editingPersonalLink = null, personalLinksLoaded = false;
function message(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function apiHeaders(extra = {}) { return {apikey: config.publishableKey, ...(token ? {Authorization: `Bearer ${token}`} : {}), ...extra}; }
function setAuthenticatedView(ok) {
  document.body.classList.toggle('is-authenticated', ok);
  $('app-navigation').hidden = !ok;
  $('app-toolbar').hidden = !ok;
  document.querySelectorAll('.app-page').forEach(p => p.hidden = true);
  $('login-page').hidden = ok; $('home-page').hidden = !ok; $('logout').hidden = !ok;
  $('header-status').textContent = ok ? 'ログイン中' : 'ログインが必要です';
  if (ok) setScreen('home');
  else { currentScreen = 'home'; screenLoads.clear(); document.title = '下肢装具サポート'; }
}
function assertConfig() { if (!config.url || !config.publishableKey) throw new Error('公開設定を確認してください。'); }
async function request(path, options = {}) { const {headers: extraHeaders = {}, ...rest} = options; assertConfig(); const response = await fetch(`${config.url}${path}`, {...rest, headers: apiHeaders(extraHeaders)}); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || body.msg || '処理できませんでした。'); } const body = await response.text(); return body ? JSON.parse(body) : null; }
async function select(table, query) { return request(`/rest/v1/${table}?${query}`, {headers: {Accept: 'application/json'}}); }
function profileDisplayName() { return profile?.display_name || ''; }
function applyTextScale(value) {
  const scale = Number(value);
  const safe = Number.isInteger(scale) && scale >= 100 && scale <= 200 ? scale : 100;
  document.documentElement.style.fontSize = `${18 * safe / 100}px`;
  $('text-scale').value = String(safe);
  $('text-scale-value').textContent = `${safe}%`;
}
function showProfile(row) {
  profile = row;
  $('profile-display-name').value = row?.display_name || '';
  applyTextScale(row?.text_scale ?? 100);
  $('device-storage').checked = row?.device_storage_enabled ?? false;
  $('profile-fields').disabled = false;
  $('profile-save').disabled = false;
  profileLoaded = true;
}
async function loadProfile() {
  const currentUser = userId, currentToken = token;
  profileLoaded = false;
  $('profile-fields').disabled = true;
  $('profile-save').disabled = true;
  message('profile-status', '本人設定を読み込み中…');
  try {
    const rows = await select('kasi_profiles', `select=user_id,display_name,text_scale,device_storage_enabled,row_version,deleted_at&user_id=eq.${currentUser}&limit=1`);
    if (currentUser !== userId || currentToken !== token) return;
    if (rows[0]?.deleted_at) throw new Error('本人設定を利用できません。管理者に確認してください。');
    showProfile(rows[0] || null);
    message('profile-status', rows.length ? '保存済みの本人設定を表示しています。' : '本人設定は未登録です。入力して保存してください。');
  } catch (error) {
    if (currentUser === userId && currentToken === token) message('profile-status', `本人設定を読み込めませんでした：${error.message}`, true);
  }
}
const ownershipLabels = {owned: '現在使用中', trial: '試用中', past: '過去に使用'};
const categoryLabels = {heavy: '重さ', hard_to_put_on: '着脱', hard_to_wear_shoes: '靴の履きやすさ', pain_or_pressure: '痛み・圧迫', fatigue: '疲労', stability: '安定性', mobility: '移動', daily_activity: '日常生活', other: 'その他'};
function node(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
async function loadOrthoses() {
  orthoses = await select('kasi_user_orthoses', 'select=id,nickname,side_code,orthosis_type_code,ownership_status,manufactured_on,manufactured_year,manufacturer_name,price_yen,funding_system_code,self_payment_rate,row_version&deleted_at=is.null&order=updated_at.desc');
  orthosis = orthoses.find(item => item.id === orthosis?.id) || orthoses.find(item => item.ownership_status === 'owned') || orthoses[0] || null;
  renderOrthosisList(); renderHome();
}
const orthosisSteps = [
  ['past', 'これまで使用した装具'],
  ['owned', 'いま使用している装具'],
  ['trial', 'これから試す装具']
];
function createOrthosisFlow(compact = false) {
  const flow = node('div', '', 'orthosis-flow');
  if (compact) flow.classList.add('orthosis-flow-compact');
  orthosisSteps.forEach(([status, description], index) => {
    const group = node('section', '', 'orthosis-group');
    group.classList.add(`orthosis-step-${status}`);
    const heading = node('div', '', 'orthosis-step-heading');
    heading.append(node('span', String(index + 1), 'orthosis-step-number'), node('h3', ownershipLabels[status]), node('p', description));
    group.append(heading);
    const items = orthoses.filter(item => item.ownership_status === status);
    if (!items.length) group.append(node('p', '登録はありません。', 'empty-state'));
    items.forEach(item => {
      const card = node('article', '', 'orthosis-card');
      card.append(node('h4', item.nickname), node('p', `${item.manufactured_on || (item.manufactured_year ? `${item.manufactured_year}年作製` : '作製日未記入')}`));
      if (!compact) { const detail = node('button', '詳細を見る'); detail.type = 'button'; detail.addEventListener('click', () => openOrthosis(item.id)); card.append(detail); }
      group.append(card);
    });
    flow.append(group);
    if (index < orthosisSteps.length - 1) {
      const arrow = node('div', '', 'orthosis-flow-arrow');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = '<svg viewBox="0 0 48 24" focusable="false"><path d="M3 12h35m-10-7 10 7-10 7"/></svg>';
      flow.append(arrow);
    }
  });
  return flow;
}
function externalLinkNode(url, label = 'リンクを開く') {
  const link = document.createElement('a'); link.className = 'resource-link'; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.append(label, node('span', '（新しいタブで開く）'));
  return link;
}
function resetPersonalLinkForm() {
  editingPersonalLink = null; $('personal-link-form').reset(); $('personal-link-form').hidden = true;
  $('personal-link-form-title').textContent = 'リンクを追加'; message('personal-link-form-status', '');
}
function showPersonalLinkForm(item = null) {
  editingPersonalLink = item; $('personal-link-form').hidden = false;
  $('personal-link-form-title').textContent = item ? 'リンクを編集' : 'リンクを追加';
  $('personal-link-title').value = item?.title || ''; $('personal-link-url').value = item?.url || ''; $('personal-link-note').value = item?.note || '';
  message('personal-link-form-status', ''); $('personal-link-title').focus();
}
function renderPersonalLinks() {
  const list = $('personal-links-list'); list.replaceChildren();
  if (!personalLinks.length) { list.append(node('p', 'まだ自分用リンクはありません。「リンクを追加」から保存できます。', 'personal-links-empty')); return; }
  personalLinks.forEach(item => {
    const card = node('article', '', 'personal-link-card'); card.append(node('h3', item.title));
    if (item.note) card.append(node('p', item.note));
    card.append(externalLinkNode(item.url));
    const actions = node('div', '', 'personal-link-actions');
    const edit = node('button', '編集する'); edit.type = 'button'; edit.addEventListener('click', () => showPersonalLinkForm(item));
    const remove = node('button', '削除する'); remove.type = 'button'; remove.addEventListener('click', () => deletePersonalLink(item));
    actions.append(edit, remove); card.append(actions); list.append(card);
  });
}
async function loadPersonalLinks() {
  const currentUser = userId, currentToken = token; personalLinksLoaded = false; message('personal-links-status', '自分用リンクを読み込み中…');
  try {
    const rows = await select('kasi_personal_links', `select=id,title,url,note,row_version&owner_id=eq.${currentUser}&deleted_at=is.null&order=updated_at.desc`);
    if (currentUser !== userId || currentToken !== token) return;
    personalLinks = rows; personalLinksLoaded = true; renderPersonalLinks(); message('personal-links-status', rows.length ? `${rows.length}件の自分用リンクを表示しています。` : '');
  } catch (error) { if (currentUser === userId && currentToken === token) message('personal-links-status', `自分用リンクを読み込めませんでした：${error.message}`, true); }
}
async function deletePersonalLink(item) {
  if (!confirm(`「${item.title}」を削除しますか？`)) return;
  try {
    const rows = await request(`/rest/v1/kasi_personal_links?id=eq.${item.id}&row_version=eq.${item.row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({deleted_at:new Date().toISOString()})});
    if (!rows.length) throw new Error('別の画面で更新されています。再読み込みしてください。');
    await loadPersonalLinks(); message('personal-links-status', 'リンクを削除しました。');
  } catch (error) { message('personal-links-status', `削除できませんでした：${error.message}`, true); }
}
function renderOrthosisList() {
  $('orthosis-list').replaceChildren(createOrthosisFlow());
  message('orthosis-list-status', orthoses.length ? `${orthoses.length}件の装具を表示しています。` : 'まだ装具がありません。「新しい装具を追加」から登録できます。');
}
function populateOrthosis(item) {
  $('orthosis-name').value = item?.nickname || '';
  $('orthosis-status-code').value = item?.ownership_status || 'owned';
  $('orthosis-side').value = item?.side_code || 'unknown';
  $('orthosis-type').value = item?.orthosis_type_code || 'unknown';
  $('manufactured-date').value = item?.manufactured_on || '';
  $('manufactured-year').value = item?.manufactured_year || '';
  $('orthosis-maker').value = item?.manufacturer_name || '';
  $('orthosis-price-yen').value = item?.price_yen ?? '';
  $('orthosis-funding-system').value = item?.funding_system_code || '';
  $('orthosis-self-payment-rate').value = item?.self_payment_rate ?? '';
}
function renderHome() {
  $('home-orthosis-flow').replaceChildren(createOrthosisFlow(true));
  $('home-orthosis-help').textContent = orthoses.length ? `装具は合計${orthoses.length}件です。使用状況ごとに確認できます。` : 'まだ装具はありません。「自分の装具を開く」から登録できます。';
  $('saved-at').textContent = orthoses.length ? '保存済み' : 'まだ保存されていません';
  if (window.KASI_F04) KASI_F04.renderHomeRecords();
}
async function loadHome() { try { await loadOrthoses(); await KASI_F04.load(); message('home-status', ''); } catch (error) { message('home-status', error.message, true); } }
function resetNeedForm() { editingNeed = null; $('need-form').reset(); $('need-form-title').textContent = '困りごと・希望を追加'; $('need-cancel').hidden = true; message('need-status', ''); }
function showOrthosisForm(item = null) {
  editingOrthosis = item;
  populateOrthosis(item);
  $('orthosis-form-title').textContent = item ? '装具を編集' : '新しい装具を追加';
  $('orthosis-detail').hidden = true; $('orthosis-form').hidden = false;
  message('orthosis-status', ''); $('orthosis-name').focus();
}
function renderFacts() {
  const price = orthosis.price_yen == null ? '未記入' : `${Number(orthosis.price_yen).toLocaleString('ja-JP')}円`;
  const fundingLabels = {medical_insurance:'治療用（医療保険）', disability_support:'生活用（障害者総合支援法）', other:'その他'};
  const selfPayment = orthosis.self_payment_rate == null ? '未記入' : `${orthosis.self_payment_rate}割`;
  const facts = [['使用状況', ownershipLabels[orthosis.ownership_status]], ['装具名', orthosis.nickname], ['左右', {left:'左',right:'右',bilateral:'両側',unknown:'不明',not_applicable:'該当なし'}[orthosis.side_code]], ['種類', {afo:'短下肢装具（AFO）',kafo:'長下肢装具（KAFO）',foot_orthosis:'足底装具',orthopedic_shoe:'靴型装具',other:'その他',unknown:'不明'}[orthosis.orthosis_type_code]], ['作製日・年', orthosis.manufactured_on || (orthosis.manufactured_year ? `${orthosis.manufactured_year}年` : '未記入')], ['製作所', orthosis.manufacturer_name || '未記入'], ['価格', price], ['制度・支払いの区分', fundingLabels[orthosis.funding_system_code] || '未記入'], ['自己負担分（原則1〜3割）', selfPayment]];
  $('orthosis-facts').replaceChildren();
  facts.forEach(([label, value]) => $('orthosis-facts').append(node('dt', label), node('dd', value || '未記入')));
}
async function openOrthosis(id) {
  const selected = orthoses.find(item => item.id === id);
  if (!selected) return;
  orthosis = selected; editingOrthosis = null; $('orthosis-form').hidden = true;
  $('orthosis-detail').hidden = false; renderFacts();
  $('photo-list').replaceChildren();
  message('photo-status', '写真を読み込み中…');
  try {
    const photoRows = await select('kasi_user_media', `select=id,storage_path,original_filename,mime_type,sort_order,row_version&user_orthosis_id=eq.${id}&deleted_at=is.null&order=sort_order.asc,created_at.asc`);
    if (orthosis?.id !== id || !token) return;
    photos = photoRows.sort((a, b) => a.sort_order - b.sort_order); await renderPhotos();
  } catch (error) { if (orthosis?.id === id) message('photo-status', `詳細の読み込みに失敗しました：${error.message}`, true); }
}
function renderNeeds() {
  $('needs-list').replaceChildren();
  if (!needs.length) $('needs-list').append(node('p', '困りごと・希望はまだ登録されていません。'));
  needs.forEach(item => {
    const card = node('article', '', 'need-card');
    card.append(node('h4', `${item.need_type === 'problem' ? '困りごと' : '希望'} · ${categoryLabels[item.category_code] || 'その他'}`), node('p', item.description || '説明なし'), node('p', `${{active:'対応中',resolved:'解決済み',archived:'保管'}[item.status_code]} · 優先度 ${item.priority || '未設定'}`));
    const edit = node('button', '編集する'); edit.type = 'button'; edit.addEventListener('click', () => {
      editingNeed = item; $('need-type').value = item.need_type; $('need-category').value = item.category_code;
      $('need-description').value = item.description || ''; $('need-priority').value = item.priority || '';
      $('need-state').value = item.status_code; $('need-form-title').textContent = '困りごと・希望を編集';
      $('need-cancel').hidden = false; $('need-description').focus();
    });
    const remove = node('button', '削除する', 'danger-button'); remove.type = 'button';
    remove.addEventListener('click', () => deleteNeed(item, remove));
    const actions = node('div', '', 'item-actions'); actions.append(edit, remove);
    card.append(actions); $('needs-list').append(card);
  });
}
async function deleteNeed(item, button) {
  const id = needOrthosisId;
  if (!id || !confirm('この「困りごと・希望」を削除しますか？')) return;
  button.disabled = true;
  try {
    const rows = await request(`/rest/v1/kasi_user_needs?id=eq.${item.id}&row_version=eq.${item.row_version}&deleted_at=is.null`, {
      method:'PATCH', headers:{'Content-Type':'application/json',Prefer:'return=representation'}, body:JSON.stringify({deleted_at:new Date().toISOString()})
    });
    if (!rows.length) throw new Error('別の画面で更新または削除されています。画面を再読み込みしてください。');
    if (editingNeed?.id === item.id) resetNeedForm();
    if (needOrthosisId === id) {
      needs = await select('kasi_user_needs', `select=id,need_type,category_code,description,priority,status_code,row_version&user_orthosis_id=eq.${id}&deleted_at=is.null&order=created_at.asc`);
      renderNeeds(); message('need-status', '困りごと・希望を削除しました。');
    }
  } catch (error) {
    message('need-status', `削除できませんでした：${error.message}`, true); button.disabled = false;
  }
}
async function loadNeedsForOrthosis(id) {
  needOrthosisId = id || ''; resetNeedForm(); $('needs-list').replaceChildren();
  if (!needOrthosisId) return;
  try {
    const selectedId = needOrthosisId;
    const rows = await select('kasi_user_needs', `select=id,need_type,category_code,description,priority,status_code,row_version&user_orthosis_id=eq.${selectedId}&deleted_at=is.null&order=created_at.asc`);
    if (needOrthosisId !== selectedId || !token) return;
    needs = rows; renderNeeds();
  } catch (error) { if (needOrthosisId === id) message('need-status', `困りごと・希望を読み込めませんでした：${error.message}`, true); }
}
window.KASI_NEEDS = {loadForOrthosis:loadNeedsForOrthosis};
function storagePath(path, authenticated = false) { return `/storage/v1/object/${authenticated ? 'authenticated/' : ''}kasi_user-media/${path.split('/').map(encodeURIComponent).join('/')}`; }
async function storageRequest(path, options = {}) {
  assertConfig();
  const response = await fetch(`${config.url}${path}`, {...options, headers: apiHeaders(options.headers)});
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || body.error || '写真の処理に失敗しました。'); }
  return response;
}
async function deleteStorageObject(path) {
  await storageRequest('/storage/v1/object/kasi_user-media', {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});
}
function clearPhotoUrls() { photoRenderId++; photoUrls.forEach(url => URL.revokeObjectURL(url)); photoUrls = []; }
async function renderPhotos() {
  clearPhotoUrls(); const generation = photoRenderId, selectedId = orthosis?.id, currentToken = token;
  $('photo-list').replaceChildren();
  if (!photos.length) $('photo-list').append(node('p', '写真はまだありません。'));
  message('photo-status', `${photos.length}/10枚を保存しています。`);
  for (const [index, item] of photos.entries()) {
    const card = node('figure', '', 'photo-card');
    const image = document.createElement('img'); image.alt = `${orthosis.nickname}の写真 ${index + 1}`;
    const caption = node('figcaption', item.original_filename || `写真 ${index + 1}`);
    const actions = node('div', '', 'photo-actions');
    for (const [label, offset] of [['前へ', -1], ['次へ', 1]]) {
      const button = node('button', label); button.type = 'button'; button.disabled = index + offset < 0 || index + offset >= photos.length;
      button.addEventListener('click', () => movePhoto(index, offset)); actions.append(button);
    }
    const remove = node('button', '削除'); remove.type = 'button'; remove.addEventListener('click', () => deletePhoto(item)); actions.append(remove);
    card.append(image, caption, actions); $('photo-list').append(card);
    try {
      const response = await storageRequest(storagePath(item.storage_path, true));
      const blob = await response.blob();
      if (generation !== photoRenderId || orthosis?.id !== selectedId || token !== currentToken) return;
      const url = URL.createObjectURL(blob); photoUrls.push(url); image.src = url;
    } catch (error) { image.replaceWith(node('p', `写真を表示できません：${error.message}`, 'error')); }
  }
}
async function refreshPhotos() {
  const id = orthosis.id;
  const rows = await select('kasi_user_media', `select=id,storage_path,original_filename,mime_type,sort_order,row_version&user_orthosis_id=eq.${id}&deleted_at=is.null&order=sort_order.asc,created_at.asc`);
  if (orthosis?.id === id) { photos = rows.sort((a, b) => a.sort_order - b.sort_order); await renderPhotos(); }
}
async function movePhoto(index, offset) {
  if (!photos[index + offset]) return;
  const id = orthosis.id, ordered = [...photos];
  [ordered[index], ordered[index + offset]] = [ordered[index + offset], ordered[index]];
  // Older photos may all have sort_order=0. Number the whole list to make a swap effective.
  let failure = null;
  try {
    for (const [position, item] of ordered.entries()) {
      if (item.sort_order === position) continue;
      const rows = await request(`/rest/v1/kasi_user_media?id=eq.${item.id}&row_version=eq.${item.row_version}`, {method:'PATCH', headers:{'Content-Type':'application/json',Prefer:'return=representation'}, body:JSON.stringify({sort_order:position})});
      if (!rows.length) throw new Error('写真が別の画面で更新されています。');
    }
  } catch (error) { failure = error; }
  if (orthosis?.id === id) {
    try { await refreshPhotos(); } catch (error) { failure ||= error; }
    message('photo-status', failure ? `順番を変更できませんでした：${failure.message}` : '写真の順番を変更しました。', !!failure);
  }
}
async function deletePhoto(item) {
  if (!confirm('この写真を削除しますか？')) return;
  const id = orthosis.id;
  try {
    const rows = await request(`/rest/v1/kasi_user_media?id=eq.${item.id}&row_version=eq.${item.row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({deleted_at:new Date().toISOString()})});
    if (!rows.length) throw new Error('写真の管理情報が別の画面で更新されました。再読み込みしてください。');
    try { await deleteStorageObject(item.storage_path); }
    catch (error) {
      const restored = await request(`/rest/v1/kasi_user_media?id=eq.${item.id}&row_version=eq.${rows[0].row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({deleted_at:null})});
      if (!restored.length) throw new Error('写真の削除に失敗し、管理情報も復元できませんでした。管理者に連絡してください。');
      throw error;
    }
    if (orthosis?.id === id) { await refreshPhotos(); message('photo-status', '写真を削除しました。'); }
  } catch (error) { message('photo-status', `削除を完了できませんでした：${error.message}`, true); }
}
const screenNames = {home:'ホーム', orthosis:'自分の装具', catalog:'装具図鑑', record:'使用記録', consultation:'相談シート', links:'リンク集', settings:'設定'};
let currentScreen = 'home';
const screenLoads = new Map();
function setScreen(name) {
  if (!token || !Object.hasOwn(screenNames, name)) return;
  currentScreen = name;
  document.querySelectorAll('.app-page').forEach(p => p.hidden = p.id !== `${name}-page`);
  $('home-page').hidden = name !== 'home';
  document.querySelectorAll('#app-navigation .screen-link, .mobile-orthosis').forEach(button => {
    const active = button.dataset.screen === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('current-screen').textContent = screenNames[name];
  document.title = `${screenNames[name]} | 下肢装具サポート`;
  if (name !== 'catalog' && window.KASI_F03) KASI_F03.hide();
  const title = $(`${name}-page`).querySelector('h1');
  if (title) { title.setAttribute('tabindex', '-1'); title.focus({preventScroll:true}); }
  window.scrollTo({top:0, behavior:'instant'});
}
$('login-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; message('auth-status', 'ログインしています…'); try { const data = await request('/auth/v1/token?grant_type=password', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: $('email').value, password: $('password').value})}); token = data.access_token; userId = (await request('/auth/v1/user')).id; $('password').value = ''; setAuthenticatedView(true); await Promise.all([loadHome(), KASI_F03.load(), loadProfile()]); } catch { token = ''; userId = ''; message('auth-status', 'メールアドレスまたはパスワードを確認してください。', true); } finally { button.disabled = false; } });
$('logout').addEventListener('click', () => { clearPhotoUrls(); KASI_F03.reset(); KASI_F04.reset(); KASI_F05.reset(); token = ''; userId = ''; orthosis = null; orthoses = []; editingOrthosis = null; editingNeed = null; needOrthosisId = ''; personalLinks = []; personalLinksLoaded = false; resetPersonalLinkForm(); $('orthosis-form').reset(); $('orthosis-form').hidden = true; $('need-form').reset(); needs = []; photos = []; profile = null; profileLoaded = false; $('profile-fields').disabled = true; $('profile-save').disabled = true; $('profile-form').reset(); applyTextScale(100); $('orthosis-detail').hidden = true; setAuthenticatedView(false); message('auth-status', 'ログアウトしました。'); $('email').focus(); });
$('personal-link-add').addEventListener('click', () => showPersonalLinkForm());
$('personal-link-cancel').addEventListener('click', resetPersonalLinkForm);
$('personal-link-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; const title = $('personal-link-title').value.trim(), url = $('personal-link-url').value.trim(), note = $('personal-link-note').value.trim();
  let parsed; try { parsed = new URL(url); } catch { message('personal-link-form-status', '正しいURLを入力してください。', true); return; }
  if (!['http:', 'https:'].includes(parsed.protocol)) { message('personal-link-form-status', 'http:// または https:// で始まるURLを入力してください。', true); return; }
  if (!title) { message('personal-link-form-status', '名前を入力してください。', true); return; }
  button.disabled = true; message('personal-link-form-status', '保存しています…'); const item = editingPersonalLink;
  try {
    const data = {title,url:parsed.href,note:note || null};
    const path = item ? `/rest/v1/kasi_personal_links?id=eq.${item.id}&row_version=eq.${item.row_version}` : '/rest/v1/kasi_personal_links';
    const rows = await request(path, {method:item?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(data)});
    if (!rows.length) throw new Error('別の画面で更新されています。再読み込みしてください。');
    resetPersonalLinkForm(); await loadPersonalLinks(); message('personal-links-status', item ? 'リンクを更新しました。' : 'リンクを追加しました。');
  } catch (error) { message('personal-link-form-status', `保存できませんでした：${error.message}`, true); } finally { button.disabled = false; }
});
$('orthosis-add').addEventListener('click', () => showOrthosisForm());
$('orthosis-edit').addEventListener('click', () => showOrthosisForm(orthosis));
$('orthosis-cancel').addEventListener('click', () => { $('orthosis-form').hidden = true; if (KASI_F04.cancelOrthosisRegistration()) return; $('orthosis-detail').hidden = !orthosis; });
$('orthosis-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  const priceInput = $('orthosis-price-yen').value;
  const priceYen = priceInput === '' ? null : Number(priceInput);
  if (!Number.isSafeInteger(priceYen) && priceYen !== null) { message('orthosis-status', '価格は0円以上の整数で入力してください。', true); button.disabled = false; return; }
  const data = {nickname: $('orthosis-name').value.trim() || '不明', ownership_status:$('orthosis-status-code').value, side_code: $('orthosis-side').value, orthosis_type_code: $('orthosis-type').value, manufactured_on: $('manufactured-date').value || null, manufactured_year: $('manufactured-year').value ? Number($('manufactured-year').value) : null, manufacturer_name: $('orthosis-maker').value.trim() || null, price_yen:priceYen, funding_system_code:$('orthosis-funding-system').value || null, self_payment_rate:$('orthosis-self-payment-rate').value ? Number($('orthosis-self-payment-rate').value) : null};
  try {
    const item = editingOrthosis, path = item ? `/rest/v1/kasi_user_orthoses?id=eq.${item.id}&row_version=eq.${item.row_version}` : '/rest/v1/kasi_user_orthoses';
    const rows = await request(path, {method: item ? 'PATCH' : 'POST', headers: {'Content-Type': 'application/json', Prefer: 'return=representation'}, body: JSON.stringify(data)});
    if (!rows.length) throw new Error('別の画面で更新されています。再読み込みしてください。');
    await loadOrthoses();
    if (await KASI_F04.orthosisSaved(rows[0].id)) return;
    await openOrthosis(rows[0].id);
    message('orthosis-list-status', '装具情報を保存しました。');
  } catch (error) { message('orthosis-status', error.message, true); } finally { button.disabled = false; }
});
$('need-cancel').addEventListener('click', resetNeedForm);
$('need-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  const id = needOrthosisId, item = editingNeed;
  const data = {need_type:$('need-type').value,category_code:$('need-category').value,description:$('need-description').value.trim(),priority:$('need-priority').value ? Number($('need-priority').value) : null,status_code:$('need-state').value};
  if (!item) data.user_orthosis_id = id;
  try {
    if (!id) throw new Error('関連する登録済み装具を選んでください。');
    if (!data.description) throw new Error('詳しい説明を入力してください。');
    const rows = await request(item ? `/rest/v1/kasi_user_needs?id=eq.${item.id}&row_version=eq.${item.row_version}` : '/rest/v1/kasi_user_needs', {method:item?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(data)});
    if (!rows.length) throw new Error('別の画面で更新されています。再読み込みしてください。');
    if (needOrthosisId === id) { needs = await select('kasi_user_needs', `select=id,need_type,category_code,description,priority,status_code,row_version&user_orthosis_id=eq.${id}&deleted_at=is.null&order=created_at.asc`); renderNeeds(); resetNeedForm(); message('need-status', '保存しました。'); }
  } catch (error) { message('need-status', error.message, true); } finally { button.disabled = false; }
});
$('orthosis-photo').addEventListener('change', async event => {
  const input = event.target, file = input.files[0], selected = orthosis;
  if (!file || !selected) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) { message('photo-status', 'JPEG・PNG・WebPの10MB以下の写真を選んでください。', true); input.value = ''; return; }
  input.disabled = true; message('photo-status', '写真を保存しています…');
  let path = '', uploaded = false;
  try {
    const current = await select('kasi_user_media', `select=id&user_orthosis_id=eq.${selected.id}&deleted_at=is.null`);
    if (current.length >= 10) throw new Error('写真は装具ごとに最大10枚です。');
    const extension = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[file.type];
    path = `${userId}/${selected.id}/${crypto.randomUUID()}.${extension}`;
    await storageRequest(storagePath(path), {method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file}); uploaded = true;
    await request('/rest/v1/kasi_user_media', {method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({user_orthosis_id:selected.id,storage_path:path,original_filename:file.name,mime_type:file.type,byte_size:file.size,sort_order:current.length})});
    if (orthosis?.id === selected.id) { await refreshPhotos(); message('photo-status', '写真を保存しました。'); }
  } catch (error) {
    if (uploaded) { try { await deleteStorageObject(path); } catch { message('photo-status', `管理情報を保存できませんでした。写真の後片付けも失敗しました：${error.message}`, true); return; } }
    message('photo-status', error.message, true);
  } finally { input.value = ''; input.disabled = false; }
});
$('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!profileLoaded || !token || !userId) return;
  const currentUser = userId, currentToken = token, currentProfile = profile;
  const displayName = $('profile-display-name').value.trim();
  const data = {display_name:displayName || null,text_scale:Number($('text-scale').value),device_storage_enabled:$('device-storage').checked};
  if (displayName.length > 80 || !Number.isInteger(data.text_scale) || data.text_scale < 100 || data.text_scale > 200) {
    message('profile-status', '表示名は80文字以内、文字の大きさは100～200%にしてください。', true); return;
  }
  $('profile-save').disabled = true;
  message('profile-status', '本人設定を保存しています…');
  try {
    const path = currentProfile
      ? `/rest/v1/kasi_profiles?user_id=eq.${currentUser}&row_version=eq.${currentProfile.row_version}`
      : '/rest/v1/kasi_profiles';
    const body = currentProfile ? data : {user_id:currentUser,...data};
    const rows = await request(path, {method:currentProfile?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body)});
    if (!rows.length) throw new Error('別の画面で更新されています。設定画面を開き直して確認してください。');
    if (currentUser !== userId || currentToken !== token) return;
    showProfile(rows[0]);
    message('profile-status', '本人設定をDBに保存しました。');
  } catch (error) {
    if (currentUser === userId && currentToken === token) message('profile-status', `保存できませんでした：${error.message}`, true);
  } finally { if (currentUser === userId && currentToken === token) $('profile-save').disabled = false; }
});
$('profile-form').addEventListener('input', event => { if (event.target.id === 'text-scale') applyTextScale(event.target.value); message('profile-status', '未保存の変更があります。'); });
$('profile-form').addEventListener('change', () => message('profile-status', '未保存の変更があります。'));
$('delete-local').addEventListener('click',()=>{if(confirm('この端末の下書きを削除しますか？')){localStorage.removeItem('kasi_record_draft');message('settings-data-status','端末の下書きを削除しました。DBの本人設定は変更していません。')}});
$('export-data').addEventListener('click',()=>{const b=new Blob([JSON.stringify({orthoses,exported_at:new Date().toISOString()},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='kasisougu-export.json';a.click();URL.revokeObjectURL(a.href)});
async function navigateTo(screen, action = '') {
  if (!token || !Object.hasOwn(screenNames, screen)) return;
  if (screen === currentScreen && !action) return;
  if (screen !== 'orthosis') KASI_F04.leaveOrthosisRegistration();
  setScreen(screen);
  // Keep editors and their photo URLs alive while moving between pages.
  // They are reset or revoked when replaced and on logout.
  if (!screenLoads.has(screen)) {
    const load = async () => {
      if (screen === 'home') await loadHome();
      if (screen === 'orthosis' && $('orthosis-form').hidden && $('orthosis-detail').hidden) await loadOrthoses();
      if (screen === 'catalog') await KASI_F03.resume();
      if (screen === 'record') { await loadOrthoses(); await KASI_F04.init(); }
      if (screen === 'consultation') await KASI_F05.init();
      if (screen === 'settings' && !profileLoaded) await loadProfile();
      if (screen === 'links' && !personalLinksLoaded) await loadPersonalLinks();
    };
    screenLoads.set(screen, load().finally(() => screenLoads.delete(screen)));
  }
  try {
    await screenLoads.get(screen);
    if (currentScreen === screen && action === 'new-record' && $('record-form').hidden) $('record-add').click();
  } catch (error) {
    const status = {home:'home-status',orthosis:'orthosis-list-status',catalog:'catalog-status',record:'record-list-status',consultation:'sheet-list-status',settings:'profile-status'};
    message(status[screen], error.message, true);
  }
}
document.querySelectorAll('.screen-link').forEach(button => button.addEventListener('click', () => navigateTo(button.dataset.screen, button.dataset.action)));
$('home-guide-open').addEventListener('click', () => $('home-guide-dialog').showModal());
document.querySelectorAll('[data-record-help]').forEach(button => button.addEventListener('click', () => {
  const dialog = $('record-help-dialog');
  dialog.showModal();
  $(`record-help-${button.dataset.recordHelp}`)?.scrollIntoView({block:'start'});
}));
document.querySelector('.brand').addEventListener('click', event => {
  if (token) { event.preventDefault(); navigateTo('home'); }
});
// Track the actual bar height, including large text and the device safe area.
if ('ResizeObserver' in window) new ResizeObserver(entries => {
  document.documentElement.style.setProperty('--mobile-nav-height', `${Math.ceil(entries[0].target.getBoundingClientRect().height)}px`);
}).observe(document.querySelector('.primary-nav'));
document.querySelectorAll('.future-link').forEach(button => button.addEventListener('click', () => message('home-status', `${button.dataset.feature}は、次の画面実装で追加します。`)));
let installPrompt; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('install').hidden = false; }); $('install').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('install').hidden = true; } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register(window.KASISOUGU_SUPABASE_CONFIG ? './sw.js' : '/sw.js').catch(() => {});
