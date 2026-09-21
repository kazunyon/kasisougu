// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const openConsultation = async () => {
    await page.locator('.primary-nav [data-screen="consultation"]').click();
    await page.locator('#consultation-page').waitFor({ state: 'visible' });
    await page.waitForFunction(() => screenLoads.size === 0);
    await page.locator('#sheet-list button').first().click();
    await page.locator('#consultation-preview').waitFor({ state: 'visible' });
  };

  await page.setViewportSize({ width: 1440, height: 1000 });
  await openConsultation();
  const desktop = await page.evaluate(() => {
    const list = document.querySelector('#sheet-list').getBoundingClientRect();
    const preview = document.querySelector('#consultation-preview').getBoundingClientRect();
    return {
      list: { left: list.left, width: list.width },
      preview: { left: preview.left, width: preview.width },
      maxWidth: getComputedStyle(document.querySelector('#consultation-preview')).maxWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert(Math.abs(desktop.list.left - desktop.preview.left) <= 1, 'Preview left edge does not align with the saved-sheet list');
  assert(Math.abs(desktop.list.width - desktop.preview.width) <= 1, 'Preview width does not match the saved-sheet list');
  assert(desktop.maxWidth === 'none', `Unexpected preview max-width: ${desktop.maxWidth}`);
  assert(desktop.overflow <= 1, 'Desktop page has horizontal overflow');
  await page.screenshot({ path: 'output/playwright/consultation-preview-full-width.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile page has horizontal overflow');

  return 'PASS: consultation preview matches the saved-sheet list width on desktop and has no mobile overflow';
}
