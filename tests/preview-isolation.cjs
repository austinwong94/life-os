const assert=require('node:assert/strict');
const fs=require('node:fs');
const browsers=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-preview-isolation';fs.mkdirSync(out,{recursive:true});
const results=[];
const seed=async(p,label)=>p.evaluate(async label=>{
  const diary=makeCard({type:'diary',title:label+' diary'});diary.id='shared-diary-id';
  state.cards=[diary];state.board.name=label+' board';
  updateDiaryEntry(diary,getTodayKey(),{thoughts:label+' full diary text\nEvery word stays.'});
  saveState();await flushDeviceWrites();saveCloudRecoveryPoint(label+' recovery');
},label);
const rawNormal=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>!key.startsWith('life-os-preview-v1:')).sort().map(key=>[key,localStorage.getItem(key)])));
const thoughts=p=>p.evaluate(()=>state.cards.find(card=>card.type==='diary').diaryEntries[getTodayKey()].thoughts);
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,action){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'}),errors=[],external=[];
    await context.route('https://**/*',route=>{external.push(route.request().frame().url());return route.fulfill({status:503,body:'Synthetic test only'});});
    const open=async preview=>{
      const page=await context.newPage();page.setDefaultTimeout(6500);page.on('pageerror',e=>errors.push(e.message));
      await page.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));await page.goto(url+(preview?'?preview=1&liveReload=0':'?liveReload=0'));return page;
    };
    try{await action({context,open,external});assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});for(const [i,page] of context.pages().entries())await page.screenshot({path:out+'/failure-'+results.length+'-'+i+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Preview never imports normal records or backups and cannot change their stored bytes',async({open})=>{
    const normal=await open(false);await seed(normal,'NORMAL-ONLY');const before=await rawNormal(normal);
    const preview=await open(true);assert.equal(await preview.evaluate(()=>JSON.stringify(getStateForStorage()).includes('NORMAL-ONLY')),false);
    assert.equal(await preview.evaluate(()=>JSON.stringify(readDiaryBackups()).includes('NORMAL-ONLY')),false);
    assert.equal(await preview.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]).length),0);
    await seed(preview,'PREVIEW-ONLY');assert.deepEqual(await rawNormal(preview),before);
    await preview.reload();assert.equal(await thoughts(preview),'PREVIEW-ONLY full diary text\nEvery word stays.');
    assert.equal(await thoughts(normal),'NORMAL-ONLY full diary text\nEvery word stays.');
    assert.deepEqual(await rawNormal(preview),before);
  });
  await run('Interrupted queues recover only within their own mode and do not consume the other pending copy',async({open})=>{
    const normal=await open(false);await seed(normal,'NORMAL');
    await normal.evaluate(()=>{LifeDeviceStore.configure(()=>false);updateDiaryEntry(state.cards[0],getTodayKey(),{thoughts:'Normal pending diary'});});
    const normalPending=await normal.evaluate(()=>LifeDeviceStore.pending().map(item=>[item.key,item.raw]));assert.ok(normalPending.length);
    const preview=await open(true);assert.equal(await preview.evaluate(()=>LifeDeviceStore.pending().length),0);await seed(preview,'PREVIEW');
    await preview.evaluate(()=>{LifeDeviceStore.configure(()=>false);updateDiaryEntry(state.cards[0],getTodayKey(),{thoughts:'Preview pending diary'});});
    const previewPending=await preview.evaluate(()=>LifeDeviceStore.pending().map(item=>[item.key,item.raw]));assert.ok(previewPending.length);
    assert.deepEqual(await normal.evaluate(()=>LifeDeviceStore.pending().map(item=>[item.key,item.raw])),normalPending);
    await normal.evaluate(async()=>{LifeDeviceStore.configure(commitDeviceWrites);await flushDeviceWrites();});
    assert.deepEqual(await preview.evaluate(()=>LifeDeviceStore.pending().map(item=>[item.key,item.raw])),previewPending);
    await preview.reload();assert.equal(await thoughts(preview),'Preview pending diary');await preview.evaluate(()=>flushDeviceWrites());
    await normal.reload();assert.equal(await thoughts(normal),'Normal pending diary');assert.equal(await normal.evaluate(()=>flushDeviceWrites()),true);assert.equal(await normal.evaluate(()=>LifeDeviceStore.pending().length),0);
  });
  await run('Cloud credentials, baselines and restore guards cannot cross through storage events',async({open,external})=>{
    const normal=await open(false);await seed(normal,'NORMAL');
    const saved=await normal.evaluate(()=>{
      writeLocalJson(RESTORE_GUARD_KEY,{id:'normal-guard',syncPaused:true});
      saveCloudSession({user:{id:'synthetic-normal-owner'},access_token:'synthetic-normal-token',expires_at:Date.now()+3600000});
      rememberCloudBase(getStateForStorage(),'synthetic-normal-owner');
      return {session:localStorage.getItem(CLOUD_SESSION_KEY),guard:localStorage.getItem(RESTORE_GUARD_KEY),base:localStorage.getItem(CLOUD_BASE_KEY)};
    });
    const preview=await open(true);assert.equal(await preview.evaluate(()=>cloudSession),null);assert.equal(await preview.evaluate(()=>cloudMergeBase),null);assert.equal(await preview.evaluate(()=>isRestoreSyncPaused()),false);
    await preview.evaluate(()=>{signOutCloud();saveCloudSession({user:{id:'synthetic-preview'},access_token:'synthetic-preview'});writeLocalJson(RESTORE_GUARD_KEY,{id:'preview-guard',syncPaused:true});});
    assert.equal(await preview.evaluate(()=>cloudSession),null);
    assert.deepEqual(await normal.evaluate(()=>({session:localStorage.getItem(CLOUD_SESSION_KEY),guard:localStorage.getItem(RESTORE_GUARD_KEY),base:localStorage.getItem(CLOUD_BASE_KEY)})),saved);
    await normal.evaluate(()=>clearRestoreSyncPause());await preview.waitForTimeout(150);
    assert.equal(await preview.evaluate(()=>isRestoreSyncPaused()),true);assert.equal(await preview.evaluate(()=>cloudSession),null);
    assert.equal(external.filter(page=>page.includes('preview=1')).length,0);
  });
  await run('Tasks, capture and coaching drafts remain separate when one tab switches between normal and preview',async({open})=>{
    const page=await open(false);await seed(page,'NORMAL');await workspace(page,'tasks');await page.getByLabel('New task',{exact:true}).fill('Normal task draft in full');
    await page.locator('#railAddButton').click();await page.getByLabel('What is on your mind?').fill('Normal note draft in full');await page.keyboard.press('Escape');
    await page.evaluate(()=>{coachingSession().draft={thoughts:'Normal goal thought'};saveCoachingDraft();});
    await page.goto(url+'?preview=1&liveReload=0');await workspace(page,'tasks');assert.equal(await page.getByLabel('New task',{exact:true}).inputValue(),'');
    await page.getByLabel('New task',{exact:true}).fill('Preview task draft');await page.locator('#railAddButton').click();assert.equal(await page.getByLabel('What is on your mind?').inputValue(),'');
    await page.getByLabel('What is on your mind?').fill('Preview note draft');await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>coachingSession().draft || null),null);await page.evaluate(()=>{coachingSession().draft={thoughts:'Preview goal thought'};saveCoachingDraft();});
    await page.goto(url+'?liveReload=0');await workspace(page,'tasks');assert.equal(await page.getByLabel('New task',{exact:true}).inputValue(),'Normal task draft in full');
    await page.locator('#railAddButton').click();assert.equal(await page.getByLabel('What is on your mind?').inputValue(),'Normal note draft in full');await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>coachingSession().draft.thoughts),'Normal goal thought');
    await page.goto(url+'?preview=1&liveReload=0');await workspace(page,'tasks');assert.equal(await page.getByLabel('New task',{exact:true}).inputValue(),'Preview task draft');assert.equal(await page.evaluate(()=>coachingSession().draft.thoughts),'Preview goal thought');
  });
  await run('Preview restore and exported recovery data do not include or replace normal records',async({open})=>{
    const normal=await open(false);await seed(normal,'NORMAL-PRIVATE-FIXTURE');const before=await rawNormal(normal);
    const preview=await open(true);await seed(preview,'PREVIEW');
    await preview.evaluate(async()=>{
      const restored=getStateForStorage();restored.boards[0].name='Restored preview board';
      await applyReviewedRestore(rehydrateState(restored),restoreComparable(localStorage.getItem(STORAGE_KEY)),'backup');
    });assert.equal(await preview.evaluate(()=>state.board.name),'Restored preview board');assert.equal(await preview.evaluate(()=>isRestoreSyncPaused()),true);
    assert.deepEqual(await rawNormal(preview),before);
    const downloadPromise=preview.waitForEvent('download');await preview.evaluate(()=>exportBoardBackup());const download=await downloadPromise;
    const backup=fs.readFileSync(await download.path(),'utf8');assert.ok(!backup.includes('NORMAL-PRIVATE-FIXTURE'));assert.ok(backup.includes('PREVIEW full diary text'));
    assert.equal(await preview.evaluate(()=>buildReadableDataArchive(getExportSnapshot()).includes('NORMAL-PRIVATE-FIXTURE')),false);
    await preview.reload();assert.equal(await preview.evaluate(()=>state.board.name),'Restored preview board');assert.deepEqual(await rawNormal(preview),before);
  });
  await run('A corrupt normal snapshot and journal cannot cause preview to overwrite or discard them',async({open})=>{
    const preview=await open(true);
    const before=await preview.evaluate(()=>{
      localStorage.setItem('progress-board-v1','{"normal":"unfinished');localStorage.setItem('life-os-pending-v2:old-tab:1','{broken');
      return [localStorage.getItem('progress-board-v1'),localStorage.getItem('life-os-pending-v2:old-tab:1')];
    });await preview.reload();assert.equal(await preview.evaluate(()=>corruptLocalStateDetected),false);await seed(preview,'PREVIEW');
    assert.deepEqual(await preview.evaluate(()=>[localStorage.getItem('progress-board-v1'),localStorage.getItem('life-os-pending-v2:old-tab:1')]),before);
    const normal=await open(false);assert.equal(await normal.evaluate(()=>corruptLocalStateDetected),true);assert.equal(await normal.evaluate(()=>localStorage.getItem(STORAGE_KEY)),before[0]);
  });
  await run('Preview saves and restores do not wait on normal device or cloud locks',async({open})=>{
    const normal=await open(false);await seed(normal,'NORMAL');
    await normal.evaluate(()=>{
      window.heldLocks=0;window.releaseLocks=[];
      for(const name of ['life-os-device-snapshot-v2','life-os-cloud-and-restore-v1'])navigator.locks.request(name,()=>new Promise(resolve=>{window.heldLocks++;window.releaseLocks.push(resolve);}));
    });await normal.waitForFunction(()=>window.heldLocks===2);
    const preview=await open(true);await seed(preview,'PREVIEW');
    await preview.evaluate(async()=>{const restored=getStateForStorage();restored.boards[0].name='Preview with normal locks held';await applyReviewedRestore(rehydrateState(restored),restoreComparable(localStorage.getItem(STORAGE_KEY)),'backup');});
    assert.equal(await preview.evaluate(()=>state.board.name),'Preview with normal locks held');assert.equal(await normal.evaluate(()=>window.heldLocks),2);
    await normal.evaluate(()=>window.releaseLocks.forEach(release=>release()));
  });
  await run('Preview rejects all low-level cloud calls and offers a deliberate path to the existing workspace',async({open,external})=>{
    const normal=await open(false);await seed(normal,'PRESERVED-WORKSPACE');
    const preview=await open(true);
    const failures=await preview.evaluate(async()=>{
      const session={user:{id:'synthetic'},access_token:'synthetic'};
      const calls=[()=>fetchCloudUser('synthetic'),()=>fetchCloudStateRow(session),()=>writeCloudState(session,{state:{}},{expectedUpdatedAt:''}),()=>cloudAuthRequest('/auth/v1/signup',{}),()=>ensureCloudSession()];
      const messages=[];for(const call of calls){try{await call();messages.push('unexpected success');}catch(error){messages.push(error.message);}}return messages;
    });assert.equal(failures.length,5);assert.ok(failures.every(message=>/disabled in this preview/.test(message)));assert.deepEqual(external,[]);
    await preview.setViewportSize({width:390,height:844});await preview.locator('#headerSaveStatus').click();
    assert.match(await preview.locator('.daily-save-details').innerText(),/Separate preview records/);
    const link=preview.getByRole('link',{name:'Open saved workspace',exact:true});const target=new URL(await link.getAttribute('href'));assert.equal(target.searchParams.has('preview'),false);assert.equal(target.hash,'');
    assert.equal(await preview.locator('#dailyDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    await preview.screenshot({path:out+'/preview-details-phone.png',fullPage:true});
    await link.click();await preview.waitForURL(target.href);assert.equal(await preview.evaluate(()=>PREVIEW_MODE),false);
    assert.equal(await thoughts(preview),'PRESERVED-WORKSPACE full diary text\nEvery word stays.');
  });
  await run('Two preview tabs still merge independent boards while normal records remain unchanged',async({open})=>{
    const normal=await open(false);await seed(normal,'NORMAL');const before=await rawNormal(normal);
    const a=await open(true);await seed(a,'PREVIEW-A');await a.evaluate(async()=>{state.boards.push(createBoardRecord({id:'preview-other',name:'Preview B',cards:[{...makeCard({type:'diary',title:'B diary'}),id:'shared-diary-id'}]}));saveState();await flushDeviceWrites();});
    const b=await open(true);await b.evaluate(()=>switchBoard('preview-other'));
    await a.evaluate(()=>updateDiaryEntry(state.cards[0],getTodayKey(),{thoughts:'Preview A complete entry'}));await b.evaluate(()=>updateDiaryEntry(state.cards[0],getTodayKey(),{thoughts:'Preview B complete entry'}));
    await a.evaluate(()=>flushDeviceWrites());await b.evaluate(()=>flushDeviceWrites());await a.reload();await b.reload();
    assert.equal(await thoughts(a),'Preview A complete entry');assert.equal(await thoughts(b),'Preview B complete entry');assert.deepEqual(await rawNormal(a),before);
  });
  await run('Preview storage failure keeps writing in memory with a warning and normal saving still works',async({open})=>{
    const normal=await open(false);await seed(normal,'NORMAL');const preview=await open(true);await seed(preview,'PREVIEW');
    await preview.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('life-os-preview-v1:'))throw new DOMException('Synthetic quota failure','QuotaExceededError');return window.originalSetItem.call(this,key,value);};});
    await workspace(preview,'today');await preview.getByLabel('Diary thoughts').fill('Full unsaved preview writing remains available');
    assert.equal(await preview.evaluate(()=>lastLocalSaveOk),false);assert.match(await preview.locator('#headerSaveStatus').innerText(),/not saved|export|failed/i);
    await normal.evaluate(async()=>{updateDiaryEntry(state.cards[0],getTodayKey(),{thoughts:'Normal writing saved independently'});await flushDeviceWrites();});
    assert.equal(await preview.getByLabel('Diary thoughts').inputValue(),'Full unsaved preview writing remains available');
    await preview.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;saveState();});await preview.evaluate(()=>flushDeviceWrites());await preview.reload();await normal.reload();
    assert.equal(await thoughts(preview),'Full unsaved preview writing remains available');assert.equal(await thoughts(normal),'Normal writing saved independently');
  });
  await run('A normal-tab cloud save cannot pick up records written in a preview tab',async({open})=>{
    const normal=await open(false);await seed(normal,'NORMAL');const base=await normal.evaluate(()=>getStateForStorage());
    let remote=structuredClone(base),stamp='2026-09-22T00:00:00.000Z',writes=0;
    await normal.route('https://**supabase.co/rest/v1/user_states**',route=>{
      const request=route.request();if(request.method()==='GET')return route.fulfill({json:[{state:remote,updated_at:stamp}]});
      if(request.method()!=='PATCH')return route.fulfill({status:400,body:'Unexpected method'});
      const payload=request.postDataJSON();remote=payload.state;stamp=payload.updated_at;writes++;return route.fulfill({json:[{updated_at:stamp}]});
    });
    await normal.evaluate(({base,stamp})=>{
      saveCloudSession({user:{id:'synthetic-owner'},access_token:'synthetic-token',expires_at:Date.now()+3600000,cloud_updated_at:stamp});
      cloudSaveEnabled=false;cloudMergeBase={ownerId:'synthetic-owner',state:base};
    },{base,stamp});
    const preview=await open(true);await seed(preview,'PREVIEW-MUST-STAY-LOCAL');
    await normal.evaluate(async()=>{updateDiaryEntry(state.cards[0],getTodayKey(),{thoughts:'Normal change to sync'});await flushDeviceWrites();await pushCloudState({manual:true});});
    assert.equal(writes,1);assert.ok(!JSON.stringify(remote).includes('PREVIEW-MUST-STAY-LOCAL'));assert.ok(JSON.stringify(remote).includes('Normal change to sync'));
    assert.equal(await thoughts(preview),'PREVIEW-MUST-STAY-LOCAL full diary text\nEvery word stays.');
  });
  await browser.close();fs.writeFileSync(out+'/preview-isolation-results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
