'use strict';
const recordCategories = [
  ['weight', '重さ'], ['fatigue', '疲れやすさ'], ['pain', '痛み・圧迫'],
  ['ease_of_putting_on', '着け外し'], ['shoe_fit', '靴との相性'],
  ['stability', '安定性'], ['comfort', '快適さ'], ['other', 'その他']
];
const resultLabels = {not_evaluated: '未評価', no_issue: '問題なし', issue: '気になる'};
const assistanceLabels = {not_evaluated: '未評価', independent: '自立', partial_assistance: '一部介助', full_assistance: '全介助'};
const F04 = (() => {
  let records = [], selected = null, editing = null, media = [], urls = [], renderSerial = 0;
  const title = row => `${row.recorded_on} · ${orthoses.find(o => o.id === row.user_orthosis_id)?.nickname || '装具名未取得'}`;
  const observation = (row, category) => row.observations?.find(o => o.category_code === category);
  const value = v => v === null || v === undefined || v === '' ? '未記入' : String(v);
  function emptyOption(text) { const option = node('option', text); option.value = ''; return option; }
  function updateChoices() {
    $('record-orthosis').replaceChildren();
    if (!orthoses.length) $('record-orthosis').append(emptyOption('先に装具を登録してください'));
    orthoses.forEach(item => { const option = node('option', `${item.nickname}（${ownershipLabels[item.ownership_status]}）`); option.value = item.id; $('record-orthosis').append(option); });
    for (const id of ['compare-first', 'compare-second']) {
      const selectEl = $(id); selectEl.replaceChildren(emptyOption('記録を選択'));
      records.forEach(row => { const option = node('option', title(row)); option.value = row.id; selectEl.append(option); });
    }
  }
  function renderList() {
    $('record-list').replaceChildren();
    if (!records.length) $('record-list').append(node('p', '保存済みの記録はありません。', 'empty-state'));
    records.forEach(row => {
      const card = node('article', '', 'record-card');
      card.append(node('h3', title(row)), node('p', `${value(row.usage_setting)} · ${row.duration_minutes == null ? '使用時間未記入' : `${row.duration_minutes}分`}`), node('p', row.overall_note || '感想・メモなし'));
      const button = node('button', '詳細を見る'); button.type = 'button'; button.addEventListener('click', () => open(row.id)); card.append(button);
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
    const rows = await select('kasi_usage_records', 'select=id,user_orthosis_id,recorded_on,footwear,usage_setting,assistance_level,duration_minutes,overall_note,row_version&deleted_at=is.null&order=recorded_on.desc,created_at.desc');
    const obs = await select('kasi_usage_record_observations', 'select=id,usage_record_id,category_code,result_code,rating,note,row_version&deleted_at=is.null');
    records = rows.map(row => ({...row, observations: obs.filter(o => o.usage_record_id === row.id)}));
    selected = records.find(row => row.id === selected?.id) || null;
    renderList(); renderHomeRecords();
    return records;
  }
  async function init() {
    const formVisible = !$('record-form').hidden, chosenOrthosis = $('record-orthosis').value;
    const detailVisible = !$('record-detail').hidden, detailId = selected?.id;
    await load();
    if (formVisible) $('record-orthosis').value = chosenOrthosis;
    else if (detailVisible && detailId) await open(detailId);
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
    $('record-form').reset(); updateChoices();
    $('recorded-on').value = row?.recorded_on || new Date().toLocaleDateString('sv-SE');
    $('record-orthosis').value = row?.user_orthosis_id || orthoses[0]?.id || '';
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
    editing = row; fillForm(row);
    $('record-form-title').textContent = row ? '記録を編集' : '新しい記録を追加';
    $('record-detail').hidden = true; $('record-form').hidden = false;
    message('record-status', ''); $('recorded-on').focus();
  }
  function closeForm() { $('record-form').hidden = true; $('record-detail').hidden = !selected; }
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
    $('record-form').hidden = true; $('record-detail').hidden = false; facts(selected); renderEvaluationDetails(selected);
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
  async function saveEvaluations(id, values, old) {
    const pending = [], creates = [];
    for (const item of values) {
      const found = old?.find(o => o.category_code === item.category_code);
      if (found) pending.push(request(`/rest/v1/kasi_usage_record_observations?id=eq.${found.id}&row_version=eq.${found.row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(item)}).then(rows => { if (!rows.length) throw new Error('評価が別の画面で更新されました。'); }));
      else creates.push({...item, usage_record_id:id});
    }
    if (creates.length) pending.push(request('/rest/v1/kasi_usage_record_observations', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(creates)}));
    await Promise.all(pending);
  }
  async function save(event) {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try {
      if (!$('record-orthosis').value) throw new Error('関連する装具を選んでください。');
      const row = editing, data = {user_orthosis_id:$('record-orthosis').value, recorded_on:$('recorded-on').value, footwear:$('record-footwear').value.trim() || null, usage_setting:$('record-setting').value.trim() || null, assistance_level:$('record-assistance').value, duration_minutes:$('record-duration').value ? Number($('record-duration').value) : null, overall_note:$('record-note').value.trim() || null};
      const values = collectObservations();
      const rows = await request(row ? `/rest/v1/kasi_usage_records?id=eq.${row.id}&row_version=eq.${row.row_version}` : '/rest/v1/kasi_usage_records', {method:row?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(data)});
      if (!rows.length) throw new Error('記録が別の画面で更新されています。再読み込みしてください。');
      await saveEvaluations(rows[0].id, values, row?.observations);
      await load(); await open(rows[0].id); message('record-list-status', '記録を保存しました。');
    } catch (error) { message('record-status', `${error.message} 記録と評価が一部だけ保存された可能性があります。詳細を再読み込みして確認してください。`, true); }
    finally { button.disabled = false; }
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
    clearUrls(); records = []; selected = null; editing = null; media = [];
    $('record-list').replaceChildren(); $('record-detail').hidden = true; $('record-form').hidden = true;
    $('record-photo-list').replaceChildren(); $('compare-result').replaceChildren(); $('compare-result').hidden = true;
    $('record-summary').replaceChildren(node('p', '保存された記録はありません。'));
  }
  makeEvaluationInputs();
  $('record-add').addEventListener('click', () => showForm());
  $('record-edit').addEventListener('click', () => showForm(selected));
  $('record-cancel').addEventListener('click', closeForm);
  $('record-form').addEventListener('submit', save);
  $('record-photo-form').addEventListener('submit', uploadPhoto);
  $('compare-run').addEventListener('click', compare);
  return {init,load,open,renderHomeRecords,clearUrls,reset,getRecords:() => records,comparisonTable};
})();
window.KASI_F04 = F04;
