'use strict';
// User-triggered URL searches only. No Google Maps Platform API or API key is used.
const KASI_MAP_SEARCHES = [
  ['リハビリを探す','リハビリ'],['リハビリ科を探す','リハビリテーション科'],['整形外科を探す','整形外科 リハビリ'],
  ['義肢装具店を探す','義肢装具'],['補装具店を探す','補装具'],['障害者支援を探す','障害者支援施設'],
  ['通所リハビリを探す','通所リハビリ'],['訪問リハビリを探す','訪問リハビリ'],['装具外来を探す','装具外来'],['脳卒中リハビリを探す','脳卒中リハビリ']
];
const KASI_NEARBY_GEOCODER = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const nearby$ = id => document.getElementById(id);
let nearbyReady = false, nearbySavedAddress = '', nearbyCurrentCenter = null;
function nearbySetStatus(text, error = false, id = 'nearby-maps-status') { const status = nearby$(id); status.textContent = text; status.classList.toggle('error', error); }
function nearbyCoordinates(latitude, longitude) { if (latitude == null || longitude == null || latitude === '' || longitude === '') return null; const lat = Number(latitude), lng = Number(longitude); return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat, lng} : null; }
function nearbyCurrentPosition() {
  if (!navigator.geolocation) return Promise.reject(new Error('現在地を取得できませんでした。住所から検索してください。'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    position => resolve({lat:position.coords.latitude,lng:position.coords.longitude,label:'現在地'}),
    error => reject(new Error(error?.code === 1 ? '位置情報を許可するか、住所を使用してください。' : '現在地を取得できませんでした。住所から検索してください。')),
    {enableHighAccuracy:false,timeout:10000,maximumAge:300000}
  ));
}
async function nearbyGeocodeAddress(address) { const response = await fetch(`${KASI_NEARBY_GEOCODER}?q=${encodeURIComponent(address)}`); if (!response.ok) throw new Error('住所を確認し、都道府県から入力してください。'); const rows = await response.json(), coordinates = nearbyCoordinates(rows?.[0]?.geometry?.coordinates?.[1],rows?.[0]?.geometry?.coordinates?.[0]); if (!coordinates) throw new Error('住所を確認し、都道府県から入力してください。'); return {...coordinates,label:address}; }
function nearbyMapsSearchUrl(keyword, center) { const location = center.address || `${center.lat},${center.lng}`; return `https://www.google.com/maps/search/?${new URLSearchParams({api:'1',query:`${keyword} ${location}`}).toString()}`; }
async function nearbyLoadSavedAddress() { const address=await window.KASI_PROFILE?.loadNearbyAddress?.(); nearbySavedAddress=address||''; nearby$('nearby-address').value=nearbySavedAddress; nearby$('nearby-address-required').hidden=Boolean(nearbySavedAddress); }
async function nearbySaveAddress(address) { if (!address) throw new Error('検索する住所を入力してください。'); await nearbyGeocodeAddress(address); if(address!==nearbySavedAddress){ if(!window.KASI_PROFILE?.saveNearbyAddress)throw new Error('住所を保存する準備ができていません。画面を再読み込みしてください。'); await window.KASI_PROFILE.saveNearbyAddress(address); nearbySavedAddress=address; } nearby$('nearby-address-required').hidden=true; return address; }
function nearbyToggleMapsAddress() { nearby$('nearby-maps-address-field').hidden=document.querySelector('input[name="nearby-maps-origin"]:checked')?.value==='current'; }
async function nearbyOpenMaps(keyword) {
  const mode=document.querySelector('input[name="nearby-maps-origin"]:checked')?.value, address=nearby$('nearby-address').value.trim(); nearbySetStatus('Google Mapsを開く準備をしています…');
  try { const center=mode==='current' ? (nearbyCurrentCenter || await nearbyCurrentPosition()) : {address:address || nearbySavedAddress}; if(!center.address && center.lat==null) throw new Error('検索する住所を入力してください。'); const url=nearbyMapsSearchUrl(keyword,center); const opened=window.open(url,'_blank'); if(opened) opened.opener=null; const fallback=nearby$('nearby-map-fallback'); fallback.href=url; fallback.hidden=Boolean(opened); nearbySetStatus(opened ? 'Google Mapsを新しい画面で開きました。' : 'Google Mapsを開けませんでした。下のリンクからブラウザで開いてください。',!opened); } catch(error){ nearbySetStatus(error.message||'Google Mapsを開けませんでした。',true); }
}
function nearbyBuildMapButtons() { const container=nearby$('nearby-map-buttons'); for(const [label,keyword] of KASI_MAP_SEARCHES){ const button=document.createElement('button'); button.type='button'; button.className='nearby-map-search-button'; button.textContent=label; button.dataset.keyword=keyword; button.addEventListener('click',()=>nearbyOpenMaps(keyword)); container.append(button); } }
function nearbyToday() { const now=new Date(), local=new Date(now.getTime()-now.getTimezoneOffset()*60000); return local.toISOString().slice(0,10); }
function nearbyToggleCandidate(open) { const form=nearby$('nearby-candidate-form'),button=nearby$('nearby-candidate-toggle'); form.hidden=!open; button.setAttribute('aria-expanded',String(open)); button.textContent=open?'入力欄を閉じる':'候補施設を登録'; if(open){ nearby$('candidate-checked-on').value ||= nearbyToday(); nearby$('candidate-name').focus(); } }
function nearbyCandidateError(error) { const message=error?.message||''; return /schema cache|could not find.*kasi_candidate_facilities/i.test(message) ? '候補施設の保存先が準備されていません。管理者に候補施設用データベース設定の適用を依頼してください。' : (message||'候補施設を保存できませんでした。'); }
async function nearbySaveCandidate(event) {
  event.preventDefault(); const form=event.currentTarget,button=event.submitter; button.disabled=true; nearbySetStatus('候補施設を保存しています…',false,'candidate-status');
  try { const value=id=>nearby$(id).value.trim(); const body={name:value('candidate-name'),facility_type:value('candidate-type'),address:value('candidate-address')||null,phone:value('candidate-phone')||null,google_maps_url:value('candidate-maps-url')||null,consultation_topic:value('candidate-consultation')||null,note:value('candidate-note')||null,checked_on:value('candidate-checked-on'),latitude:null,longitude:null};
    if(!body.name||!body.facility_type||!body.checked_on) throw new Error('施設名、施設種別、確認日を入力してください。'); if(body.google_maps_url && !/^https?:\/\//i.test(body.google_maps_url)) throw new Error('Google Maps URLは http:// または https:// から入力してください。'); await window.KASI_API.insert('kasi_candidate_facilities',body); form.reset(); nearby$('candidate-checked-on').value=nearbyToday(); nearbySetStatus('候補施設を保存しました。',false,'candidate-status');
  } catch(error){ nearbySetStatus(nearbyCandidateError(error),true,'candidate-status'); } finally{ button.disabled=false; }
}
function nearbyAddNavigation() { if(document.querySelector('[data-screen="nearby"]'))return; const button=document.createElement('button'); button.type='button';button.className='screen-link nearby-nav-link';button.dataset.screen='nearby';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s7-6.2 7-12A7 7 0 1 0 5 9c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg><span class="nav-long">近くで探す</span><span class="nav-short">近く</span>';button.addEventListener('click',()=>navigateTo('nearby'));document.querySelector('.primary-nav').insertBefore(button,document.querySelector('[data-screen="links"]')); }
async function nearbyInit() {
  if(nearbyReady){ try{await nearbyLoadSavedAddress();}catch(error){nearbySetStatus(`保存した住所を読み込めませんでした：${error.message}`,true);} return; } nearbyReady=true; nearbyAddNavigation(); nearbyBuildMapButtons(); document.querySelectorAll('input[name="nearby-maps-origin"]').forEach(radio=>radio.addEventListener('change',nearbyToggleMapsAddress));
  nearby$('nearby-address-save').addEventListener('click',async()=>{ const button=nearby$('nearby-address-save'); button.disabled=true; nearbySetStatus('住所の位置を確認しています…'); try{ const address=await nearbySaveAddress(nearby$('nearby-address').value.trim()); nearbySetStatus(`${address}を登録住所として保存しました。`); }catch(error){ nearbySetStatus(error.message,true); }finally{button.disabled=false;} });
  nearby$('nearby-use-current').addEventListener('click',async()=>{ const button=nearby$('nearby-use-current'); button.disabled=true; nearbySetStatus('現在地を取得しています…'); try{nearbyCurrentCenter=await nearbyCurrentPosition(); document.querySelector('input[name="nearby-maps-origin"][value="current"]').checked=true; nearbyToggleMapsAddress(); nearbySetStatus('現在地を検索の中心に使用します。現在地は保存しません。');}catch(error){nearbySetStatus(error.message,true);}finally{button.disabled=false;} });
  nearby$('nearby-address-cancel').addEventListener('click',()=>{nearby$('nearby-address').value=nearbySavedAddress; nearbySetStatus('住所の変更を取り消しました。');}); nearby$('nearby-candidate-toggle').addEventListener('click',()=>nearbyToggleCandidate(nearby$('nearby-candidate-form').hidden)); nearby$('candidate-cancel').addEventListener('click',()=>{nearby$('nearby-candidate-form').reset();nearbyToggleCandidate(false);}); nearby$('nearby-candidate-form').addEventListener('submit',nearbySaveCandidate); try{ await nearbyLoadSavedAddress(); }catch(error){ nearbySetStatus(`保存した住所を読み込めませんでした：${error.message}`,true); }
}
function nearbyReset(){ nearbySavedAddress=''; nearbyCurrentCenter=null; if(nearby$('nearby-address')) nearby$('nearby-address').value=''; }
window.KASI_NEARBY={init:nearbyInit,reset:nearbyReset}; nearbyAddNavigation();
