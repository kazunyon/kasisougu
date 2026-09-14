'use strict';
const F05 = (() => {
  let sheets = [], selected = null, needsForSheet = [], photosForSheet = [], previewUrls = [], previewSerial = 0;
  const text = value => value === null || value === undefined || value === '' ? '未記入' : String(value);
  const orthosisName = id => orthoses.find(row => row.id === id)?.nickname || '装具';
  function clearUrls() { previewSerial++; previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; }
  function checkList(id, items, label, checkedIds) {
    const box = $(id); box.replaceChildren();
    if (!items.length) box.append(node('p', '選べる項目はありません。', 'empty-state'));
    items.forEach(item => {
      const wrapper = node('label', '', 'sheet-choice'), input = document.createElement('input');
      input.type = 'checkbox'; input.value = item.id; input.checked = checkedIds.includes(item.id);
      wrapper.append(input, node('span', label(item))); box.append(wrapper);
    });
  }
  function selectedIds(id) { return [...$(id).querySelectorAll('input:checked')].map(input => input.value); }
  function renderSelections(saved = {}) {
    const chosen = saved.selected || {};
    checkList('sheet-orthoses', orthoses, row => `${ownershipLabels[row.ownership_status]} · ${row.nickname}`, chosen.orthoses || []);
    checkList('sheet-needs', needsForSheet, row => `${row.need_type === 'problem' ? '困りごと' : '希望'} · ${orthosisName(row.user_orthosis_id)} · ${row.description}`, chosen.needs || []);
    checkList('sheet-records', KASI_F04.getRecords(), row => `${row.recorded_on} · ${orthosisName(row.user_orthosis_id)} · ${row.overall_note || 'メモなし'}`, chosen.records || []);
    checkList('sheet-photos', photosForSheet, row => `${row.usage_record_id ? '使用記録' : '装具'} · ${row.caption || row.original_filename || '写真'}`, chosen.photos || []);
  }
  function renderList() {
    $('sheet-list').replaceChildren();
    if (!sheets.length) $('sheet-list').append(node('p', '保存済みの相談シートはありません。', 'empty-state'));
    sheets.forEach(row => {
      const card = node('article', '', 'record-card');
      card.append(node('h3', row.title), node('p', `${row.consultation_on || '相談日未記入'} · ${row.status_code === 'finalized' ? '確定済み' : '下書き'}`));
      const button = node('button', row.status_code === 'finalized' ? '内容を見る' : '開いて編集');
      button.type = 'button'; button.addEventListener('click', () => open(row.id)); card.append(button); $('sheet-list').append(card);
    });
    message('sheet-list-status', `${sheets.length}件の相談シートを表示しています。`);
  }
  async function load() {
    sheets = await select('kasi_consultation_sheets', 'select=id,title,consultation_on,display_name,question_text,include_photos,status_code,snapshot_json,finalized_at,row_version&deleted_at=is.null&order=updated_at.desc');
    selected = sheets.find(row => row.id === selected?.id) || null; renderList();
  }
  async function init() {
    const formVisible = !$('consultation-form').hidden, previewVisible = !$('consultation-preview').hidden;
    const chosen = formVisible ? {orthoses:selectedIds('sheet-orthoses'),needs:selectedIds('sheet-needs'),records:selectedIds('sheet-records'),photos:selectedIds('sheet-photos')} : null;
    await loadOrthoses(); await KASI_F04.load();
    [needsForSheet, photosForSheet] = await Promise.all([
      select('kasi_user_needs', 'select=id,user_orthosis_id,need_type,category_code,description,priority,status_code&deleted_at=is.null&order=created_at.asc'),
      select('kasi_user_media', 'select=id,user_orthosis_id,usage_record_id,storage_path,original_filename,mime_type,caption,sort_order&deleted_at=is.null&order=created_at.asc')
    ]);
    await load(); renderSelections(chosen ? {selected:chosen} : {});
    if (selected?.status_code === 'finalized') await showPreview(selected.snapshot_json || {});
    else if (formVisible && previewVisible) await showPreview(buildSnapshot());
    else if (!formVisible) $('consultation-preview').hidden = true;
  }
  function newSheet() {
    selected = null; $('consultation-form').reset(); $('sheet-title').value = '相談シート';
    $('sheet-form-title').textContent = '新しい相談シート'; renderSelections();
    $('consultation-form').hidden = false; $('consultation-preview').hidden = true; clearUrls();
    message('consultation-status', ''); $('sheet-title').focus();
  }
  function open(id) {
    const row = sheets.find(item => item.id === id); if (!row) return;
    selected = row; clearUrls();
    if (row.status_code === 'finalized') {
      $('consultation-form').hidden = true; showPreview(row.snapshot_json || {});
      message('sheet-list-status', '確定済みの内容は変更できません。'); return;
    }
    const snapshot = row.snapshot_json || {};
    $('sheet-title').value = row.title; $('sheet-display-name').value = row.display_name || '';
    $('consultation-on').value = row.consultation_on || '';
    $('consultation-recipient').value = snapshot.recipient || '';
    $('consultation-question').value = row.question_text || '';
    renderSelections(snapshot); $('sheet-form-title').textContent = '下書きを編集';
    $('consultation-form').hidden = false; $('consultation-preview').hidden = true;
    message('consultation-status', ''); $('sheet-title').focus();
  }
  function buildSnapshot() {
    const ids = {
      orthoses: selectedIds('sheet-orthoses'), needs: selectedIds('sheet-needs'),
      records: selectedIds('sheet-records'), photos: selectedIds('sheet-photos')
    };
    const records = KASI_F04.getRecords();
    return {
      version: 1, captured_at: new Date().toISOString(), selected: ids,
      title: $('sheet-title').value.trim() || '相談シート', display_name: $('sheet-display-name').value.trim(),
      consultation_on: $('consultation-on').value || null, recipient: $('consultation-recipient').value.trim(),
      question_text: $('consultation-question').value.trim(),
      orthoses: ids.orthoses.map(id => orthoses.find(row => row.id === id)).filter(Boolean).map(row => ({
        id: row.id, nickname: row.nickname, ownership_status: row.ownership_status,
        side_code: row.side_code, orthosis_type_code: row.orthosis_type_code,
        manufactured_on: row.manufactured_on, manufactured_year: row.manufactured_year, manufacturer_name: row.manufacturer_name
      })),
      needs: ids.needs.map(id => needsForSheet.find(row => row.id === id)).filter(Boolean).map(row => ({
        id: row.id, orthosis_name: orthosisName(row.user_orthosis_id), need_type: row.need_type,
        category_code: row.category_code, description: row.description, priority: row.priority, status_code: row.status_code
      })),
      records: ids.records.map(id => records.find(row => row.id === id)).filter(Boolean).map(row => ({
        id: row.id, orthosis_name: orthosisName(row.user_orthosis_id), recorded_on: row.recorded_on,
        footwear: row.footwear, usage_setting: row.usage_setting, assistance_level: row.assistance_level,
        duration_minutes: row.duration_minutes, overall_note: row.overall_note,
        observations: recordCategories.map(([code]) => row.observations?.find(item => item.category_code === code)).filter(Boolean)
          .map(item => ({category_code:item.category_code,result_code:item.result_code,rating:item.rating,note:item.note}))
      })),
      photos: ids.photos.map(id => photosForSheet.find(row => row.id === id)).filter(Boolean).map(row => ({
        id: row.id, storage_path: row.storage_path, original_filename: row.original_filename,
        mime_type: row.mime_type, caption: row.caption, source: row.usage_record_id ? '使用記録' : '装具'
      }))
    };
  }
  function sheetData(snapshot) {
    return {title:snapshot.title,consultation_on:snapshot.consultation_on,display_name:snapshot.display_name || null,
      question_text:snapshot.question_text || null,include_photos:snapshot.photos.length > 0,snapshot_json:snapshot,snapshot_version:1};
  }
  async function persistDraft(snapshot) {
    if (selected?.status_code === 'finalized') throw new Error('確定済みの相談シートは編集できません。');
    const path = selected ? `/rest/v1/kasi_consultation_sheets?id=eq.${selected.id}&row_version=eq.${selected.row_version}` : '/rest/v1/kasi_consultation_sheets';
    const rows = await request(path, {method:selected ? 'PATCH' : 'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify({...sheetData(snapshot),status_code:'draft'})});
    if (!rows.length) throw new Error('別の画面で更新されています。再読み込みしてください。');
    selected = rows[0]; await load(); return selected;
  }
  async function save(event) {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try { const snapshot = buildSnapshot(); await persistDraft(snapshot); await showPreview(snapshot); message('consultation-status', '下書きを保存しました。'); }
    catch (error) { message('consultation-status', error.message, true); }
    finally { button.disabled = false; }
  }
  async function copyPhotos(snapshot, sheetId) {
    const copied = [];
    try {
      for (const photo of snapshot.photos) {
        const response = await storageRequest(storagePath(photo.storage_path, true)); const blob = await response.blob();
        const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.mime_type];
        if (!ext || blob.size < 1 || blob.size > 10485760) throw new Error('写真の形式・容量を確認できません。');
        const path = `${userId}/consultations/${sheetId}/${crypto.randomUUID()}.${ext}`;
        await storageRequest(storagePath(path), {method:'POST',headers:{'Content-Type':photo.mime_type,'x-upsert':'false'},body:blob});
        copied.push(path); photo.storage_path = path;
      }
      return copied;
    } catch (error) {
      await Promise.allSettled(copied.map(deleteStorageObject)); throw error;
    }
  }
  async function finalize() {
    const button = $('sheet-finalize'); button.disabled = true;
    let copied = [];
    try {
      if (selected?.status_code === 'finalized') throw new Error('すでに確定済みです。');
      const snapshot = buildSnapshot();
      if (!snapshot.orthoses.length && !snapshot.needs.length && !snapshot.records.length && !snapshot.photos.length && !snapshot.question_text)
        throw new Error('掲載内容か聞きたいことを入力してください。');
      if (!confirm('現在の内容を確定しますか？確定後は編集できません。')) return;
      const row = await persistDraft(snapshot);
      copied = await copyPhotos(snapshot, row.id);
      const rows = await request(`/rest/v1/kasi_consultation_sheets?id=eq.${row.id}&row_version=eq.${row.row_version}`, {
        method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},
        body:JSON.stringify({...sheetData(snapshot),status_code:'finalized',finalized_at:new Date().toISOString()})
      });
      if (!rows.length) throw new Error('確定前に別の画面で更新されました。');
      copied = []; selected = rows[0]; await load(); $('consultation-form').hidden = true;
      await showPreview(snapshot); message('sheet-list-status', '相談シートを確定しました。写真は確定内容用に保存されています。');
    } catch (error) {
      if (copied.length) await Promise.allSettled(copied.map(deleteStorageObject));
      message('consultation-status', `${error.message} 下書きは保存されている場合があります。`, true);
    } finally { button.disabled = false; }
  }
  function section(body, heading) { const area = node('section', '', 'sheet-section'); area.append(node('h3', heading)); body.append(area); return area; }
  function paragraph(parent, label, value) { parent.append(node('p', `${label}：${text(value)}`)); }
  function comparisonForSnapshot(rows) {
    const table = node('table','','comparison-table'), head = node('thead',''), header = node('tr','');
    ['比較項目', ...rows.map(row => `${row.recorded_on} · ${row.orthosis_name}`)].forEach(x => header.append(node('th',x)));
    head.append(header); table.append(head); const tbody = node('tbody','');
    const fields = [['靴',r => r.footwear],['場所・訓練内容',r => r.usage_setting],['介助',r => assistanceLabels[r.assistance_level] || '未評価'],['使用時間',r => r.duration_minutes == null ? null : `${r.duration_minutes}分`],
      ...recordCategories.map(([code,label]) => [label, r => { const obs = r.observations?.find(item => item.category_code === code); return `${resultLabels[obs?.result_code || 'not_evaluated']}${obs?.rating ? `（${obs.rating}/5）` : ''}${obs?.note ? `：${obs.note}` : ''}`; }])];
    fields.forEach(([label,get]) => { const tr = node('tr',''); tr.append(node('th',label)); rows.forEach(row => tr.append(node('td',text(get(row))))); tbody.append(tr); });
    table.append(tbody); return table;
  }
  async function showPreview(snapshot) {
    clearUrls(); const serial = previewSerial, body = $('consultation-preview-body'); body.replaceChildren();
    $('sheet-preview-title').textContent = snapshot.title || '相談シート';
    const meta = section(body,'相談の概要');
    paragraph(meta,'本人名',snapshot.display_name); paragraph(meta,'相談日',snapshot.consultation_on); paragraph(meta,'相談先',snapshot.recipient);
    paragraph(meta,'作成日',snapshot.captured_at ? snapshot.captured_at.slice(0,10) : new Date().toLocaleDateString('sv-SE'));
    if (snapshot.orthoses?.length) { const area=section(body,'掲載する装具'); snapshot.orthoses.forEach(row => paragraph(area,ownershipLabels[row.ownership_status] || '装具',`${row.nickname}${row.manufacturer_name ? `／${row.manufacturer_name}` : ''}`)); }
    if (snapshot.needs?.length) { const area=section(body,'困りごと・希望'); snapshot.needs.forEach(row => paragraph(area,`${row.need_type === 'problem' ? '困りごと' : '希望'}（${row.orthosis_name}）`,row.description)); }
    if (snapshot.records?.length) { const area=section(body,'使用記録'); snapshot.records.forEach(row => paragraph(area,`${row.recorded_on}・${row.orthosis_name}`,row.overall_note || 'メモなし')); if (snapshot.records.length >= 2) area.append(comparisonForSnapshot(snapshot.records)); else { const row=snapshot.records[0]; recordCategories.forEach(([code,label]) => { const obs=row.observations?.find(item => item.category_code === code); paragraph(area,label,`${resultLabels[obs?.result_code || 'not_evaluated']}${obs?.note ? `：${obs.note}` : ''}`); }); } }
    if (snapshot.photos?.length) { const area=section(body,'写真'), gallery=node('div','','sheet-photo-grid'); area.classList.add('sheet-photos-section'); area.append(gallery);
      for (const photo of snapshot.photos) { const figure=node('figure','','sheet-photo'), image=document.createElement('img'); image.alt=photo.caption || photo.original_filename || '写真'; figure.append(image,node('figcaption',photo.caption || photo.original_filename || photo.source)); gallery.append(figure);
        try { const response=await storageRequest(storagePath(photo.storage_path,true)); const blob=await response.blob(); if(serial !== previewSerial || !token) return; const url=URL.createObjectURL(blob); previewUrls.push(url); image.src=url; }
        catch(error) { image.replaceWith(node('p',`写真を表示できません：${error.message}`,'error')); }
      }
    }
    const questions=section(body,'聞きたいこと'); questions.append(node('p',text(snapshot.question_text)));
    const answers=section(body,'専門家の記入欄'); answers.append(node('div','','expert-writing-space'));
    $('consultation-preview').hidden=false;
  }
  $('sheet-add').addEventListener('click', newSheet);
  $('sheet-cancel').addEventListener('click', () => { $('consultation-form').hidden=true; message('consultation-status','編集をやめました。'); });
  $('sheet-preview-button').addEventListener('click', () => showPreview(buildSnapshot()).catch(error => message('consultation-status',error.message,true)));
  $('consultation-form').addEventListener('submit',save);
  $('sheet-finalize').addEventListener('click',finalize);
  $('print-consultation').addEventListener('click',() => window.print());
  function reset() {
    clearUrls(); sheets = []; selected = null; needsForSheet = []; photosForSheet = [];
    $('sheet-list').replaceChildren(); $('consultation-form').hidden = true;
    $('consultation-preview').hidden = true; $('consultation-preview-body').replaceChildren();
  }
  return {init,load,clearUrls,reset};
})();
window.KASI_F05 = F05;
