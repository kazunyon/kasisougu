'use strict';
const F03 = (() => {
  const unknown = '未確認';
  const compareQuestions = [
    '重さ', '左手だけでの着脱', '車椅子に座った状態での着脱', '普通の靴との相性',
    '踵・足首への圧迫', '屋外歩行での安定性', '修理・調整のしやすさ'
  ];
  let items = [], filter = 'all', keyword = '', chosen = new Set(), view = 'browse', detailId = null, loadCycle = 0;

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
      card.append(node('p', valuesOf(item, 'support_scope'), 'catalog-card-category'), node('h3', nameOf(item)), node('p', item.summary, 'catalog-card-summary'));
      const facts = node('dl', '', 'catalog-card-facts');
      for (const [label, value] of [['素材', valuesOf(item, 'material')], ['足元', valuesOf(item, 'foot_structure')]]) {
        const pair = node('div', '', 'catalog-card-fact'); pair.append(node('dt', label), node('dd', value)); facts.append(pair);
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
    pair.append(node('dt', label), node('dd', value || unknown)); list.append(pair);
  }
  function renderDetail(item) {
    $('catalog-detail-title').textContent = nameOf(item); $('catalog-detail-body').replaceChildren();
    const body = $('catalog-detail-body');
    if (item.title !== nameOf(item)) body.append(node('p', item.title, 'catalog-detail-subtitle'));
    const gallery = node('div', '', 'catalog-gallery');
    if (item.media.length) item.media.forEach(photo => gallery.append(imageNode(photo)));
    else gallery.append(node('p', '写真は未確認です。', 'catalog-image-fallback'));
    body.append(gallery);
    const facts = node('dl', '', 'catalog-detail-facts');
    for (const [label, value] of [
      ['分類', valuesOf(item, 'support_scope')], ['支える範囲', unknown],
      ['素材', valuesOf(item, 'material')], ['継手', valuesOf(item, 'joint')],
      ['足元の構造', valuesOf(item, 'foot_structure')], ['特徴', valuesOf(item, 'feature')],
      ['注意点', unknown], ['確認日', checkedOn(item)]
    ]) fact(facts, label, value);
    body.append(facts);
    const summary = node('section', '', 'catalog-detail-section');
    summary.append(node('h3', '概要'), node('p', item.summary)); body.append(summary);
    const questions = node('section', '', 'catalog-detail-section'), list = node('ul', '', 'catalog-question-list');
    questions.append(node('h3', '専門家に確認したいこと（一般的な例）'));
    for (const question of ['左手だけで着け外しできるか', '車椅子に座ったまま着けられるか', '普段の靴に合うか', '圧迫や痛みがないか']) list.append(node('li', question));
    questions.append(list); body.append(questions);
    const sources = node('section', '', 'catalog-detail-section'), sourceList = node('ul', '', 'catalog-source-list');
    sources.append(node('h3', '出典'));
    if (!item.sources.length) sourceList.append(node('li', unknown));
    item.sources.forEach(link => { const li = node('li', ''); li.append(sourceNode(link));
      if (link.kasi_catalog_sources?.checked_on) li.append(node('span', `（確認日：${link.kasi_catalog_sources.checked_on}）`));
      sourceList.append(li);
    });
    sources.append(sourceList); body.append(sources);
    const actions = node('div', '', 'catalog-detail-actions'); actions.append(optionButton(item)); body.append(actions);
  }
  function renderComparison() {
    const selected = [...chosen].map(id => items.find(item => item.id === id)).filter(Boolean);
    const host = $('catalog-compare-body'); host.replaceChildren();
    const table = node('table', '', 'catalog-compare-table'), head = node('thead', ''), headingRow = node('tr', '');
    headingRow.append(node('th', '比較項目'));
    selected.forEach(item => headingRow.append(node('th', nameOf(item)))); head.append(headingRow); table.append(head);
    const tbody = node('tbody', '');
    const rows = [
      ['分類', item => valuesOf(item, 'support_scope')], ['支える範囲', () => unknown],
      ['素材', item => valuesOf(item, 'material')], ['継手', item => valuesOf(item, 'joint')],
      ['足元の構造', item => valuesOf(item, 'foot_structure')], ['特徴', item => valuesOf(item, 'feature')],
      ['概要', item => item.summary || unknown], ['注意点', () => unknown],
      ...compareQuestions.map(label => [label, () => unknown]),
      ['確認日', item => checkedOn(item)]
    ];
    for (const [label, getValue] of rows) {
      const tr = node('tr', ''); tr.append(node('th', label));
      selected.forEach(item => tr.append(node('td', getValue(item)))); tbody.append(tr);
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
    tray.hidden = $('catalog-page').hidden || view === 'comparison' || chosen.size === 0;
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
  async function load() {
    const cycle = ++loadCycle;
    try {
      const rows = await select('kasi_catalog_items', 'select=id,title,product_name,summary,reviewed_at&publication_status=eq.published&deleted_at=is.null&order=published_at.desc');
      const ids = rows.map(row => row.id), condition = `catalog_item_id=in.(${ids.join(',')})`;
      const [terms, media, links] = ids.length ? await Promise.all([
        select('kasi_catalog_item_terms', `select=catalog_item_id,sort_order,kasi_catalog_terms(term_group,code,label_ja,description,is_active)&${condition}&order=sort_order.asc`),
        select('kasi_catalog_media', `select=catalog_item_id,alt_text,source_url,sort_order&${condition}&order=sort_order.asc`),
        select('kasi_catalog_item_sources', `select=catalog_item_id,kasi_catalog_sources(publisher_name,title,source_url,checked_on)&${condition}`)
      ]) : [[], [], []];
      if (cycle !== loadCycle) return;
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
    loadCycle++; items = []; filter = 'all'; keyword = ''; chosen.clear(); view = 'browse'; detailId = null;
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
  $('catalog-compare-back').addEventListener('click', showBrowse);
  $('catalog-clear-selection').addEventListener('click', () => {
    chosen.clear(); syncOptionButtons(); renderTray();
  });
  $('catalog-run-comparison').addEventListener('click', showComparison);
  return {load, reset, hide};
})();
window.KASI_F03 = F03;
