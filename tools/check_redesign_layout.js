// Run after check_redesign_flows.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const go = async screen => {
    const selector = screen === 'orthosis' ? '.sidebar-secondary [data-screen="orthosis"]' : `.primary-nav [data-screen="${screen}"]`;
    await page.locator(selector).click();
    await page.locator(`#${screen}-page`).waitFor({state:'visible'});
    await page.waitForFunction(() => screenLoads.size === 0);
    assert(await page.locator(selector).getAttribute('aria-current') === 'page', `Current page is not marked: ${screen}`);
  };
  for (const width of [1024,768,390,320]) {
    await page.setViewportSize({width,height:900});
    for (const screen of ['home','catalog','record','consultation','links','settings']) {
      await go(screen);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1), `Horizontal overflow: ${screen} at ${width}px`);
      if (width<=760) {
        const box=await page.locator('.primary-nav').boundingBox();
        assert(box.y+box.height<=901 && box.y>500,'Bottom navigation misplaced');
      }
    }
  }
  await page.setViewportSize({width:390,height:844});
  await go('home');
  await page.screenshot({path:'output/playwright/redesign-home-mobile.png',fullPage:true});
  await go('catalog'); await page.locator('.catalog-choice').first().click();
  const trayBox=await page.locator('#catalog-selection-tray').boundingBox(), navBox=await page.locator('.primary-nav').boundingBox();
  assert(trayBox.y+trayBox.height<=navBox.y,'Comparison tray covers bottom navigation');
  await page.screenshot({path:'output/playwright/redesign-catalog-mobile.png',fullPage:true});
  await go('settings');
  await page.locator('#text-scale').fill('200');
  await page.locator('#text-scale').dispatchEvent('input');
  for (const screen of ['home','catalog','record','consultation','links','settings']) {
    await go(screen);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), `Horizontal overflow with 200% text: ${screen}`);
  }
  await page.locator('#text-scale').fill('100'); await page.locator('#text-scale').dispatchEvent('input');
  await page.locator('.mobile-orthosis').click();
  await page.locator('#orthosis-add').click();
  await page.locator('#orthosis-name').fill('ログアウトで破棄する下書き');
  await go('settings');
  await page.locator('#logout').click();
  assert(await page.locator('#app-navigation').isHidden(),'Navigation remains after logout');
  assert(await page.locator('#login-page').isVisible(),'Login missing after logout');
  assert(await page.locator('#orthosis-name').inputValue()==='', 'Orthosis draft remains after logout');
  assert(await page.locator('#orthosis-form').isHidden(), 'Orthosis editor remains open after logout');
  assert(await page.title()==='下肢装具サポート', 'Page title remains after logout');
  return 'PASS: responsive navigation at 1024, 768, 390 and 320px, 200% text, mobile comparison tray and logout';
}
