'use strict';
// Searches are user-triggered. No Google Maps Platform API or key is used.
const KASI_NEARBY_PURPOSES = {manufacture:'装具の製作',repair:'修理',fitting:'適合確認',rehabilitation:'リハビリ',consultation:'制度相談'};
const KASI_NEARBY_GEOCODER = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const nearby$ = id => document.getElementById(id);
let nearbyReady = false, nearbySavedAddress = '';
function nearbySetStatus(text, error = false) { const status = nearby$('nearby-status'); status.textContent = text; status.classList.toggle('error', error); }
function nearbyCoordinates(latitude, longitude) { if (latitude == null || longitude == null || latitude === '' || longitude === '') return null; const lat = Number(latitude), lng = Number(longitude); return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat, lng} : null; }
function nearbyDistance(meters) { return meters >= 1000 ? `約 ${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km` : `約 ${Math.round(meters)} m`; }
function nearbyStraightLineMeters(origin, destination) { const r = value => value * Math.PI / 180, lat = r(destination.lat - origin.lat), lng = r(destination.lng - origin.lng), a = Math.sin(lat / 2) ** 2 + Math.cos(r(origin.lat)) * Math.cos(r(destination.lat)) * Math.sin(lng / 2) ** 2; return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0,1 - a))); }
function nearbyCurrentPosition() { if (!navigator.geolocation) return Promise.reject(new Error('この端末では現在地を取得できません。登録した住所を選んでください。')); return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(position => resolve({lat:position.coords.latitude,lng:position.coords.longitude,label:'現在地'}), () => reject(new Error('現在地を取得できませんでした。位置情報の利用を許可するか、登録した住所を選んでください。')), {enableHighAccuracy:false,timeout:10000,maximumAge:300000})); }
async function nearbyGeocodeAddress(address) { const response = await fetch(`${KASI_NEARBY_GEOCODER}?q=${encodeURIComponent(address)}`); if (!response.ok) throw new Error('登録した住所の位置を取得できませんでした。住所を見直すか、現在地を選んでください。'); const rows = await response.json(), coordinates = nearbyCoordinates(rows?.[0]?.geometry?.coordinates?.[1],rows?.[0]?.geometry?.coordinates?.[0]); if (!coordinates) throw new Error('登録した住所の位置を確認できませんでした。住所を見直すか、現在地を選んでください。'); return {...coordinates,label:address}; }
async function nearbyOrigin(condition) { if (condition.origin === 'current') return nearbyCurrentPosition(); if (!condition.address) throw new Error('登録した住所を入力してから「登録した住所を使う」を選んでください。'); return nearbyGeocodeAddress(condition.address); }
async function nearbyFindFacilities(origin, condition) {
  // Read every matching page before sorting; an alphabetical limit misses nearer facilities.
  const facilities = [];
  const size = 100;
  for (let offset = 0; ; ) {
    const query = new URLSearchParams({
      select:'id,name,address,latitude,longitude,phone,website_url,purpose_codes',
      is_active:'eq.true', order:'id.asc', limit:String(size), offset:String(offset)
    });
    if (condition.purpose) query.set('purpose_codes', 'cs.{' + condition.purpose + '}');
    let rows;
    try { rows = await window.KASI_API.select('kasi_nearby_facilities', query.toString()); }
    catch (error) { throw new Error('施設一覧を取得できませんでした。通信と施設データの登録状況を確認してください。'); }
    if (!Array.isArray(rows)) throw new Error('施設一覧の応答を確認できませんでした。');
    for (const row of rows) {
      const location = nearbyCoordinates(row.latitude, row.longitude);
      if (!location) continue;
      const distanceMeters = nearbyStraightLineMeters(origin, location);
      if (distanceMeters <= condition.radius) facilities.push({...row, location, distanceMeters,
        category:(row.purpose_codes || []).map(code => KASI_NEARBY_PURPOSES[code]).filter(Boolean).join('・') || '登録施設'});
    }
    if (!rows.length) break;
    offset += rows.length;
  }
  return facilities.sort((a,b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name,'ja'));
}
function nearbyDirectionsUrl(origin, item) { return `https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',origin:`${origin.lat},${origin.lng}`,destination:`${item.location.lat},${item.location.lng}`}).toString()}`; }
function nearbyRenderResults(items, origin) { const container = nearby$('nearby-results'); container.replaceChildren(); if (!items.length) { const empty = document.createElement('div'); empty.className = 'nearby-empty'; empty.textContent = '条件に合う登録施設がありません。範囲・目的を変えるか、施設一覧への追加を運営者に依頼してください。'; container.append(empty); return; } items.forEach((item,index) => { const article = document.createElement('article'); article.className = 'nearby-card'; const meta = document.createElement('p'); meta.className = 'nearby-category'; meta.textContent = item.category; const heading = document.createElement('h3'); heading.textContent = item.name; const details = document.createElement('p'); details.className = 'nearby-details'; details.textContent = `直線距離：${nearbyDistance(item.distanceMeters)}`; const address = document.createElement('p'); address.textContent = item.address; const phone = document.createElement('p'); phone.className = 'nearby-source'; phone.textContent = item.phone ? `電話：${item.phone}` : '電話番号は施設サイトまたは地図で確認してください。'; const links = document.createElement('div'); links.className = 'nearby-links'; if (/^https?:\/\//i.test(item.website_url || '')) { const website = document.createElement('a'); website.className = 'resource-link'; website.href = item.website_url; website.target = '_blank'; website.rel = 'noopener noreferrer'; website.textContent = '施設サイトを開く'; links.append(website); } const map = document.createElement('a'); map.className = 'resource-link nearby-map-link'; map.href = nearbyDirectionsUrl(origin,item); map.target = '_blank'; map.rel = 'noopener noreferrer'; map.textContent = 'Google Mapsで経路を確認'; links.append(map); const rank = document.createElement('span'); rank.className = 'nearby-rank'; rank.textContent = `${index+1}`; article.append(rank,meta,heading,details,address,phone,links); container.append(article); }); }
function nearbyToggleAddressField() { const field=nearby$('nearby-address-field'),button=nearby$('nearby-address-toggle'),opening=field.hidden; field.hidden=!opening; button.setAttribute('aria-expanded',String(opening)); button.textContent=opening?'住所入力を閉じる':'住所を入力（任意）'; if(opening) nearby$('nearby-address').focus(); }
function nearbyShowAddressField() { const field=nearby$('nearby-address-field'); if(!field.hidden)return; field.hidden=false; nearby$('nearby-address-toggle').setAttribute('aria-expanded','true'); nearby$('nearby-address-toggle').textContent='住所入力を閉じる'; }
async function nearbyLoadSavedAddress() { const address=await window.KASI_PROFILE?.loadNearbyAddress?.(); nearbySavedAddress=address||''; if(nearbySavedAddress){nearby$('nearby-address').value=nearbySavedAddress;nearbyShowAddressField();} }
async function nearbySaveAddress(address) { if(address===nearbySavedAddress)return; if(!window.KASI_PROFILE?.saveNearbyAddress)throw new Error('住所を保存する準備ができていません。画面を再読み込みしてください。'); await window.KASI_PROFILE.saveNearbyAddress(address); nearbySavedAddress=address; }
async function nearbySearch() {
  const condition = {address:nearby$('nearby-address').value.trim(),purpose:nearby$('nearby-purpose').value,
    radius:Number(nearby$('nearby-radius').value),origin:document.querySelector('input[name="nearby-origin"]:checked')?.value};
  const button = nearby$('nearby-search');
  button.disabled = true;
  nearby$('nearby-results').replaceChildren();
  nearbySetStatus('登録施設までの直線距離を確認しています…');
  try {
    if (condition.origin === 'address' && !condition.address) throw new Error('出発地の住所を入力してください。');
    await nearbySaveAddress(condition.address);
    const origin = await nearbyOrigin(condition);
    const facilities = await nearbyFindFacilities(origin,condition);
    nearbyRenderResults(facilities,origin);
    nearbySetStatus(origin.label + 'から、条件に合う登録施設を近い順に' + facilities.length + '件表示しています。距離は直線距離です。');
  } catch (error) {
    nearby$('nearby-results').replaceChildren();
    nearbySetStatus(error.message || '検索できませんでした。',true);
  } finally { button.disabled = false; }
}
function nearbyAddNavigation() { if(document.querySelector('[data-screen="nearby"]'))return; const button=document.createElement('button'); button.type='button';button.className='screen-link nearby-nav-link';button.dataset.screen='nearby';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s7-6.2 7-12A7 7 0 1 0 5 9c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg><span class="nav-long">近くで探す</span><span class="nav-short">近く</span>';button.addEventListener('click',()=>navigateTo('nearby'));document.querySelector('.primary-nav').insertBefore(button,document.querySelector('[data-screen="links"]')); }
async function nearbyInit() { if(nearbyReady)return; nearbyReady=true;nearbyAddNavigation();nearby$('nearby-address-toggle').addEventListener('click',nearbyToggleAddressField);nearby$('nearby-search').addEventListener('click',nearbySearch);try{await nearbyLoadSavedAddress();}catch(error){nearbySetStatus(`保存した住所を読み込めませんでした：${error.message}`,true);} }
window.KASI_NEARBY={init:nearbyInit};nearbyAddNavigation();
