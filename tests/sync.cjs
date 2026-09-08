const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const output=process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(output,{recursive:true});
const results=[];
const user='11111111-1111-4111-8111-111111111111';
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const browser=await chromium.launch({headless:true});
 async function run(name,fn){
  const contexts=[];
  async function context(){const c=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Kuala_Lumpur'});contexts.push(c);return c;}
  try{await fn(context);results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}
  console.log(JSON.stringify(results.at(-1)));for(const c of contexts)await c.close();
 }
 async function fresh(c){
  await c.route('https://**supabase.co/**',r=>r.fulfill({status:503,body:'No production access'}));
  const p=await c.newPage();p.on('dialog',d=>d.accept());await p.goto(URL);return p;
 }
 async function connect(page,base,stamp){await page.evaluate(({base,stamp,user})=>{
   state=rehydrateState(base);cloudSession={user:{id:user},access_token:'synthetic-test-token',expires_at:Date.now()+3600000,cloud_updated_at:stamp};
   cloudSaveEnabled=false;cloudMergeBase={ownerId:user,state:JSON.parse(JSON.stringify(base))};localMergeBase=JSON.parse(JSON.stringify(state));cloudConflictPending=false;
   render();saveState({skipCloud:true,touch:false});
  },{base,stamp,user});await page.evaluate(()=>flushDeviceWrites());}
 async function setup(context,{planner=false,health=false}={}){
  const a=await fresh(await context());
  const base=await a.evaluate(async({planner,health})=>{
   state.boards.push(createBoardRecord({id:'work',name:'Work',cards:[makeCard({type:'diary',title:'Work diary'})]}));
   if(planner){const source=makeCard({type:'planner',title:'Planner sync review',category:'Personal'});source.id='sync-review-source';LifePlanner.add(source,'2026-09-01','Call the clinic','sync-review-task',1000);LifePlanner.project(source);state.cards.push(source);}
   if(health){const card=makeCard({type:'food',title:'Food sync review',category:'Health'});card.id='sync-food';card.activeFoodDate='2026-09-08';
     const rice=card.foodLibrary.find(food=>food.id==='rice-white-cooked');
     card.foodEntries={'2026-09-08':normalizeFoodEntry({meals:[{id:'meal',name:'Lunch',items:[{id:'food-entry',foodId:rice.id,...createFoodItemSnapshot(rice),amount:100,unit:'g'}]}]})};state.cards.push(card);}
   saveState();await flushDeviceWrites();return getStateForStorage();
  },{planner,health});
  const backend={state:clone(base),updated_at:'2026-09-08T00:00:00.000Z',writes:0};
  const b=await fresh(await context());
  for(const p of [a,b]){
   await p.route('https://**supabase.co/rest/v1/user_states**',async route=>{
    const req=route.request(),url=new globalThis.URL(req.url());
    if(req.method()==='GET'){await route.fulfill({json:[{state:clone(backend.state),updated_at:backend.updated_at}]});return;}
    if(req.method()==='PATCH'){
     await new Promise(resolve=>setTimeout(resolve,30));
     if(url.searchParams.get('updated_at')!=='eq.'+backend.updated_at){await route.fulfill({json:[]});return;}
     const data=req.postDataJSON();backend.state=data.state;backend.updated_at=data.updated_at;backend.writes++;await route.fulfill({json:[{updated_at:backend.updated_at}]});return;
    }
    await route.fulfill({status:400,body:'Unexpected method'});
   });
   await connect(p,base,backend.updated_at);
  }
  return {a,b,base,backend};
 }
 await run('computer and phone merge changes to different boards',async context=>{
  const {a,b,backend}=await setup(context);
  await a.evaluate(()=>{state.board.name='Computer personal board';saveState({skipCloud:true});});
  await b.evaluate(()=>{switchBoard('work');state.board.name='Phone work board';saveState({skipCloud:true});});
  await a.evaluate(()=>pushCloudState({manual:true}));await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.state.boards.find(x=>x.id==='personal-board').name,'Computer personal board');assert.equal(backend.state.boards.find(x=>x.id==='work').name,'Phone work board');
  assert.equal(await b.evaluate(()=>cloudConflictPending),false);
 });
 await run('same-record cloud conflict preserves local and remote instead of overwriting',async context=>{
  const {a,b,backend}=await setup(context);
  await a.evaluate(()=>{state.board.name='Computer version';saveState({skipCloud:true});});await b.evaluate(()=>{state.board.name='Phone version';saveState({skipCloud:true});});
  await a.evaluate(()=>pushCloudState({manual:true}));await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.state.boards[0].name,'Computer version');assert.equal(await b.evaluate(()=>state.board.name),'Phone version');assert.equal(await b.evaluate(()=>cloudConflictPending),true);
  assert.ok(await b.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]).some(x=>x.state.boards[0].name==='Computer version')));
 });
 await run('simultaneous cloud writers use compare-and-swap and retry safely',async context=>{
  const {a,b,backend}=await setup(context);
  await a.evaluate(()=>{state.board.name='Concurrent personal';saveState({skipCloud:true});});await b.evaluate(()=>{switchBoard('work');state.board.name='Concurrent work';saveState({skipCloud:true});});
  await Promise.all([a.evaluate(()=>pushCloudState({manual:true})),b.evaluate(()=>pushCloudState({manual:true}))]);
  await a.evaluate(()=>pushCloudState({manual:true}));await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.state.boards[0].name,'Concurrent personal');assert.equal(backend.state.boards.find(x=>x.id==='work').name,'Concurrent work');
 });
 await run('reviewed cloud text survives reload and resumes without replacing unrelated boards',async context=>{
  const {a,b,backend}=await setup(context);
  await a.evaluate(()=>{state.board.name='Computer text';state.boards.find(x=>x.id==='work').name='Other cloud board change';saveState({skipCloud:true});});await a.evaluate(()=>pushCloudState({manual:true}));
  await b.evaluate(()=>{state.board.name='Phone text';saveState({skipCloud:true});});await b.evaluate(()=>pushCloudState({manual:true}));
  await b.evaluate(()=>{rememberCloudBase(cloudMergeBase.state,cloudSession.user.id);persistCloudSession();});await b.reload();
  await b.evaluate(async()=>{cloudSaveEnabled=false;await flushDeviceWrites();const conflict=state.syncConflicts[0];await applyConflictTextChoice(conflict,state.board.name,'Combined text');});
  await b.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.state.boards[0].name,'Combined text');assert.equal(backend.state.boards.find(x=>x.id==='work').name,'Other cloud board change');assert.equal(await b.evaluate(()=>cloudConflictPending),false);
 });
 await run('a newer cloud edit is not overwritten by a choice from an older comparison',async context=>{
  const {a,b,backend}=await setup(context);
  await a.evaluate(()=>{state.board.name='Cloud version one';saveState({skipCloud:true});});await a.evaluate(()=>pushCloudState({manual:true}));
  await b.evaluate(()=>{state.board.name='Local writing';saveState({skipCloud:true});});await b.evaluate(()=>pushCloudState({manual:true}));
  await a.evaluate(()=>{state.board.name='Newer cloud writing';saveState({skipCloud:true});});await a.evaluate(()=>pushCloudState({manual:true}));
  await b.evaluate(()=>applyConflictTextChoice(state.syncConflicts[0],state.board.name,'Reviewed local writing'));await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.state.boards[0].name,'Newer cloud writing');assert.equal(await b.evaluate(()=>state.board.name),'Reviewed local writing');assert.equal(await b.evaluate(()=>cloudConflictPending),true);
 });
 await run('known timestamp from another tab cannot bypass baseline comparison',async context=>{
  const {a,b,backend}=await setup(context);
  await a.evaluate(()=>{state.board.name='Saved on computer';saveState({skipCloud:true});});await a.evaluate(()=>pushCloudState({manual:true}));
  await b.evaluate(stamp=>{cloudSession.cloud_updated_at=stamp;switchBoard('work');state.board.name='Saved on phone';saveState({skipCloud:true});},backend.updated_at);
  await b.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.state.boards[0].name,'Saved on computer');assert.equal(backend.state.boards[1].name,'Saved on phone');
 });
 await run('cloud restore exits recovery and permits subsequent device saving',async context=>{
  const {b,backend}=await setup(context);
  await b.evaluate(()=>{corruptLocalStateDetected=true;localStorage.setItem(STORAGE_KEY,'{broken');});
  await b.evaluate(()=>pullCloudState({confirmReplace:false}));assert.equal(await b.evaluate(()=>corruptLocalStateDetected),false);
  await b.locator('.diary-thoughts').fill('Writing after recovery');await b.evaluate(()=>flushDeviceWrites());
  assert.equal(await b.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)).boards[0].cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts),'Writing after recovery');
  assert.equal(backend.writes,0);
 });
 await run('account change cannot send the previous account records to another user',async context=>{
  const {b,backend}=await setup(context);
  await b.evaluate(()=>{state.cloudOwnerId='different-owner';state.board.name='Never send';});await b.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,0);assert.match(await b.locator('#cloudNote').innerText(),/another account/);
 });
 await run('backup restore keeps automatic cloud sync paused across reload and another tab until explicitly confirmed',async context=>{
  const {b,base,backend}=await setup(context);
  await b.evaluate(async base=>{
   persistCloudSession();rememberCloudBase(base,cloudSession.user.id);await flushDeviceWrites();
   const restored=rehydrateState(base);restored.boards[0].name='Restored personal board';
   await applyReviewedRestore(restored,restoreComparable(localStorage.getItem(STORAGE_KEY)),'backup');
  },base);
  await b.reload();assert.equal(await b.evaluate(()=>cloudSaveEnabled),false);
  const q=await b.context().newPage();let unexpected=0;
  await q.route('https://**supabase.co/**',route=>{unexpected++;return route.fulfill({status:503,body:'Auto sync must remain paused'});});await q.goto(URL);
  await q.evaluate(async()=>{switchBoard('work');state.board.name='New local work';saveState();await flushDeviceWrites();await pushCloudState({silent:true});queueCloudSave({immediate:true});});
  await q.waitForTimeout(1600);assert.equal(unexpected,0);assert.equal(backend.writes,0);
  b.removeAllListeners('dialog');b.on('dialog',dialog=>dialog.dismiss());await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.writes,0);assert.equal(await b.evaluate(()=>isRestoreSyncPaused()),true);
  b.removeAllListeners('dialog');b.on('dialog',dialog=>dialog.accept());await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.state.boards[0].name,'Restored personal board');assert.equal(backend.state.boards.find(board=>board.id==='work').name,'New local work');
  assert.equal(await b.evaluate(()=>isRestoreSyncPaused()),false);await b.reload();assert.equal(await b.evaluate(()=>isRestoreSyncPaused()),false);
 });
 await run('cloud load refuses to overwrite writing made while the cloud request was pending',async context=>{
  const {b,backend}=await setup(context);let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),seen=new Promise(resolve=>{started=resolve;});
  await b.route('https://**supabase.co/rest/v1/user_states**',async route=>{started();await gate;await route.fulfill({json:[{state:clone(backend.state),updated_at:backend.updated_at}]});});
  await b.evaluate(()=>{window.loadFinished=false;pullCloudState({confirmReplace:false}).then(()=>{window.loadFinished=true;});});await seen;
  await b.locator('.diary-thoughts').fill('Writing while the cloud is loading.');await b.evaluate(()=>flushDeviceWrites());release();
  await b.waitForFunction(()=>window.loadFinished);assert.equal(await b.locator('.diary-thoughts').inputValue(),'Writing while the cloud is loading.');
  assert.match(await b.locator('#cloudNote').innerText(),/Records changed/);assert.equal(backend.writes,0);
 });
 await run('same-browser restore waits for an in-flight cloud save and keeps later automatic saves paused',async context=>{
  const {b,base,backend}=await setup(context);let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),seen=new Promise(resolve=>{started=resolve;});
  await b.route('https://**supabase.co/rest/v1/user_states**',async route=>{
   if(route.request().method()==='GET'){await route.fulfill({json:[{state:clone(backend.state),updated_at:backend.updated_at}]});return;}
   started();await gate;const data=route.request().postDataJSON();backend.state=data.state;backend.updated_at=data.updated_at;backend.writes++;await route.fulfill({json:[{updated_at:backend.updated_at}]});
  });
  await b.evaluate(()=>{state.board.name='Saved before restore';saveState({skipCloud:true});window.pushFinished=false;pushCloudState({manual:true}).then(()=>{window.pushFinished=true;});});await seen;
  const q=await fresh(b.context());
  await q.evaluate(async base=>{
   await flushDeviceWrites();window.restoreFinished=false;const restored=rehydrateState(base);restored.boards[0].name='Chosen backup';
   applyReviewedRestore(restored,restoreComparable(localStorage.getItem(STORAGE_KEY)),'backup').then(()=>{window.restoreFinished=true;});
  },base);
  await q.waitForTimeout(100);assert.equal(await q.evaluate(()=>window.restoreFinished),false);release();
  await b.waitForFunction(()=>window.pushFinished);await q.waitForFunction(()=>window.restoreFinished);
  assert.equal(backend.writes,1);assert.equal(backend.state.boards[0].name,'Saved before restore');
  await b.evaluate(async()=>{await flushDeviceWrites();queueCloudSave({immediate:true});await pushCloudState({silent:true});});
  assert.equal(await b.evaluate(()=>state.board.name),'Chosen backup');assert.equal(backend.writes,1);assert.equal(await b.evaluate(()=>isRestoreSyncPaused()),true);
 });
 await run('interrupted device commit recovers full writing after tab closure',async context=>{
  const c=await context(),a=await fresh(c);await a.evaluate(async()=>{saveState();await flushDeviceWrites();LifeDeviceStore.configure(()=>false);});
  await a.locator('.diary-thoughts').fill('Every character survives an interrupted commit.\nIncluding this line.');
  assert.ok(await a.evaluate(()=>LifeDeviceStore.pending().length));await a.close();const b=await c.newPage();await b.goto(URL);
  assert.equal(await b.locator('.diary-thoughts').inputValue(),'Every character survives an interrupted commit.\nIncluding this line.');await b.evaluate(()=>flushDeviceWrites());assert.equal(await b.evaluate(()=>LifeDeviceStore.pending().length),0);
 });
 await run('delayed storage events cannot roll back a newer committed diary',async context=>{
  const p=await fresh(await context());
  const text=await p.evaluate(async()=>{
   saveState();await flushDeviceWrites();const old=localStorage.getItem(STORAGE_KEY);
   updateDiaryEntry(state.cards.find(c=>c.type==='diary'),getTodayKey(),{thoughts:'The newer complete entry'});await flushDeviceWrites();
   await applyExternalStorageState(old);
   return state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts;
  });
  assert.equal(text,'The newer complete entry');
 });
 await run('same-field edits in two local tabs retain both versions and raise a warning',async context=>{
  const c=await context(),a=await fresh(c);await a.evaluate(async()=>{saveState();await flushDeviceWrites();});
  const b=await fresh(c);
  for(const p of [a,b])await p.evaluate(()=>LifeDeviceStore.configure(()=>false));
  await a.locator('.diary-thoughts').fill('First tab version');
  await b.locator('.diary-thoughts').fill('Second tab version');
  const result=await a.evaluate(async()=>{
   LifeDeviceStore.configure(commitDeviceWrites);await flushDeviceWrites();
   return {conflict:cloudConflictPending,saved:JSON.parse(localStorage.getItem(STORAGE_KEY)),copies:readLocalJsonValue(CLOUD_RECOVERY_KEY,[])};
  });
  assert.equal(result.conflict,true);
  assert.match(JSON.stringify(result.saved),/Second tab version/);
  assert.match(JSON.stringify(result.copies),/First tab version/);
 });
 await run('three tabs and 600 near-simultaneous board edits all survive',async context=>{
  const c=await context(),a=await fresh(c);await a.evaluate(async()=>{for(const id of ['two','three'])state.boards.push(createBoardRecord({id,name:id,cards:[makeCard({type:'diary',title:id})]}));saveState();await flushDeviceWrites();});
  const pages=[a,await c.newPage(),await c.newPage()];for(let i=1;i<3;i++){await pages[i].goto(URL);await pages[i].evaluate(id=>switchBoard(id),['','two','three'][i]);}
  for(let round=0;round<10;round++){
   await Promise.all(pages.map((p,i)=>p.evaluate(async({i,round})=>{for(let n=1;n<=20;n++){const d=state.cards.find(c=>c.type==='diary');updateDiaryEntry(d,getTodayKey(),{thoughts:'Round '+round+' board '+i+' entry '+n});await new Promise(r=>setTimeout(r,3));}await flushDeviceWrites();},{i,round})));
   const records=await a.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)).boards.map(b=>b.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()]?.thoughts));
   assert.deepEqual(records,[0,1,2].map(i=>'Round '+round+' board '+i+' entry 20'));
   for(const p of pages){const result=await p.evaluate(()=>({conflicted:cloudConflictPending,conflicts:state.syncConflicts}));assert.equal(result.conflicted,false,JSON.stringify({round,...result}));}
  }
  await a.reload();assert.equal(await a.evaluate(()=>state.activeBoardId),'personal-board');await pages[1].reload();assert.equal(await pages[1].evaluate(()=>state.activeBoardId),'two');
 });
 async function setupPlanner(context){
  const f=await setup(context,{planner:true});
  for(const p of [f.a,f.b])await p.evaluate(()=>rememberCloudBase(cloudMergeBase.state,cloudSession.user.id));
  return f;
 }
 async function plannerConflict(a,b){
  await a.evaluate(async()=>{const s=getPlannerSourceCards().find(c=>c.id==='sync-review-source');LifePlanner.complete(s,'sync-review-task','2026-09-07',new Date('2026-09-08T12:30:00').getTime());LifePlanner.project(s);saveState({skipCloud:true});await flushDeviceWrites();});
  await b.evaluate(async()=>{const s=getPlannerSourceCards().find(c=>c.id==='sync-review-source');LifePlanner.change(s,'sync-review-task',{dateKey:'2026-09-15'});LifePlanner.project(s);saveState({skipCloud:true});await flushDeviceWrites();});
  await a.evaluate(()=>pushCloudState({manual:true}));await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(await b.evaluate(()=>state.syncConflicts[0]?.kind),'planner-task');
 }
 async function keepCurrentPlannerVersion(p){
  await p.evaluate(()=>openRecovery());await p.getByRole('radio',{name:'Current task',exact:true}).check();
  await p.getByLabel('Apply this version to this task only.',{exact:true}).check();
  await p.getByRole('button',{name:'Save task version',exact:true}).click();await p.getByText(/Task version saved/).waitFor();
 }
 await run('cloud planner history conflict pauses upload, survives reload, and resumes after whole-task review',async context=>{
  const {a,b,backend}=await setupPlanner(context);await plannerConflict(a,b);assert.equal(backend.writes,1);
  const before=clone(backend.state.boards.find(board=>board.id==='work'));
  await b.reload();await b.evaluate(user=>{cloudSession={user:{id:user},access_token:'synthetic-test-token',expires_at:Date.now()+3600000};cloudSaveEnabled=false;},user);
  await keepCurrentPlannerVersion(b);await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(await b.evaluate(()=>state.syncConflicts.length),0);assert.equal(backend.writes,2);
  const task=backend.state.boards[0].cards.find(c=>c.id==='sync-review-source').plannerTasks[0];
  assert.equal(task.done,false);assert.equal(task.dateKey,'2026-09-15');assert.equal(task.completedAt,0);
  assert.deepEqual(backend.state.boards.find(board=>board.id==='work'),before);
 });
 await run('a cloud edit made during planner review triggers a new comparison instead of being overwritten',async context=>{
  const {a,b,backend}=await setupPlanner(context);await plannerConflict(a,b);
  await a.evaluate(async()=>{const source=getPlannerSourceCards().find(c=>c.id==='sync-review-source');LifePlanner.change(source,'sync-review-task',{title:'New wording from the other device'});LifePlanner.project(source);saveState({skipCloud:true});await flushDeviceWrites();await pushCloudState({manual:true});});
  assert.equal(backend.writes,2);await keepCurrentPlannerVersion(b);await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.writes,2);assert.equal(await b.evaluate(()=>cloudConflictPending),true);
  const task=backend.state.boards[0].cards.find(c=>c.id==='sync-review-source').plannerTasks[0];
  assert.equal(task.title,'New wording from the other device');assert.equal(task.done,true);
  assert.equal(await b.evaluate(()=>state.syncConflicts[0].remote.title),'New wording from the other device');
 });
 async function healthConflict(context){
  const f=await setup(context,{health:true});
  for(const p of [f.a,f.b])await p.evaluate(()=>rememberCloudBase(cloudMergeBase.state,cloudSession.user.id));
  await f.a.evaluate(async()=>{const card=state.cards.find(c=>c.id==='sync-food');getFoodEntry(card,'2026-09-08').meals[0].items[0].amount=200;saveFoodCard(card,'2026-09-08');await flushDeviceWrites();});
  await f.b.evaluate(async()=>{const card=state.cards.find(c=>c.id==='sync-food');Object.assign(getFoodEntry(card,'2026-09-08').meals[0].items[0],{amount:1,unit:'serving'});saveFoodCard(card,'2026-09-08');await flushDeviceWrites();});
  await f.a.evaluate(()=>pushCloudState({manual:true}));await f.b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(await f.b.evaluate(()=>state.syncConflicts[0]?.recordType),'food-item');return f;
 }
 async function keepCurrentHealthVersion(p){
  await p.evaluate(()=>openRecovery());await p.getByRole('radio',{name:'Current entry',exact:true}).check();
  await p.getByLabel('Apply this version to this entry only.',{exact:true}).check();
  await p.getByRole('button',{name:'Save health version',exact:true}).click();await p.getByText(/Health version saved/).waitFor();
 }
 await run('cloud nutrition conflict survives reload, keeps quantity and units together, and resumes after review',async context=>{
  const {b,backend}=await healthConflict(context);assert.equal(backend.writes,1);const other=clone(backend.state.boards.find(b=>b.id==='work'));
  await b.reload();await b.evaluate(user=>{cloudSession={user:{id:user},access_token:'synthetic-test-token',expires_at:Date.now()+3600000};cloudSaveEnabled=false;},user);
  await keepCurrentHealthVersion(b);await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.writes,2);assert.equal(await b.evaluate(()=>state.syncConflicts.length),0);
  const item=backend.state.boards[0].cards.find(c=>c.id==='sync-food').foodEntries['2026-09-08'].meals[0].items[0];
  assert.equal(item.amount,1);assert.equal(item.unit,'serving');assert.equal(item.calories,130);assert.deepEqual(backend.state.boards.find(b=>b.id==='work'),other);
 });
 await run('a later cloud food edit cannot be overwritten by a choice from an earlier comparison',async context=>{
  const {a,b,backend}=await healthConflict(context);
  await a.evaluate(async()=>{const card=state.cards.find(c=>c.id==='sync-food');getFoodEntry(card,'2026-09-08').meals[0].items[0].amount=300;saveFoodCard(card,'2026-09-08');await flushDeviceWrites();await pushCloudState({manual:true});});
  await keepCurrentHealthVersion(b);await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.writes,2);assert.equal(await b.evaluate(()=>cloudConflictPending),true);
  const item=backend.state.boards[0].cards.find(c=>c.id==='sync-food').foodEntries['2026-09-08'].meals[0].items[0];assert.equal(item.amount,300);assert.equal(item.unit,'g');
  assert.equal(await b.evaluate(()=>state.syncConflicts[0].remote.amount),300);
 });
 fs.writeFileSync(output+'/sync-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
