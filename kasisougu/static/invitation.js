'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const config = window.KASISOUGU_SUPABASE_CONFIG || {};
  const fragment = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const type = fragment.get('type') || query.get('type') || '';
  let inviteToken = type === 'invite' ? fragment.get('access_token') || query.get('access_token') || '' : '';
  let inviteEmail = '';
  const callbackError = fragment.has('error') || fragment.has('error_code') || query.has('error') || query.has('error_code');
  // Remove the one-time token from the visible URL and browser history immediately.
  if (location.hash || location.search) history.replaceState(null, '', location.pathname);

  function status(text, error = false) {
    $('invitation-status').textContent = text;
    $('invitation-status').classList.toggle('invite-error', error);
  }

  async function authApi(path, method, body, accessToken = '') {
    if (!config.url || !config.publishableKey) throw new Error('公開設定を確認できません。管理者に連絡してください。');
    const response = await fetch(`${config.url}/auth/v1${path}`, {
      method, cache: 'no-store',
      headers: {apikey: config.publishableKey, 'Content-Type': 'application/json', ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('招待リンクが無効か期限切れです。運営担当者へ再招待をご依頼ください。');
      error.code = data.code || '';
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function initialize() {
    if (callbackError || type !== 'invite' || !inviteToken) {
      inviteToken = '';
      status('招待リンクが無効か期限切れです。運営担当者へ再招待をご依頼ください。', true);
      return;
    }
    status('招待を確認しています…');
    try {
      const user = await authApi('/user', 'GET', null, inviteToken);
      if (!user.id || !user.email) throw new Error('招待を確認できません。');
      inviteEmail = user.email;
      $('invitation-account').textContent = `招待先：${inviteEmail}`;
      $('invitation-password-panel').hidden = false;
      status('招待を確認しました。パスワードを設定してください。');
      $('invitation-password').focus();
    } catch (error) {
      inviteToken = '';
      status(error instanceof TypeError ? '通信できませんでした。接続を確認し、運営担当者へ再招待をご依頼ください。' : error.message, true);
    }
  }

  $('invitation-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = $('invitation-password-submit');
    const password = $('invitation-password').value;
    if (!inviteToken) { status('招待リンクを確認できません。運営担当者へ再招待をご依頼ください。', true); return; }
    if (password.length < 8) { status('パスワードは8文字以上で入力してください。', true); return; }
    if (password !== $('invitation-password-confirm').value) { status('確認用パスワードが一致しません。', true); return; }
    button.disabled = true; status('パスワードを設定しています…');
    let passwordUpdated = false;
    try {
      await authApi('/user', 'PUT', {password}, inviteToken);
      passwordUpdated = true;
      inviteToken = '';
      const session = await authApi('/token?grant_type=password', 'POST', {email: inviteEmail, password});
      if (!session.access_token) throw new Error('ログインを確認できません。');
      form.reset();
      const destination = new URL('./', location.href);
      const next = new URLSearchParams({type: 'invite-login', invite_access_token: session.access_token});
      location.replace(`${destination.pathname}#${next.toString()}`);
    } catch (error) {
      form.reset();
      $('invitation-password-panel').hidden = passwordUpdated;
      status(passwordUpdated ? 'パスワードを設定しました。ログイン画面で新しいパスワードを使ってログインしてください。' : (error.message || '処理できませんでした。時間をおいて再度お試しください。'), !passwordUpdated);
    } finally { button.disabled = false; }
  });

  window.addEventListener('pagehide', () => { inviteToken = ''; inviteEmail = ''; $('invitation-password-form').reset(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { inviteToken = ''; $('invitation-password-panel').hidden = true; status('招待リンクを再確認できません。運営担当者へ再招待をご依頼ください。', true); } });
  window.addEventListener('hashchange', () => { if (location.hash) location.reload(); });
  initialize();
})();
