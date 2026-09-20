'use strict';
// User-triggered URL searches only. No Google Maps Platform API or API key is used.
const KASI_NEARBY_PURPOSES = {manufacture:'装具の製作',repair:'修理',fitting:'適合確認',rehabilitation:'リハビリ',consultation:'制度相談'};
const KASI_MAP_SEARCHES = [
  ['リハビリを探す','リハビリ'],['リハビリ科を探す','リハビリテーション科'],['整形外科を探す','整形外科 リハビリ'],
  ['義肢装具店を探す','義肢装具'],['補装具店を探す','補装具'],['障害者支援を探す','障害者支援施設'],
  ['通所リハビリを探す','通所リハビリ'],['訪問リハビリを探す','訪問リハビリ'],['装具外来を探す','装具外来'],['脳卒中リハビリを探す','脳卒中リハビリ']
];
const KASI_NEARBY_GEOCODER = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const nearby$ = id => document.getElementById(id);
let nearbyReady = false, nearbySavedAddress = '', nearbyCurrentCenter = null, nearbyEditingCandidate = null, nearbyLastOrigin = null, nearbyLastCondition = null;
function nearbySetStatus(text, error = false, id = 'nearby-status') { const status = nearby$(id); status.textContent = text; status.classList.toggle('error', error); }
function nearbyCoordinates(latitude, longitude) { if (latitude == null || longitude == null || latitude === '' || longitude === '') return null; const lat = Number(latitude), lng = Number(longitude); return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat, lng} : null; }
function nearbyDistance(meters) { return meters >= 1000 ? `約 ${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km` : `約 ${Math.round(meters)} m`; }
function nearbyStraightLineMeters(origin, destination) { const r = value => value * Math.PI / 180, lat = r(destination.lat - origin.lat), lng = r(destination.lng - origin.lng), a = Math.sin(lat / 2) ** 2 + Math.cos(r(origin.lat)) * Math.cos(r(destination.lat)) * Math.sin(lng / 2) ** 2; return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0,1 - a))); }
function nearbyCurrentPosition() {
  if (!navigator.geolocation) return Promise.reject(new Error('現在地を取得できませんでした。登録住所から検索してください。'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    position => resolve({lat:position.coords.latitude,lng:position.coords.longitude,label:'現在地'}),
    error => reject(new Error(error?.code === 1 ? '位置情報を許可するか、登録住所を使用してください。' : '現在地を取得できませんでした。登録住所から検索してください。')),
    {enableHighAccuracy:false,timeout:10000,maximumAge:300000}
  ));
}
async function nearbyGeocodeAddress(address) { const response = await fetch(`${KASI_NEARBY_GEOCODER}?q=${encodeURIComponent(address)}`); if (!response.ok) throw new Error('住所を確認し、都道府県から入力してください。'); const rows = await response.json(), coordinates = nearbyCoordinates(rows?.[0]?.geometry?.coordinates?.[1],rows?.[0]?.geometry?.coordinates?.[0]); if (!coordinates) throw new Error('住所を確認し、都道府県から入力してください。'); return {...coordinates,label:address,routeOrigin:address}; }
async function nearbyOrigin(condition) { if (condition.origin === 'current') return nearbyCurrentPosition(); if (!condition.address) throw new Error('検索する住所を入力してください。'); return nearbyGeocodeAddress(condition.address); }
async function nearbySelectAll(table, select, extra = {}) {
  const all = [], size = 100;
  for (let offset = 0; ; ) {
    const query = new URLSearchParams({select,order:'id.asc',limit:String(size),offset:String(offset),...extra});
    let rows;
    try { rows = await window.KASI_API.select(table,query.toString()); } catch { throw new Error('施設一覧を取得できませんでした。通信と施設データの登録状況を確認してください。'); }
    if (!Array.isArray(rows)) throw new Error('施設一覧の応答を確認できませんでした。');
    all.push(...rows); if (!rows.length) break; offset += rows.length;
  }
  return all;
}
async function nearbyFindFacilities(origin, condition) {
  const masterExtra = {is_active:'eq.true'};
  if (condition.purpose) masterExtra.purpose_codes = 'cs.{' + condition.purpose + '}';
  const master = await nearbySelectAll('kasi_nearby_facilities','id,name,address,latitude,longitude,phone,website_url,purpose_codes',masterExtra);
  let candidates = [];
  try { candidates = await nearbySelectAll('kasi_candidate_facilities','id,name,address,latitude,longitude,phone,google_maps_url,facility_type,consultation_topic,note,checked_on,row_version',{deleted_at:'is.null'}); } catch { candidates = []; }
  const facilities = [];
  for (const row of master) {
    const location = nearbyCoordinates(row.latitude,row.longitude); if (!location) continue;
    const distanceMeters = nearbyStraightLineMeters(origin,location);
    if (distanceMeters <= condition.radius) facilities.push({...row,location,distanceMeters,category:(row.purpose_codes || []).map(code => KASI_NEARBY_PURPOSES[code]).filter(Boolean).join('・') || '登録施設'});
  }
  for (const row of candidates) {
    const candidatePurposes = {'病院':['rehabilitation'],'リハビリ':['rehabilitation'],'義肢装具':['manufacture','repair','fitting'],'補装具':['manufacture','repair','fitting'],'障害者支援施設':['consultation'],'その他':[]};
    if (condition.purpose && !(candidatePurposes[row.facility_type] || []).includes(condition.purpose)) continue;
    const location = nearbyCoordinates(row.latitude,row.longitude), distanceMeters = location ? nearbyStraightLineMeters(origin,location) : null;
    if (distanceMeters == null || distanceMeters <= condition.radius) facilities.push({...row,location,distanceMeters,category:`候補施設・${row.facility_type}`,website_url:row.google_maps_url,isCandidate:true});
  }
  return facilities.sort((a,b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity) || a.name.localeCompare(b.name,'ja'));
}
function nearbyDirectionsUrl(origin, item) { const destination = item.address || (item.location ? `${item.location.lat},${item.location.lng}` : ''); return `https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',origin:origin.routeOrigin || `${origin.lat},${origin.lng}`,destination,travelmode:'walking'}).toString()}`; }
function nearbyMapsSearchUrl(keyword, center) { const location = center.address || `${center.lat},${center.lng}`; return `https://www.google.com/maps/search/?${new URLSearchParams({api:'1',query:`${keyword} ${location}`}).toString()}`; }
function nearbyRenderResults(items, origin) {
  const container = nearby$('nearby-results'); container.replaceChildren();
  if (!items.length) { const empty = document.createElement('div'); empty.className = 'nearby-empty'; empty.textContent = '条件に合う登録施設がありません。範囲・目的を変えてください。'; container.append(empty); return; }
  items.forEach((item,index) => {
    const article=document.createElement('article'); article.className='nearby-card'; const meta=document.createElement('p'); meta.className='nearby-category'; meta.textContent=item.category; const heading=document.createElement('h3'); heading.textContent=item.name;
    const details=document.createElement('p'); details.className='nearby-details'; details.textContent=item.distanceMeters == null ? '直線距離：所在地の位置未確認' : `直線距離：${nearbyDistance(item.distanceMeters)}`;
    const address=document.createElement('p'); address.textContent=item.address || '所在地は未入力です。'; const phone=document.createElement('p'); phone.className='nearby-source'; phone.textContent=item.phone ? `電話：${item.phone}` : '電話番号は施設サイトまたは地図で確認してください。'; const links=document.createElement('div'); links.className='nearby-links';
    if (/^https?:\/\//i.test(item.website_url || '')) { const website=document.createElement('a'); website.className='resource-link'; website.href=item.website_url; website.target='_blank'; website.rel='noopener noreferrer'; website.textContent=item.isCandidate ? '登録したGoogle Maps URLを開く' : '施設サイトを開く'; links.append(website); }
    if (item.location || item.address) { const map=document.createElement('a'); map.className='resource-link nearby-map-link'; map.href=nearbyDirectionsUrl(origin,item); map.target='_blank'; map.rel='noopener noreferrer'; map.textContent='Google Mapsで経路を確認'; links.append(map); }
    if (item.isCandidate) { const actions=document.createElement('div'); actions.className='nearby-candidate-actions'; const edit=document.createElement('button'); edit.type='button'; edit.textContent='編集'; edit.addEventListener('click',()=>nearbyEditCandidate(item)); const remove=document.createElement('button'); remove.type='button'; remove.className='nearby-candidate-delete'; remove.textContent='削除'; remove.addEventListener('click',()=>nearbyDeleteCandidate(item)); actions.append(edit,remove); links.append(actions); }
    const rank=document.createElement('span'); rank.className='nearby-rank'; rank.textContent=`${index+1}`; article.append(rank,meta,heading,details,address,phone,links); container.append(article);
  });
}
async function nearbyLoadSavedAddress() { const address=await window.KASI_PROFILE?.loadNearbyAddress?.(); nearbySavedAddress=address||''; nearby$('nearby-address').value=nearbySavedAddress; nearby$('nearby-address-required').hidden=Boolean(nearbySavedAddress); if(!nearbySavedAddress) nearbySetMode('maps'); }
async function nearbySaveAddress(address) { if (!address) throw new Error('検索する住所を入力してください。'); await nearbyGeocodeAddress(address); if(address!==nearbySavedAddress){ if(!window.KASI_PROFILE?.saveNearbyAddress)throw new Error('住所を保存する準備ができていません。画面を再読み込みしてください。'); await window.KASI_PROFILE.saveNearbyAddress(address); nearbySavedAddress=address; } nearby$('nearby-address-required').hidden=true; return address; }
async function nearbySearch(originType = 'address') {
  const condition={address:nearbySavedAddress,purpose:nearby$('nearby-purpose').value,radius:Number(nearby$('nearby-radius').value),origin:originType}; const button=nearby$(originType === 'current' ? 'nearby-search-current' : 'nearby-search'); button.disabled=true; nearby$('nearby-results').replaceChildren(); nearbySetStatus('登録施設までの直線距離を確認しています…');
  try { const origin=await nearbyOrigin(condition); nearbyLastOrigin=origin; nearbyLastCondition=condition; const facilities=await nearbyFindFacilities(origin,condition); nearbyRenderResults(facilities,origin); nearbySetStatus(`${origin.label}から、条件に合う登録施設を近い順に${facilities.length}件表示しています。距離は直線距離です。`); } catch(error){ nearby$('nearby-results').replaceChildren(); nearbySetStatus(error.message||'検索できませんでした。',true); } finally{ button.disabled=false; }
}
function nearbySetMode(mode) { const maps=mode==='maps'; nearby$('nearby-registered-panel').hidden=maps; nearby$('nearby-maps-panel').hidden=!maps; for(const name of ['registered','maps']){ const active=name===mode,button=nearby$(`nearby-mode-${name}`); button.classList.toggle('active',active); button.setAttribute('aria-selected',String(active)); } }
function nearbyToggleMapsAddress() { nearby$('nearby-maps-address-field').hidden=document.querySelector('input[name="nearby-maps-origin"]:checked')?.value==='current'; }
async function nearbyOpenMaps(keyword) {
  const mode=document.querySelector('input[name="nearby-maps-origin"]:checked')?.value, address=nearby$('nearby-address').value.trim(); nearbySetStatus('Google Mapsを開く準備をしています…',false,'nearby-maps-status');
  try { const center=mode==='current' ? (nearbyCurrentCenter || await nearbyCurrentPosition()) : {address:address || nearbySavedAddress}; if(!center.address && center.lat==null) throw new Error('検索する住所を入力してください。'); const url=nearbyMapsSearchUrl(keyword,center); const opened=window.open(url,'_blank'); if(opened) opened.opener=null; const fallback=nearby$('nearby-map-fallback'); fallback.href=url; fallback.hidden=Boolean(opened); nearbySetStatus(opened ? 'Google Mapsを新しい画面で開きました。' : 'Google Mapsを開けませんでした。下のリンクからブラウザで開いてください。',!opened,'nearby-maps-status'); } catch(error){ nearbySetStatus(error.message||'Google Mapsを開けませんでした。',true,'nearby-maps-status'); }
}
function nearbyBuildMapButtons() { const container=nearby$('nearby-map-buttons'); for(const [label,keyword] of KASI_MAP_SEARCHES){ const button=document.createElement('button'); button.type='button'; button.className='nearby-map-search-button'; button.textContent=label; button.dataset.keyword=keyword; button.addEventListener('click',()=>nearbyOpenMaps(keyword)); container.append(button); } }
function nearbyToday() { const now=new Date(), local=new Date(now.getTime()-now.getTimezoneOffset()*60000); return local.toISOString().slice(0,10); }
function nearbyToggleCandidate(open) { const form=nearby$('nearby-candidate-form'),button=nearby$('nearby-candidate-toggle'); form.hidden=!open; button.setAttribute('aria-expanded',String(open)); button.textContent=open?'入力欄を閉じる':'候補施設を登録'; if(open){ nearby$('candidate-checked-on').value ||= nearbyToday(); nearby$('candidate-name').focus(); } }
function nearbyCandidateError(error) { const message=error?.message||''; return /schema cache|could not find.*kasi_candidate_facilities/i.test(message) ? '候補施設の保存先が準備されていません。管理者に候補施設用データベース設定の適用を依頼してください。' : (message||'候補施設を保存できませんでした。'); }
function nearbyResetCandidateForm() { nearbyEditingCandidate=null; nearby$('nearby-candidate-form').reset(); nearby$('candidate-checked-on').value=nearbyToday(); nearby$('nearby-candidate-title').textContent='見つけた施設を候補に追加'; nearby$('candidate-save').textContent='候補施設を保存'; }
function nearbyEditCandidate(item) {
  nearbyEditingCandidate=item; nearbySetMode('maps'); nearbyToggleCandidate(true); nearby$('nearby-candidate-title').textContent='候補施設を編集'; nearby$('candidate-save').textContent='変更を保存'; nearby$('candidate-name').value=item.name||''; nearby$('candidate-type').value=item.facility_type||''; nearby$('candidate-address').value=item.address||''; nearby$('candidate-phone').value=item.phone||''; nearby$('candidate-maps-url').value=item.google_maps_url||''; nearby$('candidate-consultation').value=item.consultation_topic||''; nearby$('candidate-note').value=item.note||''; nearby$('candidate-checked-on').value=item.checked_on||nearbyToday(); nearbySetStatus('候補施設の内容を編集しています。',false,'candidate-status');
}
async function nearbyRefreshLastSearch(message) {
  if(!nearbyLastOrigin||!nearbyLastCondition)return; const facilities=await nearbyFindFacilities(nearbyLastOrigin,nearbyLastCondition); nearbyRenderResults(facilities,nearbyLastOrigin); nearbySetStatus(message||`${nearbyLastOrigin.label}から、条件に合う登録施設を近い順に${facilities.length}件表示しています。距離は直線距離です。`);
}
async function nearbyDeleteCandidate(item) {
  if(!confirm(`候補施設「${item.name}」を削除しますか？`))return;
  try { const rows=await window.KASI_API.update('kasi_candidate_facilities',`id=eq.${encodeURIComponent(item.id)}&row_version=eq.${item.row_version}`,{deleted_at:new Date().toISOString()}); if(!rows?.length)throw new Error('施設が別の画面で更新されています。再検索してからお試しください。'); await nearbyRefreshLastSearch(`候補施設「${item.name}」を削除しました。`); }
  catch(error){ nearbySetStatus(nearbyCandidateError(error),true); }
}
async function nearbySaveCandidate(event) {
  event.preventDefault(); const form=event.currentTarget,button=event.submitter; button.disabled=true; nearbySetStatus('候補施設を保存しています…',false,'candidate-status');
  try { const value=id=>nearby$(id).value.trim(), address=value('candidate-address'); let location=null, locationWarning=''; if(address){ try{ location=await nearbyGeocodeAddress(address); }catch{ locationWarning=' 所在地の位置を確認できなかったため、直線距離は表示されません。'; } }
    const body={name:value('candidate-name'),facility_type:value('candidate-type'),address:address||null,phone:value('candidate-phone')||null,google_maps_url:value('candidate-maps-url')||null,consultation_topic:value('candidate-consultation')||null,note:value('candidate-note')||null,checked_on:value('candidate-checked-on'),latitude:location?.lat??null,longitude:location?.lng??null};
    if(!body.name||!body.facility_type||!body.checked_on) throw new Error('施設名、施設種別、確認日を入力してください。'); if(body.google_maps_url && !/^https?:\/\//i.test(body.google_maps_url)) throw new Error('Google Maps URLは http:// または https:// から入力してください。');
    const editing=nearbyEditingCandidate; if(editing){ const rows=await window.KASI_API.update('kasi_candidate_facilities',`id=eq.${encodeURIComponent(editing.id)}&row_version=eq.${editing.row_version}`,body); if(!rows?.length)throw new Error('施設が別の画面で更新されています。再検索してからお試しください。'); nearbyResetCandidateForm(); nearbyToggleCandidate(false); nearbySetMode('registered'); await nearbyRefreshLastSearch(`候補施設「${body.name}」を更新しました。${locationWarning}`); }
    else { await window.KASI_API.insert('kasi_candidate_facilities',body); nearbyResetCandidateForm(); nearbySetStatus(`候補施設を保存しました。登録施設から探す対象に追加されました。${locationWarning}`,false,'candidate-status'); }
  } catch(error){ nearbySetStatus(nearbyCandidateError(error),true,'candidate-status'); } finally{ button.disabled=false; }
}
function nearbyAddNavigation() { if(document.querySelector('[data-screen="nearby"]'))return; const button=document.createElement('button'); button.type='button';button.className='screen-link nearby-nav-link';button.dataset.screen='nearby';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s7-6.2 7-12A7 7 0 1 0 5 9c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg><span class="nav-long">近くで探す</span><span class="nav-short">近く</span>';button.addEventListener('click',()=>navigateTo('nearby'));document.querySelector('.primary-nav').insertBefore(button,document.querySelector('[data-screen="links"]')); }
async function nearbyInit() {
  if(nearbyReady){ try{await nearbyLoadSavedAddress();}catch(error){nearbySetStatus(`保存した住所を読み込めませんでした：${error.message}`,true,'nearby-maps-status');} return; } nearbyReady=true; nearbyAddNavigation(); nearbyBuildMapButtons(); nearby$('nearby-mode-registered').addEventListener('click',()=>nearbySetMode('registered')); nearby$('nearby-mode-maps').addEventListener('click',()=>nearbySetMode('maps')); nearby$('nearby-search').addEventListener('click',()=>nearbySearch()); nearby$('nearby-search-current').addEventListener('click',()=>nearbySearch('current')); document.querySelectorAll('input[name="nearby-maps-origin"]').forEach(radio=>radio.addEventListener('change',nearbyToggleMapsAddress));
  nearby$('nearby-address-save').addEventListener('click',async()=>{ const button=nearby$('nearby-address-save'); button.disabled=true; nearbySetStatus('住所の位置を確認しています…',false,'nearby-maps-status'); try{ const address=await nearbySaveAddress(nearby$('nearby-address').value.trim()); nearbySetStatus(`${address}を登録住所として保存しました。`,false,'nearby-maps-status'); }catch(error){ nearbySetStatus(error.message,true,'nearby-maps-status'); }finally{button.disabled=false;} });
  nearby$('nearby-use-current').addEventListener('click',async()=>{ const button=nearby$('nearby-use-current'); button.disabled=true; nearbySetStatus('現在地を取得しています…',false,'nearby-maps-status'); try{nearbyCurrentCenter=await nearbyCurrentPosition(); document.querySelector('input[name="nearby-maps-origin"][value="current"]').checked=true; nearbyToggleMapsAddress(); nearbySetStatus('現在地を検索の中心に使用します。現在地は保存しません。',false,'nearby-maps-status');}catch(error){nearbySetStatus(error.message,true,'nearby-maps-status');}finally{button.disabled=false;} });
  nearby$('nearby-address-cancel').addEventListener('click',()=>{nearby$('nearby-address').value=nearbySavedAddress; nearbySetStatus('住所の変更を取り消しました。',false,'nearby-maps-status');}); nearby$('nearby-candidate-toggle').addEventListener('click',()=>nearbyToggleCandidate(nearby$('nearby-candidate-form').hidden)); nearby$('candidate-cancel').addEventListener('click',()=>{nearbyResetCandidateForm();nearbyToggleCandidate(false);}); nearby$('nearby-candidate-form').addEventListener('submit',nearbySaveCandidate); try{ await nearbyLoadSavedAddress(); }catch(error){ nearbySetStatus(`保存した住所を読み込めませんでした：${error.message}`,true,'nearby-maps-status'); }
}
function nearbyReset(){ nearbySavedAddress=''; nearbyCurrentCenter=null; nearbyEditingCandidate=null; nearbyLastOrigin=null; nearbyLastCondition=null; if(nearby$('nearby-address')) nearby$('nearby-address').value=''; }
window.KASI_NEARBY={init:nearbyInit,reset:nearbyReset}; nearbyAddNavigation();
