const engines = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const URL = process.env.TEST_URL || 'http://127.0.0.1:5180/';
const OUT = process.env.TEST_OUTPUT || 'test-results';
fs.mkdirSync(OUT, {recursive:true});
const results = [];
(async () => {
  const browser = await engines[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name, fn) {
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context = await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*', route => route.fulfill({status:503,body:'No live accounts in tests'}));
    const p = await context.newPage(), errors = [], alerts = [];
    p.setDefaultTimeout(7000); p.on('pageerror', error => errors.push(error.stack));
    p.on('dialog', async dialog => {alerts.push(dialog.message()); await dialog.accept();});
    try {await p.goto(URL); await fn(p, context, alerts); assert.deepEqual(errors, []); results.push({name,pass:true});}
    catch (error) {results.push({name,pass:false,error:error.stack,pageErrors:errors}); await p.screenshot({path:OUT+'/restore-failure-'+results.length+'.png'}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1))); await context.close();
  }
  async function seed(p) {
    return p.evaluate(async () => {
      state.boards.push(createBoardRecord({id:'work',name:'Work board',cards:[makeCard({type:'quote',title:'Keep this',description:'My work notes'})]}));
      updateDiaryEntry(state.cards.find(card=>card.type==='diary'),getTodayKey(),{thoughts:'Current writing.\nEvery line matters.'});
      await flushDeviceWrites();
      const backup=getStateForStorage(); backup.boards=backup.boards.filter(board=>board.id!=='work');
      backup.boards[0].name='Personal backup';
      const diary=backup.boards[0].cards.find(card=>card.type==='diary');
      diary.diaryEntries[getTodayKey()]={thoughts:'An older diary entry.',sentence:'',feeling:'',updatedAt:1};
      return backup;
    });
  }
  async function open(p, backup) {
    await p.evaluate(backup => {window.restoreResult=null; importBoardBackup(new File([JSON.stringify(backup)],'personal-backup.json',{type:'application/json'})).then(result=>{window.restoreResult=result;});}, backup);
    await p.getByRole('dialog',{name:'Review backup restore'}).waitFor();
    await p.waitForFunction(()=>!document.querySelector('.restore-consent input').disabled);
  }
  async function confirm(p) {await p.locator('.restore-consent input').check(); await p.getByRole('button',{name:'Restore on this device',exact:true}).click();}
  const checkedRows=p=>p.locator('.backup-check-summary').evaluate(e=>Object.fromEntries([...e.querySelectorAll('dt')].map(dt=>[dt.textContent,dt.nextElementSibling.textContent])));
  async function checker(p){await p.locator('#railSettingsButton').click();await p.getByRole('button',{name:'Check a backup',exact:true}).click();return p.getByRole('dialog',{name:'Check a backup',exact:true});}
  const checkedFile=(name,value)=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  const fileState=(count=1)=>({boards:Array.from({length:count},(_,i)=>({id:'file-board-'+i,name:'File board '+i,cards:[{id:'file-diary',type:'diary',diaryEntries:{'2026-10-17':{thoughts:'Saved file writing.\nSecond line.'}}}],archivedCards:[]}))});
  await run('Backup checker reads a large file without saving, restoring, replaying or contacting cloud',async(p,context,alerts)=>{
    await seed(p);const dialog=await checker(p);
    await p.evaluate(()=>{
      window.checkOriginals=Object.fromEntries(['saveState','flushDeviceWrites','rehydrateState','applyReviewedRestore','queueCloudSave','fetch'].map(key=>[key,window[key]]));
      window.checkBefore={state:JSON.stringify(state),storage:JSON.stringify(Object.entries(localStorage).sort())};
      for(const key of Object.keys(checkOriginals))window[key]=()=>{throw Error('File check called a write, restore, replay or network path');};
    });
    const incoming=fileState();incoming.boards[0].name='<img src=x onerror="throw Error(1)"> File notes';
    incoming.boards[0].cards.push({id:'file-notes',type:'sidenote',sideNoteEntries:{'2026-10-17':{notes:[{text:'First thought'},{text:'Second thought'}]}}});
    incoming.boards[0].archivedCards.push({id:'file-archive',type:'diary',diaryEntries:{'2026-09-01':{thoughts:'Archived file writing'}}});
    const value={app:'Life OS',format:'life-os-full-backup-v2',exportedAt:'2026-10-17T10:00:00Z',state:incoming,localRecovery:{pendingDeviceWrites:[],originalRecoveryCache:JSON.stringify([{state:{oldWriting:'History '.repeat(3200000)}}])}};
    const file=checkedFile('multiline-notes-'+ 'long-file-name-'.repeat(12)+'.json',value);assert.ok(file.buffer.length>25000000);
    await dialog.getByLabel('Backup JSON file',{exact:true}).setInputFiles(file);await dialog.getByRole('status').getByText('File read successfully.',{exact:false}).waitFor();
    const rows=await checkedRows(p);assert.equal(rows.Boards,'1');assert.equal(rows['Diary entries'],'2');assert.equal(rows['Side notes'],'2');assert.equal(rows['Archived cards'],'1');assert.equal(rows['Pending write copies'],'0');
    assert.match(await dialog.locator('.backup-check-scope').innerText(),/Nothing is restored or uploaded/);assert.match(await dialog.locator('.backup-check-scope').innerText(),/Properties data is separate/);
    assert.equal(await dialog.getByRole('button',{name:'Restore on this device',exact:true}).count(),0);
    await dialog.getByText('Boards in file',{exact:true}).click();assert.equal(await dialog.locator('.backup-check-boards img').count(),0);assert.match(await dialog.locator('.backup-check-boards').innerText(),/<img src=x/);
    assert.deepEqual(await p.evaluate(()=>({state:JSON.stringify(state),storage:JSON.stringify(Object.entries(localStorage).sort())})),await p.evaluate(()=>checkBefore));
    await p.evaluate(()=>Object.assign(window,checkOriginals));
    for(const width of [320,390,1080]){
      await p.setViewportSize({width,height:844});await dialog.evaluate(e=>e.scrollTop=0);
      assert.ok(await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth+1;}));
      assert.ok(await dialog.locator('input[type=file]').evaluate(e=>{const r=e.getBoundingClientRect();return r.width<=e.closest('dialog').clientWidth&&r.height>=44;}));
      await p.screenshot({path:OUT+'/backup-check-'+width+'.png'});
    }
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(await p.locator('#settingsModal').isVisible(),true);assert.equal(await p.evaluate(()=>document.activeElement.id),'dataSafetyCheckButton');assert.deepEqual(alerts,[]);
  });
  await run('Backup checker reports incomplete copies and unfamiliar counts, clears failed previews and accepts legacy files',async(p,context,alerts)=>{
    await seed(p);const dialog=await checker(p),input=dialog.getByLabel('Backup JSON file',{exact:true});
    const value={app:'Life OS',format:'life-os-full-backup-v2',state:fileState(),counts:{boards:9},localRecovery:{pendingDeviceWrites:[{state:fileState(2)},{state:fileState(3)}],unreadablePendingDeviceWrites:[{raw:'Broken copy'}],recoveryArchiveError:'Private error text must not appear'}};
    await input.setInputFiles(checkedFile('partial.json',value));await dialog.getByText('File read with warnings. Nothing was restored.',{exact:true}).waitFor();
    let rows=await checkedRows(p);assert.equal(rows.Boards,'1');assert.equal(rows['Diary entries'],'1');assert.equal(rows['Pending write copies'],'2');
    const warnings=await dialog.locator('.backup-check-warning').allTextContents();assert.match(warnings.join(' '),/differs/);assert.match(warnings.join(' '),/unavailable or unreadable/);assert.match(warnings.join(' '),/not a replay/);assert.ok(!warnings.join(' ').includes('Private error text'));
    await input.setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await dialog.getByRole('status').getByText(/could not be read as JSON/).waitFor();assert.equal(await dialog.locator('.backup-check-summary').count(),0);assert.equal(await dialog.locator('.backup-check-warning').count(),0);
    const unusual=fileState();unusual.boards[0].cards[0].diaryEntries='Unfamiliar original data';await input.setInputFiles(checkedFile('unfamiliar.json',unusual));await dialog.getByText('File read with warnings. Nothing was restored.',{exact:true}).waitFor();rows=await checkedRows(p);assert.equal(rows['Diary entries'],'Unavailable');
    await input.setInputFiles(checkedFile('legacy.json',{cards:[{id:'q',type:'quote',description:'Original legacy note'}]}));await dialog.getByRole('status').getByText('File read successfully.',{exact:false}).waitFor();rows=await checkedRows(p);assert.equal(rows.Format,'Legacy workspace');assert.equal(rows['Export date'],'Not recorded');assert.equal(rows['Pending write copies'],'Not recorded');assert.equal(await dialog.locator('.backup-check-warning').count(),0);assert.deepEqual(alerts,[]);
  });
  await run('Backup checker ignores older selections, cleared inputs and reads finishing after close',async p=>{
    await seed(p);let dialog=await checker(p),input=dialog.getByLabel('Backup JSON file',{exact:true});
    await p.evaluate(()=>{const original=readBackupFile;window.checkWaiters=[];readBackupFile=async file=>{const value=await original(file);await new Promise(resolve=>checkWaiters.push(resolve));return value;};});
    await input.setInputFiles(checkedFile('older.json',fileState()));await p.waitForFunction(()=>checkWaiters.length===1);
    await input.setInputFiles(checkedFile('newer.json',fileState(2)));await p.waitForFunction(()=>checkWaiters.length===2);await p.evaluate(()=>checkWaiters[1]());await dialog.getByRole('status').getByText('File read successfully.',{exact:false}).waitFor();assert.equal((await checkedRows(p)).File,'newer.json');
    await p.evaluate(async()=>{checkWaiters[0]();await Promise.resolve();await Promise.resolve();});assert.equal((await checkedRows(p)).Boards,'2');
    await input.setInputFiles(checkedFile('cleared.json',fileState(3)));await p.waitForFunction(()=>checkWaiters.length===3);await input.setInputFiles([]);await dialog.getByText('No file selected. Nothing was changed.',{exact:true}).waitFor();await p.evaluate(async()=>{checkWaiters[2]();await Promise.resolve();await Promise.resolve();});assert.equal(await dialog.locator('.backup-check-summary').count(),0);assert.equal(await dialog.locator('.backup-check-result').getAttribute('aria-busy'),null);
    await input.setInputFiles(checkedFile('closed.json',fileState(4)));await p.waitForFunction(()=>checkWaiters.length===4);await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await p.locator('#settingsModal').isVisible(),true);assert.equal(await p.evaluate(()=>document.activeElement.id),'dataSafetyCheckButton');await p.getByRole('button',{name:'Check a backup',exact:true}).click();dialog=p.getByRole('dialog',{name:'Check a backup',exact:true});input=dialog.getByLabel('Backup JSON file',{exact:true});
    await input.setInputFiles(checkedFile('current.json',fileState(5)));await p.waitForFunction(()=>checkWaiters.length===5);await p.evaluate(async()=>{checkWaiters[3]();await Promise.resolve();await Promise.resolve();});assert.equal(await dialog.locator('.backup-check-summary').count(),0);await p.evaluate(()=>checkWaiters[4]());await dialog.getByRole('status').getByText('File read successfully.',{exact:false}).waitFor();assert.equal((await checkedRows(p)).Boards,'5');assert.equal((await checkedRows(p)).File,'current.json');
  });
  await run('Large full backup recovery history reaches review, cancels safely and restores only after consent', async (p,context,alerts) => {
    const backup=await seed(p);
    await p.evaluate(backup=>{
      window.largeBackupFile=new File([JSON.stringify({app:'Life OS',format:'life-os-full-backup-v2',state:backup,localRecovery:{originalRecoveryCache:JSON.stringify([{reason:'older-version',state:{boards:[{id:'old-history',cards:[{id:'old-note',type:'quote',description:'Historical note. '.repeat(1700000)}]}]}}])}})],'large-full-backup.json',{type:'application/json'});
      window.beforeLargeImport=LifeCloudCopies.records(getStateForStorage());
      window.restoreResult=null;importBoardBackup(largeBackupFile).then(result=>{window.restoreResult=result;});
    },backup);
    assert.ok(await p.evaluate(()=>largeBackupFile.size)>25000000);
    await p.waitForFunction(()=>Boolean(document.getElementById('restoreReviewModal')) || window.restoreResult===false);
    assert.equal(await p.getByRole('dialog',{name:'Review backup restore'}).isVisible(),true,alerts.join('\n'));
    assert.ok(await p.getByRole('button',{name:'Cancel restore',exact:true}).locator('svg').evaluate(e=>{const r=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return r.width===18&&r.height===18&&r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom;}),'Cancel icon must be visible inside its touch target');
    await p.waitForFunction(()=>!document.querySelector('.restore-consent input').disabled);
    assert.match(await p.locator('.restore-recovery-note').innerText(),/not automatically merged/);
    assert.equal(await p.getByRole('button',{name:'Restore on this device',exact:true}).isDisabled(),true);
    for(const width of [320,390,1080]){
      await p.setViewportSize({width,height:844});
      await p.locator('.restore-recovery-note').scrollIntoViewIfNeeded();
      assert.ok(await p.locator('#restoreReviewModal').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth+1;}));
      assert.ok(await p.locator('.restore-recovery-note').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      await p.screenshot({path:OUT+'/large-backup-review-'+width+'.png'});
    }
    await p.getByRole('button',{name:'Cancel restore',exact:true}).click();
    await p.waitForFunction(()=>window.restoreResult===false);
    assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),await p.evaluate(()=>beforeLargeImport));
    assert.equal(await p.evaluate(()=>localStorage.getItem(RESTORE_GUARD_KEY)),null);
    await p.setViewportSize({width:1280,height:900});
    await p.evaluate(()=>{window.restoreResult=null;importBoardBackup(largeBackupFile).then(result=>{window.restoreResult=result;});});
    await p.waitForFunction(()=>Boolean(document.querySelector('.restore-consent input')) && !document.querySelector('.restore-consent input').disabled);
    await confirm(p);await p.waitForFunction(()=>window.restoreResult===true);await p.reload();
    assert.equal(await p.locator('.diary-thoughts').inputValue(),'An older diary entry.');
    assert.equal(await p.evaluate(()=>state.boards.length),1);
    assert.equal(await p.evaluate(()=>isRestoreSyncPaused()),true);
    assert.match(await p.evaluate(()=>JSON.stringify(readLocalJsonValue(CLOUD_RECOVERY_KEY,[]))),/Current writing/);
    assert.equal(await p.evaluate(()=>state.boards.some(b=>b.id==='old-history')),false);
    assert.deepEqual(alerts,[]);
  });
  await run('backup preview identifies replaced and absent boards; cancel changes nothing', async p => {
    const backup=await seed(p), before=await p.evaluate(()=>getStateForStorage().boards);
    await open(p,backup); assert.equal(await p.getByRole('button',{name:'Restore on this device',exact:true}).isDisabled(),true);
    assert.match(await p.locator('.restore-board-list').innerText(),/Work board/); assert.match(await p.locator('.restore-board-list').innerText(),/Not included/);
    await p.getByRole('button',{name:'Cancel restore',exact:true}).click();
    await p.waitForFunction(()=>window.restoreResult===false);
    assert.equal(await p.evaluate(()=>window.restoreResult),false);
    assert.deepEqual(await p.evaluate(()=>getStateForStorage().boards),before);
    assert.equal(await p.evaluate(()=>localStorage.getItem(RESTORE_GUARD_KEY)),null);
  });
  await run('restore survives reload without an old diary backup undoing it and preserves the prior full copy', async p => {
    const backup=await seed(p); await open(p,backup); await confirm(p); await p.waitForFunction(()=>window.restoreResult===true);
    const result=await p.evaluate(()=>({guard:readRestoreGuard(),copy:readLocalJsonValue(CLOUD_RECOVERY_KEY,[])[0],oldBackups:readDiaryBackups()}));
    assert.equal(result.guard.syncPaused,true); assert.equal(result.copy.state.boards.length,2); assert.match(JSON.stringify(result.copy.state),/Current writing/); assert.match(JSON.stringify(result.oldBackups),/Current writing/);
    await p.reload(); assert.equal(await p.locator('.diary-thoughts').inputValue(),'An older diary entry.');
    assert.equal(await p.evaluate(()=>state.boards.length),1);
    await p.locator('.diary-thoughts').fill('New writing after restore.\nStill complete.'); await p.evaluate(()=>flushDeviceWrites()); await p.reload();
    assert.equal(await p.locator('.diary-thoughts').inputValue(),'New writing after restore.\nStill complete.');
    assert.equal(await p.evaluate(()=>cloudSaveEnabled),false); assert.match(await p.locator('#headerSaveStatus').innerText(),/cloud paused/);
  });
  await run('another tab editing during review blocks replacement until refreshed and reconfirmed', async (p,context) => {
    const backup=await seed(p); await open(p,backup);
    const q=await context.newPage(); await q.goto(URL);
    await q.evaluate(async()=>{switchBoard('work');state.board.name='New work title';saveState({skipCloud:true});await flushDeviceWrites();});
    await confirm(p); await p.getByText(/Records changed while this review was open/).waitFor();
    assert.equal(await p.evaluate(()=>state.boards.find(board=>board.id==='work').name),'New work title');
    await p.getByRole('button',{name:'Refresh comparison',exact:true}).click(); await p.getByText(/Comparison refreshed/).waitFor();
    assert.equal(await p.locator('.restore-consent input').isChecked(),false); assert.match(await p.locator('.restore-board-list').innerText(),/New work title/);
    await confirm(p); await p.waitForFunction(()=>window.restoreResult===true);
    assert.equal(await p.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[])[0].state.boards.find(board=>board.id==='work').name),'New work title');
    await q.evaluate(()=>flushDeviceWrites()); assert.equal(await q.evaluate(()=>state.boards.some(board=>board.id==='work')),false);
  });
  for (const failure of ['backup','guard','snapshot']) {
    await run(`${failure} storage failure prevents restore and retains the original`, async p => {
      const backup=await seed(p); await open(p,backup);
      await p.evaluate(failure=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){
        if ((failure==='backup' && key===CLOUD_RECOVERY_KEY) || (failure==='guard' && key===RESTORE_GUARD_KEY) || (failure==='snapshot' && key===STORAGE_KEY && JSON.parse(value).boards.length===1)) throw new DOMException('Full','QuotaExceededError');
        return original.call(this,key,value);
      };},failure);
      await confirm(p); await p.waitForFunction(()=>document.querySelector('.conflict-message').textContent.length>0);
      assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)).boards.length),2);
      assert.equal(await p.evaluate(()=>state.cards.find(card=>card.type==='diary').diaryEntries[getTodayKey()].thoughts),'Current writing.\nEvery line matters.');
      assert.equal(await p.evaluate(()=>localStorage.getItem(RESTORE_GUARD_KEY)),null);
      assert.equal(await p.locator('#restoreReviewModal').isVisible(),true);
    });
  }
  await run('unreadable original bytes are backed up before recovery replacement', async p => {
    const backup=await seed(p);
    await p.evaluate(()=>{corruptLocalStateDetected=true;localStorage.setItem(STORAGE_KEY,'{"private":"unfinished');});
    await open(p,backup); await confirm(p); await p.waitForFunction(()=>window.restoreResult===true);
    assert.equal(await p.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]).find(copy=>copy.reason==='before-restore-unreadable')?.rawState),'{'+'"private":"unfinished');
    assert.equal(await p.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]).some(copy=>copy.reason==='before-restore-verified-checkpoint')),true);
    await p.reload(); assert.equal(await p.locator('.diary-thoughts').inputValue(),'An older diary entry.');
    await p.evaluate(()=>openRecovery()); assert.equal(await p.getByRole('button',{name:'Download original storage',exact:true}).count(),1);
  });
  await run('cancelled restore from Recovery leaves its parent dialog available', async p => {
    await seed(p); await p.evaluate(()=>{saveCloudRecoveryPoint('test-copy');openRecovery();});
    await p.getByRole('button',{name:'Restore this device',exact:true}).click();
    await p.getByRole('button',{name:'Cancel restore',exact:true}).click();
    assert.equal(await p.locator('#recoveryModal').isVisible(),true); assert.equal(await p.locator('body').evaluate(el=>el.classList.contains('modal-open')),true);
  });
  await run('duplicate identities and unknown card types are rejected without normalization loss', async (p,context,alerts) => {
    const backup=await seed(p);
    for (const kind of ['card','task','unknown']) {
      const copy=JSON.parse(JSON.stringify(backup)),card=copy.boards[0].cards[0];
      if(kind==='card')copy.boards[0].cards.push(card);
      if(kind==='task')card.plannerTasks=[{id:'same',title:'One'},{id:'same',title:'Two'}];
      if(kind==='unknown')card.type='unsupported-new-type';
      const result=await p.evaluate(copy=>importBoardBackup(new File([JSON.stringify(copy)],'invalid.json')),copy);assert.equal(result,false);
    }
    assert.equal(alerts.length,3);assert.equal(await p.evaluate(()=>state.boards.length),2);
  });
  await run('restore review fits mobile and desktop and treats names as plain text', async p => {
    const backup=await seed(p);backup.boards[0].name='<img src=x onerror="window.injected=true">';await open(p,backup);
    assert.equal(await p.locator('.restore-board-list img').count(),0);assert.equal(await p.evaluate(()=>window.injected),undefined);
    await p.getByRole('button',{name:'Cancel restore',exact:true}).click();backup.boards[0].name='My personal board';await open(p,backup);
    await p.screenshot({path:OUT+'/restore-desktop.png'});
    for (const width of [320,390,768]) {
      await p.setViewportSize({width,height:844});await p.locator('.restore-consent input').check();
      const button=p.getByRole('button',{name:'Restore on this device',exact:true});await button.scrollIntoViewIfNeeded();await button.click({trial:true});
      const bounds=await p.locator('#restoreReviewModal').boundingBox();assert.ok(bounds.x>=0);assert.ok(bounds.x+bounds.width<=width);assert.ok(bounds.y+bounds.height<=844);
    }
    await p.setViewportSize({width:390,height:844});await p.locator('#restoreReviewModal').evaluate(el=>el.scrollTop=0);await p.screenshot({path:OUT+'/restore-mobile.png'});
  });
  await run('a downloaded backup restores every card type, multiline writing and task completion history', async p => {
    await seed(p);
    await p.evaluate(async()=>{
      for(const type of Object.keys(TYPE_META))state.cards.push(makeCard({type,title:'Sample '+type,description:'First line\nSecond line',items:['A finished project item','Another item']}));
      const project=state.cards.find(card=>card.type==='checklist');project.items[0].done=true;
      const planner=state.cards.find(card=>card.type==='planner');LifePlanner.add(planner,'2026-09-01','A completed task','round-trip-task',1);LifePlanner.complete(planner,'round-trip-task','2026-09-07',new Date('2026-09-08T10:22:33').getTime());LifePlanner.project(planner);
      const fitness=state.cards.find(card=>card.type==='fitness');fitness.fitnessEntries[getTodayKey()].metrics.weightKg=70.25;fitness.fitnessEntries[getTodayKey()].metrics.leftArmCm=32.5;
      const food=state.cards.find(card=>card.type==='food'),item=food.foodLibrary[0];
      food.foodEntries[getTodayKey()].meals[0].items.push({id:'logged-rice',foodId:item.id,amount:125,unit:'g',...createFoodItemSnapshot(item)});
      state.archivedCards.push({...makeCard({type:'quote',title:'An archived motivation',description:'Keep going.\nOne step at a time.'}),archivedAt:Date.now()});
      saveState();await flushDeviceWrites();
    });
    const downloading=p.waitForEvent('download');await p.evaluate(()=>exportBoardBackup());const download=await downloading;
    const file=await download.path(),backup=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(backup.includesAuthSession,false);assert.ok(backup.state.boards[0].cards.length>10);
    await p.evaluate(async()=>{state.cards.find(card=>card.type==='quote').description='A later change';saveState();await flushDeviceWrites();});
    await p.locator('#importDataFile').setInputFiles(file);await p.getByRole('dialog',{name:'Review backup restore'}).waitFor();
    await p.waitForFunction(()=>!document.querySelector('.restore-consent input').disabled);await confirm(p);
    await p.waitForFunction(()=>!document.getElementById('restoreReviewModal'));await p.reload();
    const records=boards=>boards.map(board=>({...board,cards:board.cards.map(card=>{
      // A daily countdown keeps ticking; every stored record and history field must match.
      if(card.type!=='routine')return card;
      const {remaining,duration,...record}=card;return record;
    })}));
    assert.equal(await p.evaluate(()=>corruptLocalStateDetected),false);
    assert.deepEqual(records(await p.evaluate(()=>getStateForStorage().boards)),records(backup.state.boards));
  });
  await run('normalizing an imported food card does not read or change the current card with the same ID', async p => {
    const result=await p.evaluate(async()=>{
      const live=makeCard({type:'food',title:'Current food card'});state.cards.push(live);saveState();await flushDeviceWrites();
      const before=getStateForStorage().boards;
      const incoming=LifeStateMerge.copy(state.cards.find(card=>card.id===live.id));
      incoming.foodEntries[getTodayKey()].meals=[{id:'imported-meal',name:'Imported dinner',items:[]}];incoming.activeFoodMealId='';
      const normalized=normalizeCard(incoming);
      return {before,after:getStateForStorage().boards,mealId:normalized.activeFoodMealId,mealName:normalized.foodEntries[getTodayKey()].meals[0].name};
    });
    assert.deepEqual(result.after,result.before);assert.equal(result.mealId,'imported-meal');assert.equal(result.mealName,'Imported dinner');
  });
  await run('unfinished editor input is not discarded by a restore attempt', async (p,context,alerts) => {
    const backup=await seed(p);await p.locator('#railAddButton').click();await p.getByRole('button',{name:'Add a card instead',exact:true}).click();await p.locator('#cardTitle').fill('My unfinished idea');
    const result=await p.evaluate(backup=>importBoardBackup(new File([JSON.stringify(backup)],'backup.json')),backup);
    assert.equal(result,false);assert.match(alerts[0],/Finish or close the current editor/);assert.equal(await p.locator('#cardTitle').inputValue(),'My unfinished idea');
  });
  await run('an unreadable restore guard pauses cloud and cannot replay pre-restore diary text', async p => {
    const backup=await seed(p);await open(p,backup);await confirm(p);await p.waitForFunction(()=>window.restoreResult===true);
    await p.evaluate(()=>localStorage.setItem(RESTORE_GUARD_KEY,'{broken'));await p.reload();
    assert.equal(await p.locator('.diary-thoughts').inputValue(),'An older diary entry.');assert.equal(await p.evaluate(()=>isRestoreSyncPaused()),true);
  });
  fs.writeFileSync(OUT+'/restore-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(result=>!result.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
