const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const testPageUrl=new globalThis.URL(URL);if(['127.0.0.1','localhost','::1'].includes(testPageUrl.hostname))testPageUrl.searchParams.set('liveReload','0');
const APP_URL=testPageUrl.href;
const output=process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(output,{recursive:true});
const results=[];
const user='11111111-1111-4111-8111-111111111111';
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const browser=await (process.env.TEST_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
 async function run(name,fn){
  if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
  const contexts=[];
  async function context(){const c=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Kuala_Lumpur'});await c.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic sync tests only; external services blocked'}));c.on('page',p=>{p.testErrors=[];p.on('pageerror',e=>p.testErrors.push(e.stack));});contexts.push(c);return c;}
  try{await fn(context);results.push({name,pass:true});}catch(e){
   results.push({name,pass:false,error:e.stack});
   const diagnostics=[];
   for(const c of contexts)for(const p of c.pages()){
    diagnostics.push({errors:p.testErrors,view:await p.evaluate(()=>({readyState:document.readyState,starting:document.body?.hasAttribute('data-release-starting'),startup:document.getElementById('releaseStartupMessage')?.textContent,status:document.getElementById('headerSaveStatus')?.textContent,styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>({href:link.href,loaded:Boolean(link.sheet),disabled:link.disabled}))})).catch(error=>({error:error.message}))});
   }
   fs.writeFileSync(output+'/failure-'+results.length+'.json',JSON.stringify(diagnostics,null,2));
  }
  console.log(JSON.stringify(results.at(-1)));for(const c of contexts)await c.close();
 }
 async function fresh(c){
  await c.route('https://**supabase.co/**',r=>r.fulfill({status:503,body:'No production access'}));
  const p=await c.newPage();p.on('dialog',d=>d.accept());await p.goto(APP_URL);return p;
 }
 async function connect(page,base,stamp,token='synthetic-test-token'){await page.evaluate(({base,stamp,user,token})=>{
   state=rehydrateState(base);cloudSession={user:{id:user},access_token:token,expires_at:Date.now()+3600000,cloud_updated_at:stamp};
   saveCloudSession(cloudSession);
   cloudSaveEnabled=false;cloudMergeBase={ownerId:user,state:JSON.parse(JSON.stringify(base))};localMergeBase=JSON.parse(JSON.stringify(state));cloudConflictPending=false;
   render();saveState({skipCloud:true,touch:false});
  },{base,stamp,user,token});await page.evaluate(()=>flushDeviceWrites());}
 async function setup(context,{planner=false,health=false,money=false,multipleBoards=false}={}){
  const a=await fresh(await context());
  const base=await a.evaluate(async({planner,health,money,multipleBoards})=>{
   state.boards.push(createBoardRecord({id:'work',name:'Work',cards:[makeCard({type:'diary',title:'Work diary'})]}));
   if(multipleBoards)state.boards.push(createBoardRecord({id:'wellbeing',name:'Wellbeing',cards:[makeCard({type:'diary',title:'Wellbeing diary'})]}));
   if(planner){const source=makeCard({type:'planner',title:'Planner sync review',category:'Personal'});source.id='sync-review-source';LifePlanner.add(source,'2026-09-01','Call the clinic','sync-review-task',1000);LifePlanner.project(source);state.cards.push(source);}
   if(health){const card=makeCard({type:'food',title:'Food sync review',category:'Health'});card.id='sync-food';card.activeFoodDate='2026-09-08';
     const rice=card.foodLibrary.find(food=>food.id==='rice-white-cooked');
     card.foodEntries={'2026-09-08':normalizeFoodEntry({meals:[{id:'meal',name:'Lunch',items:[{id:'food-entry',foodId:rice.id,...createFoodItemSnapshot(rice),amount:100,unit:'g'}]}]})};state.cards.push(card);}
   if(money){
    const today=getTodayKey(),month=today.slice(0,7),board=state.boards.find(b=>b.id===state.activeBoardId);
    board.money={...LifeMoney.empty(),accounts:[{id:'sync-bank',name:'Synthetic bank',owner:'personal',type:'cash',openingCents:100000,openingDate:month+'-01',reservedCents:0}],entries:[
     {id:'sync-cake',title:'Cake',kind:'expense',status:'settled',repeat:'none',amountCents:1000,accountId:'sync-bank',date:today,dueDate:today,category:'Personal Spending',note:'Original complete note\nSecond line',extension:{keep:true}},
     {id:'sync-gift',title:'Gift',kind:'expense',status:'planned',repeat:'none',amountCents:2000,accountId:'sync-bank',date:today,dueDate:today,category:'Personal Spending',note:'Keep this separate',purchaseIntent:'considering'}
    ],budgets:[]};
   }
   saveState();await flushDeviceWrites();return getStateForStorage();
  },{planner,health,money,multipleBoards});
  const backend={state:clone(base),updated_at:'2026-09-08T00:00:00.000Z',writes:0};
  const b=await fresh(await context());
  async function attach(p,token='synthetic-test-token'){
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
   await connect(p,base,backend.updated_at,token);
  }
  for(const p of [a,b])await attach(p);
  return {a,b,base,backend,attach};
 }
 await run('three different-board laptop tabs and an independent phone copy automatically converge without duplicate tasks or lost writing',async context=>{
  const {a,b,base,backend,attach}=await setup(context,{planner:true,multipleBoards:true}),q=await fresh(a.context()),r=await fresh(a.context());
  await attach(q);await attach(r);await b.setViewportSize({width:390,height:844});await connect(b,base,backend.updated_at,'synthetic-independent-phone-token');
  await q.evaluate(()=>switchBoard('work'));await r.evaluate(()=>switchBoard('wellbeing'));
  const personal=base.activeBoardId,day='2026-10-19',words=['Full personal diary\nSecond line \u4e2d\u6587','Full work diary\nEvery character','Full wellbeing diary\nNo lost writing'];
  for(const p of [a,q,r,b])await p.evaluate(()=>{cloudSaveEnabled=true;});
  for(const [p,content] of [[a,words[0]],[q,words[1]],[r,words[2]]])await p.evaluate(({day,content})=>{updateDiaryEntry(state.cards.find(c=>c.type==='diary'),day,{thoughts:content});}, {day,content});
  await b.evaluate(()=>{archivePlannerTask(getPlannerSourceItems().find(item=>item.taskId==='sync-review-task'));});
  await Promise.all([a,q,r,b].map(p=>p.evaluate(()=>{queueCloudSave({immediate:true,silent:true});})));
  for(const p of [a,q,r,b])await p.waitForFunction(()=>!cloudPushInFlight && !cloudSyncRetry.status().scheduled && /^Cloud (saved and readback verified|copy verified current)/.test(cloudStatusMessage),null,{timeout:25000});
  const expected=new Map([[personal,words[0]],['work',words[1]],['wellbeing',words[2]]]);
  for(const [id,text] of expected)assert.equal(backend.state.boards.find(board=>board.id===id).cards.find(c=>c.type==='diary').diaryEntries[day].thoughts,text);
  const source=backend.state.boards.find(board=>board.id===personal).cards.find(c=>c.id==='sync-review-source');assert.equal(source.plannerTasks.length,1);assert(source.plannerTasks[0].archivedAt);assert.equal(source.plannerTasks[0].id,'sync-review-task');
  for(const p of [a,q,r,b])await p.evaluate(()=>window.dispatchEvent(new Event('online')));
  for(const p of [a,q,r,b]){
   await p.waitForFunction(()=>!cloudPushInFlight && /^Cloud (saved and readback verified|copy verified current)/.test(cloudStatusMessage));
   const snapshot=await p.evaluate(()=>({state:getStateForStorage(),pending:LifeDeviceStore.pending().length,conflicts:state.syncConflicts.length,token:loadCloudSession().access_token}));
   assert.equal(snapshot.pending,0);assert.equal(snapshot.conflicts,0);for(const [id,text] of expected)assert.equal(snapshot.state.boards.find(board=>board.id===id).cards.find(c=>c.type==='diary').diaryEntries[day].thoughts,text);
   assert.equal(snapshot.token,p===b?'synthetic-independent-phone-token':'synthetic-test-token');
  }
  assert.equal(await q.evaluate(()=>state.activeBoardId),'work');assert.equal(await r.evaluate(()=>state.activeBoardId),'wellbeing');
 });
 async function vaultPage(context){
  const c=await context();await c.route('https://**',r=>r.abort());
  await c.route(URL+'vault-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><script src="recovery-vault.js"></script>'}));
  const p=await c.newPage();await p.goto(URL+'vault-fixture');return p;
 }
 await run('recovery vault reclaims full native storage without losing one byte of any recovery or active record',async context=>{
  const p=await vaultPage(context);
  const result=await p.evaluate(async()=>{
   const key='synthetic-recovery',active=JSON.stringify({diary:'Full thoughts\n第二行',tasks:[{id:'task',archivedAt:123,done:true}]}),copies=Array.from({length:5},(_,i)=>({id:'copy-'+i,savedAt:'2026-10-'+(10+i),state:{text:('original-'+i+'\n').repeat(70000)}}));
   localStorage.setItem('active',active);localStorage.setItem(key,JSON.stringify(copies));
   let full=false;for(let i=0;i<200;i++){try{localStorage.setItem('padding-'+i,'x'.repeat(32768));}catch(e){full=e.name==='QuotaExceededError';break;}}
   const before=JSON.stringify(copies),vault=LifeRecoveryVault.create({name:'synthetic-vault',key,locked:fn=>navigator.locks.request('synthetic-vault',fn)});
   let refused=false;try{localStorage.setItem('new-writing','x'.repeat(200000));}catch{refused=true;}
   const repair=await vault.initialize();localStorage.setItem('new-writing','x'.repeat(200000));
   const restarted=LifeRecoveryVault.create({name:'synthetic-vault',key,locked:fn=>navigator.locks.request('synthetic-vault',fn)});await restarted.refresh();
   return {full,refused,bytes:repair.movedBytes,cache:JSON.parse(localStorage.getItem(key)).length,active:localStorage.getItem('active')===active,all:JSON.stringify(restarted.all([]).sort((a,b)=>a.id.localeCompare(b.id)))===before};
  });
  assert.equal(result.full,true);assert.equal(result.refused,true);assert.ok(result.bytes>4000000);assert.equal(result.cache,1);assert.equal(result.active,true);assert.equal(result.all,true);
 });
 await run('recovery vault aborts preserve the original cache and active records unchanged',async context=>{
  const p=await vaultPage(context);
  const result=await p.evaluate(async()=>{
   const key='recovery',raw=JSON.stringify([{id:'a',state:{diary:'Do not lose this'}},{id:'b',rawState:'untouched'}]);localStorage.setItem(key,raw);localStorage.setItem('active','original');
   const transaction=IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
   const vault=LifeRecoveryVault.create({name:'aborted-vault',key,locked:fn=>fn()});let failed=false;
   try{await vault.initialize();}catch{failed=true;}finally{IDBDatabase.prototype.transaction=transaction;}
   return {failed,unchanged:localStorage.getItem(key)===raw,active:localStorage.getItem('active')};
  });assert.deepEqual(result,{failed:true,unchanged:true,active:'original'});
 });
 await run('quota recovery releases the final duplicate only after strict archive commit and complete restart readback',async context=>{
  const p=await vaultPage(context);
  const result=await p.evaluate(async()=>{
   const key='single-recovery',row={id:'single',savedAt:'2026-10-17',state:{diary:'Every original line\n第二行',padding:'Complete retained history\n'.repeat(50000)}},raw=JSON.stringify([row]);
   localStorage.setItem(key,raw);localStorage.setItem('active','Untouched active records');localStorage.setItem('pending','Untouched pending packet');
   for(let i=0;i<200;i++){try{localStorage.setItem('padding-'+i,'x'.repeat(32768));}catch{break;}}
   const transaction=IDBDatabase.prototype.transaction,modes=[];
   IDBDatabase.prototype.transaction=function(...args){if(this.name==='single-vault' && args[1]==='readwrite')modes.push(args[2]?.durability);return transaction.apply(this,args);};
   let refused=false;try{localStorage.setItem('new-writing','x'.repeat(200000));}catch{refused=true;}
   const options={name:'single-vault',key,locked:fn=>navigator.locks.request('single-vault-lock',fn)},vault=LifeRecoveryVault.create(options);
   await vault.initialize();const keptOne=localStorage.getItem(key)===raw;
   const repair=await vault.compact({releaseCache:true});localStorage.setItem('new-writing','x'.repeat(200000));
   const restarted=LifeRecoveryVault.create(options);await restarted.refresh();IDBDatabase.prototype.transaction=transaction;
   return {refused,keptOne,bytes:repair.movedBytes,cache:localStorage.getItem(key),all:JSON.stringify(restarted.all([]))===raw,active:localStorage.getItem('active'),pending:localStorage.getItem('pending'),modes};
  });
  assert.equal(result.refused,true);assert.equal(result.keptOne,true);assert(result.bytes>2000000);assert.equal(result.cache,'[]');assert.equal(result.all,true);
  assert.equal(result.active,'Untouched active records');assert.equal(result.pending,'Untouched pending packet');assert(result.modes.length>0);assert(result.modes.every(value=>value==='strict'));
 });
 await run('quota recovery never releases a cache whose archive transaction aborts',async context=>{
  const p=await vaultPage(context);
  const result=await p.evaluate(async()=>{
   const key='single-abort',raw=JSON.stringify([{id:'only',state:{diary:'Full original writing\nSecond line'}}]);localStorage.setItem(key,raw);
   const transaction=IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
   let refused=false;try{await LifeRecoveryVault.create({name:'single-abort-vault',key,locked:fn=>fn()}).compact({releaseCache:true});}catch{refused=true;}
   IDBDatabase.prototype.transaction=transaction;return {refused,unchanged:localStorage.getItem(key)===raw};
  });assert.deepEqual(result,{refused:true,unchanged:true});
 });
 await run('stalled recovery reads release the shared lock at their deadline without reducing the original cache',async context=>{
  const p=await vaultPage(context);await p.clock.install();
  await p.evaluate(()=>{
   window.originalCache=JSON.stringify([{id:'stalled',state:{diary:'All original words'}}]);localStorage.setItem('stalled-cache',originalCache);
   window.originalGetAll=IDBObjectStore.prototype.getAll;window.held=false;window.finished=null;
   IDBObjectStore.prototype.getAll=function(...args){const req=originalGetAll.apply(this,args);Object.defineProperty(req,'onsuccess',{set(){req.addEventListener('success',()=>{held=true;});}});return req;};
   window.vault=LifeRecoveryVault.create({name:'stalled-vault',key:'stalled-cache',locked:fn=>navigator.locks.request('stalled-lock',fn)});
   vault.compact({releaseCache:true}).then(()=>finished='unexpected success',error=>finished=error.name);
  });
  await p.waitForFunction(()=>held);await p.clock.runFor(11000);await p.waitForFunction(()=>finished==='RecoveryVaultTimeoutError');
  assert.equal(await p.evaluate(()=>localStorage.getItem('stalled-cache')===originalCache),true);
  assert.equal(await p.evaluate(()=>navigator.locks.request('stalled-lock',{ifAvailable:true},lock=>Boolean(lock))),true);
  await p.evaluate(()=>IDBObjectStore.prototype.getAll=originalGetAll);await p.clock.resume();
  assert.equal(await p.evaluate(async()=>{await vault.compact({releaseCache:true});return JSON.stringify(vault.all([]))===originalCache;}),true);
 });
 await run('recovery vault detects concurrent legacy writes and reloads other tabs complete archives',async context=>{
  const p=await vaultPage(context);
  const result=await p.evaluate(async()=>{
   const key='recovery',rows=[{id:'a',savedAt:'2026-10-01',state:{diary:'a'}},{id:'b',savedAt:'2026-10-02',state:{diary:'b'}}];localStorage.setItem(key,JSON.stringify(rows));
   const options={name:'concurrent-vault',key,locked:fn=>navigator.locks.request('vault',fn)},first=LifeRecoveryVault.create(options);await first.initialize();
   const second=LifeRecoveryVault.create(options);await second.initialize();
   localStorage.setItem(key,JSON.stringify([{id:'c',savedAt:'2026-10-03',state:{diary:'c'}}]));await first.compact();
   await second.compact();const ids=second.all(JSON.parse(localStorage.getItem(key))).map(x=>x.id).sort();
   const original=localStorage.getItem(key),next=JSON.stringify([{id:'d',state:{diary:'never overwrite'}}]);let digests=0;
   const subtle={digest:async(...args)=>{if(++digests===4)localStorage.setItem(key,next);return crypto.subtle.digest(...args);}};
   const legacyRace=LifeRecoveryVault.create({...options,subtle});const result=await legacyRace.compact();
   return {ids,changed:result.changed,retained:localStorage.getItem(key)===next,prior:original!==next};
  });assert.deepEqual(result,{ids:['a','b','c'],changed:true,retained:true,prior:true});
 });
 await run('recovery vault rejects corrupted IndexedDB readback without reducing original copies',async context=>{
  const p=await vaultPage(context);
  const result=await p.evaluate(async()=>{
   const key='recovery',initial=[{id:'a',state:{diary:'a'}},{id:'b',state:{diary:'b'}}],options={name:'corrupt-vault',key,locked:fn=>fn()};localStorage.setItem(key,JSON.stringify(initial));
   await LifeRecoveryVault.create(options).initialize();localStorage.setItem(key,JSON.stringify(initial));const raw=localStorage.getItem(key);
   const db=await new Promise(resolve=>{const req=indexedDB.open(options.name);req.onsuccess=()=>resolve(req.result);});
   await new Promise((resolve,reject)=>{const tx=db.transaction('copies','readwrite'),req=tx.objectStore('copies').getAll();req.onsuccess=()=>{const row=req.result[0];row.raw='corrupt';tx.objectStore('copies').put(row);};tx.oncomplete=resolve;tx.onabort=reject;});db.close();
   let failed=false;try{await LifeRecoveryVault.create(options).initialize();}catch{failed=true;}
   return {failed,unchanged:localStorage.getItem(key)===raw};
  });assert.deepEqual(result,{failed:true,unchanged:true});
 });
 await run('emergency downloads retain full unstaged writing even when device flushing cannot finish',async context=>{
  const p=await fresh(await context());
  const writing='Latest private thoughts\n第二行 '.repeat(100);
  await p.evaluate(writing=>{const card=state.cards.find(c=>c.type==='diary');card.diaryEntries[getTodayKey()]={thoughts:writing,sentence:'Full text',updatedAt:Date.now()};LifeDeviceStore.flush=()=>new Promise(()=>{});lastLocalSaveOk=false;},writing);
  const jsonDownload=p.waitForEvent('download');await p.evaluate(()=>exportBoardBackup());const json=await jsonDownload;
  const data=JSON.parse(fs.readFileSync(await json.path(),'utf8'));
  assert.ok(data.state.boards.some(b=>b.cards.some(c=>Object.values(c.diaryEntries || {}).some(e=>e.thoughts===writing))));assert.equal(data.includesAuthSession,false);
  const htmlDownload=p.waitForEvent('download');await p.evaluate(()=>exportReadableDataArchive());const html=await htmlDownload;
  assert.ok(fs.readFileSync(await html.path(),'utf8').includes('Latest private thoughts'));
 });
 await run('automatic capacity repair retains full new diary text, archive access and verified cloud readback',async context=>{
  const {a,base,backend}=await setup(context);
  await a.evaluate(base=>{
   const copies=Array.from({length:5},(_,i)=>({id:'synthetic-large-'+i,reason:'synthetic-capacity-test',savedAt:'2026-10-'+(10+i),state:base,padding:('Complete recovery '+i+'\n').repeat(25000)}));
   localStorage.setItem(CLOUD_RECOVERY_KEY,JSON.stringify(copies));
   for(let i=0;i<200;i++){try{localStorage.setItem('synthetic-padding-'+i,'x'.repeat(32768));}catch{break;}}
   cloudSaveEnabled=true;
  },base);
  const writing='Every character of this latest diary remains.\n第二行 '.repeat(150);
  await a.locator('.diary-thoughts').fill(writing);
  await a.waitForFunction(()=>lastLocalSaveOk && recoveryVault.diagnostics().archivedCopies>=5);
  assert.equal(await a.evaluate(()=>flushDeviceWrites()),true);
  await a.evaluate(()=>pushCloudState({silent:true}));
  await a.waitForFunction(()=>cloudStatusMessage.startsWith('Cloud saved and readback verified'));
  assert.ok(backend.writes>0);
  assert.ok(backend.state.boards.some(b=>b.cards.some(c=>Object.values(c.diaryEntries || {}).some(e=>e.thoughts===writing))));
  await a.reload();assert.equal(await a.locator('.diary-thoughts').inputValue(),writing);
  await a.evaluate(()=>openRecovery());assert.ok(await a.getByRole('button',{name:'Read / download',exact:true}).count()>=5);
  const originals=await a.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]).filter(c=>c.reason==='synthetic-capacity-test').map(c=>c.padding));
  assert.equal(originals.length,5);assert.ok(originals.every(s=>s.length>400000));
 });
 await run('a full single-copy cache and six queued packets recover complete new writing without resetting another board',async context=>{
  const {a,base,backend}=await setup(context);
  await a.evaluate(async base=>{
   await flushDeviceWrites();
   const snapshot=getStateForStorage();for(let i=0;i<6;i++)LifeDeviceStore.stage(snapshot,snapshot);
   localStorage.setItem(CLOUD_RECOVERY_KEY,JSON.stringify([{id:'last-duplicate',reason:'single-cache-quota-test',savedAt:'2026-10-17',state:base,padding:'Complete original recovery\n'.repeat(50000)}]));
   await recoveryVault.refresh();
   for(let i=0;i<200;i++){try{localStorage.setItem('single-padding-'+i,'x'.repeat(32768));}catch{break;}}
   cloudSaveEnabled=true;
  },base);
  let seed=12345;const writing=Array.from({length:60000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return String.fromCharCode(33+(seed>>>16)%90);}).join('')+'\nEvery final character retained.';
  await a.locator('.diary-thoughts').fill(writing);
  await a.waitForFunction(()=>lastLocalSaveOk && LifeDeviceStore.pending().length===0,{},{timeout:30000});
  assert.equal(await a.evaluate(()=>flushDeviceWrites()),true);
  assert.equal(await a.locator('.diary-thoughts').inputValue(),writing);
  const beforeOther=base.boards.find(board=>board.id==='work');
  assert.deepEqual(await a.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)).boards.find(board=>board.id==='work')),beforeOther);
  assert.equal(await a.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]).find(row=>row.id==='last-duplicate')?.padding),'Complete original recovery\n'.repeat(50000));
  await a.evaluate(()=>pushCloudState({silent:true}));await a.waitForFunction(()=>cloudStatusMessage.startsWith('Cloud saved and readback verified'));
  assert(backend.writes>0);assert(backend.state.boards.some(board=>board.cards.some(card=>Object.values(card.diaryEntries || {}).some(entry=>entry.thoughts===writing))));
  await a.reload();assert.equal(await a.locator('.diary-thoughts').inputValue(),writing);assert.equal(await a.evaluate(()=>flushDeviceWrites()),true);assert.equal(await a.evaluate(()=>LifeDeviceStore.pending().length),0);
 });
 await run('quota during the shared commit also triggers automatic archive recovery when journal staging succeeded',async context=>{
  const p=await fresh(await context());await p.evaluate(()=>flushDeviceWrites());
  await p.evaluate(()=>{
   localStorage.setItem(CLOUD_RECOVERY_KEY,JSON.stringify([{id:'main-quota',state:{original:'All original recovery text'}}]));
   window.nativeSet=Storage.prototype.setItem;window.commitQuotaRefusals=0;
   Storage.prototype.setItem=function(key,raw){
    if(this===localStorage && key===STORAGE_KEY && localStorage.getItem(CLOUD_RECOVERY_KEY)!=='[]'){
     commitQuotaRefusals++;throw new DOMException('Synthetic shared snapshot quota','QuotaExceededError');
    }
    return nativeSet.call(this,key,raw);
   };
  });
  const writing='Complete writing even when only the shared commit fills storage\nSecond line';await p.locator('.diary-thoughts').fill(writing);
  await p.waitForFunction(()=>commitQuotaRefusals>0 && lastLocalSaveOk && LifeDeviceStore.pending().length===0);
  assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);assert.equal(await p.locator('.diary-thoughts').inputValue(),writing);
  assert.equal(await p.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]).find(row=>row.id==='main-quota')?.state.original),'All original recovery text');
  await p.evaluate(()=>Storage.prototype.setItem=nativeSet);await p.reload();assert.equal(await p.locator('.diary-thoughts').inputValue(),writing);
 });
 await run('recovery vault standalone repair leaves the original open app intact and never contacts cloud',async context=>{
  const c=await context(),p=await fresh(c);let externalCalls=0;
  await c.route('https://**',r=>{externalCalls++;return r.abort();});
  const before=await p.evaluate(()=>{
   const raw=localStorage.getItem(STORAGE_KEY),base=JSON.parse(raw);localStorage.setItem(CLOUD_RECOVERY_KEY,JSON.stringify(Array.from({length:5},(_,i)=>({id:'standalone-'+i,savedAt:'2026-10-'+(10+i),state:base}))));return raw;
  });
  const repair=await c.newPage();await repair.goto(URL+'storage-repair.html');
  const download=repair.waitForEvent('download');await repair.getByRole('button',{name:'Download device recovery backup',exact:true}).click();
  const backup=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));assert.equal(backup.includesAuthSession,false);assert.equal(backup.archivedCopies.length,5);
  await repair.getByRole('button',{name:'Preserve copies and free save space',exact:true}).click();
  await repair.getByText(/Recovery archive verified/).waitFor();
  assert.equal(await p.evaluate(()=>localStorage.getItem(STORAGE_KEY)),before);assert.equal(externalCalls,0);
  await repair.reload();await repair.getByRole('button',{name:'Preserve copies and free save space',exact:true}).click();await repair.getByText(/Recovery archive verified/).waitFor();
  assert.match(await repair.locator('#details').innerText(),/Verified archived copies\s+5/);
 });
 await run('connected account hides login instructions, preserves writing and still exposes real reauthentication',async context=>{
  const p=await fresh(await context());let network=0;
  await p.route('https://**supabase.co/**',r=>{network++;return r.fulfill({status:503,json:{msg:'No production access'}});});
  await p.locator('#railSettingsButton').click();
  assert.equal(await p.locator('#cloudSignInFields').isVisible(),true);
  await p.evaluate(user=>{saveCloudSession({user:{id:user,email:'synthetic@example.com'},access_token:'synthetic-session',refresh_token:'synthetic-refresh',expires_at:Date.now()+3600000});},user);
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  assert.equal(await p.locator('#cloudStatus').innerText(),'Connected');
  assert.match(await p.locator('#cloudConnectionHelp').innerText(),/Connected as synthetic@example.com\. Automatic sync is on/);
  for(const id of ['cloudSignInFields','cloudSignInButton','cloudSignUpButton','cloudEmail','cloudGithubButton','cloudCheckButton'])assert.equal(await p.locator('#'+id).isVisible(),false,id);
  assert.equal(await p.locator('#cloudSignOutButton').isVisible(),true);assert.equal(await p.locator('#accountPasswordDetails').isVisible(),true);
  await p.evaluate(()=>{cloudSession.user.email='long'.repeat(20)+'@example.com';renderCloudStatus();});
  for(const width of [320,390,1080]){await p.setViewportSize({width,height:900});assert.equal(await p.locator('.cloud-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}
  await p.evaluate(()=>{cloudSession.user.email='synthetic@example.com';renderCloudStatus();});
  await p.locator('.cloud-panel').scrollIntoViewIfNeeded();await p.screenshot({path:output+'/connected-account-'+(process.env.TEST_BROWSER || 'chromium')+'.png',fullPage:false});
  await p.evaluate(()=>{cloudConflictPending=true;renderCloudStatus();});assert.equal(await p.locator('#cloudStatus').innerText(),'Review needed');assert.match(await p.locator('#cloudConnectionHelp').innerText(),/sync is paused/);assert.equal(await p.locator('#cloudSignInFields').isVisible(),false);
  await p.evaluate(()=>{cloudConflictPending=false;cloudSessionReauthRequired=true;renderCloudStatus('Cloud session expired. Sign in again.');});
  assert.equal(await p.locator('#cloudStatus').innerText(),'Sign-in needed');assert.equal(await p.locator('#cloudSignInFields').isVisible(),true);assert.equal(await p.locator('#cloudSignInButton').isEnabled(),true);assert.equal(await p.locator('#cloudPassword').isVisible(),true);
  assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);assert.equal(network,0);
  await p.evaluate(()=>{saveCloudSession(null);cloudStatusMessage='';renderCloudStatus();});assert.equal(await p.locator('#cloudSignInFields').isVisible(),true);assert.equal(await p.locator('#cloudSignOutButton').isVisible(),false);
 });
 await run('GitHub sign-in checks provider readiness and keeps credentials and unfinished writing out of navigation',async context=>{
  const p=await fresh(await context());
  await p.locator('.diary-thoughts').fill('Private multiline writing stays here.\n第二行');await p.evaluate(()=>flushDeviceWrites());
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  await p.locator('#railSettingsButton').click();
  await p.route('https://**supabase.co/auth/v1/settings',r=>r.fulfill({json:{external:{github:false}}}));
  await p.getByRole('button',{name:'Continue with GitHub',exact:true}).click();
  await p.getByText(/GitHub sign-in is not enabled for Life OS yet/).waitFor();
  assert.equal(await p.getByRole('link',{name:'Open GitHub sign-in',exact:true}).count(),0);
  assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);
  await p.route('https://**supabase.co/auth/v1/settings',r=>r.fulfill({json:{external:{github:true}}}));
  await p.getByRole('button',{name:'Continue with GitHub',exact:true}).click();
  const link=p.getByRole('link',{name:'Open GitHub sign-in',exact:true});await link.waitFor();
  const destination=new globalThis.URL(await link.getAttribute('href'));
  assert.equal(destination.origin,'https://shrmhjulhfuodtrsqhpu.supabase.co');assert.equal(destination.pathname,'/auth/v1/authorize');
  assert.equal(destination.searchParams.get('provider'),'github');assert.equal(destination.searchParams.get('scopes'),'user:email');
  assert.equal(destination.searchParams.get('redirect_to'),'https://austinwong94.github.io/life-os/');
  assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
  await p.evaluate(()=>render());assert.equal(await link.isVisible(),true);
  assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);assert.equal(await p.evaluate(()=>loadCloudSession()),null);
 });
 await run('sign-in in another tab verifies the existing owner and enables saving without replacing paused writing',async context=>{
  const c=await context(),p=await fresh(c),other=await fresh(c);
  await p.locator('.diary-thoughts').fill('This draft remains while another tab signs in.');await p.evaluate(()=>flushDeviceWrites());
  await p.evaluate(user=>{state.cloudOwnerId=user;saveState({skipCloud:true});},user);await p.evaluate(()=>flushDeviceWrites());
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  await p.route('https://**supabase.co/auth/v1/user',r=>r.fulfill({json:{id:user,email:'synthetic@example.com'}}));
  await p.locator('#railSettingsButton').click();
  await other.evaluate(user=>localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify({access_token:'synthetic-new-login',user:{id:user},expires_at:Date.now()+3600000})),user);
  await p.getByText(/Your existing Life OS account signed in in another tab/).waitFor();
  assert.equal(await p.locator('#cloudPushButton').isEnabled(),true);assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);
  assert.equal(await p.locator('.diary-thoughts').inputValue(),'This draft remains while another tab signs in.');
  await other.evaluate(()=>localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify({access_token:'synthetic-other-owner',user:{id:'other-owner'},expires_at:Date.now()+3600000})));
  await p.getByText(/cloud account changed or signed out in another tab/).waitFor();assert.equal(await p.locator('#cloudPushButton').isEnabled(),false);
  assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);
 });
 await run('a wrong-owner callback refuses session adoption before any cloud read or write',async context=>{
  const p=await fresh(await context());await p.evaluate(user=>{state.cloudOwnerId=user;saveState({skipCloud:true});},user);await p.evaluate(()=>flushDeviceWrites());
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));let dataCalls=0;
  await p.route('https://**supabase.co/rest/**',r=>{dataCalls++;return r.fulfill({status:500,body:'No private requests permitted'});});
  await p.route('https://**supabase.co/auth/v1/user',r=>r.fulfill({json:{id:'wrong-owner',email:'wrong@example.com'}}));
  await p.evaluate(async()=>{history.replaceState({},'',location.pathname+'#access_token=synthetic-callback&refresh_token=synthetic-refresh');await handleCloudAuthRedirect();});
  await p.getByText(/This sign-in is not the owner/).waitFor();assert.equal(dataCalls,0);assert.equal(await p.evaluate(()=>loadCloudSession()),null);
  assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);assert.equal(new globalThis.URL(p.url()).hash,'');
 });
 await run('a delayed verification cannot restore a session after another tab signs out',async context=>{
  const c=await context(),p=await fresh(c),other=await fresh(c);let respond,requested;
  const requestSeen=new Promise(resolve=>requested=resolve);
  await p.evaluate(user=>{state.cloudOwnerId=user;saveState({skipCloud:true});},user);await p.evaluate(()=>flushDeviceWrites());
  await p.route('https://**supabase.co/auth/v1/user',async r=>{requested();await new Promise(resolve=>respond=resolve);await r.fulfill({json:{id:user,email:'synthetic@example.com'}});});
  await p.locator('#railSettingsButton').click();
  await other.evaluate(user=>localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify({access_token:'synthetic-delayed',user:{id:user},expires_at:Date.now()+3600000})),user);
  await requestSeen;await other.evaluate(()=>localStorage.removeItem(CLOUD_SESSION_KEY));
  await p.getByText(/cloud account changed or signed out in another tab/).waitFor();respond();
  await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>cloudSession),null);assert.equal(await p.locator('#cloudPushButton').isEnabled(),false);
 });
 await run('parallel session renewal across two tabs rotates once and retains all original writing',async context=>{
  const c=await context(),a=await fresh(c),b=await fresh(c);let calls=0;const requestTimes=[];
  if(process.env.TEST_AUTH_TRACE)for(const [index,p]of [a,b].entries())await p.evaluate(index=>{
   window.authTrace=[];
   const label=session=>!session?'absent':session.access_token==='synthetic-expired'?'original':session.access_token==='synthetic-renewed'?'renewed':'other';
   const load=loadCloudSession;loadCloudSession=()=>{const value=load();authTrace.push({kind:'read',at:performance.timeOrigin+performance.now(),tab:index,label:label(value)});return value;};
   const save=saveCloudSession;saveCloudSession=session=>{authTrace.push({kind:'write',at:performance.timeOrigin+performance.now(),tab:index,label:label(session),stack:new Error().stack});return save(session);};
  },index);
  await c.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',async r=>{
   calls++;requestTimes.push(Date.now());assert.equal(r.request().postDataJSON().refresh_token,'synthetic-refresh-old');await new Promise(resolve=>setTimeout(resolve,75));
   await r.fulfill({json:{access_token:'synthetic-renewed',refresh_token:'synthetic-refresh-new',expires_in:3600,user:{id:user}}});
  });
  for(const p of [a,b])await p.evaluate(user=>{state.cloudOwnerId=user;saveState({skipCloud:true});saveCloudSession({access_token:'synthetic-expired',refresh_token:'synthetic-refresh-old',expires_at:1,user:{id:user}});cloudSaveEnabled=false;},user);
  await a.evaluate(()=>flushDeviceWrites());await b.evaluate(()=>flushDeviceWrites());
  const before=await a.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  const values=await Promise.all([a,b,a,b].map(p=>p.evaluate(async()=>{const s=await ensureCloudSession();return s.access_token;})));
  if(process.env.TEST_AUTH_TRACE)fs.writeFileSync(output+'/auth-trace.json',JSON.stringify({calls,requestTimes,traces:await Promise.all([a,b].map(p=>p.evaluate(()=>authTrace)))},null,2));
  assert.deepEqual(values,Array(4).fill('synthetic-renewed'));assert.equal(calls,1,JSON.stringify({calls,requestTimes}));
  assert.equal(await a.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);
  await a.reload();assert.equal(await a.evaluate(()=>cloudSession.access_token),'synthetic-renewed');assert.equal(calls,1);
 });
 await run('temporary renewal outages keep the session and retry without another login',async context=>{
  const p=await fresh(await context());
  await p.evaluate(user=>{state.cloudOwnerId=user;saveCloudSession({access_token:'synthetic-expired',refresh_token:'synthetic-refresh',expires_at:1,user:{id:user}});cloudSaveEnabled=false;},user);
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  await p.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',r=>r.fulfill({status:503,json:{msg:'Token server temporarily unavailable'}}));
  await p.evaluate(()=>maintainCloudSession());await p.locator('#railSettingsButton').click();
  await p.getByText(/Cloud connection is temporarily unavailable/).waitFor();
  assert.equal(await p.evaluate(()=>loadCloudSession().refresh_token),'synthetic-refresh');assert.equal(await p.evaluate(()=>cloudSessionReauthRequired),false);
  await p.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',r=>r.fulfill({json:{access_token:'synthetic-online',refresh_token:'synthetic-next',expires_in:3600,user:{id:user}}}));
  await p.evaluate(async()=>{cloudSessionRetryAfter=0;await maintainCloudSession();});
  assert.equal(await p.evaluate(()=>cloudSession.access_token),'synthetic-online');assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);
  assert.doesNotMatch(await p.locator('#cloudNote').innerText(),/temporarily unavailable|Sign in once/);
 });
 await run('a delayed renewal cannot sign the user back in after a deliberate sign-out',async context=>{
  const c=await context(),p=await fresh(c),other=await fresh(c);let respond,seen;
  const requested=new Promise(resolve=>seen=resolve);
  await p.evaluate(user=>{state.cloudOwnerId=user;saveCloudSession({access_token:'synthetic-expired',refresh_token:'synthetic-refresh',expires_at:1,user:{id:user}});cloudSaveEnabled=false;},user);
  await p.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',async r=>{seen();await new Promise(resolve=>respond=resolve);await r.fulfill({json:{access_token:'synthetic-too-late',refresh_token:'synthetic-next',expires_in:3600,user:{id:user}}});});
  const renewing=p.evaluate(async()=>{try{await ensureCloudSession();return '';}catch(e){return e.message;}});
  await requested;await other.evaluate(()=>localStorage.removeItem(CLOUD_SESSION_KEY));respond();
  assert.match(await renewing,/signed out during renewal/);assert.equal(await p.evaluate(()=>loadCloudSession()),null);
 });
 await run('saving a cloud receipt never overwrites newer rotated credentials',async context=>{
  const p=await fresh(await context());
  const result=await p.evaluate(user=>{
   const old={access_token:'synthetic-cached',refresh_token:'synthetic-cached-refresh',expires_at:Date.now()+3600000,user:{id:user}};saveCloudSession(old);
   const next={...old,access_token:'synthetic-current',refresh_token:'synthetic-current-refresh'};localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify(next));
   setKnownCloudUpdatedAt('2026-10-14T00:00:00.000Z');
   return {token:loadCloudSession().access_token,refresh:loadCloudSession().refresh_token,stamp:getKnownCloudUpdatedAt(),credentials:localStorage.getItem(CLOUD_SESSION_KEY),expected:JSON.stringify(next)};
  },user);
  assert.equal(result.token,'synthetic-current');assert.equal(result.refresh,'synthetic-current-refresh');assert.equal(result.stamp,'2026-10-14T00:00:00.000Z');assert.equal(result.credentials,result.expected);
 });
 await run('renewal refuses a wrong owner without changing the stored session or private records',async context=>{
  const p=await fresh(await context());
  await p.evaluate(user=>{state.cloudOwnerId=user;saveCloudSession({access_token:'synthetic-expired',refresh_token:'synthetic-original',expires_at:1,user:{id:user}});cloudSaveEnabled=false;},user);
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  await p.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',r=>r.fulfill({json:{access_token:'synthetic-wrong',refresh_token:'synthetic-wrong-refresh',expires_in:3600,user:{id:'other-owner'}}}));
  const error=await p.evaluate(async()=>{try{await ensureCloudSession();return '';}catch(e){return e.message;}});
  assert.match(error,/Cloud session expired/);assert.equal(await p.evaluate(()=>loadCloudSession().refresh_token),'synthetic-original');assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);
 });
 await run('stalled renewal releases its lock after timeout and preserves credentials for retry',async context=>{
  const p=await fresh(await context());
  await p.evaluate(user=>{state.cloudOwnerId=user;saveCloudSession({access_token:'synthetic-expired',refresh_token:'synthetic-stalled',expires_at:1,user:{id:user}});cloudSaveEnabled=false;},user);
  await p.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',async r=>{await new Promise(resolve=>setTimeout(resolve,100));await r.fulfill({json:{}}).catch(()=>{});});
  await p.evaluate(async()=>{const request=cloudAuthRequest;cloudAuthRequest=(path,body,options)=>request(path,body,{...options,timeoutMs:20});try{await maintainCloudSession();}finally{cloudAuthRequest=request;}});
  assert.equal(await p.evaluate(()=>loadCloudSession().refresh_token),'synthetic-stalled');assert.equal(await p.evaluate(()=>cloudSessionReauthRequired),false);
  assert.equal(await p.evaluate(()=>navigator.locks.request(LifeStorageScope.key('life-os-auth-refresh-v1'),{ifAvailable:true},lock=>Boolean(lock))),true);
 });
 await run('revoked session pauses repeated renewal without discarding saved information',async context=>{
  const p=await fresh(await context());let calls=0;
  await p.evaluate(user=>{state.cloudOwnerId=user;saveCloudSession({access_token:'synthetic-expired',refresh_token:'synthetic-revoked',expires_at:1,user:{id:user}});cloudSaveEnabled=false;},user);
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  await p.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',r=>{calls++;return r.fulfill({status:400,json:{msg:'Invalid refresh token'}});});
  await p.evaluate(async()=>{await maintainCloudSession();cloudSessionRetryAfter=0;await maintainCloudSession();});
  assert.equal(calls,1);assert.equal(await p.evaluate(()=>cloudSessionReauthRequired),true);assert.equal(await p.evaluate(()=>loadCloudSession().refresh_token),'synthetic-revoked');assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);
 });
 await run('email sign-in targets only existing accounts and never changes or uploads local records',async context=>{
  const p=await fresh(await context());let calls=0,request;
  await p.route('https://**supabase.co/auth/v1/otp**',r=>{calls++;request={url:r.request().url(),body:r.request().postDataJSON()};return r.fulfill({json:{}});});
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  await p.locator('#railSettingsButton').click();await p.locator('#cloudEmail').fill('synthetic@example.com');await p.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();
  await p.getByText(/Sign-in email requested/).waitFor();assert.equal(calls,1);assert.equal(request.body.create_user,false);assert.equal(request.body.email,'synthetic@example.com');assert.ok(!Object.hasOwn(request.body,'password'));
  assert.equal(new globalThis.URL(request.url).searchParams.get('redirect_to'),'https://austinwong94.github.io/life-os/');
  assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);assert.equal(await p.evaluate(()=>loadCloudSession()),null);
  await p.route('https://**supabase.co/auth/v1/otp**',r=>r.fulfill({status:429,json:{msg:'Email rate limit exceeded'}}));
  await p.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();await p.getByText(/Email rate limit exceeded/).waitFor();
  assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);assert.equal(await p.getByRole('button',{name:'Email me a sign-in link',exact:true}).isEnabled(),true);
 });
 await run('rejected login preserves current records and keeps retry available without suggesting another account',async context=>{
  const p=await fresh(await context());
  await p.locator('.diary-thoughts').fill('Every current word remains.\n第二行');await p.evaluate(()=>flushDeviceWrites());
  const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  await p.route('https://**supabase.co/auth/v1/token**',r=>r.fulfill({status:400,json:{code:'invalid_credentials',msg:'Invalid login credentials'}}));
  await p.locator('#railSettingsButton').click();await p.locator('#cloudEmail').fill('synthetic@example.com');await p.locator('#cloudPassword').fill('synthetic-password');await p.getByRole('button',{name:'Sign in',exact:true}).click();
  await p.getByText(/Sign-in failed: the email or password/).waitFor();assert.equal(await p.locator('#cloudSignInButton').isEnabled(),true);
  assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);assert.equal(await p.evaluate(()=>loadCloudSession()),null);
 });
 await run('a failed session storage write cannot report successful login or replace a previous token',async context=>{
  const p=await fresh(await context());
  const result=await p.evaluate(()=>{
   const original={user:{id:'synthetic-owner'},access_token:'synthetic-old',expires_at:1};saveCloudSession(original);
   const before=JSON.stringify(getStateForStorage().boards),write=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){if(k===CLOUD_SESSION_KEY)throw new DOMException('Full','QuotaExceededError');return write.call(this,k,v);};
   let error='';try{saveCloudSession({...original,access_token:'synthetic-new'});}catch(e){error=e.message;}
   Storage.prototype.setItem=write;renderCloudStatus(error);
   return {error,oldRetained:cloudSession.access_token==='synthetic-old' && loadCloudSession().access_token==='synthetic-old',unchanged:before===JSON.stringify(getStateForStorage().boards)};
  });
  assert.match(result.error,/Sign-in could not be saved/);assert.equal(result.oldRetained,true);assert.equal(result.unchanged,true);
  await p.locator('#railSettingsButton').click();assert.equal(await p.locator('#cloudSignInButton').isEnabled(),true);assert.equal(await p.locator('#cloudPassword').isVisible(),true);
 });
 await run('an already-renewed same-owner session is adopted before refreshing a stale cached token',async context=>{
  const p=await fresh(await context());let authCalls=0;
  await p.route('https://**supabase.co/auth/**',r=>{authCalls++;return r.fulfill({status:400,json:{msg:'Old refresh token must not be used'}});});
  const result=await p.evaluate(async()=>{
   const old={user:{id:'same-owner'},access_token:'synthetic-old',refresh_token:'old-refresh',expires_at:1};saveCloudSession(old);
   const newer={...old,access_token:'synthetic-new',refresh_token:'new-refresh',expires_at:Date.now()+3600000};localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify(newer));
   const before=JSON.stringify(getStateForStorage().boards),session=await ensureCloudSession();return {adopted:session.access_token==='synthetic-new',unchanged:before===JSON.stringify(getStateForStorage().boards)};
  });
  assert.equal(authCalls,0);assert.equal(result.adopted,true);assert.equal(result.unchanged,true);
 });
 await run('cloud readback verifies complete diary notes and tasks without another write',async context=>{
  const {a,backend}=await setup(context,{planner:true});
  await a.evaluate(()=>{
   const diary=state.cards.find(card=>card.type==='diary');diary.diaryEntries[getTodayKey()]={thoughts:'Complete private diary.\n第二行\nLast line remains.',highlight:'Current reflection',feeling:'neutral'};
   state.cards.push(makeCard({type:'motivation',title:'Current notes',description:'First line.\nSecond line.'}));saveState({skipCloud:true});
  });
  await a.evaluate(()=>pushCloudState({manual:true}));
  const uploaded=clone(backend.state),writes=backend.writes;
  await a.evaluate(()=>pushCloudState({manual:true}));
  assert.match(await a.locator('#cloudNote').innerText(),/Cloud copy verified current/);
  assert.equal(backend.writes,writes);assert.deepEqual(backend.state,uploaded);
  assert.equal(await a.evaluate(cloud=>doesCloudStateMatchLocal(cloud),uploaded),true);
  await a.evaluate(()=>{state.cards.find(card=>card.type==='diary').diaryEntries[getTodayKey()].thoughts+='\nNew writing';saveState({skipCloud:true});});
  await a.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,writes+1);
  assert.match(await a.locator('#cloudNote').innerText(),/^Cloud saved /);
 });
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
  let requests=0;b.on('request',request=>{if(request.url().includes('/rest/v1/user_states'))requests++;});
  await b.evaluate(()=>{state.cloudOwnerId='different-owner';state.board.name='Never send';});await b.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,0);assert.equal(requests,0);assert.match(await b.locator('#cloudNote').innerText(),/not the owner/);
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
  await q.route('https://**supabase.co/**',route=>{unexpected++;return route.fulfill({status:503,body:'Auto sync must remain paused'});});await q.goto(APP_URL);
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
  assert.ok(await a.evaluate(()=>LifeDeviceStore.pending().length));await a.close();const b=await c.newPage();await b.goto(APP_URL);
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
  const pages=[a,await c.newPage(),await c.newPage()];for(let i=1;i<3;i++){await pages[i].goto(APP_URL);await pages[i].evaluate(id=>switchBoard(id),['','two','three'][i]);}
  if(process.env.TEST_SAVE_TRACE)for(const p of pages)await p.evaluate(()=>{
   window.stressTrace=[];
   const pick=s=>({text:s?.boards?.map(b=>b.cards.find(c=>c.type==='diary')?.diaryEntries[getTodayKey()]?.thoughts),heads:s?.deviceWriteHeads});
   const stage=LifeDeviceStore.stage;LifeDeviceStore.stage=(base,next)=>{stressTrace.push({kind:'stage',at:performance.timeOrigin+performance.now(),base:pick(base),next:pick(next)});return stage(base,next);};
   LifeDeviceStore.configure(entries=>{const before=pick(JSON.parse(localStorage.getItem(STORAGE_KEY))),queue=entries.map(i=>({writer:i.entry.writerId,sequence:i.entry.sequence,base:pick(i.entry.base),next:pick(i.entry.state)}));
    const ok=commitDeviceWrites(entries);stressTrace.push({kind:'commit',at:performance.timeOrigin+performance.now(),before,queue,after:pick(JSON.parse(localStorage.getItem(STORAGE_KEY))),visible:pick(getStateForStorage())});return ok;});
  });
  try{
  for(let round=0;round<10;round++){
   await Promise.all(pages.map((p,i)=>p.evaluate(async({i,round})=>{for(let n=1;n<=20;n++){const d=state.cards.find(c=>c.type==='diary');updateDiaryEntry(d,getTodayKey(),{thoughts:'Round '+round+' board '+i+' entry '+n});await new Promise(r=>setTimeout(r,3));}await flushDeviceWrites();},{i,round})));
   const expected=[0,1,2].map(i=>'Round '+round+' board '+i+' entry 20');
   await a.waitForFunction(expected=>{
    const rows=JSON.parse(localStorage.getItem(STORAGE_KEY)).boards.map(b=>b.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()]?.thoughts);
    return JSON.stringify(rows)===JSON.stringify(expected);
   },expected,{timeout:10000});
   const records=await a.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)).boards.map(b=>b.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()]?.thoughts));
   assert.deepEqual(records,[0,1,2].map(i=>'Round '+round+' board '+i+' entry 20'));
   for(const p of pages){const result=await p.evaluate(()=>({conflicted:cloudConflictPending,conflicts:state.syncConflicts}));assert.equal(result.conflicted,false,JSON.stringify({round,...result}));}
  }
  for(let i=0;i<3;i++){
   await pages[i].reload();assert.equal(await pages[i].evaluate(()=>state.activeBoardId),['personal-board','two','three'][i]);
   await pages[i].waitForFunction(i=>state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()]?.thoughts==='Round 9 board '+i+' entry 20',i);
   assert.equal(await pages[i].evaluate(()=>LifeDeviceStore.pending().length),0);
  }
  }catch(error){
   if(process.env.TEST_SAVE_TRACE){
    const traces=await Promise.all(pages.map(p=>p.evaluate(()=>{
     const result={events:window.stressTrace || []};
     const fields={memory:()=>getStateForStorage(),stored:()=>JSON.parse(localStorage.getItem(STORAGE_KEY)),pending:()=>LifeDeviceStore.pending(),checkpoint:()=>LifeDeviceStore.checkpointSnapshot(),lastLocalSaveOk:()=>lastLocalSaveOk,lastDeviceSaveError:()=>lastDeviceSaveError};
     for(const [key,read] of Object.entries(fields))try{result[key]=read();}catch(error){result[key]={captureError:error.message};}
     return result;
    }).catch(error=>({captureError:error.message}))));
    fs.writeFileSync(output+'/stress-trace.json',JSON.stringify({originalError:error.stack,traces},null,2));
   }
   throw error;
  }
 });
 await run('a missing device prerequisite blocks cloud upload until complete diary writing is safely committed',async context=>{
  const {b,backend}=await setup(context),text='Complete pending diary\nNo character may be discarded.';
  await b.evaluate(()=>{state.deviceWriteHeads.syntheticParent=1;localMergeBase=getStateForStorage();});await b.locator('.diary-thoughts').fill(text);
  await b.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,0);assert.equal(await b.evaluate(()=>state.syncConflicts.length),0);
  assert.equal(await b.locator('.diary-thoughts').inputValue(),text);assert(await b.evaluate(()=>LifeDeviceStore.pending().length>0));
  assert.match(await b.locator('#savedState').innerText(),/Pending copy kept - waiting for another tab/);
  assert(await b.evaluate(async()=>{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));saved.deviceWriteHeads.syntheticParent=1;localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));return flushDeviceWrites();}));
  await b.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,1);
  assert.equal(backend.state.boards[0].cards.find(c=>c.type==='diary').diaryEntries[await b.evaluate(()=>getTodayKey())].thoughts,text);
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
 await run('cloud archive versus a stale device rename stays absent after reload and keeps both task versions',async context=>{
  const {a,b,backend}=await setupPlanner(context);
  await a.evaluate(async()=>{archivePlannerTask(getPlannerSourceItems().find(t=>t.taskId==='sync-review-task'));await flushDeviceWrites();await pushCloudState({manual:true});});
  await b.evaluate(async()=>{const c=getPlannerSourceCards().find(c=>c.id==='sync-review-source');LifePlanner.change(c,'sync-review-task',{title:'Stale device rename'});LifePlanner.project(c);saveState({skipCloud:true});await flushDeviceWrites();await pushCloudState({manual:true});});
  assert.equal(backend.writes,1);assert.equal(await b.evaluate(()=>state.syncConflicts[0]?.kind),'planner-task');
  await b.reload();assert.equal(await b.evaluate(()=>getPlannerSourceItems().filter(t=>t.taskId==='sync-review-task').length),0);
  const original=await b.evaluate(()=>getPlannerSourceCards().find(c=>c.id==='sync-review-source').plannerTasks[0]);assert.equal(original.title,'Stale device rename');assert.equal(original.archivedAt,0);
  assert.match(await b.evaluate(()=>renderArchivedPlannerTasks().innerText),/Review versions/);
  const versions=await b.evaluate(()=>state.syncConflicts[0]);assert.ok(versions.remote.archivedAt);assert.equal(versions.local.title,'Stale device rename');
  assert.ok(backend.state.boards[0].cards.find(c=>c.id==='sync-review-source').plannerTasks[0].archivedAt);
  await b.evaluate(user=>{cloudSession={user:{id:user},access_token:'synthetic-test-token',expires_at:Date.now()+3600000};cloudSaveEnabled=false;openRecovery();},user);
  await b.getByRole('radio',{name:'Cloud version at conflict',exact:true}).check();await b.getByLabel('Apply this version to this task only.',{exact:true}).check();
  await b.getByRole('button',{name:'Save task version',exact:true}).click();await b.getByText(/Task version saved/).waitFor();await b.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.writes,2);assert.equal(await b.evaluate(()=>state.syncConflicts.length),0);
  assert.ok(backend.state.boards[0].cards.find(c=>c.id==='sync-review-source').plannerTasks[0].archivedAt);
  await b.reload();assert.equal(await b.evaluate(()=>getPlannerSourceItems().filter(t=>t.taskId==='sync-review-task').length),0);
 });
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
 async function missingHistory(context,{archivedRoutine=false}={}) {
  const f=await setup(context,{planner:true});
  f.backend.state.boards[0].cards.find(c=>c.type==='diary').diaryEntries={'2026-05-19':{thoughts:'Earlier cloud-only writing',sentence:'',feeling:'',updatedAt:10}};
  const old=clone(f.backend.state);
  await f.a.evaluate(async archivedRoutine=>{
   cloudMergeBase=null;localStorage.removeItem(CLOUD_BASE_KEY);
   updateDiaryEntry(state.cards.find(c=>c.type==='diary'),'2026-10-13',{thoughts:'Latest full diary.\nKeep every character.'});
   const c=getPlannerSourceCards().find(c=>c.id==='sync-review-source');LifePlanner.change(c,'sync-review-task',{title:'Current renamed task',done:true,completedOn:'2026-10-13',archivedAt:2000});LifePlanner.project(c);
   if(archivedRoutine)state.archivedCards.push(normalizeArchivedCard({...makeCard({type:'routine',title:'Archived daily routine'}),id:'archived-daily-routine',archivedAt:2000}));
   saveState({skipCloud:true});await flushDeviceWrites();
   window.copySaveFinished=false;pushCloudState({manual:true}).then(()=>window.copySaveFinished=true);
  },archivedRoutine);
  await f.a.getByRole('dialog',{name:'Compare device and cloud'}).waitFor();
  return {...f,old,before:await f.a.evaluate(()=>getStateForStorage())};
 }
 await run('missing sync history preserves old cloud privately without replacing diary or resurrecting archived tasks, then verifies full readback',async context=>{
  const {a,backend,old,before}=await missingHistory(context);
  await a.getByRole('button',{name:'Keep device + preserve cloud',exact:true}).click();
  await a.waitForFunction(()=>window.copySaveFinished);
  assert.equal(backend.writes,1);assert.match(await a.locator('#cloudNote').innerText(),/readback verified/);
  assert.deepEqual(backend.state.boards[0].cards,before.boards[0].cards);
  const copy=backend.state.boards.flatMap(b=>b.archivedCards).find(c=>c.preservedCloudSnapshot)?.preservedCloudSnapshot;
  assert.deepEqual(copy.state,old);assert.equal(backend.state.boards[0].cards.find(c=>c.id==='sync-review-source').plannerTasks[0].archivedAt,2000);
  await a.reload();assert.deepEqual(await a.evaluate(()=>LifeCloudCopies.retained(getStateForStorage())[0].state),old);
  assert.equal(await a.evaluate(()=>cloudMergeBase?.ownerId),user);
  await a.evaluate(()=>openRecovery());assert.equal(await a.getByRole('button',{name:'Read preserved cloud history',exact:true}).count(),1);
 });
 await run('cancelled cloud comparison changes neither copy',async context=>{
  const {a,backend,before}=await missingHistory(context);
  await a.getByRole('button',{name:'Cancel comparison',exact:true}).click();await a.waitForFunction(()=>window.copySaveFinished);
  assert.equal(backend.writes,0);assert.deepEqual(await a.evaluate(()=>getStateForStorage()),before);
 });
 await run('archived daily countdown advancing during missing-history review does not block saving or change its ticks and history',async context=>{
  const {a,backend,before}=await missingHistory(context,{archivedRoutine:true});
  const routine=before.boards[0].archivedCards.find(c=>c.id==='archived-daily-routine');
  await a.waitForTimeout(1400);
  await a.getByRole('button',{name:'Keep device + preserve cloud',exact:true}).click();await a.waitForFunction(()=>window.copySaveFinished);
  assert.equal(backend.writes,1);assert.match(await a.locator('#cloudNote').innerText(),/readback verified/);
  const saved=backend.state.boards[0].archivedCards.find(c=>c.id==='archived-daily-routine');assert.deepEqual(saved.items,routine.items);assert.deepEqual(saved.history,routine.history);
 });
 for(const changed of ['device','cloud','owner'])await run(changed+' changes during missing-history review prevent cloud replacement',async context=>{
  const {a,backend}=await missingHistory(context);
  if(changed==='cloud'){backend.state.boards[0].name='Changed elsewhere';backend.updated_at='2026-10-14T00:00:00Z';}
  if(changed==='device')await a.evaluate(async()=>{state.board.name='A new device edit';saveState({skipCloud:true});await flushDeviceWrites();});
  if(changed==='owner')await a.evaluate(()=>{saveCloudSession({user:{id:'wrong-owner'},access_token:'synthetic-wrong',expires_at:Date.now()+3600000});});
  await a.getByRole('button',{name:'Keep device + preserve cloud',exact:true}).click();
  await a.locator('#cloudCopiesReview .conflict-message').filter({hasText:/changed/}).waitFor();
  assert.equal(backend.writes,0);await a.getByRole('button',{name:'Cancel comparison',exact:true}).click();
 });
 await run('recovery quota failure prevents missing-history upload rather than dropping either copy',async context=>{
  const {a,backend,before}=await missingHistory(context);
  await a.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===CLOUD_RECOVERY_KEY)throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
  await a.getByRole('button',{name:'Keep device + preserve cloud',exact:true}).click();
  await a.getByText(/device backup could not be saved/).waitFor();assert.equal(backend.writes,0);
  assert.deepEqual(await a.evaluate(()=>getStateForStorage().boards),before.boards);
  await a.getByRole('button',{name:'Cancel comparison',exact:true}).click();
 });
 await run('cloud readback truncation is not reported as saved and leaves the full latest writing on device',async context=>{
  const {a,backend}=await missingHistory(context);
  await a.route('https://**supabase.co/rest/v1/user_states**',async route=>{
   if(route.request().method()==='PATCH'){const data=route.request().postDataJSON();backend.state=data.state;backend.updated_at=data.updated_at;backend.writes++;return route.fulfill({json:[{updated_at:backend.updated_at}]});}
   const snapshot=clone(backend.state);if(backend.writes)snapshot.boards[0].cards.find(c=>c.type==='diary').diaryEntries['2026-10-13'].thoughts='L';
   return route.fulfill({json:[{state:snapshot,updated_at:backend.updated_at}]});
  });
  await a.getByRole('button',{name:'Keep device + preserve cloud',exact:true}).click();await a.waitForFunction(()=>window.copySaveFinished);
  assert.match(await a.locator('#cloudNote').innerText(),/readback did not match/);assert.equal(await a.evaluate(()=>cloudConflictPending),true);
  assert.equal(await a.evaluate(()=>state.cards.find(c=>c.type==='diary').diaryEntries['2026-10-13'].thoughts),'Latest full diary.\nKeep every character.');
 });
 await run('baseline storage failure after verified upload stays paused and can safely retry without another overwrite',async context=>{
  const {a,backend}=await missingHistory(context);
  await a.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===CLOUD_BASE_KEY)throw new DOMException('Full','QuotaExceededError');return window.originalStorageSet.call(this,key,value);};});
  await a.getByRole('button',{name:'Keep device + preserve cloud',exact:true}).click();await a.waitForFunction(()=>window.copySaveFinished);
  assert.equal(backend.writes,1);assert.equal(await a.evaluate(()=>cloudConflictPending),true);assert.match(await a.locator('#cloudNote').innerText(),/sync history could not be saved/);
  await a.evaluate(async()=>{Storage.prototype.setItem=window.originalStorageSet;await pushCloudState({manual:true});});
  assert.equal(backend.writes,1);assert.equal(await a.evaluate(()=>cloudConflictPending),false);assert.match(await a.locator('#cloudNote').innerText(),/verified current/);
 });
 await run('native storage quota reopens with a lossless compact sync baseline and keeps diary, recovery and unrelated padding intact',async context=>{
  const c=await context(),p=await fresh(c);
  const original=await p.evaluate(async user=>{
   const diary=state.cards.find(card=>card.type==='diary');
   diary.diaryEntries={};for(let n=1;n<=28;n++)diary.diaryEntries['2026-09-'+String(n).padStart(2,'0')]={thoughts:('Every original line '+n+'\n').repeat(1800),sentence:'',feeling:'',updatedAt:n};
   saveState({skipCloud:true});await flushDeviceWrites();const base=getStateForStorage();
   localStorage.setItem(CLOUD_BASE_KEY,JSON.stringify({ownerId:user,state:base}));saveCloudRecoveryPoint('quota-recovery',base);
   const before=localStorage.getItem(STORAGE_KEY),recovery=localStorage.getItem(CLOUD_RECOVERY_KEY);
   let padding='';for(let n=0;n<1000;n++){try{const next=padding+'x'.repeat(16384);localStorage.setItem('native-quota-padding',next);padding=next;}catch{break;}}
   let oldJournalRejected=false;try{localStorage.setItem('old-full-journal',JSON.stringify({base,state:base}));}catch{oldJournalRejected=true;}
   return {base,before,recovery,padding,oldJournalRejected,legacyBaseBytes:localStorage.getItem(CLOUD_BASE_KEY).length};
  },user);
  assert.equal(original.oldJournalRejected,true);
  const reopen=new globalThis.URL(URL);reopen.searchParams.set('liveReload','0');await p.goto(reopen.href);
  await p.evaluate(()=>flushDeviceWrites());
  const result=await p.evaluate(()=>({base:cloudMergeBase,encoded:JSON.parse(localStorage.getItem(CLOUD_BASE_KEY)),recovery:localStorage.getItem(CLOUD_RECOVERY_KEY),padding:localStorage.getItem('native-quota-padding'),saved:lastLocalSaveOk,diary:state.cards.find(c=>c.type==='diary').diaryEntries}));
  assert.equal(result.encoded.format,'life-os-cloud-base-lz-v1');assert.equal(result.encoded.ownerId,undefined);assert.deepEqual(result.base,{ownerId:user,state:original.base});
  assert.deepEqual(result.diary,original.base.boards[0].cards.find(c=>c.type==='diary').diaryEntries);assert.equal(result.recovery,original.recovery);assert.equal(result.padding,original.padding);assert.equal(result.saved,true);
  assert(JSON.stringify(result.encoded).length<original.legacyBaseBytes/3);
  await p.locator('.diary-thoughts').fill('A new complete entry after migration.\nThe second line stays.');assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);
  await p.reload();assert.equal(await p.locator('.diary-thoughts').inputValue(),'A new complete entry after migration.\nThe second line stays.');
 });
 await run('an older tab rewriting legacy sync history is re-compacted without changing the current tab common baseline or records',async context=>{
  const c=await context(),p=await fresh(c),other=await fresh(c);
  const current=await p.evaluate(async user=>{const base=getStateForStorage();rememberCloudBase(base,user);return {ownerId:user,state:base};},user);
  const legacy=clone(current);legacy.state.boards[0].name='Another tab baseline';
  await other.evaluate(value=>localStorage.setItem(CLOUD_BASE_KEY,JSON.stringify(value)),legacy);
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem(CLOUD_BASE_KEY)).format==='life-os-cloud-base-lz-v1');
  assert.deepEqual(await p.evaluate(()=>cloudMergeBase),current);assert.equal(await p.evaluate(()=>state.board.name),current.state.boards[0].name);
  assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.decodeBase(JSON.parse(localStorage.getItem(CLOUD_BASE_KEY)),LZString)),legacy);
 });
 await run('JSONB-reordered cloud objects do not create a false conflict when a synced task is renamed on one device',async context=>{
  const {a,backend}=await setup(context,{planner:true});
  const reorder=value=>Array.isArray(value)?value.map(reorder):value && typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorder(value[key])])):value;
  await a.route('https://**supabase.co/rest/v1/user_states**',async r=>r.request().method()==='GET'?r.fulfill({json:[{state:reorder(backend.state),updated_at:backend.updated_at}]}):r.fallback());
  await a.evaluate(async()=>{const source=getPlannerSourceCards().find(c=>c.id==='sync-review-source');LifePlanner.change(source,'sync-review-task',{title:'Renamed after the initial save'});LifePlanner.project(source);saveState({skipCloud:true});await flushDeviceWrites();await pushCloudState({manual:true});});
  assert.equal(backend.writes,1);assert.equal(await a.evaluate(()=>state.syncConflicts.length),0);
  assert.equal(backend.state.boards[0].cards.find(c=>c.id==='sync-review-source').plannerTasks[0].title,'Renamed after the initial save');assert.match(await a.locator('#cloudNote').innerText(),/readback verified/);
 });
 async function moneySheet(p,phone=false){
  if(phone)await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{const session=moneySession();session.month=getTodayKey().slice(0,7);session.owner='all';session.view='table';session.sheetWorkbook=true;saveMoneySession(session);setWorkspaceMode('money');});
  await p.locator('.money-workbook-grid td[data-x="0"][data-y="1"]').waitFor();
  if(phone)await p.getByLabel('Sheet zoom level',{exact:true}).selectOption('50');
 }
 async function moneyDraftCell(p,x,y,value){
  const cell=p.locator('.money-workbook-grid td[data-x="'+x+'"][data-y="'+y+'"]');
  await cell.scrollIntoViewIfNeeded();await cell.dblclick();const input=cell.locator('input,textarea');await input.fill(value);await input.press('Enter');
 }
 async function moneyCell(p,id,x,value){
  const y=await p.evaluate(id=>LifeMoneyWorkbookUI.active().base.rows.findIndex(row=>row.entry.id===id)+1,id);assert(y>0);await moneyDraftCell(p,x,y,value);
 }
 async function saveMoneySheet(p){await p.getByRole('button',{name:'Save sheet',exact:true}).click();assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);}
 const cloudMoney=(f)=>f.backend.state.boards.find(b=>b.id===f.base.activeBoardId).money;
 async function moneyOf(p){return p.evaluate(()=>moneyLedger());}
 function moneyOriginals(f){return f.base.boards.map(board=>({id:board.id,cards:board.cards,archivedCards:board.archivedCards}));}
 function assertMoneyOriginals(f){assert.deepEqual(f.backend.state.boards.map(board=>({id:board.id,cards:board.cards,archivedCards:board.archivedCards})),moneyOriginals(f));}
 await run('money workbook laptop and phone round trip keeps IDs, full notes, detail cells and exact totals without duplicate saves',async context=>{
  const f=await setup(context,{money:true}),{a,b,backend}=f;
  await moneySheet(a);await moneyCell(a,'sync-cake',1,'12.34');await moneyCell(a,'sync-cake',6,'Laptop complete note\n第二行');await moneyCell(a,'sync-cake',25,'Receipt detail stays with the entry');await saveMoneySheet(a);
  await a.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,1);await a.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,1);
  await b.evaluate(()=>pushCloudState({manual:true}));await moneySheet(b,true);assert.deepEqual(await moneyOf(b),cloudMoney(f));
  await moneyCell(b,'sync-gift',0,'Gift renamed on phone');await moneyCell(b,'sync-gift',1,'20.10');await saveMoneySheet(b);await b.evaluate(()=>pushCloudState({manual:true}));
  await a.evaluate(()=>pushCloudState({manual:true}));assert.deepEqual(await moneyOf(a),cloudMoney(f));
  const saved=clone(cloudMoney(f));assert.equal(saved.entries.length,2);assert.equal(new Set(saved.entries.map(e=>e.id)).size,2);
  const cake=saved.entries.find(e=>e.id==='sync-cake'),gift=saved.entries.find(e=>e.id==='sync-gift');assert.equal(cake.amountCents,1234);assert.equal(cake.note,'Laptop complete note\n第二行');assert.equal(cake.sheetCells.Z,'Receipt detail stays with the entry');assert.deepEqual(cake.extension,{keep:true});assert.equal(gift.amountCents,2010);assert.equal(gift.title,'Gift renamed on phone');
  for(const p of [a,b]){await p.evaluate(()=>{cloudSaveEnabled=false;clearTimeout(cloudSaveTimer);});await p.reload();await p.waitForFunction(()=>typeof moneyLedger==='function');assert.deepEqual(await moneyOf(p),saved);const totals=await p.evaluate(()=>LifeMoney.worksheet(moneyLedger(),getTodayKey().slice(0,7),getTodayKey(),'all').totals);assert.equal(totals.paid,1234);assert.equal(totals.considering,2010);const balance=await p.evaluate(()=>LifeMoney.summary(moneyLedger(),getTodayKey(),getTodayKey(),'all').actualCents);assert.equal(balance,98766);}
  assertMoneyOriginals(f);
 });
 await run('money workbook independent concurrent device edits merge without duplicating rows or reverting either amount',async context=>{
  const f=await setup(context,{money:true}),{a,b}=f;await moneySheet(a);await moneySheet(b,true);
  await moneyCell(a,'sync-cake',1,'15.55');await saveMoneySheet(a);await moneyCell(b,'sync-gift',1,'20.10');await saveMoneySheet(b);
  await a.evaluate(()=>pushCloudState({manual:true}));await b.evaluate(()=>pushCloudState({manual:true}));await a.evaluate(()=>pushCloudState({manual:true}));
  const saved=clone(cloudMoney(f));assert.equal(saved.entries.length,2);assert.equal(saved.entries.find(e=>e.id==='sync-cake').amountCents,1555);assert.equal(saved.entries.find(e=>e.id==='sync-gift').amountCents,2010);
  for(const p of [a,b]){assert.deepEqual(await moneyOf(p),saved);assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);}assertMoneyOriginals(f);
 });
 await run('money workbook competing laptop and phone edits preserve both complete versions and block stale cloud overwrite',async context=>{
  const f=await setup(context,{money:true}),{a,b,backend}=f;await moneySheet(a);await moneySheet(b,true);
  await moneyCell(a,'sync-cake',1,'15.55');await saveMoneySheet(a);await a.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,1);
  await moneyCell(b,'sync-cake',6,'New phone note\nKeep every character');await saveMoneySheet(b);await b.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,1);
  const conflict=await b.evaluate(()=>state.syncConflicts.find(c=>c.kind==='money-record'));assert(conflict);assert.equal(conflict.local.note,'New phone note\nKeep every character');assert.equal(conflict.local.amountCents,1000);assert.equal(conflict.remote.amountCents,1555);assert.equal(conflict.remote.note,'Original complete note\nSecond line');assert.equal(cloudMoney(f).entries.find(e=>e.id==='sync-cake').amountCents,1555);
  await b.reload();await b.waitForFunction(()=>state.syncConflicts.some(c=>c.kind==='money-record'));const retained=await b.evaluate(()=>state.syncConflicts.find(c=>c.kind==='money-record'));assert.deepEqual(retained.local,conflict.local);assert.deepEqual(retained.remote,conflict.remote);assertMoneyOriginals(f);
 });
 await run('money workbook lost cloud acknowledgement retries the same record without duplicate transactions or history',async context=>{
  const f=await setup(context,{money:true}),{a,b,backend}=f;let dropped=false;
  await a.route('https://**supabase.co/rest/v1/user_states**',async route=>{
   const request=route.request();if(request.method()!=='PATCH' || dropped)return route.fallback();
   assert.equal(new globalThis.URL(request.url()).searchParams.get('updated_at'),'eq.'+backend.updated_at);const data=request.postDataJSON();backend.state=clone(data.state);backend.updated_at=data.updated_at;backend.writes++;dropped=true;await route.abort('failed');
  });
  await moneySheet(a);await moneyDraftCell(a,0,3,'Synthetic retry purchase');await moneyDraftCell(a,1,3,'12.34');await moneyDraftCell(a,6,3,'Complete new entry\nSecond line');await saveMoneySheet(a);
  const local=await moneyOf(a),created=local.entries.find(e=>e.title==='Synthetic retry purchase');assert(created);assert.equal(created.amountCents,1234);
  await a.evaluate(()=>pushCloudState({manual:true}));assert.equal(dropped,true);assert.equal(backend.writes,1);const saved=clone(cloudMoney(f));
  await a.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,1);assert.deepEqual(await moneyOf(a),saved);assert.equal(saved.entries.length,3);assert.equal(saved.entries.filter(e=>e.id===created.id).length,1);assert.deepEqual(saved.entries.find(e=>e.id===created.id),created);
  for(const original of f.base.boards.find(board=>board.id===f.base.activeBoardId).money.entries)assert.deepEqual(saved.entries.find(e=>e.id===original.id),original);
  await b.evaluate(()=>pushCloudState({manual:true}));assert.deepEqual(await moneyOf(b),saved);assertMoneyOriginals(f);
 });
 await run('money workbook observed cross-tab edit followed by a return edit does not create a false cloud conflict with an older baseline',async context=>{
  const f=await setup(context,{money:true}),{a,base,backend}=f,q=await fresh(a.context());
  await q.route('https://**supabase.co/rest/v1/user_states**',async route=>{
   const req=route.request(),url=new globalThis.URL(req.url());
   if(req.method()==='GET')return route.fulfill({json:[{state:clone(backend.state),updated_at:backend.updated_at}]});
   if(req.method()==='PATCH'){
    if(url.searchParams.get('updated_at')!=='eq.'+backend.updated_at)return route.fulfill({json:[]});
    const data=req.postDataJSON();backend.state=clone(data.state);backend.updated_at=data.updated_at;backend.writes++;return route.fulfill({json:[{updated_at:backend.updated_at}]});
   }
   return route.fulfill({status:400,body:'Unexpected method'});
  });
  await connect(q,base,backend.updated_at);await moneySheet(a);await moneySheet(q,true);
  await moneyCell(q,'sync-cake',1,'15.55');await moneyCell(q,'sync-cake',6,'Observed phone note\nEvery character');await saveMoneySheet(q);await q.evaluate(()=>pushCloudState({manual:true}));assert.equal(backend.writes,1);
  await a.waitForFunction(()=>moneyLedger().entries.find(e=>e.id==='sync-cake').amountCents===1555);
  assert.equal(await a.evaluate(()=>cloudMergeBase.state.boards.find(b=>b.id===state.activeBoardId).money.entries.find(e=>e.id==='sync-cake').amountCents),1000,'retain the deliberately older cloud baseline');
  await moneyCell(a,'sync-cake',1,'12.34');await moneyCell(a,'sync-cake',6,'Observed phone note\nEvery character\nDesktop continuation');await saveMoneySheet(a);await a.evaluate(()=>pushCloudState({manual:true}));
  assert.equal(backend.writes,2);assert.equal(await a.evaluate(()=>state.syncConflicts.length),0);await q.waitForFunction(()=>moneyLedger().entries.find(e=>e.id==='sync-cake').amountCents===1234);assert.equal(await q.evaluate(()=>state.syncConflicts.length),0);
  const saved=cloudMoney(f),cake=saved.entries.find(e=>e.id==='sync-cake');assert.equal(saved.entries.length,2);assert.equal(cake.history.length,2);assert.equal(cake.note,'Observed phone note\nEvery character\nDesktop continuation');assert.deepEqual(cake.history.map(h=>h.record.amountCents),[1000,1555]);assertMoneyOriginals(f);
 });
 fs.writeFileSync(output+'/sync-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
