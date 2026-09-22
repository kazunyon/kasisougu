'use strict';
const KASI_CONCERNS = (() => {
  let concerns = [], editing = null;
  const ids = ['concern-filter-orthosis', 'concern-orthosis'];
  function options() {
    const orthosisOptions = KASI_F04.getOrthosisOptions();
    ids.forEach(id => {
      const field = $(id), selected = field.value;
      field.replaceChildren(new Option(id === 'concern-filter-orthosis' ? 'すべての装具' : '対象装具を選択', ''));
      orthosisOptions.forEach(item => field.add(new Option(item.label, item.id)));
      field.value = selected;
    });
  }
  function resetForm() {
    editing = null;
    $('concern-form').reset();
    $('concern-form').hidden = true;
    $('concern-form-title').textContent = '気になったこと・変化を追加';
    $('concern-resolved-on').disabled = true;
  }
  function render() {
    const list = $('concern-list'); list.replaceChildren();
    const visible = concerns.filter(item =>
      (!$('concern-filter-orthosis').value || item.user_orthosis_id === $('concern-filter-orthosis').value) &&
      (!$('concern-filter-category').value || item.category_code === $('concern-filter-category').value) &&
      (!$('concern-filter-status').value || item.status_code === $('concern-filter-status').value));
    if (!visible.length) list.append(node('p', '条件に合う気になったこと・変化はありません。', 'empty-state'));
    visible.forEach(item => {
      const card = node('article', '', 'concern-card');
      const orthosisName = orthoses.find(row => row.id === item.user_orthosis_id)?.nickname || '装具未確認';
      card.append(node('h3', `${item.noted_on} · ${concernCategoryLabels[item.category_code] || 'その他'}`),
        formattedNode('p', item.description),
        node('p', `対象装具：${orthosisName} · 対応状況：${concernStatusLabels[item.status_code] || '未対応'}`));
      if (item.occurred_timing) card.append(formattedNode('p', `発生時期：${item.occurred_timing}`));
      if (item.action_note) card.append(formattedNode('p', `対応内容：${item.action_note}`));
      if (item.resolved_on) card.append(node('p', `解決日：${item.resolved_on}`));
      const actions = node('div', '', 'item-actions');
      const edit = node('button', '編集する'); edit.type = 'button';
      edit.addEventListener('click', () => {
        editing = item;
        $('concern-form-title').textContent = '気になったこと・変化を編集';
        $('concern-orthosis').value = item.user_orthosis_id;
        $('concern-date').value = item.noted_on;
        $('concern-category').value = item.category_code;
        $('concern-state').value = item.status_code;
        $('concern-timing').value = item.occurred_timing || '';
        $('concern-description').value = item.description;
        $('concern-action').value = item.action_note || '';
        $('concern-resolved-on').disabled = item.status_code !== 'resolved';
        $('concern-resolved-on').value = item.resolved_on || '';
        $('concern-form').hidden = false;
        $('concern-description').focus();
      });
      const remove = node('button', '削除する', 'danger-button'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!confirm('この「気になったこと・変化」を削除しますか？')) return;
        remove.disabled = true;
        try {
          const rows = await request(`/rest/v1/kasi_usage_record_concerns?id=eq.${item.id}&row_version=eq.${item.row_version}&deleted_at=is.null`, {
            method:'PATCH', headers:{'Content-Type':'application/json',Prefer:'return=representation'},
            body:JSON.stringify({deleted_at:new Date().toISOString()})
          });
          if (!rows.length) throw new Error('別の画面で更新または削除されています。');
          await load(); message('concern-status', '気になったこと・変化を削除しました。');
        } catch (error) { message('concern-status', error.message, true); remove.disabled = false; }
      });
      actions.append(edit, remove); card.append(actions); list.append(card);
    });
  }
  async function load() {
    await KASI_F04.load();
    options();
    $('concern-list').replaceChildren();
    const currentToken = token;
    const rows = await select('kasi_usage_record_concerns', 'select=id,user_orthosis_id,usage_record_id,noted_on,category_code,description,occurred_timing,status_code,action_note,resolved_on,row_version&deleted_at=is.null&order=noted_on.desc,created_at.desc');
    if (!token || token !== currentToken) return;
    concerns = rows;
    resetForm(); render(); message('concern-status', '');
  }
  $('concern-add').addEventListener('click', () => {
    resetForm(); options();
    $('concern-orthosis').value = $('concern-filter-orthosis').value;
    $('concern-date').value = new Date().toLocaleDateString('sv-SE');
    $('concern-form').hidden = false; $('concern-orthosis').focus();
  });
  $('concern-cancel').addEventListener('click', resetForm);
  $('concern-state').addEventListener('change', () => {
    const resolved = $('concern-state').value === 'resolved';
    $('concern-resolved-on').disabled = !resolved;
    if (!resolved) $('concern-resolved-on').value = '';
  });
  ['concern-filter-orthosis', 'concern-filter-category', 'concern-filter-status'].forEach(id => $(id).addEventListener('change', render));
  $('concerns-to-sheet').addEventListener('click', () => navigateTo('consultation'));
  $('concern-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    const item = editing, statusCode = $('concern-state').value;
    const data = {
      user_orthosis_id:$('concern-orthosis').value,
      noted_on:$('concern-date').value,
      category_code:$('concern-category').value,
      description:$('concern-description').value.trim(),
      occurred_timing:$('concern-timing').value.trim() || null,
      status_code:statusCode,
      action_note:$('concern-action').value.trim() || null,
      resolved_on:statusCode === 'resolved' ? ($('concern-resolved-on').value || null) : null
    };
    try {
      if (!data.user_orthosis_id || !data.description) throw new Error('対象装具と内容を入力してください。');
      const path = item ? `/rest/v1/kasi_usage_record_concerns?id=eq.${item.id}&row_version=eq.${item.row_version}` : '/rest/v1/kasi_usage_record_concerns';
      const rows = await request(path, {method:item ? 'PATCH' : 'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(data)});
      if (!rows.length) throw new Error('別の画面で更新されています。再読み込みしてください。');
      await load(); message('concern-status', item ? '気になったこと・変化を更新しました。' : '気になったこと・変化を追加しました。');
    } catch (error) { message('concern-status', `保存できませんでした：${error.message}`, true); }
    finally { button.disabled = false; }
  });
  function reset() {
    concerns = []; resetForm(); $('concern-list').replaceChildren(); message('concern-status', '');
  }
  return {load, reset};
})();
