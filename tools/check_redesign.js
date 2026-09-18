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
    {id:'orthosis-1',nickname:'長下肢装具',orthosis_type_code:'kafo',ownership_status:'owned',side_code:'left',price_yen:120000,funding_system_code:'medical_insurance',self_payment_rate:3,row_version:1},
    {id:'orthosis-2',nickname:'短下肢装具',orthosis_type_code:'afo',ownership_status:'trial',side_code:'left',row_version:1},
    {id:'orthosis-3',nickname:'その他',orthosis_type_code:'other',ownership_status:'trial',row_version:1},
    {id:'orthosis-4',nickname:'その他',orthosis_type_code:'other',ownership_status:'trial',row_version:1},
    {id:'orthosis-5',nickname:'過去の長下肢装具',orthosis_type_code:'kafo',ownership_status:'past',row_version:1}
  ];
  const records = [
    {id:'record-1',user_orthosis_id:'orthosis-2',recorded_on:'2026-09-14',usage_setting:'室内での訓練',duration_minutes:180,assistance_level:'independent',overall_note:'着け外しを相談したい',row_version:1},
    {id:'record-2',user_orthosis_id:'orthosis-1',recorded_on:'2026-09-13',usage_setting:'室内での訓練',duration_minutes:120,assistance_level:'independent',overall_note:'いつも通り使用しました',row_version:1}
  ];
  const concerns = [
    {id:'concern-1',usage_record_id:'record-2',noted_on:'2026-09-16',category_code:'pain_pressure',description:'右くるぶし付近が当たる',occurred_timing:'使用開始から2年後',status_code:'planned',action_note:null,resolved_on:null,row_version:1}
  ];
  const photos = [
    {id:'photo-1',user_orthosis_id:'orthosis-1',storage_path:'test-user/orthoses/orthosis-1/photo-1.jpg',original_filename:'装具の写真.jpg',mime_type:'image/jpeg',caption:'装具の写真',sort_order:1},
    {id:'photo-2',user_orthosis_id:'orthosis-1',storage_path:'test-user/orthoses/orthosis-1/photo-2.jpg',original_filename:'追加する写真.jpg',mime_type:'image/jpeg',caption:'追加する写真',sort_order:2}
  ];
  const profile = {user_id:'test-user',display_name:'テスト利用者',text_scale:100,device_storage_enabled:false,row_version:1};
  const personalLinks = [];
  const tables = {
    kasi_user_orthoses:orthoses,
    kasi_usage_records:records,
    kasi_usage_record_observations:[{id:'obs-1',usage_record_id:'record-1',category_code:'ease_of_putting_on',result_code:'issue',rating:2,note:'ベルトが少し気になります',row_version:1}],
    kasi_usage_record_concerns:concerns,
    kasi_user_needs:[{id:'need-1',user_orthosis_id:'orthosis-1',need_type:'problem',category_code:'weight',description:'長時間使うと重さが気になる',priority:2,status_code:'active',row_version:1}],
    kasi_profiles:[profile],
    kasi_personal_links:personalLinks,
    kasi_consultation_sheets:[{id:'sheet-1',title:'次回の相談',consultation_on:'2026-09-28',status_code:'finalized',row_version:1,snapshot_json:{title:'次回の相談',display_name:'テスト利用者',recipient:'リハビリクリニック',consultation_on:'2026-09-28',question_text:'着け外しについて相談したいです。',selected:{orthoses:['orthosis-1'],needs:[],records:[],photos:['photo-1']},orthoses,records:[],photos}}],
    kasi_user_media:photos,
    kasi_catalog_items:['長下肢装具（スペックス）','長下肢装具（リングロック）','短下肢装具','長下肢装具（CBブレース付）'].map((name,i)=>({id:`catalog-${i}`,title:name,product_name:name,summary:'装具の構造や使い方を確認し、専門職との相談に役立てます。',publication_status:'published',row_version:1})),
    kasi_catalog_item_terms:[0,1,2,3].map(i=>({catalog_item_id:`catalog-${i}`,kasi_catalog_terms:{id:`term-${i}`,code:i===2?'afo':'kafo',term_group:'support_scope',label_ja:i===2?'短下肢装具（AFO）':'長下肢装具（KAFO）',is_active:true}}))
  };
  let mutations = 0;
  await page.route('**/pages-config.js', route => route.fulfill({contentType:'application/javascript',body:'window.KASISOUGU_SUPABASE_CONFIG={url:"https://redesign-test.invalid",publishableKey:"sb_publishable_fixture",googleMapsApiKey:"browser-restricted-fixture"};'}));
  await page.route('https://japanese-addresses-v2.geoloniamaps.com/**', route => route.fulfill({contentType:'application/json',body:JSON.stringify({pref:'埼玉県',cities:[{city:'さいたま市',point:[139.6489,35.8617]},{city:'川口市',point:[139.7242,35.8078]}]})}));
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
    else if (pathname.startsWith('/storage/v1/object/')) return route.fulfill({contentType:'application/json',body:'{}'});
    else if (pathname === '/rest/v1/kasi_usage_record_concerns') {
      if (request.method() === 'GET') body = concerns.filter(row => !row.deleted_at && (!request.url().includes('status_code=neq.resolved') || row.status_code !== 'resolved'));
      else if (request.method() === 'POST') {
        const saved = {...request.postDataJSON(),id:`concern-${concerns.length + 1}`,row_version:1}; concerns.push(saved);
        return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
      } else {
        const query = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        const id = query.get('id')?.replace('eq.',''); const version = Number(query.get('row_version')?.replace('eq.',''));
        const saved = concerns.find(row => row.id === id && row.row_version === version);
        if (!saved) return route.fulfill({contentType:'application/json',body:'[]'});
        Object.assign(saved,request.postDataJSON(),{row_version:saved.row_version+1});
        return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
      }
    }
    else if (pathname === '/rest/v1/kasi_user_needs') {
      const userNeeds = tables.kasi_user_needs;
      if (request.method() === 'GET') {
        const query = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        body = userNeeds.filter(row => !row.deleted_at);
        const orthosisId = query.get('user_orthosis_id')?.replace('eq.','');
        if (orthosisId) body = body.filter(row => row.user_orthosis_id === orthosisId);
      } else if (request.method() === 'POST') {
        const saved = {...request.postDataJSON(),id:`need-${userNeeds.length + 1}`,row_version:1}; userNeeds.push(saved);
        return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
      } else {
        const query = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        const id = query.get('id')?.replace('eq.',''); const version = Number(query.get('row_version')?.replace('eq.',''));
        const saved = userNeeds.find(row => row.id === id && row.row_version === version && !row.deleted_at);
        if (!saved) return route.fulfill({contentType:'application/json',body:'[]'});
        Object.assign(saved,request.postDataJSON(),{row_version:saved.row_version+1});
        return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
      }
    }
    else if (pathname === '/rest/v1/kasi_personal_links') {
      if (request.method() === 'GET') body = personalLinks.filter(row => !row.deleted_at);
      else if (request.method() === 'POST') {
        const saved = {...request.postDataJSON(),id:`personal-link-${personalLinks.length + 1}`,row_version:1}; personalLinks.push(saved);
        return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
      } else {
        const query = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        const id = query.get('id')?.replace('eq.',''); const version = Number(query.get('row_version')?.replace('eq.',''));
        const saved = personalLinks.find(row => row.id === id && row.row_version === version);
        if (!saved) return route.fulfill({contentType:'application/json',body:'[]'});
        Object.assign(saved, request.postDataJSON(), {row_version:saved.row_version + 1});
        return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
      }
    }
    else {
      const table = pathname.split('/').at(-1);
      body = tables[table] || [];
      if (table === 'kasi_consultation_sheets') {
        body = body.filter(row => !row.deleted_at);
        if (request.method() === 'POST') {
          const saved = {...request.postDataJSON(),id:`sheet-${tables[table].length + 1}`,row_version:1};
          tables[table].push(saved);
          return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
        }
        if (request.method() === 'PATCH') {
          const query = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
          const id = query.get('id')?.replace('eq.','');
          const version = Number(query.get('row_version')?.replace('eq.',''));
          const saved = tables[table].find(row => row.id === id && row.row_version === version);
          if (!saved) return route.fulfill({contentType:'application/json',body:'[]'});
          Object.assign(saved,request.postDataJSON(),{row_version:saved.row_version+1});
          return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
        }
      }
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
  await page.evaluate(() => {
    const places = Array.from({length:6}, (_, index) => ({displayName:`制度相談テスト施設 ${index + 1}`,formattedAddress:`埼玉県さいたま市テスト${index + 1}`,location:{lat:() => 35.86 + index / 1000,lng:() => 139.64 + index / 1000},googleMapsURI:`https://maps.google.com/?q=test-${index + 1}`,websiteURI:`https://example.invalid/facility-${index + 1}`,nationalPhoneNumber:'048-000-0000'}));
    window.google = {maps:{
      importLibrary:async () => ({Place:{searchByText:async () => ({places})}}),
      TravelMode:{DRIVING:'DRIVING',TRANSIT:'TRANSIT',WALKING:'WALKING'},
      DirectionsService:class { route(request, callback) { callback({routes:[{legs:[{duration:{value:1200,text:'20 分'},distance:{text:'8 km'}}]}]},'OK'); } }
    }};
  });
  assert(await page.getByText('装具のこと、使って感じたことを少しずつ残しましょう。',{exact:true}).count()===0,'Removed home lead remains');
  await page.getByRole('button',{name:'最初に読んでほしいこと',exact:true}).click();
  assert(await page.locator('#home-guide-dialog').isVisible(),'Home guide dialog did not open');
  assert((await page.locator('#home-guide-dialog').textContent()).includes('このアプリは、「下肢装具サポート」といって、足に装着する装具を使っている方や、そのご家族・支援者の方に向けたアプリです。'),'Home guide text is missing');
  await page.screenshot({path:'output/playwright/home-guide-dialog.png',fullPage:true});
  await page.locator('#home-guide-dialog').getByRole('button',{name:'閉じる',exact:true}).click();
  assert(await page.locator('#home-guide-dialog').isHidden(),'Home guide dialog did not close');
  assert(await page.locator('#home-orthosis-flow .orthosis-flow').count()===1,'Home My Orthoses flow missing');
  const go = async screen => {
    const selector = screen === 'orthosis' ? '.sidebar-secondary [data-screen="orthosis"]' : `.primary-nav [data-screen="${screen}"]`;
    await page.locator(selector).click();
    await page.locator(`#${screen}-page`).waitFor({state:'visible'});
    await page.waitForFunction(() => screenLoads.size === 0);
    assert(await page.locator(selector).getAttribute('aria-current') === 'page', `Current page is not marked: ${screen}`);
  };
  await page.screenshot({path:'output/playwright/redesign-home-desktop.png',fullPage:true});
  for (const screen of ['catalog','record','consultation','nearby','links','settings','orthosis','home']) await go(screen);
  await go('nearby');
  await page.getByLabel('都道府県',{exact:true}).selectOption('埼玉県');
  await page.getByLabel('市区町村',{exact:true}).selectOption('さいたま市');
  await page.getByLabel('探す目的',{exact:true}).selectOption('consultation');
  await page.getByRole('button',{name:'条件に合う相談先を探す',exact:true}).click();
  assert(await page.locator('#nearby-results .nearby-card').count() === 5,'Nearby search must keep dynamic results to five candidates');
  assert((await page.locator('#nearby-results').textContent()).includes('制度相談テスト施設 1'),'Nearby dynamic facility search result is missing');
  assert(await page.locator('#nearby-results a[target="_blank"]').count() === 10,'Nearby facility and map links must open in a new tab');
  assert(await page.getByText('ホームへ戻る',{exact:true}).count()===0,'Home-back links remain');
  await go('links');
  const priceGuide = page.locator('a[href="https://sogulabblog.com/price/"]');
  assert(await priceGuide.getAttribute('href') === 'https://sogulabblog.com/price/','Lower-limb orthosis price guide link is missing');
  assert(await priceGuide.getAttribute('target') === '_blank','Price guide must open in a new tab');
  assert(await page.getByRole('heading',{name:'固定のお役立ち情報',exact:true}).count() === 1,'Fixed links section is missing');
  await page.getByRole('button',{name:'＋ リンクを追加',exact:true}).click();
  await page.getByLabel('名前',{exact:true}).fill('病院のお知らせ');
  await page.getByLabel('URL',{exact:true}).fill('https://example.invalid/notice');
  await page.getByLabel('メモ（任意）',{exact:true}).fill('次回の受診前に確認');
  await page.getByRole('button',{name:'保存する',exact:true}).click();
  await page.getByRole('heading',{name:'病院のお知らせ',exact:true}).waitFor();
  assert(await page.getByRole('heading',{name:'病院のお知らせ',exact:true}).count() === 1,'Personal link was not added');
  await page.getByRole('button',{name:'編集する',exact:true}).click();
  await page.getByLabel('メモ（任意）',{exact:true}).fill('確認済み');
  await page.getByRole('button',{name:'保存する',exact:true}).click();
  await page.getByText('確認済み',{exact:true}).waitFor();
  assert(await page.getByText('確認済み',{exact:true}).count() === 1,'Personal link was not updated');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button',{name:'削除する',exact:true}).click();
  await page.waitForFunction(() => document.getElementById('personal-links-list').textContent.includes('まだ自分用リンクはありません'));
  await go('record');
  assert(await page.locator('#record-form').isVisible(),'Current record form did not open');
  await page.getByRole('button',{name:'意味を確認',exact:true}).first().click();
  assert(await page.locator('#record-help-dialog').isVisible(),'Record field help dialog did not open');
  assert((await page.locator('#record-help-dialog').textContent()).includes('靴によって装具の入りやすさ・歩きやすさが変わるため、記録しておくと比較に役立ちます。'),'Footwear help text is missing');
  await page.locator('#record-help-dialog').getByRole('button',{name:'閉じる',exact:true}).click();
  assert(await page.locator('#record-picker').inputValue()==='record-2','Current-use orthosis was not preferred');
  assert(await page.locator('#record-detail').isVisible(),'Record photos did not open');
  assert((await page.locator('#record-concern-list').textContent()).includes('右くるぶし付近が当たる'),'Dated concern is missing from the usage record');
  assert(await page.getByLabel('気づいた日',{exact:true}).inputValue()==='2026-09-13','Concern date must be independent and default to the selected usage date');
  assert(await page.locator('.sidebar-secondary button[data-screen="orthosis"] svg').count()===1,'My Orthoses icon missing');
  assert(await page.locator('#record-form + .record-needs').isVisible(),'Needs section must follow the record save controls');
  assert(await page.locator('#orthosis-detail #needs-list').count()===0,'Needs section still appears in My Orthoses');
  const needsResponse = page.waitForResponse(r => r.url().includes('/kasi_user_needs') && r.url().includes('user_orthosis_id=eq.orthosis-2'));
  await page.locator('#record-orthosis-type').selectOption('afo');
  await needsResponse;
  assert(await page.locator('#record-orthosis').inputValue()==='orthosis-2','Needs must switch with the selected registered orthosis');
  const restoredNeedsResponse = page.waitForResponse(r => r.url().includes('/kasi_user_needs') && r.url().includes('user_orthosis_id=eq.orthosis-1'));
  await page.locator('#record-orthosis-type').selectOption('kafo');
  await restoredNeedsResponse;
  assert(await page.locator('#record-orthosis').inputValue()==='orthosis-1','Record fixture must be restored before later regression checks');
  assert((await page.locator('#needs-list').textContent()).includes('長時間使うと重さが気になる'),'Need fixture is missing');
  await page.screenshot({path:'output/playwright/redesign-record-desktop.png',fullPage:true});
  await go('orthosis');
  assert(JSON.stringify(await page.locator('#orthosis-list .orthosis-step-heading h3').allTextContents()) === JSON.stringify(['過去に使用','現在使用中','試用中']),'Orthosis flow order is incorrect');
  assert(await page.locator('#orthosis-list .orthosis-flow-arrow').count()===2,'Orthosis flow arrows are missing');
  await page.getByRole('button',{name:'詳細を見る',exact:true}).nth(1).click();
  assert(await page.locator('#orthosis-facts').textContent().then(text => text.includes('価格') && text.includes('120,000円') && text.includes('治療用（医療保険）') && text.includes('自己負担分（原則1〜3割）') && text.includes('3割')),'Orthosis payment details are missing from the detail');
  await page.getByRole('button',{name:'編集する',exact:true}).click();
  assert(await page.getByLabel('制度・支払いの区分',{exact:true}).inputValue() === 'medical_insurance','Funding-system value was not loaded into the form');
  assert(await page.getByLabel('自己負担分（原則1〜3割）',{exact:true}).inputValue() === '3','Self-payment rate was not loaded into the form');
  await page.screenshot({path:'output/playwright/orthosis-flow-desktop.png'});
  assert(errors.length===0,errors.join('\n'));
  return 'PASS: login, navigation across all screens, current-page indicator and current record form';
}
