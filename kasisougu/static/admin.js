'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const config = window.KASISOUGU_SUPABASE_CONFIG || {};
  const labels = {home:'管理ホーム',key:'登録キー管理',users:'利用者管理',audit:'操作履歴'};
  const actions = {bootstrap:'初回管理者登録',key_rotate:'登録キー発行',key_update:'発行先メモ変更',key_delete:'登録キー削除',key_stop:'登録キー停止',invite:'招待送信',invite_failed:'招待失敗',invite_resend:'招待再送',invite_resend_failed:'招待再送失敗',user_suspend:'利用停止',user_resume:'利用再開',user_delete:'利用者削除',role_grant:'権限付与',role_revoke:'権限解除'};
  let token = '', roles = [], users = [], auditRows = [];
  let userPage = 1, userNext = false, auditPage = 1, auditNext = false;
  let editingKeyId = '';
  const owner = () => roles.includes('system_operator');
  const invitation = () => owner() || roles.includes('invitation_operator');
  const auditor = () => owner() || roles.includes('audit_reader');
  const auditTarget = item => item.target_email || item.target_user_id || item.detail?.memo || '—';
  const date = value => value ? new Date(value).toLocaleString('ja-JP') : '—';
  const shortDate = value => value ? new Date(value).toLocaleDateString('ja-JP') : '—';
  function status(message, error = false) {
    const target = $('dashboard').hidden ? $('entry-status') : $('status');
    target.textContent = message; target.classList.toggle('error', error);
  }
  function clearStatus() { $('status').textContent = ''; $('entry-status').textContent = ''; }
  async function request(path, body, accessToken = '') {
    if (!config.url || !config.publishableKey) throw new Error('公開設定を確認できません。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${config.url}${path}`, {method:'POST', cache:'no-store', signal:controller.signal,
        headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(accessToken ? {Authorization:`Bearer ${accessToken}`} : {})},
        body:JSON.stringify(body)});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { const error = new Error(data.message || '処理できませんでした。'); error.status = response.status; throw error; }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('通信が完了しませんでした。操作結果を確認してから再試行してください。');
      if (error instanceof TypeError) throw new Error(path.startsWith('/functions/v1/admin-management')
        ? '管理機能に接続できません。Supabase の管理機能の設定を確認してください。'
        : '認証サーバーに接続できません。通信環境を確認してください。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  const api = (action, data = {}) => request('/functions/v1/admin-management', {action, ...data}, token);
  async function confirmAction(title, message, warning = '') {
    $('confirm-title').textContent = title; $('confirm-text').textContent = message;
    $('confirm-warning').textContent = warning; $('confirm-warning').hidden = !warning;
    const dialog = $('confirm-dialog'); dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {once:true}));
  }
  async function run(button, action) {
    button.disabled = true; status('処理しています…');
    try { await action(); }
    catch (error) { status(error.message, true); if (error.status === 401) logout(); }
    finally {
      if ($('status').textContent === '処理しています…' || $('entry-status').textContent === '処理しています…') clearStatus();
      button.disabled = false;
    }
  }
  function logout() {
    token = ''; roles = []; users = []; auditRows = [];
    $('password').value = ''; $('bootstrap-token').value = '';
    $('dashboard').hidden = true; $('entry-shell').hidden = false;
    $('bootstrap-panel').hidden = true; $('login-panel').hidden = false;
    $('new-key').hidden = true; $('code').textContent = '';
  }
  function badge(text, type = '') {
    const span = document.createElement('span'); span.className = `badge ${type}`; span.textContent = text; return span;
  }
  function appendCell(row, value) { const cell = row.insertCell(); cell.textContent = String(value ?? '—'); return cell; }
  function emptyRow(body, columns, message) {
    const cell = body.insertRow().insertCell(); cell.colSpan = columns; cell.className = 'empty-cell'; cell.textContent = message;
  }
  const userState = user => user.banned_until && new Date(user.banned_until) > new Date() ? 'suspended' : user.email_confirmed_at ? 'active' : 'pending';
  function renderKey(key) {
    const active = key.status === 'active', expired = key.status === 'expired';
    const label = active ? '有効' : expired ? '期限切れ' : '停止中';
    $('home-key').textContent = label;
    $('home-key-detail').textContent = active ? `有効なキー：${key.active_count}件` : '有効な登録キーはありません';
    $('key-state').textContent = active ? `現在、有効な登録キー${key.active_count}件で新規利用登録を受け付けています。` : '現在、新規利用登録は受け付けていません。';
    $('key-badge').textContent = active ? `${key.active_count}件有効` : label; $('key-badge').className = `badge ${active ? '' : expired ? 'pending' : 'neutral'}`;
    $('key-expires').textContent = date(key.expires_at);
    $('key-days').textContent = active && key.expires_at ? `${Math.max(0, Math.ceil((new Date(key.expires_at) - new Date()) / 86400000))}日` : '—';
    $('stop').disabled = !active;
    const list = $('active-key-list'); list.replaceChildren();
    if (!key.keys?.length) { list.textContent = '有効なキーはありません。'; return; }
    for (const item of key.keys) {
      const row = document.createElement('div'); row.className = 'active-key-row';
      const info = document.createElement('div'); info.className = 'active-key-info';
      const memo = document.createElement('strong'); memo.textContent = item.memo || '発行先メモなし';
      const expiry = document.createElement('span'); expiry.textContent = `発行：${date(item.created_at)} ／ 期限：${date(item.expires_at)}`;
      info.append(memo, expiry); row.append(info);
      if (owner()) {
        const buttons = document.createElement('div'); buttons.className = 'row-actions active-key-actions';
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'メモを変更';
        edit.addEventListener('click', () => { editingKeyId = item.id; $('edit-key-memo').value = item.memo; $('key-edit-dialog').showModal(); });
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger'; remove.textContent = '削除';
        remove.addEventListener('click', () => run(remove, async () => {
          if (!await confirmAction('登録キーを削除しますか', `「${item.memo}」の登録キーを削除します。`, '削除したキーはすぐに使えなくなり、元に戻せません。')) return;
          const result = await api('key_delete', {key_id:item.id}); renderKey(result.key);
          $('new-key').hidden = true; $('code').textContent = '';
          status('登録キーを削除しました。'); if (auditor()) await loadKeyHistory();
        }));
        buttons.append(edit, remove); row.append(buttons);
      }
      list.append(row);
    }
  }
  async function loadKey() {
    renderKey((await api('key_status')).key);
    await loadKeyHistory();
  }
  async function loadHome() {
    if (invitation()) {
      const key = await api('key_status'); renderKey(key.key);
      let page = 1, pending = 0, active = 0, suspended = 0, next = false;
      do {
        const result = await api('users', {page});
        for (const user of result.users) {
          const state = userState(user);
          if (state === 'pending') pending++; else if (state === 'active') active++; else suspended++;
        }
        next = result.next; page++;
      } while (next && page <= 20);
      const suffix = next ? '以上' : '';
      $('home-pending').textContent = `${pending}人${suffix}`;
      $('home-active').textContent = `${active}人${suffix}`;
      $('home-suspended').textContent = `${suspended}人${suffix}`;
      $('home-next').textContent = pending ? `${pending}人の利用者が登録を待っています。招待の状況を確認してください。` : '招待中の利用者はいません。必要な場合は新しく招待してください。';
      $('home-next-card').classList.toggle('quiet', !pending);
      $('home-next-button').classList.toggle('primary', !!pending);
    } else {
      $('home-key').textContent = '閲覧権限なし'; $('home-key-detail').textContent = '';
      $('home-pending').textContent = '—'; $('home-active').textContent = '—'; $('home-suspended').textContent = '—';
      $('home-next').textContent = '操作履歴を確認できます。';
      $('home-next-card').classList.add('quiet');
      $('home-next-button').classList.remove('primary');
      $('home-next-button').dataset.view = 'audit'; $('home-next-button').textContent = '操作履歴を見る';
    }
    const body = $('home-audit-rows'); body.replaceChildren();
    if (!auditor()) { emptyRow(body, 4, '操作履歴を確認する権限がありません。'); return; }
    const result = await api('audit', {page:1});
    if (!result.rows.length) emptyRow(body, 4, '操作履歴はありません。');
    for (const item of result.rows.slice(0, 5)) {
      const row = body.insertRow(); appendCell(row, date(item.occurred_at)); appendCell(row, actions[item.action] || item.action);
      appendCell(row, auditTarget(item));
      row.insertCell().append(badge(item.action.endsWith('_failed') ? '失敗' : '成功', item.action.endsWith('_failed') ? 'failed' : ''));
    }
  }
  async function showView(name) {
    if ((name === 'key' || name === 'users') && !invitation()) return;
    if (name === 'audit' && !auditor()) return;
    if (name !== 'key') { $('new-key').hidden = true; $('code').textContent = ''; }
    for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== name;
    for (const button of document.querySelectorAll('.side-nav [data-view]')) button.classList.toggle('active', button.dataset.view === name);
    $('breadcrumb-current').textContent = labels[name]; clearStatus();
    if (name === 'home') await loadHome();
    if (name === 'key') await loadKey();
    if (name === 'users') await loadUsers();
    if (name === 'audit') await loadAudit();
  }
  async function enter() {
    const context = await api('context'); roles = context.roles;
    $('entry-shell').hidden = true; $('dashboard').hidden = false;
    $('role-label').textContent = owner() ? '管理責任者' : invitation() ? '招待担当者' : '履歴閲覧者';
    if (invitation()) { $('home-next-button').dataset.view = 'users'; $('home-next-button').textContent = '利用者を確認する'; }
    $('key-issue-card').hidden = !owner(); $('stop').hidden = !owner(); $('open-invite').hidden = !invitation();
    for (const button of document.querySelectorAll('[data-view]')) {
      if (button.dataset.view === 'key' || button.dataset.view === 'users') button.hidden = !invitation();
      if (button.dataset.view === 'audit') button.hidden = !auditor();
    }
    await showView('home');
  }
  function renderUsers() {
    const body = $('user-rows'); body.replaceChildren();
    const query = $('user-filter').value.trim().toLowerCase(), stateFilter = $('user-state-filter').value;
    const visible = users.filter(user => (user.email || '').toLowerCase().includes(query) && (!stateFilter || userState(user) === stateFilter));
    $('user-count').textContent = `このページの${visible.length}件を表示`;
    if (!visible.length) emptyRow(body, 5, '該当する利用者はいません。');
    for (const user of visible) {
      const state = userState(user), row = body.insertRow();
      appendCell(row, user.email); row.insertCell().append(badge(user.email_confirmed_at ? '登録済み' : '招待中', user.email_confirmed_at ? '' : 'pending'));
      row.insertCell().append(badge(state === 'suspended' ? '停止中' : state === 'active' ? '利用中' : '未利用', state === 'suspended' ? 'suspended' : state === 'pending' ? 'neutral' : ''));
      appendCell(row, shortDate(user.invited_at || user.created_at));
      const cell = row.insertCell(), buttons = document.createElement('div'); buttons.className = 'row-actions'; cell.append(buttons);
      if (invitation() && !user.email_confirmed_at && user.email) {
        const resend = document.createElement('button'); resend.textContent = '再送';
        resend.addEventListener('click', () => run(resend, async () => {
          if (!await confirmAction('招待メールを再送しますか', `${user.email} に送信します。`)) return;
          const result = await api('resend_invite', {user_id:user.id}); status(result.message);
        })); buttons.append(resend);
      }
      if (owner()) {
        const control = document.createElement('button'); control.className = 'row-action-main'; control.textContent = state === 'suspended' ? '利用再開' : '利用停止';
        control.addEventListener('click', () => run(control, async () => {
          if (!await confirmAction(`利用を${state === 'suspended' ? '再開' : '停止'}しますか`, `${user.email} の利用状態を変更します。`, state === 'suspended' ? '' : '停止中は、この利用者はログインできなくなります。')) return;
          await api(state === 'suspended' ? 'resume' : 'suspend', {user_id:user.id}); status('利用状態を更新しました。'); await loadUsers();
        })); buttons.append(control);
        if (state === 'suspended') {
          const remove = document.createElement('button'); remove.textContent = '削除'; remove.className = 'danger row-action-delete';
          remove.addEventListener('click', () => run(remove, async () => {
            if (!await confirmAction('利用者を完全に削除しますか', `${user.email} のアカウントと関連データを削除します。`, '装具・利用記録・相談シート・写真を含み、元に戻せません。')) return;
            const result = await api('delete_user', {user_id:user.id}); status(result.message); await loadUsers();
          })); buttons.append(remove);
        }
        const details = document.createElement('details'), summary = document.createElement('summary'), menu = document.createElement('div');
        summary.textContent = '権限'; menu.className = 'role-menu'; details.append(summary, menu);
        for (const [role, title] of [['invitation_operator','招待担当'],['audit_reader','履歴閲覧']]) {
          const button = document.createElement('button'); button.textContent = title;
          button.addEventListener('click', () => run(button, async () => {
            const current = await api('user_roles', {user_id:user.id}), grant = !current.roles.includes(role);
            if (!await confirmAction('担当者権限を変更しますか', `${user.email} の「${title}」権限を${grant ? '付与' : '解除'}します。`)) return;
            await api('role_change', {user_id:user.id, role, grant}); details.open = false; status('担当者権限を変更しました。');
          })); menu.append(button);
        }
        buttons.append(details);
      }
    }
    $('users-page').textContent = `${userPage}ページ`; $('users-prev').disabled = userPage <= 1; $('users-next').disabled = !userNext;
  }
  async function loadUsers() { const result = await api('users', {page:userPage}); users = result.users; userNext = result.next; renderUsers(); }
  function renderAudit() {
    const body = $('audit-rows'); body.replaceChildren();
    const period = Number($('audit-period').value), action = $('audit-action').value, result = $('audit-result').value;
    const cutoff = period ? Date.now() - period * 86400000 : 0;
    const visible = auditRows.filter(item => (!cutoff || new Date(item.occurred_at).getTime() >= cutoff)
      && (!action || item.action.startsWith(action))
      && (!result || (item.action.endsWith('_failed') ? 'failed' : 'success') === result));
    if (!visible.length) emptyRow(body, 5, '該当する操作履歴はありません。');
    for (const item of visible) {
      const row = body.insertRow(); appendCell(row, date(item.occurred_at)); appendCell(row, item.actor_id);
      appendCell(row, actions[item.action] || item.action); appendCell(row, auditTarget(item));
      row.insertCell().append(badge(item.action.endsWith('_failed') ? '失敗' : '成功', item.action.endsWith('_failed') ? 'failed' : ''));
    }
    $('audit-page').textContent = `${auditPage}ページ`; $('audit-prev').disabled = auditPage <= 1; $('audit-next').disabled = !auditNext;
  }
  async function loadAudit() { const data = await api('audit', {page:auditPage}); auditRows = data.rows; auditNext = data.next; renderAudit(); }
  $('login-form').addEventListener('submit', event => { event.preventDefault(); run(event.submitter, async () => {
    const data = await request('/auth/v1/token?grant_type=password', {email:$('email').value.trim(),password:$('password').value});
    token = data.access_token; $('password').value = '';
    try { await enter(); }
    catch (error) { if (error.status === 403) { $('login-panel').hidden = true; $('bootstrap-panel').hidden = false; status('管理権限がありません。初回設定の場合は確認コードを入力してください。', true); } else throw error; }
  }); });
  $('bootstrap-form').addEventListener('submit', event => { event.preventDefault(); run(event.submitter, async () => {
    await api('bootstrap', {token:$('bootstrap-token').value}); $('bootstrap-token').value = ''; await enter(); status('初回管理者の登録が完了しました。');
  }); });
  $('logout').addEventListener('click', () => { logout(); status('ログアウトしました。'); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view).catch(error => status(error.message, true))));
  $('rotate').addEventListener('click', () => run($('rotate'), async () => {
    const memo = $('key-memo').value.trim();
    if (!memo) { $('key-memo').focus(); throw new Error('発行先のメモを入力してください。'); }
    if (!await confirmAction('新しい登録キーを発行しますか', `「${memo}」向けのキーを追加します。現在有効なキーはそのまま使えます。`)) return;
    const result = await api('key_rotate', {memo}); renderKey(result.key); $('key-memo').value = ''; $('code').textContent = result.code; $('new-key').hidden = false; status('新しい登録キーを発行しました。');
    if (auditor()) await loadKeyHistory();
  }));
  async function loadKeyHistory() {
    const body = $('key-history-rows'); body.replaceChildren();
    if (!auditor()) { emptyRow(body, 4, '更新履歴を確認する権限がありません。'); return; }
    const result = await api('audit', {page:1});
    const rows = result.rows.filter(item => ['key_rotate', 'key_update', 'key_delete', 'key_stop'].includes(item.action));
    if (!rows.length) emptyRow(body, 4, '直近50件に登録キーの操作はありません。');
    for (const item of rows.slice(0, 5)) { const row = body.insertRow(); appendCell(row, date(item.occurred_at)); appendCell(row, actions[item.action]); appendCell(row, auditTarget(item)); appendCell(row, item.actor_id); }
  }
  $('stop').addEventListener('click', () => run($('stop'), async () => {
    if (!await confirmAction('登録キーを停止しますか', '有効な登録キーをすべて停止します。', '新しいキーを発行するまで、新規利用登録を受け付けません。')) return;
    const result = await api('key_stop'); renderKey(result.key); $('new-key').hidden = true; $('code').textContent = ''; status('登録キーを停止しました。');
    if (auditor()) await loadKeyHistory();
  }));
  $('hide-key').addEventListener('click', () => { $('new-key').hidden = true; $('code').textContent = ''; });
  $('cancel-key-edit').addEventListener('click', () => $('key-edit-dialog').close());
  $('key-edit-form').addEventListener('submit', event => { event.preventDefault(); run(event.submitter, async () => {
    const memo = $('edit-key-memo').value.trim();
    if (!memo) { $('edit-key-memo').focus(); throw new Error('発行先のメモを入力してください。'); }
    const result = await api('key_update', {key_id:editingKeyId, memo});
    $('key-edit-dialog').close(); renderKey(result.key); status('発行先のメモを変更しました。');
    if (auditor()) await loadKeyHistory();
  }); });
  $('open-invite').addEventListener('click', () => $('invite-dialog').showModal());
  $('close-invite').addEventListener('click', () => $('invite-dialog').close());
  $('cancel-invite').addEventListener('click', () => $('invite-dialog').close());
  $('invite-form').addEventListener('submit', event => { event.preventDefault(); run(event.submitter, async () => {
    const email = $('invite-email').value.trim();
    if (!await confirmAction('招待メールを送りますか', `${email} に送信します。`)) return;
    const result = await api('invite', {email}); $('invite-email').value = ''; $('invite-dialog').close(); status(result.message); await loadUsers();
  }); });
  $('user-filter').addEventListener('input', renderUsers); $('user-state-filter').addEventListener('change', renderUsers);
  for (const id of ['audit-period','audit-action','audit-result']) $(id).addEventListener('change', renderAudit);
  $('users-prev').addEventListener('click', () => { userPage--; loadUsers().catch(error => status(error.message,true)); });
  $('users-next').addEventListener('click', () => { userPage++; loadUsers().catch(error => status(error.message,true)); });
  $('audit-prev').addEventListener('click', () => { auditPage--; loadAudit().catch(error => status(error.message,true)); });
  $('audit-next').addEventListener('click', () => { auditPage++; loadAudit().catch(error => status(error.message,true)); });
  window.addEventListener('pagehide', logout);
})();
