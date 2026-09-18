// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const input = '前の文章。~~訂正を入れる。~~次の文章。';
  await page.locator('.primary-nav [data-screen="record"]').click();
  await page.locator('#record-detail').waitFor({state:'visible'});
  await page.locator('#record-edit').click();
  await page.getByLabel('その日の感想（任意）', {exact:true}).fill(input);
  await page.getByRole('button', {name:'記録を保存', exact:true}).click();
  await page.locator('#record-detail').waitFor({state:'visible'});
  const listNote = page.locator('#record-list .record-card').filter({hasText:'前の文章。'}).locator('p').last();
  assert(await listNote.locator('del').textContent() === '訂正を入れる。', 'List view does not render strikethrough text');
  assert(!(await listNote.textContent()).includes('~~'), 'List view exposes strikethrough markers');
  const detailNote = page.locator('#record-facts dd').filter({hasText:'前の文章。'});
  assert(await detailNote.locator('del').textContent() === '訂正を入れる。', 'Detail view does not render strikethrough text');
  assert(!(await detailNote.textContent()).includes('~~'), 'Detail view exposes strikethrough markers');
  await page.locator('#record-edit').click();
  assert(await page.getByLabel('その日の感想（任意）', {exact:true}).inputValue() === input, 'Editor does not preserve strikethrough markers');
  return 'PASS: strikethrough renders in list and detail while the editor preserves the markers';
}
