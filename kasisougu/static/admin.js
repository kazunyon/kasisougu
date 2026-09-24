'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const config = window.KASISOUGU_SUPABASE_CONFIG || {};
  let token = '';
  let roles = [];
  let users = [];
  let userPage = 1, userNext = false, auditPage = 1, auditNext = false;
  const owner = () => roles.includes('system_operator');
  const invitation = () => owner() || roles.includes('invitation_operator');
  const auditor = () => owner() || roles.includes('audit_reader');
  const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
  const date = value => value ? new Date(value).toLocaleString('ja-JP') : '—';
  async function request(path, body, accessToken = '') {
    if (!config.url || !config.publishableKey) throw new Error('公開設定を確認できません。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${config.url}${path}`, {method:'POST', cache:'no-store', signal:controller.signal,
        headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(accessToken ? {Authorization:`Bearer ${accessToken}`} : {})},
        body:JSON.stringify(body)});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || '処理できませんでした。'); error.status = response.status; throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('通信が完了しませんでした。操作結果を確認してから再試行してください。');
      if (error instanceof TypeError) throw new Error('通信できませんでした。接続を確認してください。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  const api = (action, data = {}) => request('/functions/v1/admin-management', {action, ...data}, token);
  async function confirmAction(title, message) {
    $('confirm-title').textContent = title; $('confirm-text').textContent = message;
    const dialog = $('confirm-dialog'); dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {once:true}));
  }
  async function run(button, action) {
    button.disabled = true; status('処理しています…');
    try { await action(); }
    catch (error) { status(error.message, true); if (error.status === 401) logout(); }
    finally { button.disabled = false; }
  }
  function logout() {
    token = ''; roles = []; users = []; $('password').value = ''; $('bootstrap-token').value = '';
    $('dashboard').hidden = true; $('bootstrap-panel').hidden = true; $('login-panel').hidden = false; $('logout').hidden = true;
    $('new-key').hidden = true; $('code').textContent = '';
  }
  async function showView(name) {
    if ((name === 'key' || name === 'users') && !invitation()) return;
    if (name === 'audit' && !auditor()) return;
    if (name !== 'key') { $('new-key').hidden = true; $('code').textContent = ''; }
    for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== name;
    for (const button of document.querySelectorAll('nav button')) button.classList.toggle('active', button.dataset.view === name);
    status('');
    if (name === 'key') await loadKey();
    if (name === 'users') await loadUsers();
    if (name === 'audit') await loadAudit();
  }
  async function enter() {
    const context = await api('context'); roles = context.roles;
    $('login-panel').hidden = true; $('bootstrap-panel').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false;
    $('welcome').textContent = `${context.email || ''} でログインしています。`;
    $('rotate').hidden = !owner(); $('stop').hidden = !owner();
    $('invite-panel').hidden = !invitation();
    for (const button of document.querySelectorAll('nav button,[data-view]')) {
      if (button.dataset.view === 'key' || button.dataset.view === 'users') button.hidden = !invitation();
      if (button.dataset.view === 'audit') button.hidden = !auditor();
    }
    if (invitation()) { const key = await api('key_status'); renderKey(key.key); }
    else $('home-key').textContent = 'この権限では表示できません。';
    await showView('home');
  }
  function renderKey(key) {
    const label = key.status === 'active' ? `有効（期限：${date(key.expires_at)}）` : key.status === 'expired' ? '期限切れ' : '有効なキーはありません。';
    $('key-state').textContent = `現在の状態：${label}`; $('home-key').textContent = label;
    $('stop').disabled = key.status !== 'active';
  }
  async function loadKey() { renderKey((await api('key_status')).key); }
  function appendCell(row, text) { const cell = row.insertCell(); cell.textContent = String(text ?? '—'); return cell; }
  function renderUsers() {
    const body = $('user-rows'); body.replaceChildren();
    const filter = $('user-filter').value.trim().toLowerCase();
    for (const user of users.filter(item => (item.email || '').toLowerCase().includes(filter))) {
      const row = body.insertRow(); appendCell(row, user.email); appendCell(row, date(user.created_at));
      const suspended = user.banned_until && new Date(user.banned_until) > new Date();
      appendCell(row, suspended ? '停止中' : user.email_confirmed_at ? '利用中' : '招待中');
      const cell = row.insertCell();
      if (invitation() && !user.email_confirmed_at && user.email) {
        const resend = document.createElement('button'); resend.textContent = '招待を再送';
        resend.addEventListener('click', () => run(resend, async () => {
          if (!await confirmAction('招待メールを再送しますか', `${user.email} に送信します。`)) return;
          const result = await api('resend_invite', {user_id:user.id}); status(result.message);
        })); cell.append(resend);
      }
      if (owner()) {
        const button = document.createElement('button'); button.textContent = suspended ? '再開' : '停止';
        button.addEventListener('click', () => run(button, async () => {
          if (!await confirmAction(`利用を${suspended ? '再開' : '停止'}しますか`, `${user.email} の利用状態を変更します。`)) return;
          await api(suspended ? 'resume' : 'suspend', {user_id:user.id}); status('利用状態を更新しました。'); await loadUsers();
        })); cell.append(button);
        for (const role of ['invitation_operator', 'audit_reader']) {
          const roleButton = document.createElement('button'); roleButton.textContent = role === 'invitation_operator' ? '招待担当' : '履歴閲覧';
          roleButton.title = 'クリックして権限を付与または解除';
          roleButton.addEventListener('click', () => run(roleButton, async () => {
            const roleData = await api('user_roles', {user_id:user.id});
            const grant = !roleData.roles.includes(role);
            if (!await confirmAction('担当者権限を変更しますか', `${user.email} の「${roleButton.textContent}」権限を${grant ? '付与' : '解除'}します。`)) return;
            await api('role_change', {user_id:user.id, role, grant}); status('担当者権限を変更しました。');
          })); cell.append(roleButton);
        }
      }
    }
    $('users-page').textContent = `${userPage}ページ`; $('users-prev').disabled = userPage <= 1; $('users-next').disabled = !userNext;
  }
  async function loadUsers() { const result = await api('users', {page:userPage}); users = result.users; userNext = result.next; renderUsers(); }
  const labels = {bootstrap:'初回管理者登録',key_rotate:'登録キー発行',key_stop:'登録キー停止',invite:'招待送信',invite_failed:'招待失敗',invite_resend:'招待再送',invite_resend_failed:'招待再送失敗',user_suspend:'利用停止',user_resume:'利用再開',role_grant:'権限付与',role_revoke:'権限解除'};
  async function loadAudit() {
    const result = await api('audit', {page:auditPage}); auditNext = result.next;
    const body = $('audit-rows'); body.replaceChildren();
    for (const item of result.rows) { const row = body.insertRow(); appendCell(row, date(item.occurred_at)); appendCell(row, labels[item.action] || item.action); appendCell(row, item.target_email || item.target_user_id || '—'); appendCell(row, item.actor_id); }
    $('audit-page').textContent = `${auditPage}ページ`; $('audit-prev').disabled = auditPage <= 1; $('audit-next').disabled = !auditNext;
  }
  $('login-form').addEventListener('submit', event => { event.preventDefault(); run(event.submitter, async () => {
    const data = await request('/auth/v1/token?grant_type=password', {email:$('email').value.trim(),password:$('password').value});
    token = data.access_token; $('password').value = '';
    try { await enter(); status('ログインしました。'); }
    catch (error) { if (error.status === 403) { $('login-panel').hidden = true; $('bootstrap-panel').hidden = false; status('管理権限がありません。初回設定の場合は確認コードを入力してください。', true); } else throw error; }
  }); });
  $('bootstrap-form').addEventListener('submit', event => { event.preventDefault(); run(event.submitter, async () => {
    await api('bootstrap', {token:$('bootstrap-token').value}); $('bootstrap-token').value = ''; await enter(); status('初回管理者の登録が完了しました。');
  }); });
  $('logout').addEventListener('click', () => { logout(); status('ログアウトしました。'); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view).catch(error => status(error.message, true))));
  $('rotate').addEventListener('click', () => run($('rotate'), async () => {
    if (!await confirmAction('新しい登録キーを発行しますか', '今の登録キーは直ちに使えなくなります。')) return;
    const result = await api('key_rotate'); renderKey(result.key); $('code').textContent = result.code; $('new-key').hidden = false; status('新しい登録キーを発行しました。');
  }));
  $('stop').addEventListener('click', () => run($('stop'), async () => {
    if (!await confirmAction('登録キーを停止しますか', '新しいキーを発行するまで招待申込を受け付けません。')) return;
    const result = await api('key_stop'); renderKey(result.key); $('new-key').hidden = true; $('code').textContent = ''; status('登録キーを停止しました。');
  }));
  $('hide-key').addEventListener('click', () => { $('new-key').hidden = true; $('code').textContent = ''; });
  $('invite-form').addEventListener('submit', event => { event.preventDefault(); run(event.submitter, async () => {
    const email = $('invite-email').value.trim();
    if (!await confirmAction('招待メールを送りますか', `${email} に送信します。`)) return;
    const result = await api('invite', {email}); $('invite-email').value = ''; status(result.message); await loadUsers();
  }); });
  $('user-filter').addEventListener('input', renderUsers);
  $('users-prev').addEventListener('click', () => { userPage--; loadUsers().catch(error => status(error.message,true)); });
  $('users-next').addEventListener('click', () => { userPage++; loadUsers().catch(error => status(error.message,true)); });
  $('audit-prev').addEventListener('click', () => { auditPage--; loadAudit().catch(error => status(error.message,true)); });
  $('audit-next').addEventListener('click', () => { auditPage++; loadAudit().catch(error => status(error.message,true)); });
  window.addEventListener('pagehide', logout);
})();
