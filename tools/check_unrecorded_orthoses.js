// Run after check_redesign.js with its five-orthosis/two-record fixtures.
async page => {
  const assert = (ok,m) => { if (!ok) throw new Error(m); };
  await page.evaluate(() => { window.confirm = () => true; });
  const options = page.locator('#record-picker option');
  assert(await options.count() === 6, 'Five entries plus placeholder required');
  const labels = await options.allTextContents();
  const values = await options.evaluateAll(items => items.map(item => item.value));
  assert(JSON.stringify(values) === JSON.stringify(['','record-1','orthosis:orthosis-3','orthosis:orthosis-4','record-2','orthosis:orthosis-5']), 'Picker keys must order trial, current use, then past; within each: date, type, and registered orthosis');
  assert(labels.filter(s=>s.includes('試用中')).length===3, 'Three trial orthoses required');
  assert(labels.filter(s=>s.includes('記録未入力')).length===3,'Three unrecorded orthoses required');
  assert(labels.some(s=>s.includes('その他（1）')) && labels.some(s=>s.includes('その他（2）')),'Duplicate names not distinguished');
  for (const id of ['orthosis-3','orthosis-4','orthosis-5']) {
    await page.locator('#record-picker').selectOption(`orthosis:${id}`);
    assert(await page.locator('#record-orthosis').inputValue()===id,'Wrong orthosis selected');
    assert(await page.locator('#record-note').inputValue()==='', 'Other record values leaked');
  }
  await page.locator('#record-picker').selectOption('orthosis:orthosis-4');
  await page.locator('#record-note').fill('2つ目のその他の記録');
  await page.locator('.primary-nav [data-screen=home]').click();
  await page.locator('.primary-nav [data-screen=record]').click();
  await page.waitForFunction(()=>screenLoads.size===0);
  assert(await page.locator('#record-picker').inputValue()==='orthosis:orthosis-4','Draft selection lost');
  assert(await page.locator('#record-note').inputValue()==='2つ目のその他の記録','Draft input lost');
  const response = page.waitForResponse(r=>r.url().endsWith('/rpc/kasi_save_usage_record'));
  await page.locator('#record-form button.primary').click();
  const savedRequest = (await response).request().postDataJSON();
  assert(savedRequest.p_id===null && savedRequest.p_record.user_orthosis_id==='orthosis-4','Must create only for selected orthosis');
  await page.waitForFunction(()=>!document.getElementById('record-save-comparison').disabled);
  assert(await options.count()===6,'Saved entry must replace placeholder');
  assert((await options.allTextContents()).filter(s=>s.includes('記録未入力')).length===2,'Wrong pending count');
  assert(!(await page.locator('#record-picker').inputValue()).startsWith('orthosis:'),'Saved record key missing');
  assert(await page.locator('#record-orthosis').inputValue()==='orthosis-4','Saved orthosis wrong');
  const needResponse = page.waitForResponse(r => r.url().includes('/kasi_user_needs') && r.request().method() === 'POST');
  await page.locator('#need-description').fill('使用記録から追加した困りごと');
  await page.locator('#need-form button.primary').click();
  const needRequest = (await needResponse).request().postDataJSON();
  assert(needRequest.user_orthosis_id==='orthosis-4','Need must be linked to the orthosis selected in the usage record');
  return 'PASS: all five orthoses, three trial entries, separate duplicate names, draft retention, pending entry replaced after save';
}
