// Run after check_redesign.js. Does not access live user data.
async page => {
  const assert = (ok,m) => { if (!ok) throw new Error(m); };
  let patches = [];
  page.on('request', r=>{if(r.method()==='PATCH') patches.push(r.url());});
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.locator('#record-picker').selectOption('orthosis:orthosis-4');
  await page.evaluate(()=>{window.confirm=m=>{window.deletePrompt=m;return false;};});
  await page.locator('#record-delete').click();
  assert(patches.length===0,'Cancellation sent a mutation');
  assert(await page.evaluate(()=>window.deletePrompt.includes('その他（2）') && window.deletePrompt.includes('自分の装具')),'Wrong target in prompt');
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.locator('#record-delete').click();
  await page.waitForFunction(()=>!document.getElementById('record-delete').disabled);
  assert(patches.length===1 && patches[0].includes('kasi_user_orthoses?id=eq.orthosis-4'),'Wrong deletion target');
  assert(await page.locator('#record-picker option[value="orthosis:orthosis-4"]').count()===0,'Deleted orthosis still in picker');
  assert(await page.locator('#record-picker option[value="orthosis:orthosis-3"]').count()===1,'Other same-name orthosis removed');
  await page.locator('.sidebar-secondary [data-screen=orthosis]').click();
  assert(!(await page.evaluate(()=>orthoses.some(o=>o.id==='orthosis-4'))),'Deleted orthosis remains in My Orthoses');
  await page.locator('.primary-nav [data-screen=record]').click();
  await page.waitForFunction(()=>screenLoads.size===0);
  await page.locator('#record-picker').selectOption('record-1');
  await page.locator('#record-delete').click();
  await page.waitForFunction(()=>!document.getElementById('record-delete').disabled);
  assert(await page.locator('#record-picker option[value="record-1"]').count()===0,'Deleted record remains');
  assert(await page.locator('#compare-first option[value="record-1"]').count()===0,'Deleted record remains in comparison');
  assert(await page.locator('#record-picker option[value="orthosis:orthosis-2"]').count()===1,'Underlying orthosis should remain');
  // A version conflict must keep the selected item and show failure.
  await page.locator('#record-picker').selectOption('record-2');
  await page.route('**/kasi_usage_records?**', async route=>{
    if(route.request().method()==='PATCH') return route.fulfill({contentType:'application/json',body:'[]'});
    await route.fallback();
  });
  await page.locator('#record-delete').click();
  await page.waitForFunction(()=>!document.getElementById('record-delete').disabled);
  assert((await page.locator('#record-status').textContent()).includes('削除できませんでした'),'Conflict not shown');
  assert(await page.locator('#record-picker').inputValue()==='record-2','Selection lost after conflict');
  return 'PASS: cancel, exact unrecorded orthosis deletion, My Orthoses refresh, record-only deletion, comparison refresh, conflict recovery';
}
