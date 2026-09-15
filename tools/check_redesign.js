// Run against a locally served Pages build with:
// playwright-cli -s=green-redesign run-code --filename tools/check_redesign.js
// All API calls use synthetic fixtures; no account or live data is accessed.
async (page) => {
  const appUrl = page.url();
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
  });
  await page.goto('about:blank');
  await page.unrouteAll({behavior:'wait'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const orthoses = [
    {id:'orthosis-1',nickname:'長下肢装具',orthosis_type_code:'kafo',ownership_status:'owned',side_code:'left',row_version:1},
    {id:'orthosis-2',nickname:'短下肢装具',orthosis_type_code:'afo',ownership_status:'trial',side_code:'left',row_version:1},
    {id:'orthosis-3',nickname:'その他',orthosis_type_code:'other',ownership_status:'trial',row_version:1},
    {id:'orthosis-4',nickname:'その他',orthosis_type_code:'other',ownership_status:'trial',row_version:1},
    {id:'orthosis-5',nickname:'過去の長下肢装具',orthosis_type_code:'kafo',ownership_status:'past',row_version:1}
  ];
  const records = [
    {id:'record-1',user_orthosis_id:'orthosis-2',recorded_on:'2026-09-14',usage_setting:'室内での訓練',duration_minutes:180,assistance_level:'independent',overall_note:'着け外しを相談したい',row_version:1},
    {id:'record-2',user_orthosis_id:'orthosis-1',recorded_on:'2026-09-13',usage_setting:'室内での訓練',duration_minutes:120,assistance_level:'independent',overall_note:'いつも通り使用しました',row_version:1}
  ];
  const profile = {user_id:'test-user',display_name:'テスト利用者',text_scale:100,device_storage_enabled:false,row_version:1};
  const tables = {
    kasi_user_orthoses:orthoses,
    kasi_usage_records:records,
    kasi_usage_record_observations:[{id:'obs-1',usage_record_id:'record-1',category_code:'ease_of_putting_on',result_code:'issue',rating:2,note:'ベルトが少し気になります',row_version:1}],
    kasi_profiles:[profile],
    kasi_consultation_sheets:[{id:'sheet-1',title:'次回の相談',consultation_on:'2026-09-28',status_code:'finalized',row_version:1,snapshot_json:{title:'次回の相談',display_name:'テスト利用者',recipient:'リハビリクリニック',consultation_on:'2026-09-28',question_text:'着け外しについて相談したいです。',orthoses,records:[],photos:[]}}],
    kasi_catalog_items:['長下肢装具（スペックス）','長下肢装具（リングロック）','短下肢装具','長下肢装具（CBブレース付）'].map((name,i)=>({id:`catalog-${i}`,title:name,product_name:name,summary:'装具の構造や使い方を確認し、専門職との相談に役立てます。',publication_status:'published',row_version:1})),
    kasi_catalog_item_terms:[0,1,2,3].map(i=>({catalog_item_id:`catalog-${i}`,kasi_catalog_terms:{id:`term-${i}`,code:i===2?'afo':'kafo',term_group:'support_scope',label_ja:i===2?'短下肢装具（AFO）':'長下肢装具（KAFO）',is_active:true}}))
  };
  let mutations = 0;
  await page.route('**/pages-config.js', route => route.fulfill({contentType:'application/javascript',body:'window.KASISOUGU_SUPABASE_CONFIG={url:"https://redesign-test.invalid",publishableKey:"sb_publishable_fixture"};'}));
  await page.route('**/sw.js', route => route.fulfill({contentType:'application/javascript',body:'// Disabled only in the isolated browser smoke check.'}));
  await page.route('https://redesign-test.invalid/**', async route => {
    const request = route.request(), pathname = request.url().split('.invalid')[1].split('?')[0];
    let body = [];
    if (pathname === '/rest/v1/rpc/kasi_save_usage_record') {
      const data = request.postDataJSON();
      const base = records.find(row => row.id === data.p_id);
      if (data.p_id && (!base || base.row_version !== data.p_version)) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'記録が別の画面で更新されています。'})});
      let saved;
      if (base && !data.p_comparison) { Object.assign(base, data.p_record, {row_version:base.row_version+1}); saved = base; }
      else { saved = {...data.p_record,id:`record-${records.length+1}`,row_version:1,record_kind:data.p_comparison?'comparison':'current'}; records.push(saved); }
      tables.kasi_usage_record_observations = tables.kasi_usage_record_observations.filter(row => row.usage_record_id !== saved.id);
      tables.kasi_usage_record_observations.push(...data.p_observations.map((row,i)=>({...row,id:`obs-${saved.id}-${i}`,usage_record_id:saved.id,row_version:1})));
      return route.fulfill({contentType:'application/json',body:JSON.stringify({id:saved.id,row_version:saved.row_version})});
    }
    if (pathname.startsWith('/auth/v1/token')) body = {access_token:'synthetic-test-session'};
    else if (pathname === '/auth/v1/user') body = {id:'test-user'};
    else {
      const table = pathname.split('/').at(-1);
      body = tables[table] || [];
      if (['kasi_usage_records','kasi_user_orthoses'].includes(table)) {
        const query = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        body = body.filter(row => !row.deleted_at);
        for (const field of ['id','user_orthosis_id','row_version']) {
          const filter = query.get(field);
          if (filter?.startsWith('eq.')) body = body.filter(row => String(row[field]) === filter.slice(3));
        }
        if (request.method() === 'PATCH') {
          body.forEach(row => Object.assign(row,request.postDataJSON(),{row_version:row.row_version+1}));
          return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
        }
      }

      if (request.method() !== 'GET') {
        mutations++;
        const data = request.postDataJSON();
        if (table === 'kasi_profiles') Object.assign(profile,data,{row_version:profile.row_version+1});
        body = [table === 'kasi_profiles' ? profile : {...data,id:'saved-test-row',row_version:2}];
      }
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  // Prevent accidental connections to the real API even if the build configuration changes.
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(appUrl);
  assert(await page.locator('#app-navigation').isHidden(),'Navigation must be hidden before login');
  await page.getByLabel('メールアドレス',{exact:true}).fill('test@example.invalid');
  await page.getByLabel('パスワード',{exact:true}).fill('synthetic-password');
  await page.getByRole('button',{name:'ログインする',exact:true}).click();
  await page.locator('#home-page').waitFor({state:'visible'});
  await page.waitForFunction(() => document.getElementById('saved-at').textContent === '保存済み');
  const go = async screen => {
    const selector = screen === 'orthosis' ? '.sidebar-secondary [data-screen="orthosis"]' : `.primary-nav [data-screen="${screen}"]`;
    await page.locator(selector).click();
    await page.locator(`#${screen}-page`).waitFor({state:'visible'});
    await page.waitForFunction(() => screenLoads.size === 0);
    assert(await page.locator(selector).getAttribute('aria-current') === 'page', `Current page is not marked: ${screen}`);
  };
  await page.screenshot({path:'output/playwright/redesign-home-desktop.png',fullPage:true});
  for (const screen of ['catalog','record','consultation','links','settings','orthosis','home']) await go(screen);
  assert(await page.getByText('ホームへ戻る',{exact:true}).count()===0,'Home-back links remain');
  await go('record');
  assert(await page.locator('#record-form').isVisible(),'Current record form did not open');
  assert(await page.locator('#record-picker').inputValue()==='record-2','Current-use orthosis was not preferred');
  assert(await page.locator('#record-detail').isVisible(),'Record photos did not open');
  assert(await page.locator('.sidebar-secondary button[data-screen="orthosis"] svg').count()===1,'My Orthoses icon missing');
  assert(await page.locator('#record-form + .record-needs').isVisible(),'Needs section must follow the record save controls');
  assert(await page.locator('#orthosis-detail #needs-list').count()===0,'Needs section still appears in My Orthoses');
  const needsResponse = page.waitForResponse(r => r.url().includes('/kasi_user_needs') && r.url().includes('user_orthosis_id=eq.orthosis-2'));
  await page.locator('#record-orthosis-type').selectOption('afo');
  await needsResponse;
  assert(await page.locator('#record-orthosis').inputValue()==='orthosis-2','Needs must switch with the selected registered orthosis');
  await page.screenshot({path:'output/playwright/redesign-record-desktop.png',fullPage:true});
  await go('orthosis');
  assert(JSON.stringify(await page.locator('.orthosis-flow .orthosis-step-heading h3').allTextContents()) === JSON.stringify(['過去に使用','現在使用中','試用中']),'Orthosis flow order is incorrect');
  assert(await page.locator('.orthosis-flow-arrow').count()===2,'Orthosis flow arrows are missing');
  await page.screenshot({path:'output/playwright/orthosis-flow-desktop.png',fullPage:true});
  assert(errors.length===0,errors.join('\n'));
  return 'PASS: login, navigation across all screens, current-page indicator and current record form';
}
