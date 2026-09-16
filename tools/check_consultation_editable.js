// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.locator('.primary-nav [data-screen="consultation"]').click();
  await page.locator('#consultation-page').waitFor({state:'visible'});
  await page.waitForFunction(() => screenLoads.size === 0);
  await page.locator('#sheet-list button').first().click();
  await page.locator('#consultation-preview').waitFor({state:'visible'});
  await page.locator('#sheet-revise').click();
  await page.locator('#consultation-form').waitFor({state:'visible'});
  assert(await page.locator('#sheet-select-grid').isVisible(),'Selections are locked in an editable revision');
  const photo = page.locator('#sheet-photos input[value="photo-1"]');
  assert(await photo.isChecked(),'Inherited photo is not selected in the editable revision');
  const addedPhoto = page.locator('#sheet-photos input[value="photo-2"]');
  assert(!(await addedPhoto.isChecked()),'Unselected photo is unexpectedly included in the editable revision');
  await addedPhoto.check();
  await page.locator('#sheet-preview-button').click();
  await page.locator('#consultation-preview').waitFor({state:'visible'});
  assert(await page.locator('#consultation-preview .sheet-photo').count()===2,'Added photo is missing from the editable preview');
  await photo.uncheck();
  await page.locator('#sheet-preview-button').click();
  await page.locator('#consultation-preview').waitFor({state:'visible'});
  assert(await page.locator('#consultation-preview .sheet-photo').count()===1,'Removed photo remains in the editable preview');
  await page.locator('#sheet-photo-file').setInputFiles('output/playwright/redesign-home-desktop.png');
  await page.locator('#sheet-photo-upload').click();
  await page.waitForFunction(() => document.getElementById('sheet-photo-status').textContent.includes('新しい写真を追加'));
  assert(await page.locator('#sheet-photos input:checked').count()===2,'Newly uploaded photo is not selected for the consultation');
  return 'PASS: finalized consultation opens an editable revision and photos can be added, removed or newly uploaded';
}
