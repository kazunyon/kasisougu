// Isolated tests: no live account, location or external API access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('kasisougu/static/nearby-search.js','utf8');
const context = vm.createContext({URLSearchParams,window:{},document:{querySelector:()=>({})}});
vm.runInContext(source,context);
const run = expression => vm.runInContext(expression,context);

assert.equal(run('nearbyCoordinates(null,139)'),null);
assert.equal(run('nearbyCoordinates(91,139)'),null);
const addressUrl = new URL(run("nearbyMapsSearchUrl('リハビリテーション科',{address:'さいたま市見沼区堀崎町1592'})"));
assert.equal(addressUrl.searchParams.get('api'),'1');
assert.equal(addressUrl.searchParams.get('query'),'リハビリテーション科 さいたま市見沼区堀崎町1592');
const currentUrl = new URL(run("nearbyMapsSearchUrl('義肢装具',{lat:35.9,lng:139.6})"));
assert.equal(currentUrl.searchParams.get('query'),'義肢装具 35.9,139.6');
assert.equal(run('KASI_MAP_SEARCHES.length'),10);
assert.match(run("nearbyCandidateError(new Error(\"Could not find the table 'public.kasi_candidate_facilities' in the schema cache\"))"),/保存先が準備されていません/);
assert.doesNotMatch(source,/kasi_nearby_facilities|nearbyStraightLineMeters|nearbyFindFacilities|nearbyDirectionsUrl|maps\.googleapis/i);
console.log('PASS: Maps-only search, 10 URL searches, Japanese encoding, current coordinates, and candidate-table error guidance.');
