// Run with playwright-cli run-code --filename tools/render_brand_icons.js
// Serve kasisougu/static locally and open its index.html first.
async (page) => {
  const response = await page.request.get(page.url().replace(/[^/]*$/, 'brand-mark.svg'));
  const svg = await response.text();
  if (!svg.startsWith('<svg')) throw new Error('The served directory must contain brand-mark.svg.');
  for (const size of [192, 512]) {
    await page.setViewportSize({width:size,height:size});
    // Keep the entire mark inside the central maskable-icon safe area.
    await page.setContent(`<html><body style="margin:0;background:#fff;display:grid;place-items:center;width:100vw;height:100vh"><div style="width:64%;height:64%">${svg}</div></body></html>`);
    await page.screenshot({path:`kasisougu/static/icon-${size}.png`});
  }
}
