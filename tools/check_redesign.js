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
    {id:'photo-1',user_orthosis_id:'orthosis-1',storage_path:'test-user/orthoses/orthosis-1/photo-1.jpg',original_filename:'装具の写真.jpg',mime_type:'image/jpeg',byte_size:256,caption:'装具の写真',sort_order:1,row_version:1},
    {id:'photo-2',user_orthosis_id:'orthosis-1',storage_path:'test-user/orthoses/orthosis-1/photo-2.jpg',original_filename:'追加する写真.jpg',mime_type:'image/jpeg',byte_size:256,caption:'追加する写真',sort_order:2,row_version:1},
    {id:'photo-3',usage_record_id:'record-2',storage_path:'test-user/records/record-2/photo-3.jpg',original_filename:'使用中の写真.jpg',mime_type:'image/jpeg',byte_size:256,caption:'使用中',sort_order:0,is_representative:true,row_version:1},
    {id:'photo-4',usage_record_id:'record-2',storage_path:'test-user/records/record-2/photo-4.jpg',original_filename:'別角度の写真.jpg',mime_type:'image/jpeg',byte_size:256,caption:'別角度',sort_order:1,is_representative:false,row_version:1}
  ];
  const profile = {user_id:'test-user',display_name:'テスト利用者',nearby_address:null,text_scale:100,device_storage_enabled:false,row_version:1};
  const personalLinks = [];
  const nearbyFacilities = Array.from({length:6}, (_, index) => ({id:`facility-${index + 1}`,name:`制度相談テスト施設 ${index + 1}`,address:`埼玉県さいたま市テスト${index + 1}`,prefecture:'埼玉県',municipality:'さいたま市',latitude:35.94 + index / 1000,longitude:139.75 + index / 1000,purpose_codes:['consultation'],phone:'048-000-0000',website_url:`https://example.invalid/facility-${index + 1}`,is_active:true}));
  const personalCatalogItems = [{id:'personal-catalog-1',title:'相談したい装具',category_code:'kafo',summary:'次回の相談で確認するために保存した装具です。',material:'金属',row_version:1,updated_at:'2026-09-21T00:00:00Z'}];
  const tables = {
    kasi_user_orthoses:orthoses,
    kasi_usage_records:records,
    kasi_usage_record_observations:[{id:'obs-1',usage_record_id:'record-1',category_code:'ease_of_putting_on',result_code:'issue',rating:2,note:'ベルトが少し気になります',row_version:1}],
    kasi_usage_record_concerns:concerns,
    kasi_user_needs:[{id:'need-1',user_orthosis_id:'orthosis-1',need_type:'problem',category_code:'weight',description:'長時間使うと重さが気になる',priority:2,status_code:'active',row_version:1}],
    kasi_profiles:[profile],
    kasi_personal_links:personalLinks,
    kasi_personal_catalog_items:personalCatalogItems,
    kasi_nearby_facilities:nearbyFacilities,
    kasi_candidate_facilities:[],
    kasi_consultation_sheets:[{id:'sheet-1',title:'次回の相談',consultation_on:'2026-09-28',status_code:'finalized',row_version:1,snapshot_json:{title:'次回の相談',display_name:'テスト利用者',recipient:'リハビリクリニック',consultation_on:'2026-09-28',question_text:'着け外しについて相談したいです。',selected:{orthoses:['orthosis-1'],needs:[],records:[],photos:['photo-1']},orthoses,records:[],photos}}],
    kasi_user_media:photos,
    kasi_catalog_items:['長下肢装具（スペックス）','長下肢装具（リングロック）','短下肢装具','長下肢装具（CBブレース付）'].map((name,i)=>({id:`catalog-${i}`,title:name,product_name:name,summary:'装具の構造や使い方を確認し、専門職との相談に役立てます。',publication_status:'published',row_version:1})),
    kasi_catalog_item_terms:[0,1,2,3].map(i=>({catalog_item_id:`catalog-${i}`,kasi_catalog_terms:{id:`term-${i}`,code:i===2?'afo':'kafo',term_group:'support_scope',label_ja:i===2?'短下肢装具（AFO）':'長下肢装具（KAFO）',is_active:true}}))
  };
  let mutations = 0;
  const passwordUpdates = [];
  await page.route('**/pages-config.js', route => route.fulfill({contentType:'application/javascript',body:'window.KASISOUGU_SUPABASE_CONFIG={url:"https://redesign-test.invalid",publishableKey:"sb_publishable_fixture"};'}));
  await page.route('https://msearch.gsi.go.jp/address-search/**', route => route.fulfill({contentType:'application/json',body:JSON.stringify([{geometry:{coordinates:[139.645,35.865]}}])}));
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
    if (pathname === '/rest/v1/rpc/kasi_set_usage_record_representative_photo') {
      const data = request.postDataJSON();
      const selectedPhoto = photos.find(row => row.id === data.p_media_id && row.usage_record_id === data.p_usage_record_id && !row.deleted_at);
      if (!selectedPhoto) return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'代表写真を確認できません。'})});
      photos.filter(row => row.usage_record_id === data.p_usage_record_id && !row.deleted_at).forEach(row => { row.is_representative = row.id === selectedPhoto.id; row.row_version += 1; });
      return route.fulfill({contentType:'application/json',body:JSON.stringify(selectedPhoto)});
    }
    if (pathname.startsWith('/auth/v1/token')) body = {access_token:'synthetic-test-session'};
    else if (pathname === '/auth/v1/user') {
      if (request.method() === 'PUT') passwordUpdates.push(request.postDataJSON());
      body = {id:'test-user',email:'test@example.invalid'};
    }
    else if (pathname.startsWith('/storage/v1/object/')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#dcebdd"/><path d="M45 92V34h48l22 18v40z" fill="#23805d"/><circle cx="65" cy="61" r="12" fill="#fff"/><path d="M95 45v18h20" fill="none" stroke="#fff" stroke-width="6"/></svg>'});
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
    else if (pathname === '/rest/v1/kasi_personal_catalog_items') {
      if (request.method() === 'GET') body = personalCatalogItems.filter(row => !row.deleted_at);
      else if (request.method() === 'POST') {
        const saved = {...request.postDataJSON(),id:`personal-catalog-${personalCatalogItems.length + 1}`,row_version:1,updated_at:new Date().toISOString()}; personalCatalogItems.push(saved);
        return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
      } else {
        const query = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        const id = query.get('id')?.replace('eq.',''); const version = Number(query.get('row_version')?.replace('eq.',''));
        const saved = personalCatalogItems.find(row => row.id === id && row.row_version === version);
        if (!saved) return route.fulfill({contentType:'application/json',body:'[]'});
        Object.assign(saved,request.postDataJSON(),{row_version:saved.row_version+1,updated_at:new Date().toISOString()});
        return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
      }
    }
    else {
      const table = pathname.split('/').at(-1);
      body = tables[table] || [];
      if (table === 'kasi_nearby_facilities') {
        const params = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        const offset = Number(params.get('offset') || 0);
        body = body.slice(offset, offset + Number(params.get('limit') || 100));
      }
      if (table === 'kasi_candidate_facilities') {
        if (request.method() === 'POST') {
          const saved = {...request.postDataJSON(),id:`candidate-${tables[table].length + 1}`,row_version:1};
          tables[table].push(saved);
          return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
        }
        const params = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        if (request.method() === 'PATCH') {
          const id = params.get('id')?.replace('eq.',''); const version = Number(params.get('row_version')?.replace('eq.',''));
          const saved = tables[table].find(row => row.id === id && row.row_version === version && !row.deleted_at);
          if (!saved) return route.fulfill({contentType:'application/json',body:'[]'});
          Object.assign(saved,request.postDataJSON(),{row_version:saved.row_version+1});
          return route.fulfill({contentType:'application/json',body:JSON.stringify([saved])});
        }
        body = body.filter(row => !row.deleted_at).slice(Number(params.get('offset') || 0), Number(params.get('offset') || 0) + Number(params.get('limit') || 100));
      }
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
      if (table === 'kasi_user_media') {
        const params = new Map((request.url().split('?')[1] || '').split('&').map(part => part.split('=').map(decodeURIComponent)));
        body = photos.filter(row => !row.deleted_at);
        const usageRecordId = params.get('usage_record_id');
        if (usageRecordId?.startsWith('eq.')) body = body.filter(row => row.usage_record_id === usageRecordId.slice(3));
        if (usageRecordId === 'not.is.null') body = body.filter(row => row.usage_record_id);
        if (params.get('is_representative') === 'eq.true') body = body.filter(row => row.is_representative);
        if (request.method() === 'PATCH') {
          const id = params.get('id')?.replace('eq.',''); const version = Number(params.get('row_version')?.replace('eq.',''));
          const saved = photos.find(row => row.id === id && row.row_version === version);
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
  await page.locator('#home-orthosis-flow .orthosis-card[data-orthosis-id="orthosis-1"] .representative-record-photo').waitFor();
  assert(await page.locator('#home-orthosis-flow .representative-record-photo').count() === 1,'Representative usage-record photo is missing from Home');
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
  await go('catalog');
  const publicCatalogTab = page.getByRole('tab',{name:'公開されている装具',exact:true});
  const personalCatalogTab = page.getByRole('tab',{name:'自分で追加した装具',exact:true});
  assert(await publicCatalogTab.getAttribute('aria-selected') === 'true','Public catalog tab must be selected initially');
  await publicCatalogTab.focus(); await publicCatalogTab.press('ArrowRight');
  assert(await personalCatalogTab.getAttribute('aria-selected') === 'true','Arrow key must select the personal catalog tab');
  await page.getByRole('heading',{name:'相談したい装具',exact:true}).waitFor();
  assert(await page.getByRole('heading',{name:'相談したい装具',exact:true}).count() === 1,'Saved personal catalog item is missing');
  await page.getByRole('button',{name:'＋ 装具を追加',exact:true}).click();
  await page.locator('#personal-catalog-name').fill('自分で見つけた短下肢装具');
  await page.locator('#personal-catalog-category').selectOption('afo');
  await page.locator('#personal-catalog-summary').fill('着け外しについて相談したい装具です。');
  await page.locator('#personal-catalog-image-url').fill('https://redesign-test.invalid/storage/v1/object/personal-orthosis.png');
  await page.locator('#personal-catalog-form').getByRole('button',{name:'保存する',exact:true}).click();
  await page.getByRole('heading',{name:'自分で見つけた短下肢装具',exact:true}).waitFor();
  let personalCard = page.locator('.personal-catalog-card').filter({hasText:'自分で見つけた短下肢装具'});
  await personalCard.getByRole('button',{name:'編集する',exact:true}).click();
  await page.locator('#personal-catalog-summary').fill('更新後：次回の受診で確認します。');
  await page.locator('#personal-catalog-form').getByRole('button',{name:'保存する',exact:true}).click();
  await page.getByText('更新後：次回の受診で確認します。',{exact:true}).waitFor();
  personalCard = page.locator('.personal-catalog-card').filter({hasText:'自分で見つけた短下肢装具'});
  await page.evaluate(() => { window.confirm = () => true; });
  await personalCard.getByRole('button',{name:'削除する',exact:true}).click();
  await page.waitForFunction(() => !document.getElementById('personal-catalog-list').textContent.includes('自分で見つけた短下肢装具'));
  assert(Boolean(personalCatalogItems.find(row => row.title === '自分で見つけた短下肢装具')?.deleted_at),'Personal catalog item must be soft-deleted');
  await personalCatalogTab.press('ArrowLeft');
  assert(await publicCatalogTab.getAttribute('aria-selected') === 'true','Arrow key must return to the public catalog tab');
  await go('nearby');
  assert(await page.locator('#nearby-maps-panel').isVisible(),'Maps search setup must be shown when no address is saved');
  assert(await page.locator('#nearby-map-buttons button').count() === 10,'Ten purpose-specific Google Maps buttons must be shown');
  assert(await page.getByRole('button',{name:'現在地を使用',exact:true}).count() === 1,'Current-location setup button must be shown');
  await page.getByLabel('検索する住所',{exact:true}).fill('埼玉県さいたま市見沼区堀崎町1592');
  await page.getByRole('button',{name:'この住所を保存',exact:true}).click();
  await page.waitForFunction(() => !document.getElementById('nearby-address-save').disabled);
  assert(profile.nearby_address === '埼玉県さいたま市見沼区堀崎町1592','Nearby address must be saved in the user profile without truncating the street number');
  await page.evaluate(() => { window.__lastOpenedMapsUrl = ''; window.open = url => { window.__lastOpenedMapsUrl = url; return {opener:null}; }; });
  await page.getByRole('button',{name:'リハビリ科を探す',exact:true}).click();
  const openedSearch = await page.evaluate(() => { const url=new URL(window.__lastOpenedMapsUrl); return {pathname:url.pathname,query:url.searchParams.get('query'),origin:url.searchParams.get('origin'),destination:url.searchParams.get('destination')}; });
  assert(openedSearch.pathname.includes('/maps/search/'),'Facility type button must open Google Maps search');
  assert(openedSearch.query === `リハビリテーション科 ${profile.nearby_address}`,'Google Maps search must include the full saved address and facility type');
  assert(openedSearch.query.endsWith('堀崎町1592'),'Google Maps search must not truncate the street number');
  assert(openedSearch.origin === null && openedSearch.destination === null,'Google Maps search must not automatically select route endpoints');
  await page.screenshot({path:'output/playwright/nearby-category-search.png',fullPage:true});
  await page.getByRole('button',{name:'候補施設を登録',exact:true}).click();
  await page.getByLabel('施設名（必須）',{exact:true}).fill('あすはゆリハビリクリニック');
  await page.locator('#candidate-type').selectOption({label:'リハビリ'});
  await page.locator('#candidate-address').fill('埼玉県さいたま市候補住所');
  await page.getByLabel('Google Maps URL',{exact:true}).fill('https://www.google.com/maps/dir/?api=1&origin=現在地&destination=埼玉県さいたま市候補住所');
  await page.locator('#candidate-checked-on').fill('2026-09-20');
  await page.locator('#nearby-candidate-form').getByRole('button',{name:'候補施設を保存',exact:true}).click();
  await page.waitForFunction(() => document.getElementById('candidate-status').textContent.includes('保存しました'));
  assert(tables.kasi_candidate_facilities.length === 1,'Candidate facility must be saved');
  await page.getByRole('tab',{name:'登録施設から探す',exact:true}).click();
  await page.locator('#nearby-purpose').selectOption('');
  await page.getByRole('button',{name:'登録住所から検索',exact:true}).click();
  await page.waitForFunction(() => !document.getElementById('nearby-search').disabled);
  assert(await page.locator('#nearby-results .nearby-card').count() === 7,'Registered and candidate facilities within range must be shown');
  assert((await page.locator('#nearby-results').textContent()).includes('直線距離：'),'Nearby straight-line distance is missing');
  const directionsHref = await page.locator('#nearby-results .nearby-map-link').first().getAttribute('href');
  const directionsRoute = await page.evaluate(href => { const url=new URL(href); return {origin:url.searchParams.get('origin'),travelmode:url.searchParams.get('travelmode')}; },directionsHref);
  assert(directionsRoute.origin === profile.nearby_address,'Google Maps link must use the saved address as its origin');
  assert(directionsRoute.travelmode === 'walking','Google Maps directions must default to walking');
  let candidateCard=page.locator('#nearby-results .nearby-card').filter({hasText:'あすはゆリハビリクリニック'});
  assert(await candidateCard.getByText('登録したGoogle Maps URLを開く',{exact:true}).count()===0,'Candidate cards must not open a saved directions URL with an old origin');
  assert(await candidateCard.getByRole('link',{name:'Google Mapsで経路を確認',exact:true}).count()===1,'Candidate cards must provide the address-based directions link');
  assert(await candidateCard.getByRole('button',{name:'編集',exact:true}).count()===1,'Candidate edit button is missing');
  assert(await candidateCard.getByRole('button',{name:'削除',exact:true}).count()===1,'Candidate delete button is missing');
  await candidateCard.getByRole('button',{name:'編集',exact:true}).click();
  await page.locator('#candidate-name').fill('あすはゆリハビリクリニック（更新）');
  await page.getByRole('button',{name:'変更を保存',exact:true}).click();
  await page.waitForFunction(() => document.getElementById('nearby-results').textContent.includes('あすはゆリハビリクリニック（更新）'));
  assert(tables.kasi_candidate_facilities[0].name==='あすはゆリハビリクリニック（更新）','Candidate facility must be updated');
  candidateCard=page.locator('#nearby-results .nearby-card').filter({hasText:'あすはゆリハビリクリニック（更新）'});
  page.once('dialog',dialog=>dialog.accept());
  await candidateCard.getByRole('button',{name:'削除',exact:true}).click();
  await page.waitForFunction(() => !document.getElementById('nearby-results').textContent.includes('あすはゆリハビリクリニック（更新）'));
  assert(Boolean(tables.kasi_candidate_facilities[0].deleted_at),'Candidate facility must be soft-deleted');
  await go('settings');
  await page.getByLabel('現在のパスワード',{exact:true}).fill('synthetic-current-password');
  await page.getByLabel('新しいパスワード',{exact:true}).fill('synthetic-new-password');
  await page.getByLabel('新しいパスワード（確認）',{exact:true}).fill('synthetic-new-password');
  await page.getByRole('button',{name:'パスワードを変更する',exact:true}).click();
  await page.waitForFunction(() => document.getElementById('password-change-status').textContent.includes('パスワードを変更しました。'));
  assert(passwordUpdates.length === 1 && passwordUpdates[0].password === 'synthetic-new-password' && passwordUpdates[0].current_password === 'synthetic-current-password','Password change must update Supabase Auth with current-password verification');
  assert((await page.locator('#password-change-status').textContent()).includes('パスワードを変更しました。'),'Password change success message is missing');
  assert(await page.getByText('ホームへ戻る',{exact:true}).count()===0,'Home-back links remain');
  await go('links');
  const priceGuide = page.locator('a[href="https://sogulabblog.com/price/"]');
  assert(await priceGuide.getAttribute('href') === 'https://sogulabblog.com/price/','Lower-limb orthosis price guide link is missing');
  assert(await priceGuide.getAttribute('target') === '_blank','Price guide must open in a new tab');
  assert(await page.getByRole('heading',{name:'固定のお役立ち情報',exact:true}).count() === 1,'Fixed links section is missing');
  const fixedLinksTab = page.getByRole('tab',{name:'固定のお役立ち情報',exact:true});
  const personalLinksTab = page.getByRole('tab',{name:'自分で追加したリンク',exact:true});
  assert(await fixedLinksTab.getAttribute('aria-selected') === 'true','Fixed links tab must be selected initially');
  assert(await page.locator('#fixed-links-panel').isVisible(),'Fixed links panel must be visible initially');
  assert(!(await page.locator('#personal-links-panel').isVisible()),'Personal links panel must be hidden initially');
  await fixedLinksTab.focus();
  await fixedLinksTab.press('ArrowRight');
  assert(await personalLinksTab.getAttribute('aria-selected') === 'true','Arrow key must select the personal links tab');
  assert(await page.locator('#personal-links-panel').isVisible(),'Personal links panel must be visible after switching tabs');
  assert(!(await page.locator('#fixed-links-panel').isVisible()),'Fixed links panel must be hidden after switching tabs');
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
  await personalLinksTab.press('ArrowLeft');
  assert(await fixedLinksTab.getAttribute('aria-selected') === 'true','Arrow key must return to the fixed links tab');
  await go('record');
  assert(await page.locator('#record-form').isVisible(),'Current record form did not open');
  await page.getByRole('button',{name:'意味を確認',exact:true}).first().click();
  assert(await page.locator('#record-help-dialog').isVisible(),'Record field help dialog did not open');
  assert((await page.locator('#record-help-dialog').textContent()).includes('靴によって装具の入りやすさ・歩きやすさが変わるため、記録しておくと比較に役立ちます。'),'Footwear help text is missing');
  await page.locator('#record-help-dialog').getByRole('button',{name:'閉じる',exact:true}).click();
  assert(await page.locator('#record-picker').inputValue()==='record-2','Current-use orthosis was not preferred');
  assert(await page.locator('#record-detail').isVisible(),'Record photos did not open');
  assert(await page.locator('input[name="record-representative-photo"]').count() === 2,'Usage-record photos must offer representative selection');
  assert(await page.locator('input[name="record-representative-photo"]:checked').count() === 1,'Exactly one representative photo must be selected');
  await page.getByLabel('別角度の写真.jpgを代表写真にする',{exact:true}).check();
  await page.waitForFunction(() => document.getElementById('record-photo-status').textContent.includes('代表写真を保存しました'));
  assert(await page.locator('input[name="record-representative-photo"]:checked').count() === 1,'Representative selection must remain exclusive after changing it');
  assert(photos.find(row => row.id === 'photo-4').is_representative && !photos.find(row => row.id === 'photo-3').is_representative,'Representative flag did not move to the selected photo');
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
  await page.locator('#orthosis-list .orthosis-card[data-orthosis-id="orthosis-1"] .representative-record-photo').waitFor();
  assert(await page.locator('#orthosis-list .representative-record-photo').count() === 1,'Representative usage-record photo is missing from My Orthoses');
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
