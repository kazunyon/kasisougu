// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.locator('.primary-nav [data-screen="settings"]').click();
  await page.locator('#settings-page').waitFor({state:'visible'});
  assert(await page.getByRole('heading', {name:'端末のデータ', exact:true}).count() === 0, 'Obsolete device-data section remains');
  assert(await page.getByText('端末への下書き保存を許可する', {exact:true}).count() === 0, 'Obsolete draft-storage setting remains');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {name:'完全バックアップを作る', exact:true}).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  const stream = await download.createReadStream();
  let backupText = '';
  for await (const chunk of stream) backupText += chunk.toString('utf8');
  const backup = JSON.parse(backupText);
  assert(backup.format === 'kasisougu-complete-backup' && backup.version === 1, 'Complete-backup header is invalid');
  assert(backup.data.orthoses.length === 5, 'Orthoses are missing from backup');
  assert(backup.data.usage_records.length >= 2, 'Usage records are missing from backup');
  assert(backup.data.consultation_sheets.length >= 1, 'Consultation sheets are missing from backup');
  assert(backup.data.profile.display_name === 'テスト利用者', 'Profile is missing from backup');
  assert(backup.data.files.length === 4, 'Photo binaries are missing from backup');
  assert(backup.data.files.every(file => file.data_base64.length > 0), 'A photo binary is empty');

  let restorePayload = null;
  let restoreCalls = 0;
  await page.route('https://redesign-test.invalid/rest/v1/rpc/kasi_restore_backup', async route => {
    restoreCalls += 1;
    restorePayload = route.request().postDataJSON().p_backup;
    await route.fulfill({contentType:'application/json', body:JSON.stringify({already_restored:restoreCalls > 1, restored_rows:restoreCalls > 1 ? 0 : 20})});
  });

  const input = page.locator('#backup-file');
  await input.setInputFiles(backupPath);
  await page.getByText(/装具5件／使用記録\d+件／相談シート\d+件／写真4枚/).waitFor();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'このバックアップを復元する', exact:true}).click();
  await page.waitForFunction(() => document.getElementById('backup-status').textContent.includes('完全バックアップを復元しました'));
  assert(restorePayload?.backup_id === backup.backup_id, 'Backup id was not sent to restore RPC');
  assert(restorePayload.data.orthoses[0].id !== backup.data.orthoses[0].id, 'Restored IDs were not remapped');
  assert(restorePayload.data.media.every(item => item.storage_path.startsWith('test-user/')), 'Restored photo paths are outside the user folder');
  assert(!JSON.stringify(restorePayload.data.consultation_sheets).includes('test-user/orthoses/orthosis-1/photo-1.jpg'), 'Consultation snapshot photo paths were not remapped');

  await input.setInputFiles(backupPath);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'このバックアップを復元する', exact:true}).click();
  await page.waitForFunction(() => document.getElementById('backup-status').textContent.includes('すでに復元済み'));
  assert(restoreCalls === 2, 'Restore retry did not use the idempotent RPC');
  await page.screenshot({path:'output/playwright/settings-backup-restore.png', fullPage:true});
  await page.setViewportSize({width:390, height:844});
  assert(await page.getByRole('button', {name:'完全バックアップを作る', exact:true}).isVisible(), 'Backup button is not visible on mobile');
  assert(await page.getByText('バックアップファイルを選ぶ', {exact:true}).isVisible(), 'Restore file picker is not visible on mobile');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Backup settings overflow horizontally on mobile');
  await page.screenshot({path:'output/playwright/settings-backup-restore-mobile.png', fullPage:true});
  await page.setViewportSize({width:1440, height:1000});
  await input.setInputFiles(backupPath);
  assert(await page.locator('#backup-restore-area').isVisible(), 'Selected backup summary is not visible');
  await page.locator('#logout').click();
  assert(await input.inputValue() === '', 'Selected backup file was retained after logout');
  assert(await page.locator('#backup-restore-area').isHidden(), 'Backup restore controls were retained after logout');
  return 'PASS: complete export, photo inclusion, ID/path remapping, restore, and idempotent retry';
}
