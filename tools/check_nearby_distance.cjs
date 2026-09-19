// Isolated tests: no live account, location or external API access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('kasisougu/static/nearby-search.js','utf8');
const context = vm.createContext({
  URLSearchParams, window:{}, document:{querySelector:() => ({})}
});
vm.runInContext(source,context);
const run = expression => vm.runInContext(expression,context);
(async () => {
  assert.equal(run('nearbyCoordinates(null,139)'),null);
  assert.equal(run('nearbyCoordinates(91,139)'),null);
  assert.equal(run('nearbyStraightLineMeters({lat:0,lng:0},{lat:0,lng:0})'),0);
  assert.ok(Math.abs(run('nearbyStraightLineMeters({lat:0,lng:0},{lat:0,lng:1})') - 111195) < 1);
  let calls = 0;
  context.window.KASI_API = {select:async (table, query) => {
    assert.equal(table,'kasi_nearby_facilities');
    const params = new URLSearchParams(query);
    assert.equal(params.get('purpose_codes'),'cs.{rehabilitation}');
    calls++;
    const offset = Number(params.get('offset'));
    if (offset === 0) return Array.from({length:100},(_,i) => ({id:String(i),name:'遠方',latitude:10,longitude:0,purpose_codes:['rehabilitation']}));
    if (offset === 100) return [{id:'near',name:'近く',latitude:0.001,longitude:0,purpose_codes:['rehabilitation']}];
    return [];
  }};
  const rows = await run('nearbyFindFacilities({lat:0,lng:0},{purpose:"rehabilitation",radius:10000})');
  assert.equal(calls,3);
  assert.equal(rows.length,1); // Applies radius to every DB record.
  assert.equal(rows[0].name,'近く'); // Nearest record is beyond the first page.
  const url = new URL(run('nearbyDirectionsUrl({lat:35,lng:139},{location:{lat:36,lng:140}})'));
  assert.equal(url.searchParams.get('api'),'1');
  assert.equal(url.searchParams.get('origin'),'35,139');
  assert.equal(url.searchParams.get('destination'),'36,140');
  context.window.KASI_API.select = async () => { throw Error('offline'); };
  await assert.rejects(run('nearbyFindFacilities({lat:0,lng:0},{purpose:"",radius:10000})'),/取得できません/);
  context.window.KASI_API.select = async () => [];
  assert.equal((await run('nearbyFindFacilities({lat:0,lng:0},{purpose:"",radius:Infinity})')).length,0);
  assert.doesNotMatch(source,/overpass|openstreetmap|VERIFIED_FACILITIES|maps\.googleapis/i);
  console.log('PASS: distance, coordinate validation, pagination, radius, Maps URL, empty and error states, no fixed fallback or paid Maps API.');
})().catch(error => { console.error(error); process.exitCode = 1; });
