// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.locator('.primary-nav [data-screen="consultation"]').click();
  await page.locator('#consultation-page').waitFor({state:'visible'});
  await page.waitForFunction(() => screenLoads.size === 0);
  assert(await page.locator('#sheet-list .danger-button').count()===1,'Consultation delete button is missing');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('#sheet-list .danger-button').click();
  await page.waitForFunction(() => document.getElementById('sheet-list-status').textContent.includes('削除しました'));
  assert(await page.locator('#sheet-list .record-card').count()===0,'Deleted consultation sheet remains in the list');
  return 'PASS: consultation sheet can be deleted from its list card';
}
