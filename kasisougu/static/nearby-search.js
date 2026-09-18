'use strict';
// Facility records are deliberately not bundled. Municipalities are loaded per prefecture
// from the nationwide Japanese-addresses dataset, and facilities are searched on demand.
const KASI_NEARBY_PREFECTURES = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const KASI_NEARBY_PURPOSES = {
  manufacture:{label:'装具の製作',query:'義肢装具 製作所',category:'義肢装具製作所・装具店'},
  repair:{label:'修理',query:'義肢装具 修理',category:'義肢装具製作所・装具店'},
  fitting:{label:'適合確認',query:'装具外来',category:'装具外来のある医療機関'},
  rehabilitation:{label:'リハビリ',query:'理学療法 リハビリテーション',category:'理学療法・リハビリ施設'},
  consultation:{label:'制度相談',query:'障害者 相談支援',category:'自治体の相談窓口・障害者支援施設'}
};
const KASI_NEARBY_TRANSPORT = {
  car:{label:'車',mode:'DRIVING',note:''},
  public_transport:{label:'公共交通',mode:'TRANSIT',note:''},
  welfare_taxi:{label:'福祉タクシー',mode:'DRIVING',note:'車の経路を参考表示'},
  electric_wheelchair:{label:'電動車いす',mode:'WALKING',note:'徒歩経路を参考表示'}
};
// This endpoint permits browser cross-origin requests. It contains the nationwide
// prefecture-to-municipality list but no facility records.
const KASI_NEARBY_ADDRESS_API = 'https://geolonia.github.io/japanese-addresses/api/ja.json';
const nearby$ = id => document.getElementById(id);
let nearbyReady = false;
let nearbyMapsPromise = null;
const nearbyMunicipalities = new Map();

