// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  await page.setViewportSize({width:390,height:844});
  await page.locator('.primary-nav [data-screen="catalog"]').click();
  await page.locator('#catalog-page').waitFor({state:'visible'});
  await page.getByRole('tab',{name:'自分で追加した装具',exact:true}).click();
  await page.locator('#catalog-personal-panel').waitFor({state:'visible'});
  const result = await page.evaluate(() => ({
    noOverflow:document.documentElement.scrollWidth <= window.innerWidth + 1,
    selected:document.getElementById('catalog-personal-tab').getAttribute('aria-selected'),
    cards:document.querySelectorAll('.personal-catalog-card').length,
    publicHidden:document.getElementById('catalog-public-panel').hidden
  }));
  if (!result.noOverflow || result.selected !== 'true' || !result.cards || !result.publicHidden) throw new Error(JSON.stringify(result));
  await page.screenshot({path:'output/playwright/personal-catalog-mobile.png',fullPage:true});
  return `PASS: personal catalog mobile layout (${result.cards} card)`;
}
