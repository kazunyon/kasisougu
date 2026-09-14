'use strict';
const $ = id => document.getElementById(id);
const config = window.KASISOUGU_SUPABASE_CONFIG || {};
let token = '', userId = '', orthosis = null, orthoses = [], editingOrthosis = null;
let needs = [], editingNeed = null, photos = [], photoUrls = [], photoRenderId = 0, catalogItems = [];
function message(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function apiHeaders(extra = {}) { return {apikey: config.publishableKey, ...(token ? {Authorization: `Bearer ${token}`} : {}), ...extra}; }
function setAuthenticatedView(ok) { if (!ok) document.querySelectorAll('.app-page').forEach(p => p.hidden = true); $('login-page').hidden = ok; $('home-page').hidden = !ok; $('logout').hidden = !ok; $('header-status').textContent = ok ? 'ログイン中' : 'ログインが必要です'; }
function assertConfig() { if (!config.url || !config.publishableKey) throw new Error('公開設定を確認してください。'); }
async function request(path, options = {}) { const {headers: extraHeaders = {}, ...rest} = options; assertConfig(); const response = await fetch(`${config.url}${path}`, {...rest, headers: apiHeaders(extraHeaders)}); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || body.msg || '処理できませんでした。'); } const body = await response.text(); return body ? JSON.parse(body) : null; }
async function select(table, query) { return request(`/rest/v1/${table}?${query}`, {headers: {Accept: 'application/json'}}); }
const ownershipLabels = {owned: '現在使用中', trial: '試用中', past: '過去に使用'};
const categoryLabels = {heavy: '重さ', hard_to_put_on: '着脱', hard_to_wear_shoes: '靴の履きやすさ', pain_or_pressure: '痛み・圧迫', fatigue: '疲労', stability: '安定性', mobility: '移動', daily_activity: '日常生活', other: 'その他'};
function node(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
async function loadOrthoses() {
  orthoses = await select('kasi_user_orthoses', 'select=id,nickname,side_code,orthosis_type_code,ownership_status,manufactured_on,manufactured_year,manufacturer_name,row_version&deleted_at=is.null&order=updated_at.desc');
  orthosis = orthoses.find(item => item.id === orthosis?.id) || orthoses.find(item => item.ownership_status === 'owned') || orthoses[0] || null;
  renderOrthosisList(); renderHome();
}
function renderOrthosisList() {
  $('orthosis-list').replaceChildren();
  for (const status of ['owned', 'trial', 'past']) {
    const group = node('section', '', 'orthosis-group');
    group.append(node('h3', ownershipLabels[status]));
    const items = orthoses.filter(item => item.ownership_status === status);
    if (!items.length) group.append(node('p', '登録はありません。', 'empty-state'));
    items.forEach(item => {
      const card = node('article', '', 'orthosis-card');
      card.append(node('h4', item.nickname), node('p', `${item.manufactured_on || (item.manufactured_year ? `${item.manufactured_year}年作製` : '作製日未記入')}`));
      const detail = node('button', '詳細を見る'); detail.type = 'button'; detail.addEventListener('click', () => openOrthosis(item.id));
      card.append(detail); group.append(card);
    });
    $('orthosis-list').append(group);
  }
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
}
function renderHome() {
  const current = orthoses.filter(item => item.ownership_status === 'owned');
  $('orthosis-value').textContent = current.length ? current.map(item => item.nickname).join('、') : '現在使用中の装具は未登録です';
  $('orthosis-help').textContent = orthoses.length ? `装具は合計${orthoses.length}件です。一覧から試用中・過去の装具も確認できます。` : '装具名が分からない場合も、次の画面で「不明」として登録できます。';
  $('saved-at').textContent = orthoses.length ? '保存済み' : 'まだ保存されていません';
  if (window.KASI_F04) KASI_F04.renderHomeRecords();
}
async function loadHome() { try { await loadOrthoses(); await KASI_F04.load(); message('home-status', orthoses.length ? '保存した内容を表示しています。' : 'まだ保存された内容はありません。'); } catch (error) { message('home-status', error.message, true); } }
function resetNeedForm() { editingNeed = null; $('need-form').reset(); $('need-form-title').textContent = '困りごと・希望を追加'; $('need-cancel').hidden = true; message('need-status', ''); }
function showOrthosisForm(item = null) {
  editingOrthosis = item;
  populateOrthosis(item);
  $('orthosis-form-title').textContent = item ? '装具を編集' : '新しい装具を追加';
  $('orthosis-detail').hidden = true; $('orthosis-form').hidden = false;
  message('orthosis-status', ''); $('orthosis-name').focus();
}
function renderFacts() {
  const facts = [['使用状況', ownershipLabels[orthosis.ownership_status]], ['装具名', orthosis.nickname], ['左右', {left:'左',right:'右',bilateral:'両側',unknown:'不明',not_applicable:'該当なし'}[orthosis.side_code]], ['種類', {afo:'短下肢装具（AFO）',kafo:'長下肢装具（KAFO）',foot_orthosis:'足底装具',orthopedic_shoe:'靴型装具',other:'その他',unknown:'不明'}[orthosis.orthosis_type_code]], ['作製日・年', orthosis.manufactured_on || (orthosis.manufactured_year ? `${orthosis.manufactured_year}年` : '未記入')], ['製作所', orthosis.manufacturer_name || '未記入']];
  $('orthosis-facts').replaceChildren();
  facts.forEach(([label, value]) => $('orthosis-facts').append(node('dt', label), node('dd', value || '未記入')));
}
async function openOrthosis(id) {
  const selected = orthoses.find(item => item.id === id);
  if (!selected) return;
  orthosis = selected; editingOrthosis = null; $('orthosis-form').hidden = true;
  $('orthosis-detail').hidden = false; renderFacts(); resetNeedForm();
  $('needs-list').replaceChildren(); $('photo-list').replaceChildren();
  message('photo-status', '写真を読み込み中…');
  try {
    const [needRows, photoRows] = await Promise.all([
      select('kasi_user_needs', `select=id,need_type,category_code,description,priority,status_code,row_version&user_orthosis_id=eq.${id}&deleted_at=is.null&order=created_at.asc`),
      select('kasi_user_media', `select=id,storage_path,original_filename,mime_type,sort_order,row_version&user_orthosis_id=eq.${id}&deleted_at=is.null&order=sort_order.asc,created_at.asc`)
    ]);
    if (orthosis?.id !== id || !token) return;
    needs = needRows; photos = photoRows.sort((a, b) => a.sort_order - b.sort_order); renderNeeds(); await renderPhotos();
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
    card.append(edit); $('needs-list').append(card);
  });
}
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
function setScreen(name) { document.querySelectorAll('.app-page').forEach(p => p.hidden = true); $('home-page').hidden = name !== 'home'; if (name !== 'home') $(`${name}-page`).hidden = false; document.querySelector('main').scrollIntoView({block: 'start'}); }
function termValues(terms, group) { return terms.filter(t => t.kasi_catalog_terms?.term_group === group).map(t => t.kasi_catalog_terms.label_ja).join('、') || '未確認'; }
function renderCatalog(filter = 'all') { const items=catalogItems.filter(i=>filter==='all'||i.type===filter); $('catalog-list').replaceChildren(); if(!items.length)return $('catalog-list').append(Object.assign(document.createElement('p'),{className:'empty-state',textContent:'公開済みの記事はありません。'})); items.forEach(i=>{const card=document.createElement('article'),photo=i.media[0],source=i.sources[0];card.className='catalog-card';card.innerHTML=`${photo?`<img class="catalog-photo" src="${photo.source_url}" alt="${photo.alt_text}" loading="lazy">`:''}<p>${i.category}</p><h2>${i.product_name||i.title}</h2><p>${i.summary}</p><footer>${source?`<a href="${source.source_url}" target="_blank" rel="noopener">出典：${source.publisher_name}「${source.title}」</a>`:''}<span>確認日：${i.reviewed_at||'未確認'}</span></footer>`;$('catalog-list').append(card);}); }
async function loadCatalog() { try { const rows=await select('kasi_catalog_items','select=id,title,product_name,summary,reviewed_at&publication_status=eq.published&deleted_at=is.null&order=published_at.desc'); const ids=rows.map(r=>r.id), inIds=ids.join(','); const terms=ids.length?await select('kasi_catalog_item_terms',`select=catalog_item_id,kasi_catalog_terms(term_group,label_ja)&catalog_item_id=in.(${inIds})`):[]; const media=ids.length?await select('kasi_catalog_media',`select=catalog_item_id,alt_text,source_url,sort_order&catalog_item_id=in.(${inIds})&order=sort_order.asc`):[]; const links=ids.length?await select('kasi_catalog_item_sources',`select=catalog_item_id,kasi_catalog_sources(publisher_name,title,source_url)&catalog_item_id=in.(${inIds})`):[]; catalogItems=rows.map(row=>{const itemTerms=terms.filter(t=>t.catalog_item_id===row.id),scope=termValues(itemTerms,'support_scope');return {...row,terms:itemTerms,media:media.filter(m=>m.catalog_item_id===row.id),sources:links.filter(l=>l.catalog_item_id===row.id).map(l=>l.kasi_catalog_sources),category:scope,type:scope.includes('AFO')?'afo':scope.includes('KAFO')?'kafo':scope==='足底装具'?'foot_orthosis':scope==='靴型装具'?'orthopedic_shoe':'other'};}); renderCatalog(); message('catalog-status',catalogItems.length?`公開済みの${catalogItems.length}件を表示しています。`:'公開済みの記事はありません。'); } catch(error) { message('catalog-status',error.message,true); } }
$('login-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; message('auth-status', 'ログインしています…'); try { const data = await request('/auth/v1/token?grant_type=password', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: $('email').value, password: $('password').value})}); token = data.access_token; userId = (await request('/auth/v1/user')).id; $('password').value = ''; setAuthenticatedView(true); await Promise.all([loadHome(), loadCatalog()]); } catch { token = ''; userId = ''; message('auth-status', 'メールアドレスまたはパスワードを確認してください。', true); } finally { button.disabled = false; } });
$('logout').addEventListener('click', () => { clearPhotoUrls(); KASI_F04.reset(); KASI_F05.reset(); token = ''; userId = ''; orthosis = null; orthoses = []; needs = []; photos = []; $('orthosis-detail').hidden = true; setAuthenticatedView(false); message('auth-status', 'ログアウトしました。'); $('email').focus(); });
$('orthosis-add').addEventListener('click', () => showOrthosisForm());
$('orthosis-edit').addEventListener('click', () => showOrthosisForm(orthosis));
$('orthosis-cancel').addEventListener('click', () => { $('orthosis-form').hidden = true; $('orthosis-detail').hidden = !orthosis; });
$('orthosis-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  const data = {nickname: $('orthosis-name').value.trim() || '不明', ownership_status:$('orthosis-status-code').value, side_code: $('orthosis-side').value, orthosis_type_code: $('orthosis-type').value, manufactured_on: $('manufactured-date').value || null, manufactured_year: $('manufactured-year').value ? Number($('manufactured-year').value) : null, manufacturer_name: $('orthosis-maker').value.trim() || null};
  try {
    const item = editingOrthosis, path = item ? `/rest/v1/kasi_user_orthoses?id=eq.${item.id}&row_version=eq.${item.row_version}` : '/rest/v1/kasi_user_orthoses';
    const rows = await request(path, {method: item ? 'PATCH' : 'POST', headers: {'Content-Type': 'application/json', Prefer: 'return=representation'}, body: JSON.stringify(data)});
    if (!rows.length) throw new Error('別の画面で更新されています。再読み込みしてください。');
    await loadOrthoses(); await openOrthosis(rows[0].id);
    message('orthosis-list-status', '装具情報を保存しました。');
  } catch (error) { message('orthosis-status', error.message, true); } finally { button.disabled = false; }
});
$('need-cancel').addEventListener('click', resetNeedForm);
$('need-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  const id = orthosis.id, item = editingNeed;
  const data = {need_type:$('need-type').value,category_code:$('need-category').value,description:$('need-description').value.trim(),priority:$('need-priority').value ? Number($('need-priority').value) : null,status_code:$('need-state').value};
  if (!item) data.user_orthosis_id = id;
  try {
    if (!data.description) throw new Error('詳しい説明を入力してください。');
    const rows = await request(item ? `/rest/v1/kasi_user_needs?id=eq.${item.id}&row_version=eq.${item.row_version}` : '/rest/v1/kasi_user_needs', {method:item?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(data)});
    if (!rows.length) throw new Error('別の画面で更新されています。再読み込みしてください。');
    if (orthosis?.id === id) { needs = await select('kasi_user_needs', `select=id,need_type,category_code,description,priority,status_code,row_version&user_orthosis_id=eq.${id}&deleted_at=is.null&order=created_at.asc`); renderNeeds(); resetNeedForm(); message('need-status', '保存しました。'); }
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
$('text-scale').addEventListener('input',e=>{const v=e.target.value;document.documentElement.style.fontSize=`${18*v/100}px`;$('text-scale-value').textContent=`${v}%`;localStorage.setItem('kasi_text_scale',v)});
$('device-storage').addEventListener('change',e=>localStorage.setItem('kasi_device_storage',e.target.checked?'enabled':'disabled'));
$('delete-local').addEventListener('click',()=>{if(confirm('この端末の下書きを削除しますか？')){localStorage.removeItem('kasi_record_draft');localStorage.removeItem('kasi_device_storage');$('device-storage').checked=false}});
$('export-data').addEventListener('click',()=>{const b=new Blob([JSON.stringify({orthoses,exported_at:new Date().toISOString()},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='kasisougu-export.json';a.click();URL.revokeObjectURL(a.href)});
document.querySelectorAll('.screen-link').forEach(button => button.addEventListener('click', async () => {
  const screen = button.dataset.screen;
  if (screen !== 'orthosis') clearPhotoUrls();
  if (screen !== 'record') KASI_F04.clearUrls();
  if (screen !== 'consultation') KASI_F05.clearUrls();
  setScreen(screen);
  if (screen === 'home') await loadHome();
  if (screen === 'orthosis') {
    try { await loadOrthoses(); $('orthosis-form').hidden = true; $('orthosis-detail').hidden = true; clearPhotoUrls(); }
    catch (error) { message('orthosis-list-status', error.message, true); }
  }
  if (screen === 'catalog') await loadCatalog();
  if (screen === 'record') {
    try { await loadOrthoses(); await KASI_F04.init(); }
    catch (error) { message('record-list-status', error.message, true); }
  }
  if (screen === 'consultation') {
    try { await KASI_F05.init(); }
    catch (error) { message('sheet-list-status', error.message, true); }
  }
  if (screen === 'settings') {
    const v = localStorage.getItem('kasi_text_scale') || '100';
    $('text-scale').value = v; $('text-scale-value').textContent = `${v}%`;
    $('device-storage').checked = localStorage.getItem('kasi_device_storage') === 'enabled';
  }
}));
document.querySelectorAll('.future-link').forEach(button => button.addEventListener('click', () => message('home-status', `${button.dataset.feature}は、次の画面実装で追加します。`)));
document.querySelectorAll('.catalog-filter-button').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.catalog-filter-button').forEach(i => i.classList.toggle('active', i === button)); renderCatalog(button.dataset.filter); }));
let installPrompt; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('install').hidden = false; }); $('install').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('install').hidden = true; } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register(window.KASISOUGU_SUPABASE_CONFIG ? './sw.js' : '/sw.js').catch(() => {});
