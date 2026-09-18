'use strict';
// This first release intentionally uses only manually confirmed public sources.
// It does not call a map, routing, or places API from the browser.
const KASI_NEARBY_PREFECTURES = {
  '北海道':['札幌市','旭川市','函館市'], '青森県':['青森市','八戸市','弘前市'], '岩手県':['盛岡市','一関市'], '宮城県':['仙台市','石巻市'], '秋田県':['秋田市','横手市'], '山形県':['山形市','鶴岡市'], '福島県':['福島市','郡山市','いわき市'],
  '茨城県':['水戸市','つくば市','日立市'], '栃木県':['宇都宮市','小山市'], '群馬県':['前橋市','高崎市'], '埼玉県':['さいたま市','上尾市','川口市','川越市','所沢市','越谷市','熊谷市'], '千葉県':['千葉市','船橋市','柏市'], '東京都':['千代田区','新宿区','八王子市'], '神奈川県':['横浜市','川崎市','相模原市'],
  '新潟県':['新潟市','長岡市'], '富山県':['富山市','高岡市'], '石川県':['金沢市','小松市'], '福井県':['福井市','敦賀市'], '山梨県':['甲府市','甲斐市'], '長野県':['長野市','松本市'], '岐阜県':['岐阜市','大垣市'], '静岡県':['静岡市','浜松市','沼津市'], '愛知県':['名古屋市','豊田市'], '三重県':['津市','四日市市'],
  '滋賀県':['大津市','草津市'], '京都府':['京都市','宇治市'], '大阪府':['大阪市','堺市','東大阪市'], '兵庫県':['神戸市','姫路市','尼崎市'], '奈良県':['奈良市','橿原市'], '和歌山県':['和歌山市','田辺市'], '鳥取県':['鳥取市','米子市'], '島根県':['松江市','出雲市'], '岡山県':['岡山市','倉敷市'], '広島県':['広島市','福山市'], '山口県':['山口市','下関市'],
  '徳島県':['徳島市','阿南市'], '香川県':['高松市','丸亀市'], '愛媛県':['松山市','今治市'], '高知県':['高知市','南国市'], '福岡県':['福岡市','北九州市','久留米市'], '佐賀県':['佐賀市','唐津市'], '長崎県':['長崎市','佐世保市'], '熊本県':['熊本市','八代市'], '大分県':['大分市','別府市'], '宮崎県':['宮崎市','延岡市'], '鹿児島県':['鹿児島市','霧島市'], '沖縄県':['那覇市','沖縄市']
};
const KASI_NEARBY_PURPOSES = {manufacture:'装具の製作',repair:'修理',fitting:'適合確認',rehabilitation:'リハビリ',consultation:'制度相談'};
const KASI_NEARBY_TRANSPORT = {car:'車',public_transport:'公共交通',welfare_taxi:'福祉タクシー',electric_wheelchair:'電動車いす'};
const KASI_NEARBY_FACILITIES = [
  {name:'埼玉県総合リハビリテーションセンター',category:'義肢装具製作所・装具店',prefecture:'埼玉県',municipalities:['上尾市','さいたま市'],minutes:{car:35,public_transport:45,welfare_taxi:40,electric_wheelchair:90},purposes:['manufacture','repair','fitting','rehabilitation','consultation'],summary:'補装具製作施設で、義肢装具の製作・修理・相談に対応。装具外来は要予約です。',url:'https://www.pref.saitama.lg.jp/rihasen/annai/fukushikogaku/gishisougu.html',source:'埼玉県公式'},
  {name:'国立障害者リハビリテーションセンター病院 補装具診・装具外来',category:'装具外来のある医療機関',prefecture:'埼玉県',municipalities:['所沢市','さいたま市'],minutes:{car:60,public_transport:75,welfare_taxi:65,electric_wheelchair:90},purposes:['manufacture','fitting','rehabilitation'],summary:'医師・義肢装具士などが参加し、下肢装具等の検討・製作・適合を行う外来です。',url:'https://www.rehab.go.jp/hospital/department/consultation/senmon/hosougu/',source:'国立障害者リハビリテーションセンター公式'},
  {name:'さいたま市障害者総合支援センター',category:'障害者支援施設',prefecture:'埼玉県',municipalities:['さいたま市'],minutes:{car:25,public_transport:35,welfare_taxi:30,electric_wheelchair:75},purposes:['consultation','rehabilitation'],summary:'生活・就労・社会参加などの支援を、地域の関係機関と連携して行う総合支援センターです。',url:'https://www.city.saitama.lg.jp/006/015/050/003/p054196.html',source:'さいたま市公式'},
  {name:'さいたま市 障害者生活支援センター',category:'自治体の相談窓口',prefecture:'埼玉県',municipalities:['さいたま市'],minutes:{car:20,public_transport:30,welfare_taxi:25,electric_wheelchair:60},purposes:['consultation'],summary:'障害のある方や家族の相談に対応し、必要に応じて関係機関との連携や専門機関の紹介を行います。',url:'https://www.city.saitama.lg.jp/002/003/004/003/005/p002725.html',source:'さいたま市公式'},
  {name:'さいたま市 補装具の交付・修理相談',category:'自治体の相談窓口',prefecture:'埼玉県',municipalities:['さいたま市'],minutes:{car:20,public_transport:30,welfare_taxi:25,electric_wheelchair:60},purposes:['repair','consultation'],summary:'補装具の購入・修理の費用支給について、各区の福祉事務所で相談できます。',url:'https://www.city.saitama.lg.jp/002/003/004/003/006/p001359.html',source:'さいたま市公式'}
];
let nearbyReady = false;
const nearby$ = id => document.getElementById(id);
function nearbyOption(value, text) { const option = document.createElement('option'); option.value = value; option.textContent = text; return option; }
function nearbyPopulateMunicipalities() {
  const prefecture = nearby$('nearby-prefecture').value;
  const municipality = nearby$('nearby-municipality'); municipality.replaceChildren(nearbyOption('', '市区町村を選択'));
  (KASI_NEARBY_PREFECTURES[prefecture] || []).forEach(name => municipality.append(nearbyOption(name, name)));
  municipality.disabled = !prefecture;
}
function nearbyTravelMinutes(item, transport) { return item.minutes[transport] || item.minutes.car; }
function nearbyRenderResults(items, condition) {
  const container = nearby$('nearby-results'); container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'nearby-empty';
    empty.textContent = 'この条件に一致する確認済みの候補は、まだ登録されていません。リンク集や自治体の公式窓口もご確認ください。'; container.append(empty); return;
  }
  items.forEach((item, index) => {
    const article = document.createElement('article'); article.className = 'nearby-card';
    const heading = document.createElement('h3'); heading.textContent = item.name;
    const meta = document.createElement('p'); meta.className = 'nearby-category'; meta.textContent = item.category;
    const details = document.createElement('p'); details.className = 'nearby-details'; details.textContent = `${item.prefecture}・${item.municipalities[0]}｜${KASI_NEARBY_TRANSPORT[condition.transport]}で約${nearbyTravelMinutes(item, condition.transport)}分の目安`;
    const description = document.createElement('p'); description.textContent = item.summary;
    const source = document.createElement('p'); source.className = 'nearby-source'; source.textContent = `情報元：${item.source}`;
    const link = document.createElement('a'); link.className = 'resource-link'; link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '公式情報を確認する（新しいタブで開く）';
    const rank = document.createElement('span'); rank.className = 'nearby-rank'; rank.textContent = `${index + 1}`;
    article.append(rank, meta, heading, details, description, source, link); container.append(article);
  });
}
function nearbySearch() {
  const condition = {prefecture:nearby$('nearby-prefecture').value, municipality:nearby$('nearby-municipality').value, transport:nearby$('nearby-transport').value, duration:Number(nearby$('nearby-duration').value), purpose:nearby$('nearby-purpose').value};
  if (!condition.prefecture || !condition.municipality) { nearby$('nearby-status').textContent = '都道府県と市区町村を選んでください。'; return; }
  const results = KASI_NEARBY_FACILITIES.filter(item => item.prefecture === condition.prefecture && item.purposes.includes(condition.purpose) && nearbyTravelMinutes(item, condition.transport) <= condition.duration).sort((a, b) => {
    const aLocal = a.municipalities.includes(condition.municipality) ? 0 : 1, bLocal = b.municipalities.includes(condition.municipality) ? 0 : 1;
    return aLocal - bLocal || nearbyTravelMinutes(a, condition.transport) - nearbyTravelMinutes(b, condition.transport);
  }).slice(0, 5);
  nearbyRenderResults(results, condition);
  nearby$('nearby-status').textContent = `${condition.prefecture}${condition.municipality}・${KASI_NEARBY_PURPOSES[condition.purpose]}の候補を${results.length}件表示しています（最大5件）。`;
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
  const prefecture = nearby$('nearby-prefecture'); prefecture.replaceChildren(nearbyOption('', '都道府県を選択'));
  Object.keys(KASI_NEARBY_PREFECTURES).forEach(name => prefecture.append(nearbyOption(name, name)));
  prefecture.addEventListener('change', nearbyPopulateMunicipalities); nearby$('nearby-search').addEventListener('click', nearbySearch);
}
window.KASI_NEARBY = {init:nearbyInit};
nearbyAddNavigation();
