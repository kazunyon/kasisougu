// Run after check_redesign.js; uses synthetic API fixtures only.
async (page) => {
  const assert = (v,m) => { if (!v) throw new Error(m); };
  await page.evaluate(() => { window.confirm = () => true; });
  const save = async selector => {
    const response = page.waitForResponse(r => r.url().endsWith('/rpc/kasi_save_usage_record'));
    await page.locator(selector).click(); await response;
    await page.waitForFunction(() => document.getElementById('record-save-comparison').disabled === false);
  };
  await page.locator('.primary-nav [data-screen="record"]').click();
  assert(await page.locator('#record-picker').inputValue()==='record-2','Baseline must be current KAFO');
  assert(await page.locator('#record-note').inputValue()==='いつも通り使用しました','Existing values missing');
  await page.locator('#record-note').fill('画面移動でも保持');
  await page.locator('.primary-nav [data-screen=home]').click();
  await page.locator('.primary-nav [data-screen=record]').click();
  await page.waitForFunction(() => screenLoads.size === 0);
  assert(await page.locator('#record-note').inputValue()==='画面移動でも保持','Draft lost on navigation');
  const before = await page.locator('#record-picker option').count();
  await page.locator('#record-note').fill('保存する現在の記録');
  await page.locator('#result-other').selectOption('issue');
  await page.locator('#rating-other').selectOption('2');
  await page.locator('#note-other').fill('比較用にも残す評価');
  await save('#record-form button.primary');
  assert(await page.locator('#record-picker option').count()===before,'Normal save created duplicate');
  assert(await page.locator('#record-note').inputValue()==='保存する現在の記録','Updated value missing');
  await page.locator('#record-note').fill('比較用だけのメモ');
  await save('#record-save-comparison');
  assert(await page.locator('#record-picker option').count()===before+1,'Comparison copy missing');
  assert(await page.locator('#record-picker').inputValue()==='record-2','Copy switched baseline');
  const copy = await page.locator('#compare-second').inputValue();
  assert((await page.locator('#compare-second option:checked').textContent()).includes('比較用'),'Comparison label missing');
  await page.locator('#record-cancel').click();
  await page.waitForFunction(() => document.getElementById('record-note').value === '保存する現在の記録');
  assert(await page.locator('#record-note').inputValue()==='保存する現在の記録','Copy changed baseline');
  await page.locator('#record-note').fill('さらに更新した現在の記録');
  await save('#record-form button.primary');
  await page.locator('#record-picker').selectOption(copy);
  await page.waitForFunction(id => document.getElementById('record-picker').value === id && document.getElementById('record-form-title').textContent.includes('比較用'),copy);
  assert(await page.locator('#record-note').inputValue()==='比較用だけのメモ','Copy mutated with baseline');
  assert(await page.locator('#note-other').inputValue()==='比較用にも残す評価','Evaluation copy missing');
  await page.locator('#record-picker').selectOption('record-1');
  await page.waitForFunction(() => document.getElementById('record-orthosis').value === 'orthosis-2');
  await page.locator('#recorded-on').fill('2026-09-01');
  await save('#record-form button.primary');
  assert(await page.locator('#recorded-on').inputValue()==='2026-09-01','Past record edit failed');
  assert(await page.locator('#record-picker option').count()===before+1,'Past edit created duplicate');
  // Force an atomic API failure; user input must survive and both save controls must recover.
  await page.route('**/rpc/kasi_save_usage_record', route => route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'記録が別の画面で更新されています。'})}));
  await page.locator('#record-note').fill('競合時に保持する入力');
  await save('#record-form button.primary');
  assert(await page.locator('#record-note').inputValue()==='競合時に保持する入力','Input lost after failure');
  assert((await page.locator('#record-status').textContent()).includes('保存できませんでした'),'Failure not shown');
  await page.unroute('**/rpc/kasi_save_usage_record');
  await page.locator('#record-picker').selectOption('record-2');
  await page.waitForFunction(() => document.getElementById('record-note').value === 'さらに更新した現在の記録');
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(() => applyTextScale(200));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),`Overflow at ${width}/200%`);
    await page.evaluate(() => applyTextScale(100));
    await page.screenshot({path:`output/playwright/current-record-${width}.png`,fullPage:true});
  }
  return 'PASS: current baseline, in-place save, independent comparison copy + evaluations, past edit, conflict recovery, responsive layout';
}
