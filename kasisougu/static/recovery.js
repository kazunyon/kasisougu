'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const config = window.KASISOUGU_SUPABASE_CONFIG || {};
  const fragment = new URLSearchParams(location.hash.slice(1));
  let recoveryToken = fragment.get('type') === 'recovery' ? fragment.get('access_token') || '' : '';
  const callback = !!location.hash || !!location.search;
  const callbackError = fragment.has('error') || fragment.has('error_code');
  // Never persist credentials or leave them in browser history / outgoing URLs.
  history.replaceState(null, '', location.pathname);
  for (const key of [...fragment.keys()]) fragment.delete(key);
  const status = (text, error = false) => {
    $('recovery-status').textContent = text;
    $('recovery-status').classList.toggle('error', error);
  };
  const invalidLink = () => {
    recoveryToken = '';
    $('reset-section').hidden = true;
    $('request-section').hidden = false;
    status('リンクが無効、または期限切れです。再設定メールをもう一度送信してください。', true);
  };
  async function api(path, method, body, accessToken = '') {
    if (!config.url || !config.publishableKey) throw new Error('公開設定を確認できません。管理者に連絡してください。');
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(`${config.url}/auth/v1${path}`, {
            method, signal: controller.signal, cache: 'no-store',
            headers: {apikey: config.publishableKey, 'Content-Type': 'application/json', ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {})},
            ...(body ? {body: JSON.stringify(body)} : {})
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            let text = '処理できませんでした。時間をおいて再度お試しください。';
            if (response.status === 429) text = '送信・操作の回数制限に達しました。しばらく待ってから再度お試しください。';
            else if (response.status === 401 || response.status === 403) text = '認証が無効、または期限切れです。再設定メールをもう一度送信してください。';
            else if (data.code === 'same_password') text = '現在と異なる新しいパスワードを入力してください。';
            else if (data.code === 'weak_password') text = 'より長く推測されにくいパスワードにしてください。';
            const error = new Error(text); error.status = response.status; throw error;
          }
          return data;
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => {
          reject(new Error(method === 'PUT' ? '応答を確認できませんでした。変更が済んでいる可能性があります。ログイン画面で新しいパスワードを試し、入れない場合はメールを再送してください。' : '通信が完了しませんでした。受信メールを確認し、届かなければ時間をおいて再送してください。'));
          controller.abort();
        }, 15000); })
      ]);
    } catch (error) {
      if (error instanceof TypeError) throw new Error('通信できませんでした。インターネット接続を確認してください。');
      throw error;
    } finally { clearTimeout(timer); controller.abort(); }
  }
  $('recovery-request-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('recovery-send');
    if (button.disabled) return;
    button.disabled = true;
    status('再設定メールを送信しています…');
    try {
      const redirect = new URL('./recovery.html', location.href).href;
      await api(`/recover?redirect_to=${encodeURIComponent(redirect)}`, 'POST', {email: $('recovery-email').value.trim()});
      status('登録済みのアドレスであれば、再設定メールが届きます。迷惑メールも確認してください。再送する場合は60秒以上お待ちください。');
    } catch (error) { status(error.message, true); }
    finally { button.disabled = false; }
  });
  $('recovery-reset-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('recovery-update');
    if (button.disabled) return;
    if (!recoveryToken) { invalidLink(); return; }
    const password = $('recovery-password').value;
    if (password.length < 8) { status('新しいパスワードは8文字以上で入力してください。', true); return; }
    if (password !== $('recovery-confirm').value) { status('新しいパスワードが一致しません。', true); return; }
    button.disabled = true;
    status('パスワードを再設定しています…');
    try {
      await api('/user', 'PUT', {password}, recoveryToken);
      recoveryToken = '';
      $('reset-section').hidden = true;
      status('パスワードを再設定しました。「ログイン画面へ戻る」から新しいパスワードでログインしてください。');
    } catch (error) {
      if (error.status === 401 || error.status === 403) invalidLink();
      else status(error.message, true);
    } finally { form.reset(); button.disabled = false; }
  });
  async function initialize() {
    if (callbackError || (callback && !recoveryToken)) { invalidLink(); return; }
    if (!recoveryToken) return;
    $('request-section').hidden = true;
    status('再設定リンクを確認しています…');
    try {
      const user = await api('/user', 'GET', null, recoveryToken);
      if (!user.id || !user.email) { invalidLink(); return; }
      $('recovery-account').textContent = `対象アカウント：${user.email}`;
      $('reset-section').hidden = false;
      status('確認できました。新しいパスワードを入力してください。');
      $('recovery-password').focus();
    } catch (error) {
      recoveryToken = '';
      $('request-section').hidden = false;
      status(error.message, true);
    }
  }
  window.addEventListener('pagehide', () => { recoveryToken = ''; $('recovery-reset-form').reset(); });
  // Email links may reuse an already open recovery tab (fragment-only navigation).
  window.addEventListener('hashchange', () => { if (location.hash) location.reload(); });
  window.addEventListener('pageshow', event => { if (event.persisted) invalidLink(); });
  initialize();
})();
