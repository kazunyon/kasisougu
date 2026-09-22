// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const go = async screen => {
    await page.locator(`.primary-nav [data-screen="${screen}"]`).click();
    await page.locator(`#${screen}-page`).waitFor({ state: 'visible' });
    await page.waitForFunction(() => screenLoads.size === 0);
  };
  const size = selector => page.locator(selector).first().evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await go('record');
  const baseline = await size('#record-page .lead');
  const recordSelectors = [
    '.record-selection label',
    '#record-picker',
    '#record-current-state',
    '#record-list-status',
    '#record-form > p',
    '.photo-field > p',
    '.record-concerns > p',
    '.concern-card p',
    '.record-comparison p',
  ];
  for (const selector of recordSelectors) {
    const actual = await size(selector);
    assert(Math.abs(actual - baseline) < 0.1, `${selector} is ${actual}px; expected ${baseline}px`);
  }
  const compactLabel = baseline * (0.8 / 0.9);
  for (const selector of ['#record-form > .form-grid > label', '#record-form > .form-grid > .record-help-field', '#record-form > .wide-field']) {
    const actual = await size(selector);
    assert(Math.abs(actual - compactLabel) < 0.1, `${selector} is ${actual}px; expected ${compactLabel}px`);
  }
  const footwearSize = await size('#record-footwear');
  for (const selector of ['#recorded-on', '#record-orthosis-type', '#record-orthosis']) {
    const actual = await size(selector);
    assert(Math.abs(actual - footwearSize) < 0.1, `${selector} is ${actual}px; expected footwear size ${footwearSize}px`);
  }
  assert(await page.locator('#recorded-on').evaluate(element => getComputedStyle(element).textAlign === 'left'), 'Record date is not left-aligned');
  assert(Math.abs(await size('#record-concern-form-title') - baseline) < 0.1, 'Concern form heading does not match the compact body size');

  const pageChecks = [
    ['home', '.home-orthosis-section > p'],
    ['catalog', '.catalog-card .catalog-card-summary'],
    ['links', '.resource-link-card p'],
    ['settings', '.settings-help'],
  ];
  for (const [screen, selector] of pageChecks) {
    await go(screen);
    const actual = await size(selector);
    assert(Math.abs(actual - baseline) < 0.1, `${screen} body copy is ${actual}px; expected ${baseline}px`);
  }

  await go('record');
  await page.screenshot({ path: 'output/playwright/record-readable-text.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile record page has horizontal overflow');

  return `PASS: explanatory text is consistently ${baseline}px and the mobile record page has no horizontal overflow`;
}
