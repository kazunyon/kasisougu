'use strict';
const recordCategories = [
  ['weight', '重さ'], ['fatigue', '疲れやすさ'], ['pain', '痛み・圧迫'],
  ['ease_of_putting_on', '着け外し'], ['shoe_fit', '靴との相性'],
  ['stability', '安定性'], ['comfort', '快適さ'], ['other', 'その他']
];
const resultLabels = {not_evaluated: '未評価', no_issue: '問題なし', issue: '気になる'};
const assistanceLabels = {not_evaluated: '未評価', independent: '自立', partial_assistance: '一部介助', full_assistance: '全介助'};
const F04 = (() => {
  let records = [], selected = null, editing = null, media = [], urls = [], renderSerial = 0, registeringOrthosis = false, saving = false;
  const orthosisTypeLabels = {kafo:'長下肢装具',afo:'短下肢装具',other:'その他'};
  const orthosisGroup = code => code === 'kafo' || code === 'afo' ? code : 'other';
  const title = row => `${row.record_kind === 'comparison' ? '【比較用】' : ''}${row.recorded_on} · ${orthoses.find(o => o.id === row.user_orthosis_id)?.nickname || '装具名未取得'}`;
  const observation = (row, category) => row.observations?.find(o => o.category_code === category);
  const value = v => v === null || v === undefined || v === '' ? '未記入' : String(v);
  function emptyOption(text) { const option = node('option', text); option.value = ''; return option; }
  function updateOrthosisChoices(preferredId = '') {
    const type = $('record-orthosis-type').value, available = orthoses.filter(item => orthosisGroup(item.orthosis_type_code) === type);
    const selectEl = $('record-orthosis'); selectEl.replaceChildren();
    if (!available.length) selectEl.append(emptyOption(`${orthosisTypeLabels[type]}は未登録です`));
    available.forEach(item => { const option = node('option', `${item.nickname}（${ownershipLabels[item.ownership_status]}）`); option.value = item.id; selectEl.append(option); });
    selectEl.value = available.find(item => item.id === preferredId)?.id || available[0]?.id || '';
    message('record-orthosis-guide', available.length
      ? `${orthosisTypeLabels[type]}は${available.length}件登録済みです。使った装具を選んでください。`
      : `${orthosisTypeLabels[type]}は未登録です。「選択した種類の装具を追加」から登録してください。`);
  }
  function updateChoices() {
    updateOrthosisChoices($('record-orthosis').value);
    for (const id of ['compare-first', 'compare-second']) {
      const selectEl = $(id), previous = selectEl.value; selectEl.replaceChildren(emptyOption('記録を選択'));
      records.forEach(row => { const option = node('option', title(row)); option.value = row.id; selectEl.append(option); });
      selectEl.value = records.some(row => row.id === previous) ? previous : '';
    }
  }
  function renderList() {
    $('record-picker').replaceChildren(emptyOption('記録を選択（過去分もここから）'));
    records.forEach(row => { const option = node('option', title(row)); option.value = row.id; $('record-picker').append(option); });
    $('record-picker').value = selected?.id || '';
    $('record-list').replaceChildren();
    if (!records.length) $('record-list').append(node('p', '保存済みの記録はありません。', 'empty-state'));
    records.forEach(row => {
      const card = node('article', '', 'record-card');
      card.dataset.recordId = row.id;
      card.classList.toggle('selected', row.id === selected?.id);
      card.append(node('h3', title(row)), node('p', `${value(row.usage_setting)} · ${row.duration_minutes == null ? '使用時間未記入' : `${row.duration_minutes}分`}`), node('p', row.overall_note || '感想・メモなし'));
      const button = node('button', 'この記録を開く'); button.type = 'button'; button.setAttribute('aria-controls', 'record-detail'); button.setAttribute('aria-pressed', String(row.id === selected?.id)); button.addEventListener('click', () => open(row.id)); card.append(button);
      $('record-list').append(card);
    });
    message('record-list-status', records.length ? `${records.length}件の記録を表示しています。` : 'まだ記録がありません。');
    updateChoices();
  }
  function renderHomeRecords() {
    const box = $('record-summary'); box.replaceChildren();
    if (!records.length) box.append(node('p', '保存された記録はありません。'));
    records.slice(0, 3).forEach(row => box.append(node('p', `${row.recorded_on} · ${orthoses.find(o => o.id === row.user_orthosis_id)?.nickname || '装具'} · ${row.overall_note || 'メモなし'}`)));
  }
  async function load() {
    const rows = await select('kasi_usage_records', 'select=*&deleted_at=is.null&order=recorded_on.desc,created_at.desc');
    const obs = await select('kasi_usage_record_observations', 'select=id,usage_record_id,category_code,result_code,rating,note,row_version&deleted_at=is.null');
    records = rows.map(row => ({...row, observations: obs.filter(o => o.usage_record_id === row.id)}));
    selected = records.find(row => row.id === selected?.id) || null;
    renderList(); renderHomeRecords();
    if (!$('compare-result').hidden) {
      if ($('compare-first').value && $('compare-second').value) compare();
      else { $('compare-result').hidden = true; message('compare-status', ''); }
    }
    return records;
  }
  async function init() {
    const formVisible = !$('record-form').hidden, chosenOrthosis = $('record-orthosis').value, chosenType = $('record-orthosis-type').value;
    const detailVisible = !$('record-detail').hidden, detailId = selected?.id;
    await load();
    if (formVisible) { $('record-orthosis-type').value = chosenType; updateOrthosisChoices(chosenOrthosis); }
    else if (detailVisible && detailId) await open(detailId);
    else {
      const baseline = records.find(row => row.record_kind !== 'comparison' && orthoses.some(o => o.id === row.user_orthosis_id && o.ownership_status === 'owned')) || records.find(row => row.record_kind !== 'comparison');
      if (baseline) await open(baseline.id); else showForm();
    }
  }
  function makeEvaluationInputs() {
    $('record-evaluations').replaceChildren();
    recordCategories.forEach(([code, label]) => {
      const panel = node('section', '', 'evaluation-row'); panel.append(node('h3', label));
      const resultLabel = node('label', '結果'); const result = document.createElement('select'); result.id = `result-${code}`;
      for (const [key, text] of Object.entries(resultLabels)) { const option = node('option', text); option.value = key; result.append(option); }
      resultLabel.append(result);
      const ratingLabel = node('label', '5段階評価（任意）'); const rating = document.createElement('select'); rating.id = `rating-${code}`;
      rating.append(emptyOption('未設定'));
      for (let n = 1; n <= 5; n++) { const option = node('option', String(n)); option.value = String(n); rating.append(option); }
      result.addEventListener('change', () => { rating.disabled = result.value === 'not_evaluated'; if (rating.disabled) rating.value = ''; });
      ratingLabel.append(rating);
      const noteLabel = node('label', '具体的な様子（任意）'); const note = document.createElement('input'); note.id = `note-${code}`; note.maxLength = 500; note.placeholder = `例：${label}について`; noteLabel.append(note);
      panel.append(resultLabel, ratingLabel, noteLabel); $('record-evaluations').append(panel);
    });
  }
  function fillForm(row) {
    $('record-form').reset();
    const related = orthoses.find(item => item.id === row?.user_orthosis_id) || orthoses.find(item => item.ownership_status === 'owned') || orthoses[0];
    $('record-orthosis-type').value = related ? orthosisGroup(related.orthosis_type_code) : 'kafo';
    updateChoices();
    $('recorded-on').value = row?.recorded_on || new Date().toLocaleDateString('sv-SE');
    updateOrthosisChoices(row?.user_orthosis_id || related?.id);
    $('record-footwear').value = row?.footwear || '';
    $('record-setting').value = row?.usage_setting || '';
    $('record-assistance').value = row?.assistance_level || 'not_evaluated';
    $('record-duration').value = row?.duration_minutes ?? '';
    $('record-note').value = row?.overall_note || '';
    recordCategories.forEach(([code]) => {
      const obs = row && observation(row, code);
      $(`result-${code}`).value = obs?.result_code || 'not_evaluated';
      $(`rating-${code}`).value = obs?.rating ?? '';
      $(`rating-${code}`).disabled = !obs || obs.result_code === 'not_evaluated';
      $(`note-${code}`).value = obs?.note || '';
    });
  }
  function showForm(row = null) {
    editing = row; selected = row; fillForm(row);
    $('record-picker').value = row?.id || '';
    $('record-current-state').textContent = row?.record_kind === 'comparison' ? '比較用' : ownershipLabels[orthoses.find(o => o.id === row?.user_orthosis_id)?.ownership_status] || '未保存';
    $('record-form-title').textContent = row?.record_kind === 'comparison' ? '比較用の記録を編集' : '現在の記録';
    $('record-detail').hidden = true; $('record-form').hidden = false;
    message('record-status', '');
  }
  async function closeForm() { if (editing && records.some(row => row.id === editing.id)) await open(editing.id); else showForm(); }
  function addOrthosis() {
    registeringOrthosis = true;
    const type = $('record-orthosis-type').value;
    setScreen('orthosis'); showOrthosisForm();
    $('orthosis-type').value = type; $('orthosis-name').value = orthosisTypeLabels[type];
  }
  async function orthosisSaved(id) {
    if (!registeringOrthosis) return false;
    registeringOrthosis = false;
    await load();
    const item = orthoses.find(row => row.id === id);
    $('record-orthosis-type').value = orthosisGroup(item?.orthosis_type_code);
    updateOrthosisChoices(id);
    $('record-detail').hidden = true; $('record-form').hidden = false; setScreen('record');
    message('record-status', `${item?.nickname || '装具'}を追加しました。続けて記録を保存できます。`);
    return true;
  }
  function cancelOrthosisRegistration() {
    if (!registeringOrthosis) return false;
    registeringOrthosis = false; setScreen('record'); return true;
  }
  function leaveOrthosisRegistration() { registeringOrthosis = false; }
  function facts(row) {
    const entries = [['使用日', row.recorded_on], ['装具', orthoses.find(o => o.id === row.user_orthosis_id)?.nickname || '未登録'], ['靴', value(row.footwear)], ['場所・訓練内容', value(row.usage_setting)], ['介助', assistanceLabels[row.assistance_level] || '未評価'], ['使用時間', row.duration_minutes == null ? '未記入' : `${row.duration_minutes}分`], ['感想・メモ', value(row.overall_note)]];
    $('record-facts').replaceChildren(); entries.forEach(([a,b]) => $('record-facts').append(node('dt',a),node('dd',b)));
  }
  function renderEvaluationDetails(row) {
    $('record-detail-evaluations').replaceChildren();
    recordCategories.forEach(([code, label]) => {
      const obs = observation(row, code), result = resultLabels[obs?.result_code || 'not_evaluated'];
      $('record-detail-evaluations').append(node('p', `${label}：${result}${obs?.rating ? `（${obs.rating}/5）` : ''}${obs?.note ? `\n${obs.note}` : ''}`));
    });
  }
  function clearUrls() { renderSerial++; urls.forEach(url => URL.revokeObjectURL(url)); urls = []; }
  async function renderMedia() {
    clearUrls(); const serial = renderSerial, id = selected?.id, currentToken = token;
    $('record-photo-list').replaceChildren();
    if (!media.length) $('record-photo-list').append(node('p', '写真はまだありません。'));
    for (const photo of media) {
      const card = node('figure', '', 'photo-card'); const img = document.createElement('img'); img.alt = photo.caption || photo.original_filename || '使用記録の写真';
      const caption = document.createElement('input'); caption.value = photo.caption || ''; caption.maxLength = 200; caption.setAttribute('aria-label', '写真の説明');
      const save = node('button', '説明を保存'); save.type = 'button'; save.addEventListener('click', () => updateCaption(photo, caption.value));
      const remove = node('button', '写真を削除'); remove.type = 'button'; remove.addEventListener('click', () => removePhoto(photo));
      const label = node('figcaption', photo.original_filename || '写真'); label.append(caption, save, remove); card.append(img, label); $('record-photo-list').append(card);
      try {
        const response = await storageRequest(storagePath(photo.storage_path, true)); const blob = await response.blob();
        if (serial !== renderSerial || selected?.id !== id || token !== currentToken) return;
        const url = URL.createObjectURL(blob); urls.push(url); img.src = url;
      } catch (error) { img.replaceWith(node('p', `写真を表示できません：${error.message}`, 'error')); }
    }
  }
  async function loadMedia() {
    if (!selected) return;
    const id = selected.id;
    const rows = await select('kasi_user_media', `select=id,storage_path,original_filename,caption,mime_type,sort_order,row_version&usage_record_id=eq.${id}&deleted_at=is.null&order=sort_order.asc,created_at.asc`);
    if (selected?.id === id) { media = rows; await renderMedia(); }
  }
  async function open(id) {
    selected = records.find(row => row.id === id) || null; if (!selected) return;
    showForm(selected); $('record-detail').hidden = false; facts(selected); renderEvaluationDetails(selected);
    $('record-list').querySelectorAll('.record-card').forEach(card => {
      const active = card.dataset.recordId === id;
      card.classList.toggle('selected', active);
      card.querySelector('button').setAttribute('aria-pressed', String(active));
    });
    message('record-photo-status', '写真を読み込み中…');
    try { await loadMedia(); message('record-photo-status', `${media.length}枚の写真を表示しています。`); }
    catch (error) { message('record-photo-status', error.message, true); }
  }
  function collectObservations() {
    return recordCategories.map(([code]) => ({
      category_code: code, result_code: $(`result-${code}`).value,
      rating: $(`result-${code}`).value === 'not_evaluated' || !$(`rating-${code}`).value ? null : Number($(`rating-${code}`).value),
      note: $(`note-${code}`).value.trim() || null
    }));
  }
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    const copy = event.submitter?.id === 'record-save-comparison';
    if (copy && !editing) return message('record-status', '先に現在の記録を保存してください。', true);
    saving = true;
    const controls = [...$('record-form').querySelectorAll('button, input, select, textarea'), $('record-picker'), $('record-add')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => control.disabled = true);
    const session = token, owner = userId, baseline = editing;
    try {
      if (!orthoses.some(item => item.id === $('record-orthosis').value && orthosisGroup(item.orthosis_type_code) === $('record-orthosis-type').value))
        throw new Error('選択した種類の装具を登録し、関連する装具を選んでください。');
      const data = {user_orthosis_id:$('record-orthosis').value, recorded_on:$('recorded-on').value, footwear:$('record-footwear').value.trim() || null, usage_setting:$('record-setting').value.trim() || null, assistance_level:$('record-assistance').value, duration_minutes:$('record-duration').value ? Number($('record-duration').value) : null, overall_note:$('record-note').value.trim() || null};
      const saved = await request('/rest/v1/rpc/kasi_save_usage_record', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_id:baseline?.id || null,p_version:baseline?.row_version || null,p_comparison:copy,p_record:data,p_observations:collectObservations()})});
      if (token !== session || userId !== owner) return;
      await load();
      if (copy) {
        // Keep the baseline and unsaved form values; copying must never switch to the copy.
        selected = records.find(row => row.id === baseline.id); editing = selected;
        $('record-picker').value = baseline.id;
        $('compare-first').value = baseline.id; $('compare-second').value = saved.id;
        compare();
      } else await open(saved.id);
      message('record-status', copy ? '比較用として別に保存しました。現在の記録は変更していません。' : '表示中の記録を保存しました。');
    } catch (error) {
      if (token === session && userId === owner) message('record-status', `保存できませんでした：${error.message}`, true);
    } finally { saving = false; controls.forEach((control, i) => control.disabled = disabled[i]);
      recordCategories.forEach(([code]) => { $(`rating-${code}`).disabled = $(`result-${code}`).value === 'not_evaluated'; }); }
  }
  async function updateCaption(photo, caption) {
    try {
      const rows = await request(`/rest/v1/kasi_user_media?id=eq.${photo.id}&row_version=eq.${photo.row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({caption:caption.trim() || null})});
      if (!rows.length) throw new Error('写真が別の画面で更新されています。');
      await loadMedia(); message('record-photo-status', '説明を保存しました。');
    } catch (error) { message('record-photo-status', error.message, true); }
  }
  async function removePhoto(photo) {
    if (!confirm('この記録の写真を削除しますか？')) return;
    try {
      const rows = await request(`/rest/v1/kasi_user_media?id=eq.${photo.id}&row_version=eq.${photo.row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({deleted_at:new Date().toISOString()})});
      if (!rows.length) throw new Error('写真が別の画面で更新されています。');
      try { await deleteStorageObject(photo.storage_path); }
      catch (error) {
        await request(`/rest/v1/kasi_user_media?id=eq.${photo.id}&row_version=eq.${rows[0].row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({deleted_at:null})});
        throw error;
      }
      await loadMedia(); message('record-photo-status', '写真を削除しました。');
    } catch (error) { message('record-photo-status', error.message, true); }
  }
  async function uploadPhoto(event) {
    event.preventDefault(); const button = event.submitter, file = $('record-photo-file').files[0], recordId = selected?.id;
    if (!recordId || !file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size < 1 || file.size > 10485760) return message('record-photo-status','JPEG・PNG・WebPの10MB以下の写真を選んでください。',true);
    button.disabled = true; let path = '', uploaded = false, metadataSaved = false;
    try {
      const current = await select('kasi_user_media', `select=id&usage_record_id=eq.${recordId}&deleted_at=is.null`);
      if (current.length >= 10) throw new Error('記録ごとの写真は最大10枚です。');
      const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
      path = `${userId}/records/${recordId}/${crypto.randomUUID()}.${extension}`;
      await storageRequest(storagePath(path), {method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file}); uploaded = true;
      await request('/rest/v1/kasi_user_media', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usage_record_id:recordId,storage_path:path,original_filename:file.name,mime_type:file.type,byte_size:file.size,caption:$('record-photo-caption').value.trim() || null,sort_order:current.length})}); metadataSaved = true;
      $('record-photo-form').reset(); if (selected?.id === recordId) { await loadMedia(); message('record-photo-status','写真を保存しました。'); }
    } catch (error) {
      if (uploaded && !metadataSaved) { try { await deleteStorageObject(path); } catch { message('record-photo-status',`保存に失敗し、アップロード済み写真の後片付けも失敗しました：${error.message}`,true); return; } }
      if (metadataSaved) return message('record-photo-status',`写真は保存されましたが表示を更新できませんでした。画面を開き直してください：${error.message}`,true);
      message('record-photo-status',error.message,true);
    } finally { button.disabled = false; }
  }
  function compareRows(a,b) {
    const durationSame = a.duration_minutes != null && b.duration_minutes != null && Math.abs(a.duration_minutes-b.duration_minutes) <= Math.max(5, Math.round(Math.max(a.duration_minutes,b.duration_minutes)*0.2));
    const conditions = [
      ['靴', value(a.footwear), value(b.footwear), !!a.footwear && a.footwear === b.footwear],
      ['場所・訓練内容', value(a.usage_setting), value(b.usage_setting), !!a.usage_setting && a.usage_setting === b.usage_setting],
      ['介助', assistanceLabels[a.assistance_level], assistanceLabels[b.assistance_level], a.assistance_level !== 'not_evaluated' && a.assistance_level === b.assistance_level],
      ['使用時間', a.duration_minutes == null ? '未記入' : `${a.duration_minutes}分`, b.duration_minutes == null ? '未記入' : `${b.duration_minutes}分`, durationSame]
    ];
    const evaluations = recordCategories.map(([code,label]) => {
      const show = row => { const o=observation(row,code); return `${resultLabels[o?.result_code || 'not_evaluated']}${o?.rating ? `（${o.rating}/5）` : ''}${o?.note ? `\n${o.note}` : ''}`; };
      return [label,show(a),show(b)];
    });
    return {conditions,evaluations};
  }
  function comparisonTable(a,b) {
    const table = node('table','','comparison-table'), head = document.createElement('thead'), tr = document.createElement('tr');
    ['比較項目',title(a),title(b)].forEach(v => tr.append(node('th',v))); head.append(tr); table.append(head);
    const body = document.createElement('tbody'), {conditions,evaluations}=compareRows(a,b);
    [...conditions.map(([label,x,y,same]) => [label,x,y,same ? '同条件' : '条件が異なる／未記入']), ...evaluations.map(([label,x,y]) => [label,x,y,''])].forEach(([label,x,y,match]) => {
      const row = document.createElement('tr'); row.append(node('th',label),node('td',x),node('td',`${y}${match ? `\n${match}` : ''}`)); body.append(row);
    });
    table.append(body); return table;
  }
  function compare() {
    const a = records.find(r => r.id === $('compare-first').value), b = records.find(r => r.id === $('compare-second').value);
    if (!a || !b || a.id === b.id) return message('compare-status','異なる2件を選んでください。',true);
    $('compare-result').replaceChildren(); $('compare-result').append(comparisonTable(a,b)); $('compare-result').hidden = false;
    const same = compareRows(a,b).conditions.every(x => x[3]);
    message('compare-status', same ? '主要条件がそろっています。評価の違いを専門職と確認してください。' : '条件が異なる項目があります。装具の違いだけによる変化とは断定できません。',!same);
  }
  function reset() {
    clearUrls(); records = []; selected = null; editing = null; media = []; registeringOrthosis = false;
    $('record-picker').replaceChildren(); $('record-current-state').textContent = ''; $('record-form').reset();
    $('record-list').replaceChildren(); $('record-detail').hidden = true; $('record-form').hidden = true;
    $('record-photo-list').replaceChildren(); $('compare-result').replaceChildren(); $('compare-result').hidden = true;
    $('record-summary').replaceChildren(node('p', '保存された記録はありません。'));
  }
  makeEvaluationInputs();
  $('record-orthosis-type').addEventListener('change', () => updateOrthosisChoices());
  $('record-add-orthosis').addEventListener('click', addOrthosis);
  $('record-add').addEventListener('click', () => { if (!editing || confirm('入力中の変更を破棄して、別の日・装具の記録を入力しますか？')) showForm(); });
  $('record-picker').addEventListener('change', async () => { const id = $('record-picker').value; if (!id) { $('record-picker').value = editing?.id || ''; return; } if (editing && !confirm('入力中の変更を破棄して、選択した記録を開きますか？')) { $('record-picker').value = editing.id; return; } await open(id); });
  $('record-edit').addEventListener('click', () => showForm(selected));
  $('record-cancel').addEventListener('click', closeForm);
  $('record-form').addEventListener('submit', save);
  $('record-photo-form').addEventListener('submit', uploadPhoto);
  $('compare-run').addEventListener('click', compare);
  for (const id of ['compare-first', 'compare-second']) $(id).addEventListener('change', () => { $('compare-result').hidden = true; message('compare-status', ''); });
  return {init,load,open,renderHomeRecords,clearUrls,reset,orthosisSaved,cancelOrthosisRegistration,leaveOrthosisRegistration,getRecords:() => records,comparisonTable};
})();
window.KASI_F04 = F04;
