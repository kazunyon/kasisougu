// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('.primary-nav [data-screen="record"]').click();
  await page.locator('#record-page').waitFor({state:'visible'});
  await page.waitForFunction(() => screenLoads.size === 0);

  await page.getByLabel('気づいた日',{exact:true}).fill('2026-09-18');
  await page.getByLabel('内容',{exact:true}).fill('削除確認用の気になったこと');
  const concernCreate = page.waitForResponse(r => r.url().includes('/kasi_usage_record_concerns') && r.request().method() === 'POST');
  await page.locator('#record-concern-form').getByRole('button',{name:'保存する',exact:true}).click();
  await concernCreate;
  const concernCard = page.locator('#record-concern-list .concern-card').filter({hasText:'削除確認用の気になったこと'});
  await concernCard.waitFor({state:'visible'});
  const concernDelete = page.waitForResponse(r => r.url().includes('/kasi_usage_record_concerns') && r.request().method() === 'PATCH');
  await concernCard.getByRole('button',{name:'削除する',exact:true}).click();
  await concernDelete;
  await concernCard.waitFor({state:'detached'});
  assert((await page.locator('#record-concern-status').textContent()).includes('削除しました'),'Concern delete status is missing');

  await page.getByLabel('詳しい説明',{exact:true}).fill('削除確認用の困りごと');
  const needCreate = page.waitForResponse(r => r.url().includes('/kasi_user_needs') && r.request().method() === 'POST');
  await page.locator('#need-form').getByRole('button',{name:'困りごと・希望を保存',exact:true}).click();
  await needCreate;
  const needCard = page.locator('#needs-list .need-card').filter({hasText:'削除確認用の困りごと'});
  await needCard.waitFor({state:'visible'});
  const needDelete = page.waitForResponse(r => r.url().includes('/kasi_user_needs') && r.request().method() === 'PATCH');
  await needCard.getByRole('button',{name:'削除する',exact:true}).click();
  await needDelete;
  await needCard.waitFor({state:'detached'});
  assert((await page.locator('#need-status').textContent()).includes('削除しました'),'Need delete status is missing');

  await page.locator('.primary-nav [data-screen="consultation"]').click();
  await page.locator('#consultation-page').waitFor({state:'visible'});
  await page.waitForFunction(() => screenLoads.size === 0);
  await page.getByRole('button',{name:'新しい相談シート',exact:true}).click();
  assert(!(await page.locator('#sheet-needs').textContent()).includes('削除確認用の困りごと'),'Deleted need remains selectable on consultation sheet');
  assert(!(await page.locator('#sheet-concerns').textContent()).includes('削除確認用の気になったこと'),'Deleted concern remains selectable on consultation sheet');
  return 'PASS: concern and need soft deletion, list refresh, and consultation exclusion';
}
