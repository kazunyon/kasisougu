'use strict';
const F03 = (() => {
  const unknown = '未確認';
  const compareQuestions = [
    '重さ', '左手だけでの着脱', '車椅子に座った状態での着脱', '普通の靴との相性',
    '踵・足首への圧迫', '屋外歩行での安定性', '修理・調整のしやすさ'
  ];
  const termGroups = [['support_scope', '分類'], ['material', '素材'], ['joint', '継手'], ['foot_structure', '足元の構造'], ['feature', '特徴']];
  const personalCategoryLabels = {afo:'短下肢装具（AFO）', kafo:'長下肢装具（KAFO）', foot_orthosis:'足底装具', orthopedic_shoe:'靴型装具', other:'その他'};
  let items = [], allTerms = [], filter = 'all', keyword = '', chosen = new Set(), view = 'browse', detailId = null, loadCycle = 0, editingItem = null, editableDetailsSupported = true;
  let catalogTab = 'public', personalItems = [], personalLoaded = false, personalLoadCycle = 0, editingPersonalItem = null;

  function nameOf(item) { return item.product_name || item.title; }
  function termsOf(item, group) {
    return item.terms.map(link => link.kasi_catalog_terms)
      .filter(term => term?.term_group === group && term.is_active !== false);
  }
  function valuesOf(item, group) {
    return termsOf(item, group).map(term => term.label_ja).filter(Boolean).join('、') || unknown;
  }
  function codesOf(item, group) { return termsOf(item, group).map(term => term.code); }
  function checkedOn(item) {
    return item.sources.map(link => link.kasi_catalog_sources?.checked_on).filter(Boolean).sort().at(-1) || unknown;
  }
  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
    catch { return null; }
  }
  function optionalHttps(value, label) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const url = safeUrl(trimmed);
    if (!url) throw new Error(`${label}は「https://」で始まるURLを入力してください。`);
    return url;
  }
  function sourceNode(link) {
    const source = link.kasi_catalog_sources;
    if (!source) return node('span', unknown);
    const label = `${source.publisher_name}「${source.title}」`, url = safeUrl(source.source_url);
    if (!url) return node('span', `${label}（URL未確認）`);
    const anchor = node('a', label); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function imageNode(photo) {
    const figure = node('figure', '', 'catalog-figure'), url = safeUrl(photo?.source_url);
    if (!url) { figure.append(node('p', '写真は未確認です。', 'catalog-image-fallback')); return figure; }
    const image = document.createElement('img'); image.className = 'catalog-photo'; image.src = url;
    image.alt = photo.alt_text || '装具の写真'; image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(node('p', '写真を表示できません。', 'catalog-image-fallback')));
    figure.append(image);
    if (photo.alt_text) figure.append(node('figcaption', photo.alt_text));
    return figure;
  }
  function optionButton(item) {
    const button = node('button', '比較に追加');
    button.type = 'button'; button.className = 'catalog-choice'; button.dataset.itemId = item.id;
    syncOptionButton(button);
    button.addEventListener('click', () => toggle(item.id));
    return button;
  }
  function syncOptionButton(button) {
    const active = chosen.has(button.dataset.itemId);
    button.textContent = active ? '選択中' : '比較に追加';
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = !active && chosen.size >= 3;
  }
  function syncOptionButtons() {
    document.querySelectorAll('#catalog-page .catalog-choice').forEach(syncOptionButton);
  }
  function filteredItems() {
    const words = keyword.toLocaleLowerCase('ja').split(/\s+/).filter(Boolean);
    return items.filter(item => {
      if (filter !== 'all' && !codesOf(item, 'support_scope').includes(filter)) return false;
      const searchable = [item.title, item.product_name, item.summary,
        ...item.terms.map(link => link.kasi_catalog_terms).filter(term => term && term.is_active !== false)
          .flatMap(term => [term.label_ja, term.description])]
        .filter(Boolean).join(' ').toLocaleLowerCase('ja');
      return words.every(word => searchable.includes(word));
    });
  }
  function updateFilterButtons() {
    document.querySelectorAll('.catalog-filter-button').forEach(button => {
      const active = button.dataset.filter === filter;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  function renderBrowse() {
    updateFilterButtons(); $('catalog-list').replaceChildren();
    const found = filteredItems();
    message('catalog-status', `${found.length}件の検索結果（公開済み全${items.length}件）`);
    if (!found.length) $('catalog-list').append(node('p', items.length ? '条件に合う装具はありません。' : '公開済みの記事はありません。', 'empty-state'));
    for (const item of found) {
      const card = node('article', '', 'catalog-card');
      if (item.media.length) card.append(imageNode(item.media[0]));
      card.append(node('p', valuesOf(item, 'support_scope'), 'catalog-card-category'), formattedNode('h3', nameOf(item)), formattedNode('p', item.summary, 'catalog-card-summary'));
      const facts = node('dl', '', 'catalog-card-facts');
      for (const [label, value] of [['素材', valuesOf(item, 'material')], ['足元', valuesOf(item, 'foot_structure')]]) {
        const pair = node('div', '', 'catalog-card-fact'); pair.append(node('dt', label), formattedNode('dd', value)); facts.append(pair);
      }
      card.append(facts);
      const actions = node('div', '', 'catalog-card-actions'), detail = node('button', '詳細を見る');
      detail.type = 'button'; detail.addEventListener('click', () => showDetail(item.id));
      actions.append(detail, optionButton(item)); card.append(actions); $('catalog-list').append(card);
    }
    renderTray();
  }
  function fact(list, label, value) {
    const pair = node('div', '', 'catalog-detail-fact');
    pair.append(node('dt', label), formattedNode('dd', value || unknown)); list.append(pair);
  }
  function renderDetail(item) {
    $('catalog-detail-title').replaceChildren(); appendFormattedText($('catalog-detail-title'), nameOf(item)); $('catalog-detail-body').replaceChildren();
    const body = $('catalog-detail-body');
    const status = node('p', '', 'catalog-detail-status'); status.id = 'catalog-detail-status'; body.append(status);
    if (item.title !== nameOf(item)) body.append(formattedNode('p', item.title, 'catalog-detail-subtitle'));
    const gallery = node('div', '', 'catalog-gallery');
    if (item.media.length) item.media.forEach(photo => gallery.append(imageNode(photo)));
    else gallery.append(node('p', '写真は未確認です。', 'catalog-image-fallback'));
    body.append(gallery);
    if (!editableDetailsSupported) body.append(node('p', '編集機能を利用するには、管理者がF03追加マイグレーションを適用してください。', 'catalog-edit-migration-note'));
    const facts = node('dl', '', 'catalog-detail-facts');
    for (const [label, value] of [
      ['分類', valuesOf(item, 'support_scope')], ['支える範囲', item.support_scope_text || unknown],
      ['素材', valuesOf(item, 'material')], ['継手', valuesOf(item, 'joint')],
      ['足元の構造', valuesOf(item, 'foot_structure')], ['特徴', valuesOf(item, 'feature')],
      ['注意点', item.caution_text || unknown], ['確認日', checkedOn(item)]
    ]) fact(facts, label, value);
    body.append(facts);
    const summary = node('section', '', 'catalog-detail-section');
    summary.append(node('h3', '概要'), formattedNode('p', item.summary)); body.append(summary);
    const questions = node('section', '', 'catalog-detail-section'), list = node('ul', '', 'catalog-question-list');
    questions.append(node('h3', '専門家に確認したいこと（一般的な例）'));
    const questionsToShow = Array.isArray(item.expert_questions) && item.expert_questions.length ? item.expert_questions : ['左手だけで着け外しできるか', '車椅子に座ったまま着けられるか', '普段の靴に合うか', '圧迫や痛みがないか'];
    for (const question of questionsToShow) list.append(formattedNode('li', question));
    questions.append(list); body.append(questions);
    const sources = node('section', '', 'catalog-detail-section'), sourceList = node('ul', '', 'catalog-source-list');
    sources.append(node('h3', '出典'));
    if (!item.sources.length) sourceList.append(node('li', unknown));
    item.sources.forEach(link => { const li = node('li', ''); li.append(sourceNode(link));
      if (link.kasi_catalog_sources?.checked_on) li.append(node('span', `（確認日：${link.kasi_catalog_sources.checked_on}）`));
      sourceList.append(li);
    });
    sources.append(sourceList); body.append(sources);
    const actions = node('div', '', 'catalog-detail-actions'); actions.append(optionButton(item));
    if (editableDetailsSupported) { const edit = node('button', '内容を編集'); edit.type = 'button'; edit.addEventListener('click', () => showEditor(item)); actions.append(edit); }
    body.append(actions);
  }
  function termsForEditor(item, group) {
    const linked = new Set(codesOf(item, group));
    return allTerms.filter(term => term.term_group === group || linked.has(term.code));
  }
  function showEditor(item) {
    editingItem = item;
    $('catalog-edit-title').value = item.title || '';
    $('catalog-edit-product').value = item.product_name || '';
    $('catalog-edit-scope').value = item.support_scope_text || '';
    $('catalog-edit-caution').value = item.caution_text || '';
    $('catalog-edit-summary').value = item.summary || '';
    const source = item.sources[0]?.kasi_catalog_sources || {};
    $('catalog-edit-checked-on').value = source.checked_on || '';
    $('catalog-edit-publisher').value = source.publisher_name || '';
    $('catalog-edit-source-title').value = source.title || '';
    $('catalog-edit-source-url').value = source.source_url || '';
    $('catalog-edit-questions').value = (Array.isArray(item.expert_questions) ? item.expert_questions : []).join('\n');
    const host = $('catalog-edit-terms'); host.replaceChildren();
    for (const [group, label] of termGroups) {
      const wrapper = node('label', '', 'catalog-edit-term-group'); wrapper.append(node('span', label));
      const selectBox = document.createElement('select'); selectBox.multiple = true; selectBox.dataset.group = group; selectBox.setAttribute('aria-label', label);
      termsForEditor(item, group).forEach(term => { const option = new Option(term.label_ja, term.id); option.selected = codesOf(item, group).includes(term.code); selectBox.add(option); });
      wrapper.append(selectBox); host.append(wrapper);
    }
    $('catalog-edit-form').hidden = false; $('catalog-edit-status').textContent = '編集内容を入力してください。'; $('catalog-edit-title').focus();
  }
  function hideEditor() { editingItem = null; $('catalog-edit-form').hidden = true; $('catalog-edit-form').reset(); }
  async function saveEditor(event) {
    event.preventDefault(); if (!editingItem) return;
    const item = editingItem, button = $('catalog-edit-save'); button.disabled = true; message('catalog-edit-status', '図鑑の内容を保存しています…');
    const questions = $('catalog-edit-questions').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    const data = {title:$('catalog-edit-title').value.trim(), product_name:$('catalog-edit-product').value.trim() || null, summary:$('catalog-edit-summary').value.trim(), support_scope_text:$('catalog-edit-scope').value.trim() || null, caution_text:$('catalog-edit-caution').value.trim() || null, expert_questions:questions};
    try {
      if (!data.title || !data.summary) throw new Error('タイトルと概要を入力してください。');
      const rows = await request(`/rest/v1/kasi_catalog_items?id=eq.${item.id}&row_version=eq.${item.row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(data)});
      if (!rows.length) throw new Error('別の管理者が更新しました。図鑑を読み込み直してください。');
      const selects = [...$('catalog-edit-terms').querySelectorAll('select')];
      await request(`/rest/v1/kasi_catalog_item_terms?catalog_item_id=eq.${item.id}`, {method:'DELETE'});
      const links = selects.flatMap(select => [...select.selectedOptions].map((option, index) => ({catalog_item_id:item.id,catalog_term_id:option.value,sort_order:index})));
      if (links.length) await request('/rest/v1/kasi_catalog_item_terms', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(links)});
      const sourceValues = {publisher_name:$('catalog-edit-publisher').value.trim(),title:$('catalog-edit-source-title').value.trim(),source_url:$('catalog-edit-source-url').value.trim() || null,checked_on:$('catalog-edit-checked-on').value};
      const sourceLink = item.sources[0];
      if (sourceValues.publisher_name && sourceValues.title && sourceValues.checked_on) {
        if (sourceLink?.kasi_catalog_sources?.id) {
          const source = sourceLink.kasi_catalog_sources;
          const sourceRows = await request(`/rest/v1/kasi_catalog_sources?id=eq.${source.id}&row_version=eq.${source.row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(sourceValues)});
          if (!sourceRows.length) throw new Error('出典が別の画面で更新されています。');
        } else {
          const sourceRows = await request('/rest/v1/kasi_catalog_sources', {method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({source_type:'other',...sourceValues})});
          if (!sourceRows.length) throw new Error('出典を保存できませんでした。');
          await request('/rest/v1/kasi_catalog_item_sources', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({catalog_item_id:item.id,catalog_source_id:sourceRows[0].id})});
        }
      }
      hideEditor(); await load(); const updated = items.find(row => row.id === item.id); if (updated) { showDetail(updated.id); message('catalog-detail-status', '図鑑の内容を保存しました。'); }
    } catch (error) { message('catalog-edit-status', `保存できませんでした：${error.message}`, true); } finally { button.disabled = false; }
  }
  function renderComparison() {
    const selected = [...chosen].map(id => items.find(item => item.id === id)).filter(Boolean);
    const host = $('catalog-compare-body'); host.replaceChildren();
    const table = node('table', '', 'catalog-compare-table'), head = node('thead', ''), headingRow = node('tr', '');
    headingRow.append(node('th', '比較項目'));
    selected.forEach(item => headingRow.append(node('th', nameOf(item)))); head.append(headingRow); table.append(head);
    const tbody = node('tbody', '');
    const rows = [
      ['分類', item => valuesOf(item, 'support_scope')], ['支える範囲', item => item.support_scope_text || unknown],
      ['素材', item => valuesOf(item, 'material')], ['継手', item => valuesOf(item, 'joint')],
      ['足元の構造', item => valuesOf(item, 'foot_structure')], ['特徴', item => valuesOf(item, 'feature')],
      ['概要', item => item.summary || unknown], ['注意点', item => item.caution_text || unknown],
      ...compareQuestions.map(label => [label, item => Array.isArray(item.expert_questions) && item.expert_questions.length ? item.expert_questions.join('、') : unknown]),
      ['確認日', item => checkedOn(item)]
    ];
    for (const [label, getValue] of rows) {
      const tr = node('tr', ''); tr.append(node('th', label));
      selected.forEach(item => tr.append(formattedNode('td', getValue(item)))); tbody.append(tr);
    }
    const sourceRow = node('tr', ''); sourceRow.append(node('th', '出典'));
    selected.forEach(item => { const cell = node('td', '');
      if (!item.sources.length) cell.textContent = unknown;
      item.sources.forEach(link => { const line = node('div', '', 'catalog-compare-source'); line.append(sourceNode(link)); cell.append(line); });
      sourceRow.append(cell);
    });
    tbody.append(sourceRow); table.append(tbody); host.append(table);
  }
  function renderTray() {
    const tray = $('catalog-selection-tray');
    tray.hidden = $('catalog-page').hidden || catalogTab !== 'public' || view === 'comparison' || chosen.size === 0;
    document.body.classList.toggle('catalog-has-tray', !tray.hidden);
    $('catalog-selection-count').textContent = `${chosen.size}／3件`;
    $('catalog-selected-items').replaceChildren();
    [...chosen].forEach((id, index) => { const item = items.find(row => row.id === id); if (!item) return;
      const row = node('div', '', 'catalog-selected-row'), remove = node('button', '外す');
      remove.type = 'button'; remove.setAttribute('aria-label', `${nameOf(item)}を比較候補から外す`);
      remove.addEventListener('click', () => toggle(id));
      row.append(node('span', `${index + 1}. ${nameOf(item)}`), remove); $('catalog-selected-items').append(row);
    });
    $('catalog-run-comparison').disabled = chosen.size < 2;
    $('catalog-run-comparison').textContent = `${chosen.size}件を比較する`;
  }
  function toggle(id) {
    if (chosen.has(id)) chosen.delete(id);
    else if (chosen.size < 3 && items.some(item => item.id === id)) chosen.add(id);
    syncOptionButtons(); if (view === 'comparison') renderComparison(); renderTray();
  }
  function showBrowse() {
    view = 'browse'; detailId = null;
    $('catalog-browse').hidden = false; $('catalog-detail').hidden = true; $('catalog-comparison').hidden = true;
    renderBrowse(); if (!$('catalog-page').hidden) $('catalog-page').scrollIntoView({block:'start'});
  }
  function showDetail(id) {
    const item = items.find(row => row.id === id); if (!item) return;
    view = 'detail'; detailId = id;
    $('catalog-browse').hidden = true; $('catalog-detail').hidden = false; $('catalog-comparison').hidden = true;
    renderDetail(item); renderTray(); $('catalog-detail-title').focus();
  }
  function showComparison() {
    if (chosen.size < 2) return;
    view = 'comparison'; detailId = null;
    $('catalog-browse').hidden = true; $('catalog-detail').hidden = true; $('catalog-comparison').hidden = false;
    renderComparison(); renderTray(); $('catalog-compare-title').focus();
  }
  function setCatalogTab(nextTab, focus = false) {
    catalogTab = nextTab === 'personal' ? 'personal' : 'public';
    document.querySelectorAll('[data-catalog-tab]').forEach(button => {
      const selected = button.dataset.catalogTab === catalogTab;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    $('catalog-public-panel').hidden = catalogTab !== 'public';
    $('catalog-personal-panel').hidden = catalogTab !== 'personal';
    if (catalogTab === 'personal') {
      hide();
      if (!personalLoaded) loadPersonalItems(); else renderPersonalItems();
    } else renderTray();
    if (focus) $(`catalog-${catalogTab}-tab`).focus();
  }
  function personalImage(item) {
    const url = safeUrl(item.image_url); if (!url) return null;
    const figure = node('figure', '', 'catalog-figure personal-catalog-figure');
    const image = document.createElement('img'); image.className = 'catalog-photo'; image.src = url; image.alt = `${item.title}の写真`; image.loading = 'lazy';
    image.addEventListener('error', () => figure.remove()); figure.append(image); return figure;
  }
  function personalFact(list, label, value) {
    if (!value) return;
    const pair = node('div', '', 'catalog-card-fact'); pair.append(node('dt', label), formattedNode('dd', value)); list.append(pair);
  }
  function renderPersonalItems() {
    const host = $('personal-catalog-list'); host.replaceChildren();
    message('personal-catalog-status', `${personalItems.length}件の自分用装具を表示しています。`);
    if (!personalItems.length) {
      host.append(node('p', '自分で追加した装具はまだありません。「＋ 装具を追加」から登録できます。', 'empty-state personal-catalog-empty')); return;
    }
    personalItems.forEach(item => {
      const card = node('article', '', 'catalog-card personal-catalog-card'), picture = personalImage(item);
      if (picture) card.append(picture);
      card.append(node('p', personalCategoryLabels[item.category_code] || personalCategoryLabels.other, 'catalog-card-category'), formattedNode('h3', item.title), formattedNode('p', item.summary, 'catalog-card-summary'));
      const facts = node('dl', '', 'catalog-card-facts');
      personalFact(facts, '素材', item.material); personalFact(facts, '継手', item.joint_text); personalFact(facts, '足元', item.foot_structure);
      if (facts.children.length) card.append(facts);
      for (const [label, value] of [['特徴', item.feature_text], ['注意点・確認したいこと', item.caution_text]]) {
        if (!value) continue;
        const section = node('section', '', 'personal-catalog-note'); section.append(node('h4', label), formattedNode('p', value)); card.append(section);
      }
      const reference = safeUrl(item.reference_url);
      if (reference) { const anchor = node('a', '参考ページを開く（新しいタブ）', 'resource-link'); anchor.href = reference; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; card.append(anchor); }
      const actions = node('div', '', 'catalog-card-actions personal-catalog-actions');
      const edit = node('button', '編集する'); edit.type = 'button'; edit.addEventListener('click', () => showPersonalForm(item));
      const remove = node('button', '削除する'); remove.type = 'button'; remove.className = 'danger-button'; remove.addEventListener('click', () => deletePersonalItem(item));
      actions.append(edit, remove); card.append(actions); host.append(card);
    });
  }
  async function loadPersonalItems() {
    const cycle = ++personalLoadCycle; message('personal-catalog-status', '自分で追加した装具を読み込んでいます…');
    try {
      const rows = await select('kasi_personal_catalog_items', 'select=id,title,category_code,summary,material,joint_text,foot_structure,feature_text,caution_text,reference_url,image_url,row_version,updated_at&deleted_at=is.null&order=updated_at.desc');
      if (cycle !== personalLoadCycle) return;
      personalItems = rows; personalLoaded = true; renderPersonalItems();
    } catch (error) {
      if (cycle !== personalLoadCycle) return;
      personalItems = []; personalLoaded = false; $('personal-catalog-list').replaceChildren();
      message('personal-catalog-status', `自分用の図鑑を読み込めませんでした：${error.message}`, true);
    }
  }
  function showPersonalForm(item = null) {
    editingPersonalItem = item; $('personal-catalog-form').reset();
    $('personal-catalog-form-title').textContent = item ? '自分用の装具を編集' : '自分用の装具を追加';
    const values = {
      'personal-catalog-name':item?.title, 'personal-catalog-material':item?.material, 'personal-catalog-joint':item?.joint_text,
      'personal-catalog-foot':item?.foot_structure, 'personal-catalog-image-url':item?.image_url,
      'personal-catalog-reference-url':item?.reference_url, 'personal-catalog-summary':item?.summary,
      'personal-catalog-feature':item?.feature_text, 'personal-catalog-caution':item?.caution_text
    };
    Object.entries(values).forEach(([id, value]) => { $(id).value = value || ''; });
    $('personal-catalog-category').value = item?.category_code || 'afo';
    message('personal-catalog-form-status', item ? '内容を変更して保存してください。' : '自分用に残す内容を入力してください。');
    $('personal-catalog-form').hidden = false; $('personal-catalog-name').focus();
  }
  function hidePersonalForm() { editingPersonalItem = null; $('personal-catalog-form').hidden = true; $('personal-catalog-form').reset(); message('personal-catalog-form-status', ''); }
  async function savePersonalItem(event) {
    event.preventDefault(); const button = $('personal-catalog-save'), current = editingPersonalItem;
    try {
      const data = {
        title:$('personal-catalog-name').value.trim(), category_code:$('personal-catalog-category').value, summary:$('personal-catalog-summary').value.trim(),
        material:$('personal-catalog-material').value.trim() || null, joint_text:$('personal-catalog-joint').value.trim() || null,
        foot_structure:$('personal-catalog-foot').value.trim() || null, feature_text:$('personal-catalog-feature').value.trim() || null,
        caution_text:$('personal-catalog-caution').value.trim() || null,
        reference_url:optionalHttps($('personal-catalog-reference-url').value, '参考URL'), image_url:optionalHttps($('personal-catalog-image-url').value, '写真URL')
      };
      if (!data.title || !data.summary) throw new Error('名前と概要を入力してください。');
      button.disabled = true; message('personal-catalog-form-status', '保存しています…');
      const path = current ? `/rest/v1/kasi_personal_catalog_items?id=eq.${current.id}&row_version=eq.${current.row_version}` : '/rest/v1/kasi_personal_catalog_items';
      const rows = await request(path, {method:current ? 'PATCH' : 'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(data)});
      if (!rows.length) throw new Error(current ? '別の画面で更新されています。読み込み直して再度お試しください。' : '保存結果を確認できませんでした。');
      hidePersonalForm(); await loadPersonalItems(); message('personal-catalog-status', current ? '自分用の装具を更新しました。' : '自分用の装具を追加しました。');
    } catch (error) { message('personal-catalog-form-status', `保存できませんでした：${error.message}`, true); }
    finally { button.disabled = false; }
  }
  async function deletePersonalItem(item) {
    if (!confirm(`「${item.title}」を削除しますか？`)) return;
    try {
      const rows = await request(`/rest/v1/kasi_personal_catalog_items?id=eq.${item.id}&row_version=eq.${item.row_version}`, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({deleted_at:new Date().toISOString()})});
      if (!rows.length) throw new Error('別の画面で更新されています。読み込み直して再度お試しください。');
      if (editingPersonalItem?.id === item.id) hidePersonalForm();
      await loadPersonalItems(); message('personal-catalog-status', '自分用の装具を削除しました。');
    } catch (error) { message('personal-catalog-status', `削除できませんでした：${error.message}`, true); }
  }
  async function load() {
    const cycle = ++loadCycle;
    try {
      let rows;
      try {
        rows = await select('kasi_catalog_items', 'select=id,title,product_name,summary,support_scope_text,caution_text,expert_questions,publication_status,reviewed_at,row_version&publication_status=eq.published&deleted_at=is.null&order=published_at.desc');
        editableDetailsSupported = true;
      } catch (error) {
        // Keep the published catalog readable until the additive F03 migration is applied.
        editableDetailsSupported = false;
        rows = await select('kasi_catalog_items', 'select=id,title,product_name,summary,publication_status,reviewed_at,row_version&publication_status=eq.published&deleted_at=is.null&order=published_at.desc');
      }
      const ids = rows.map(row => row.id), condition = `catalog_item_id=in.(${ids.join(',')})`;
      const [terms, media, links, availableTerms] = ids.length ? await Promise.all([
        select('kasi_catalog_item_terms', `select=catalog_item_id,sort_order,kasi_catalog_terms(id,term_group,code,label_ja,description,is_active)&${condition}&order=sort_order.asc`),
        select('kasi_catalog_media', `select=catalog_item_id,alt_text,source_url,sort_order&${condition}&order=sort_order.asc`),
        select('kasi_catalog_item_sources', `select=catalog_item_id,kasi_catalog_sources(id,source_type,publisher_name,title,source_url,checked_on,row_version)&${condition}`),
        select('kasi_catalog_terms', 'select=id,term_group,code,label_ja,description,is_active&is_active=eq.true&order=term_group.asc,sort_order.asc')
      ]) : [[], [], [], []];
      if (cycle !== loadCycle) return;
      allTerms = availableTerms;
      items = rows.map(row => ({...row,
        terms: terms.filter(link => link.catalog_item_id === row.id),
        media: media.filter(photo => photo.catalog_item_id === row.id),
        sources: links.filter(link => link.catalog_item_id === row.id)
      }));
      chosen = new Set([...chosen].filter(id => items.some(item => item.id === id)));
      showBrowse();
    } catch (error) {
      if (cycle !== loadCycle) return;
      items = []; chosen.clear(); showBrowse(); message('catalog-status', `図鑑を読み込めませんでした：${error.message}`, true);
    }
  }
  function reset() {
    loadCycle++; personalLoadCycle++; items = []; allTerms = []; filter = 'all'; keyword = ''; chosen.clear(); view = 'browse'; detailId = null; hideEditor();
    personalItems = []; personalLoaded = false; editingPersonalItem = null; hidePersonalForm(); setCatalogTab('public');
    $('catalog-keyword').value = ''; $('catalog-list').replaceChildren(); $('catalog-detail-body').replaceChildren();
    $('catalog-compare-body').replaceChildren(); $('catalog-browse').hidden = false;
    $('catalog-detail').hidden = true; $('catalog-comparison').hidden = true; $('catalog-selection-tray').hidden = true;
    document.body.classList.remove('catalog-has-tray');
  }
  function hide() { $('catalog-selection-tray').hidden = true; document.body.classList.remove('catalog-has-tray'); }

  $('catalog-search-form').addEventListener('submit', event => {
    event.preventDefault(); keyword = $('catalog-keyword').value.trim(); renderBrowse();
  });
  $('catalog-clear').addEventListener('click', () => {
    keyword = ''; filter = 'all'; $('catalog-keyword').value = ''; renderBrowse(); $('catalog-keyword').focus();
  });
  document.querySelectorAll('.catalog-filter-button').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter; renderBrowse();
  }));
  $('catalog-detail-back').addEventListener('click', showBrowse);
  $('catalog-edit-cancel').addEventListener('click', hideEditor);
  $('catalog-edit-form').addEventListener('submit', saveEditor);
  $('catalog-compare-back').addEventListener('click', showBrowse);
  $('catalog-clear-selection').addEventListener('click', () => {
    chosen.clear(); syncOptionButtons(); renderTray();
  });
  $('catalog-run-comparison').addEventListener('click', showComparison);
  document.querySelectorAll('[data-catalog-tab]').forEach(button => {
    button.addEventListener('click', () => setCatalogTab(button.dataset.catalogTab));
    button.addEventListener('keydown', event => {
      const tabs = [...document.querySelectorAll('[data-catalog-tab]')], index = tabs.indexOf(button);
      let target = null;
      if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') target = tabs[0];
      if (event.key === 'End') target = tabs.at(-1);
      if (!target) return;
      event.preventDefault(); setCatalogTab(target.dataset.catalogTab, true);
    });
  });
  $('personal-catalog-add').addEventListener('click', () => showPersonalForm());
  $('personal-catalog-cancel').addEventListener('click', hidePersonalForm);
  $('personal-catalog-form').addEventListener('submit', savePersonalItem);
  async function resume() {
    // Preserve the search, comparison, detail and unfinished administrator edits.
    if (!items.length) await load();
    if (catalogTab === 'personal') {
      setCatalogTab('personal');
      if (!personalLoaded) await loadPersonalItems();
    } else renderTray();
  }
  return {load, reset, hide, resume};
})();
window.KASI_F03 = F03;