function nearbyOption(value, text) { const option = document.createElement('option'); option.value = value; option.textContent = text; return option; }
function nearbySetStatus(text, error = false) { const status = nearby$('nearby-status'); status.textContent = text; status.classList.toggle('error', error); }
function nearbyMapsKey() { return window.KASISOUGU_SUPABASE_CONFIG?.googleMapsApiKey || ''; }
function nearbyLoadMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (nearbyMapsPromise) return nearbyMapsPromise;
  const key = nearbyMapsKey();
  if (!key) return Promise.reject(new Error('地図検索の設定が未完了です。管理者は GOOGLE_MAPS_API_KEY を公開設定に追加してください。'));
  nearbyMapsPromise = new Promise((resolve, reject) => {
    const callbackName = '__kasiNearbyMapsReady';
    const fail = message => {
      delete window[callbackName];
      nearbyMapsPromise = null;
      reject(new Error(message));
    };
    const script = document.createElement('script');
    window[callbackName] = () => {
      delete window[callbackName];
      if (window.google?.maps?.importLibrary) resolve(window.google.maps);
      else fail('Google Maps の初期化に失敗しました。');
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=ja&region=JP&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => fail('Google Maps を読み込めませんでした。接続とAPIキーの設定を確認してください。');
    document.head.append(script);
  });
  return nearbyMapsPromise;
}
async function nearbyLoadMunicipalities() {
  const prefecture = nearby$('nearby-prefecture').value;
  const municipality = nearby$('nearby-municipality');
  municipality.replaceChildren(nearbyOption('', prefecture ? '市区町村を読み込み中…' : '市区町村を選択'));
  municipality.disabled = true;
  if (!prefecture) return;
  try {
    let cities = nearbyMunicipalities.get(prefecture);
    if (!cities) {
      const response = await fetch(KASI_NEARBY_ADDRESS_API);
      if (!response.ok) throw new Error('市区町村データを取得できませんでした。');
      const payload = await response.json();
      cities = (payload[prefecture] || []).map(name => ({name})).filter(city => city.name).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      if (!cities.length) throw new Error('市区町村データが見つかりませんでした。');
      nearbyMunicipalities.set(prefecture, cities);
    }
    municipality.replaceChildren(nearbyOption('', '市区町村を選択'), ...cities.map(city => nearbyOption(city.name, city.name)));
    municipality.disabled = false;
    nearbySetStatus(`${prefecture}の市区町村を${cities.length}件読み込みました。`);
  } catch (error) {
    municipality.replaceChildren(nearbyOption('', '市区町村を取得できませんでした'));
    nearbySetStatus(error.message || '市区町村を取得できませんでした。', true);
  }
}
function nearbySelectedCity() {
  const prefecture = nearby$('nearby-prefecture').value;
  const name = nearby$('nearby-municipality').value;
  return nearbyMunicipalities.get(prefecture)?.find(city => city.name === name) || null;
}
function nearbySearchText(condition) { return `${KASI_NEARBY_PURPOSES[condition.purpose].query} ${condition.prefecture}${condition.municipality}`; }
async function nearbyFindPlaces(maps, condition) {
  const {Place} = await maps.importLibrary('places');
  const {places = []} = await Place.searchByText({
    textQuery: nearbySearchText(condition),
    fields:['displayName','formattedAddress','location','googleMapsURI','websiteURI','nationalPhoneNumber','businessStatus'],
    maxResultCount:8,
    language:'ja', region:'JP'
  });
  return places.filter(place => place.location && place.displayName).map(place => ({
    name:place.displayName,
    address:place.formattedAddress || '',
    location:{lat:Number(place.location.lat()), lng:Number(place.location.lng())},
    mapsUrl:place.googleMapsURI || '', website:place.websiteURI || '', phone:place.nationalPhoneNumber || ''
  }));
}
function nearbyDuration(seconds) { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分`; }
function nearbyDistance(meters) { return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km` : `${Math.round(meters)} m`; }
async function nearbyRoute(maps, origin, destination, transport) {
  const {Route} = await maps.importLibrary('routes');
  const {routes = []} = await Route.computeRoutes({origin, destination, travelMode:transport.mode, fields:['durationMillis','distanceMeters'], region:'jp'});
  const route = routes[0];
  if (!route || !Number.isFinite(route.durationMillis)) return null;
  return {seconds:Math.round(route.durationMillis / 1000), duration:nearbyDuration(route.durationMillis / 1000), distance:Number.isFinite(route.distanceMeters) ? nearbyDistance(route.distanceMeters) : ''};
}
function nearbyRenderResults(items, condition) {
  const container = nearby$('nearby-results'); container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'nearby-empty';
    empty.textContent = '指定時間内の候補が見つかりませんでした。移動可能時間・目的を変えるか、Google Mapsで地域名を含めて検索してください。'; container.append(empty); return;
  }
  const purpose = KASI_NEARBY_PURPOSES[condition.purpose]; const transport = KASI_NEARBY_TRANSPORT[condition.transport];
  items.forEach((item, index) => {
    const article = document.createElement('article'); article.className = 'nearby-card';
    const heading = document.createElement('h3'); heading.textContent = item.name;
    const meta = document.createElement('p'); meta.className = 'nearby-category'; meta.textContent = purpose.category;
    const details = document.createElement('p'); details.className = 'nearby-details'; details.textContent = `${transport.label}で${item.route.duration}${item.route.distance ? `・${item.route.distance}` : ''}${transport.note ? `（${transport.note}）` : ''}`;
    const address = document.createElement('p'); address.textContent = item.address;
    const source = document.createElement('p'); source.className = 'nearby-source'; source.textContent = item.phone ? `電話：${item.phone}` : '電話番号はGoogle Mapsまたは施設サイトで確認してください。';
    const links = document.createElement('div'); links.className = 'nearby-links';
    if (item.website) { const website = document.createElement('a'); website.className = 'resource-link'; website.href = item.website; website.target = '_blank'; website.rel = 'noopener noreferrer'; website.textContent = '施設サイトを開く'; links.append(website); }
    if (item.mapsUrl) { const mapsLink = document.createElement('a'); mapsLink.className = 'resource-link'; mapsLink.href = item.mapsUrl; mapsLink.target = '_blank'; mapsLink.rel = 'noopener noreferrer'; mapsLink.textContent = 'Google Mapsで確認する'; links.append(mapsLink); }
    const rank = document.createElement('span'); rank.className = 'nearby-rank'; rank.textContent = `${index + 1}`;
    article.append(rank, meta, heading, details, address, source, links); container.append(article);
  });
}
async function nearbySearch() {
  const condition = {prefecture:nearby$('nearby-prefecture').value, municipality:nearby$('nearby-municipality').value, transport:nearby$('nearby-transport').value, duration:Number(nearby$('nearby-duration').value), purpose:nearby$('nearby-purpose').value};
  const city = nearbySelectedCity();
  if (!condition.prefecture || !condition.municipality || !city) { nearbySetStatus('都道府県と市区町村を選んでください。', true); return; }
  const button = nearby$('nearby-search'); button.disabled = true; nearby$('nearby-results').replaceChildren(); nearbySetStatus('施設と経路を検索しています…');
  try {
    const maps = await nearbyLoadMaps();
    const places = await nearbyFindPlaces(maps, condition);
    const origin = `${condition.prefecture}${condition.municipality}`;
    const transport = KASI_NEARBY_TRANSPORT[condition.transport];
    const routed = (await Promise.all(places.map(async place => ({...place, route:await nearbyRoute(maps, origin, place.location, transport)})))).filter(item => item.route && item.route.seconds <= condition.duration * 60).sort((a, b) => a.route.seconds - b.route.seconds).slice(0, 5);
    nearbyRenderResults(routed, condition);
    nearbySetStatus(`${condition.prefecture}${condition.municipality}・${KASI_NEARBY_PURPOSES[condition.purpose].label}の候補を${routed.length}件表示しています（最大5件）。`);
  } catch (error) {
    nearbyRenderResults([], condition); nearbySetStatus(error.message || '検索できませんでした。', true);
  } finally { button.disabled = false; }
}
function nearbyAddNavigation() {
  if (document.querySelector('[data-screen="nearby"]')) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'screen-link nearby-nav-link'; button.dataset.screen = 'nearby';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s7-6.2 7-12A7 7 0 1 0 5 9c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg><span class="nav-long">近くで探す</span><span class="nav-short">近く</span>';
  button.addEventListener('click', () => navigateTo('nearby'));
  document.querySelector('.primary-nav').insertBefore(button, document.querySelector('[data-screen="links"]'));
}
function nearbyInit() {
  if (nearbyReady) return; nearbyReady = true; nearbyAddNavigation();
  const prefecture = nearby$('nearby-prefecture'); prefecture.replaceChildren(nearbyOption('', '都道府県を選択'), ...KASI_NEARBY_PREFECTURES.map(name => nearbyOption(name, name)));
  prefecture.addEventListener('change', nearbyLoadMunicipalities); nearby$('nearby-search').addEventListener('click', nearbySearch);
}
window.KASI_NEARBY = {init:nearbyInit};
nearbyAddNavigation();
