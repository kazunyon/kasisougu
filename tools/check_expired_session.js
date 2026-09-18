// Run after check_redesign.js in the same isolated Playwright session.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.route('https://redesign-test.invalid/rest/v1/kasi_user_orthoses**', route => route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'JWT expired'})}));
  await page.evaluate(() => loadHome());
  await page.locator('#login-page').waitFor({state:'visible'});
  assert(await page.locator('#app-navigation').isHidden(), 'Navigation remains visible after session expiry');
  assert(await page.locator('#auth-status').textContent() === 'ログインの有効期限が切れました。もう一度ログインしてください', 'Session-expiry guidance is incorrect');
  return 'PASS: an expired JWT returns the user to the login screen with clear guidance';
}
