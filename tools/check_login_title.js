// Run against a locally served Pages build with:
// playwright-cli -s=login-title-two-lines run-code --filename tools/check_login_title.js
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const widths = [1440, 1220, 1024, 768, 761, 760, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({width, height: 900});
    const title = await page.locator('#login-title').evaluate(element => {
      const textNodes = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      return textNodes.map(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return {text: node.textContent.trim(), lineCount: range.getClientRects().length};
      });
    });
    assert(title.length === 2, `Login title must contain two explicit lines at ${width}px`);
    assert(title[0].text === '相談の準備を、' && title[1].text === 'ここから始めましょう', `Unexpected login title at ${width}px`);
    assert(title.every(line => line.lineCount === 1), `Login title wrapped beyond two lines at ${width}px: ${JSON.stringify(title)}`);
  }
  await page.setViewportSize({width: 1220, height: 900});
  await page.screenshot({path: 'output/playwright/login-title-two-lines.png', fullPage: true});
  return 'PASS: login title stays on exactly two lines from 1440px through 320px';
}
