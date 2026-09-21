// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.locator('.primary-nav [data-screen="links"]').click();
  await page.locator('#links-page').waitFor({state:'visible'});

  const fixedTab = page.getByRole('tab', {name:'固定のお役立ち情報', exact:true});
  const personalTab = page.getByRole('tab', {name:'自分で追加したリンク', exact:true});
  await fixedTab.click();
  assert(await fixedTab.getAttribute('aria-selected') === 'true', 'Fixed links tab is not selected');
  assert(await page.locator('#fixed-links-panel').isVisible(), 'Fixed links panel is not visible');
  assert(!(await page.locator('#personal-links-panel').isVisible()), 'Personal links panel is still visible');
  await page.screenshot({path:'output/playwright/links-fixed-tab.png', fullPage:true});

  await fixedTab.press('ArrowRight');
  assert(await personalTab.getAttribute('aria-selected') === 'true', 'Personal links tab is not selected by ArrowRight');
  assert(await page.locator('#personal-links-panel').isVisible(), 'Personal links panel is not visible');
  assert(!(await page.locator('#fixed-links-panel').isVisible()), 'Fixed links panel is still visible');
  assert(await page.getByRole('button', {name:'＋ リンクを追加', exact:true}).isVisible(), 'Add-link button is not visible in the personal tab');
  await page.screenshot({path:'output/playwright/links-personal-tab.png', fullPage:true});

  await page.setViewportSize({width:390, height:844});
  assert(await personalTab.isVisible(), 'Personal links tab is not visible on mobile');
  assert(await page.locator('#personal-links-panel').isVisible(), 'Personal links panel is not visible on mobile');
  await page.screenshot({path:'output/playwright/links-personal-tab-mobile.png', fullPage:true});
  await page.setViewportSize({width:1440, height:1000});

  await personalTab.press('Home');
  assert(await fixedTab.getAttribute('aria-selected') === 'true', 'Home key did not return to the fixed links tab');
  return 'PASS: links tabs, visibility, keyboard switching, and add-link placement';
}
