const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const url=new URL(process.env.TEST_URL || 'http://127.0.0.1:5180/');url.searchParams.delete('preview');url.searchParams.set('liveReload','0');
assert(['127.0.0.1','localhost'].includes(url.hostname),'Session fault tests must use an isolated local server');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-session-renewal',owner='11111111-1111-4111-8111-111111111111';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
 async function run(name,fn){
  if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
  const repetitions=Math.min(20,Math.max(1,Number(process.env.TEST_REPETITIONS) || 1));
  for(let repetition=0;repetition<repetitions;repetition++){
  const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[],requests=[];
  await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic sessions only; no real cloud access'}));
  await context.addInitScript(()=>window.addEventListener('storage',event=>{if(window.holdSessionEvents && event.key===window.sessionFixtureKey)event.stopImmediatePropagation();},true));
  context.on('page',p=>{p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));});
  context.on('request',req=>{if(req.url().startsWith('https:'))requests.push({path:new URL(req.url()).pathname,method:req.method()});});
  const p=await context.newPage();
  // Install before application timers exist; late installation can briefly
  // expose the clock's zero epoch to an already-running maintenance interval.
  await p.clock.install({time:new Date('2026-10-17T08:00:00+08:00')});
  try{
   await p.goto(url.href);
   await p.evaluate(async owner=>{
    const diary={...makeCard({type:'diary',title:'My diary'}),id:'original-diary',diaryEntries:{'2026-10-16':{thoughts:'Every original word\nEvery line',updatedAt:123}}};
    state.boards=[createBoardRecord({id:'one',name:'Personal',cards:[diary],archivedCards:[]}),createBoardRecord({id:'two',name:'Work',cards:[makeCard({type:'quote',title:'Original note',description:'Another complete original record'})],archivedCards:[]})];
    applyBoardToState(state,'one');state.cloudOwnerId=owner;saveState({skipCloud:true});await flushDeviceWrites();
    saveCloudSession({user:{id:owner},access_token:'synthetic-original-access',refresh_token:'synthetic-original-refresh',expires_at:Date.now()+3600000});
    cloudSaveEnabled=false;cloudSessionMaintenancePending=true;window.sessionFixtureKey=CLOUD_SESSION_KEY;window.holdSessionEvents=true;
   },owner);
   const q=await context.newPage();await q.clock.install({time:new Date('2026-10-17T08:00:00+08:00')});await q.goto(url.href);await q.evaluate(()=>{cloudSaveEnabled=false;cloudSessionMaintenancePending=true;});
   const before=await p.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage())));requests.length=0;
   await fn(p,q,context,requests);
   assert.equal(await p.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage()))),before);assert.deepEqual(errors,[]);
   results.push({name,pass:true});
  }catch(error){results.push({name,pass:false,error:error.stack,errors});}
  console.log(JSON.stringify(results.at(-1)));await context.close();
  }
 }
 const ensure=p=>p.evaluate(()=>ensureCloudSession().then(s=>s.access_token));
 await run('a cloud-save timestamp from a stale tab never republishes old sign-in credentials',async p=>{
  const result=await p.evaluate(()=>{
   const original=Storage.prototype.getItem,set=Storage.prototype.setItem,oldRaw=original.call(localStorage,CLOUD_SESSION_KEY);
   const next={...JSON.parse(oldRaw),access_token:'synthetic-current-access',refresh_token:'synthetic-current-refresh'},nextRaw=JSON.stringify(next);set.call(localStorage,CLOUD_SESSION_KEY,nextRaw);let credentialWrites=0;
   Storage.prototype.getItem=function(key){return this===localStorage && key===CLOUD_SESSION_KEY?oldRaw:original.call(this,key);};
   Storage.prototype.setItem=function(key,...args){if(this===localStorage && key===CLOUD_SESSION_KEY)credentialWrites++;return set.call(this,key,...args);};
   try{setKnownCloudUpdatedAt('2026-10-17T00:05:00.000Z');return {credentialWrites,raw:original.call(localStorage,CLOUD_SESSION_KEY),expected:nextRaw,stamp:getKnownCloudUpdatedAt()};}
   finally{Storage.prototype.getItem=original;Storage.prototype.setItem=set;}
  });
  assert.equal(result.credentialWrites,0);assert.equal(result.raw,result.expected);assert.equal(result.stamp,'2026-10-17T00:05:00.000Z');
  await p.reload();assert.equal(await p.evaluate(()=>getKnownCloudUpdatedAt()),'2026-10-17T00:05:00.000Z');assert.equal(await ensure(p),'synthetic-current-access');
 });
 const expire=p=>p.evaluate(()=>saveCloudSession({...cloudSession,expires_at:1}));
 async function backend(context,handler){
  let calls=0;
  await context.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',async route=>{
   calls++;assert.equal(route.request().postDataJSON().refresh_token,'synthetic-original-refresh');
   if(handler && await handler(route,calls))return;
   await route.fulfill({json:{access_token:'synthetic-renewed-access',refresh_token:'synthetic-renewed-refresh',expires_in:3600,user:{id:owner}}});
  });return ()=>calls;
 }
 const receiptRows=p=>p.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(LifeStorageScope.key('life-os-auth-renewal-v1'),1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('receipts'),store=tx.objectStore('receipts'),keys=store.getAllKeys(),values=store.getAll();
   tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
 });
 await run('session fast-path refuses another tab sign-out before its storage event arrives',async(p,q,context,requests)=>{
  await q.evaluate(()=>signOutCloud());await assert.rejects(ensure(p),/changed|signed out/);
  assert.equal(await p.evaluate(()=>loadCloudSession()),null);assert.equal(requests.length,0);
 });
 await run('session fast-path refuses a different stored owner and does not remove that sign-in',async(p,q,context,requests)=>{
  const raw=await q.evaluate(()=>{const raw=JSON.stringify({user:{id:'other-owner'},access_token:'synthetic-other-access',expires_at:Date.now()+3600000});localStorage.setItem(CLOUD_SESSION_KEY,raw);return raw;});
  await assert.rejects(ensure(p),/changed|owner/);assert.equal(await q.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),raw);assert.equal(requests.length,0);
 });
 await run('session fast-path checks the recorded data owner even when cache and storage agree',async(p,q,context,requests)=>{
  const raw=await p.evaluate(()=>{cloudSession={user:{id:'other-owner'},access_token:'synthetic-other-access',expires_at:Date.now()+3600000};const raw=JSON.stringify(cloudSession);localStorage.setItem(CLOUD_SESSION_KEY,raw);return raw;});
  await assert.rejects(ensure(p),/owner/);assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),raw);assert.equal(requests.length,0);
 });
 await run('session fast-path retains malformed original storage and refuses cached credentials',async(p,q,context,requests)=>{
  for(const raw of ['{"unfinished":','null','[]','{"access_token":"synthetic-incomplete"}',JSON.stringify({access_token:{malformed:true},user:{id:owner},expires_at:Date.now()+3600000}),JSON.stringify({access_token:'synthetic-access',refresh_token:{malformed:true},user:{id:owner},expires_at:Date.now()+3600000})]){
   await q.evaluate(raw=>localStorage.setItem(CLOUD_SESSION_KEY,raw),raw);
   // WebKit propagates its cross-page storage cache asynchronously. Wait for
   // the write itself, while the application storage listener remains blocked.
   await p.waitForFunction(raw=>localStorage.getItem(CLOUD_SESSION_KEY)===raw,raw);
   await assert.rejects(ensure(p),/changed|signed out/);
   assert.equal(await q.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),raw);
  }
  assert.equal(requests.length,0);
 });
 await run('a valid same-owner cached session returns without renewal or changing records',async(p,q,context,requests)=>{
  assert.equal(await ensure(p),'synthetic-original-access');assert.equal(requests.length,0);
 });
 await run('malformed provider credentials never replace the original session or acknowledge a rotation',async(p,q,context)=>{
  await expire(p);const original=await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY));
  for(const fields of [{access_token:{invalid:true}},{refresh_token:{invalid:true}},{user:{id:123}}]){
   await context.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',route=>route.fulfill({json:{access_token:'synthetic-renewed-access',refresh_token:'synthetic-renewed-refresh',expires_in:3600,user:{id:owner},...fields}}));
   await assert.rejects(ensure(p),/Cloud session expired/);assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),original);assert.equal((await receiptRows(p)).values[0].status,'pending');
  }
 });
 await run('a newer same-owner session is adopted without replaying cached credentials',async(p,q,context,requests)=>{
  await q.evaluate(()=>saveCloudSession({...cloudSession,access_token:'synthetic-new-access',refresh_token:'synthetic-new-refresh',expires_at:Date.now()+3600000}));
  assert.equal(await ensure(p),'synthetic-new-access');assert.equal(requests.length,0);
 });
 await run('a stale storage view cannot exchange a token already renewed in another tab',async(p,q,context)=>{
  let calls=0;
  await context.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',route=>{
   calls++;return route.fulfill({json:{access_token:'synthetic-renewed-'+calls,refresh_token:'synthetic-next-'+calls,expires_in:3600,user:{id:owner}}});
  });
  await p.evaluate(()=>saveCloudSession({...cloudSession,expires_at:1}));
  // Freeze the expired session, not WebKit's briefly cached valid predecessor.
  // Application storage events remain held throughout this fault injection.
  await q.waitForFunction(()=>JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY))?.expires_at===1);
  const expiredFixture=await q.evaluate(()=>{
   window.originalSessionRead=Storage.prototype.getItem;window.oldSessionRaw=originalSessionRead.call(localStorage,CLOUD_SESSION_KEY);window.staleSessionView=true;
   Storage.prototype.getItem=function(key){return staleSessionView && this===localStorage && key===CLOUD_SESSION_KEY?oldSessionRaw:originalSessionRead.call(this,key);};
   return JSON.parse(oldSessionRaw).expires_at===1;
  });
  assert.equal(expiredFixture,true);
  assert.equal(await ensure(p),'synthetic-renewed-1');
  const error=await q.evaluate(async()=>{try{await ensureCloudSession();return null;}catch(error){return {message:error.message,retryable:error.retryable};}});
  assert(error);assert.match(error.message,/another tab|Waiting/i);assert.equal(error.retryable,true);assert.equal(calls,1);
  await q.evaluate(()=>{staleSessionView=false;});assert.equal(await ensure(q),'synthetic-renewed-1');assert.equal(calls,1);
 });
 await run('published receipts contain hashes and coordination metadata, never credentials or diary records',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);assert.equal(await ensure(p),'synthetic-renewed-access');
  const rows=await receiptRows(p);assert.equal(rows.keys.length,1);assert.match(rows.keys[0],/^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(rows.values[0]).sort(),['attempt','format','status']);assert.equal(rows.values[0].status,'applied');
  assert(!JSON.stringify(rows).includes('synthetic-'));assert(!JSON.stringify(rows).includes(owner));
  await p.reload();assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),1);
 });
 await run('receipt quota refusal stops before token exchange and retries after storage recovers',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);
  const original=await p.evaluate(()=>{
   window.originalReceiptPut=IDBObjectStore.prototype.put;window.allowReceiptWrites=false;
   IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name===LifeStorageScope.key('life-os-auth-renewal-v1') && !allowReceiptWrites)throw new DOMException('Synthetic receipt quota','QuotaExceededError');return originalReceiptPut.apply(this,args);};
   return localStorage.getItem(CLOUD_SESSION_KEY);
  });
  await assert.rejects(ensure(p),/coordination is unavailable/);assert.equal(calls(),0);assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),original);
  await p.evaluate(()=>{allowReceiptWrites=true;});assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),1);
 });
 await run('a malformed renewal receipt retains its bytes and refuses an unverified exchange',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);
  const damaged=await p.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(LifeStorageScope.key('life-os-auth-renewal-v1'),1);req.onupgradeneeded=()=>req.result.createObjectStore('receipts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
   const key=await LifeAuthRenewal.digest('synthetic-original-refresh'),row={format:'unknown-original',status:'unreadable',original:'Keep these bytes'};
   await new Promise((resolve,reject)=>{const tx=db.transaction('receipts','readwrite');tx.objectStore('receipts').put(row,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();return row;
  });
  const original=await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY));await assert.rejects(ensure(p),/receipts need review/);
  assert.equal(calls(),0);assert.deepEqual((await receiptRows(p)).values,[damaged]);assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),original);
 });
 await run('denied receipt storage retains the current credentials without any network request',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);const original=await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY));
  await p.evaluate(()=>{window.originalReceiptOpen=indexedDB.open;indexedDB.open=function(name,...args){if(name===LifeStorageScope.key('life-os-auth-renewal-v1'))throw new DOMException('Synthetic denial','SecurityError');return originalReceiptOpen.call(this,name,...args);};});
  await assert.rejects(ensure(p),/coordination is unavailable/);assert.equal(calls(),0);assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),original);
 });
 await run('a stalled receipt open reaches its deadline, releases the auth lock and remains retryable',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);
  await p.evaluate(()=>{
   window.originalReceiptOpen=indexedDB.open;window.heldReceiptOpen=false;window.receiptOutcome=null;
   indexedDB.open=function(name,...args){if(name===LifeStorageScope.key('life-os-auth-renewal-v1')){heldReceiptOpen=true;return {};}return originalReceiptOpen.call(this,name,...args);};
   ensureCloudSession().then(()=>receiptOutcome='unexpected success',error=>receiptOutcome=error.message);
  });
  await p.waitForFunction(()=>heldReceiptOpen);await p.clock.runFor(11000);await p.waitForFunction(()=>receiptOutcome!==null);
  assert.match(await p.evaluate(()=>receiptOutcome),/coordination is unavailable/);assert.equal(calls(),0);
  assert.equal(await p.evaluate(()=>navigator.locks.request(LifeStorageScope.key('life-os-auth-refresh-v1'),{ifAvailable:true},lock=>Boolean(lock))),true);
  await p.evaluate(()=>{indexedDB.open=originalReceiptOpen;});await p.clock.resume();assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),1);
 });
 await run('a temporary renewal outage leaves a pending receipt and can retry without signing in again',async(p,q,context)=>{
  const calls=await backend(context,async(route,n)=>{if(n===1){await route.fulfill({status:503,json:{msg:'Synthetic outage'}});return true;}});await expire(p);
  const original=await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY));await assert.rejects(ensure(p),/temporarily unavailable/);
  assert.equal((await receiptRows(p)).values[0].status,'pending');assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),original);
  assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),2);assert.equal((await receiptRows(p)).values[0].status,'applied');
 });
 await run('a lost token response remains recoverable using the provider parent-token recovery path',async(p,q,context)=>{
  let issuedPair=null,issued=0;
  const calls=await backend(context,async(route,n)=>{
   if(n===1){issuedPair={access_token:'synthetic-renewed-access',refresh_token:'synthetic-renewed-refresh',expires_in:3600,user:{id:owner}};issued++;await route.abort('failed');return true;}
   assert(issuedPair);await route.fulfill({json:issuedPair});return true;
  });await expire(p);
  const original=await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY));await assert.rejects(ensure(p),/temporarily unavailable/);
  assert.equal((await receiptRows(p)).values[0].status,'pending');assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),original);
  assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),2);assert.equal(issued,1);assert.equal((await receiptRows(p)).values[0].status,'applied');
 });
 await run('failed credential publication keeps original bytes and can recover the rotated session after quota recovery',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);
  const original=await p.evaluate(()=>{
   window.originalCredentialWrite=Storage.prototype.setItem;window.rejectCredentialWrite=true;
   Storage.prototype.setItem=function(key,value){if(this===localStorage && key===CLOUD_SESSION_KEY && rejectCredentialWrite)throw new DOMException('Synthetic credential quota','QuotaExceededError');return originalCredentialWrite.call(this,key,value);};
   return localStorage.getItem(CLOUD_SESSION_KEY);
  });
  await assert.rejects(ensure(p),/Sign-in could not be saved/);assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY)),original);assert.equal((await receiptRows(p)).values[0].status,'pending');
  await p.evaluate(()=>{rejectCredentialWrite=false;});assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),2);assert.equal((await receiptRows(p)).values[0].status,'applied');
 });
 await run('a failed final receipt cannot erase published credentials or claim renewal was verified',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);
  await p.evaluate(()=>{
   window.originalReceiptPut=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value,...args){if(this.transaction.db.name===LifeStorageScope.key('life-os-auth-renewal-v1') && value.status==='applied')throw new DOMException('Synthetic final receipt quota','QuotaExceededError');return originalReceiptPut.call(this,value,...args);};
  });
  await assert.rejects(ensure(p),/coordination is unavailable/);assert.equal(await p.evaluate(()=>loadCloudSession().access_token),'synthetic-renewed-access');assert.equal((await receiptRows(p)).values[0].status,'pending');
  assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),1);
 });
 await run('credential publication retries the same returned pair after verified recovery compaction without another token exchange',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);
  await p.evaluate(()=>{
   window.originalCredentialWrite=Storage.prototype.setItem;window.rejectCredentialWrite=true;window.recoveryCompactions=0;
   Storage.prototype.setItem=function(key,value){if(this===localStorage && key===CLOUD_SESSION_KEY && rejectCredentialWrite)throw new DOMException('Synthetic credential quota','QuotaExceededError');return originalCredentialWrite.call(this,key,value);};
   recoveryVault={compact:async options=>{if(!options.releaseCache)throw new Error('Full duplicates must be preserved before releasing the cache');recoveryCompactions++;rejectCredentialWrite=false;}};
  });
  assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),1);assert.equal(await p.evaluate(()=>recoveryCompactions),1);assert.equal((await receiptRows(p)).values[0].status,'applied');
 });
 await run('a sign-out during recovery compaction cannot republish the returned token pair',async(p,q,context)=>{
  const calls=await backend(context);await expire(p);
  await p.evaluate(()=>{
   window.originalCredentialWrite=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(this===localStorage && key===CLOUD_SESSION_KEY)throw new DOMException('Synthetic credential quota','QuotaExceededError');return originalCredentialWrite.call(this,key,value);};
   recoveryVault={compact:async()=>{localStorage.removeItem(CLOUD_SESSION_KEY);}};
  });
  await assert.rejects(ensure(p),/changed or signed out/);assert.equal(calls(),1);assert.equal(await p.evaluate(()=>loadCloudSession()),null);assert.equal((await receiptRows(p)).values[0].status,'pending');
 });
 await run('three laptop tabs renew once while an independent phone keeps its separate same-owner session',async(p,q,context)=>{
  const calls=await backend(context),r=await context.newPage();await r.clock.install({time:new Date('2026-10-17T08:00:00+08:00')});await r.goto(url.href);
  await r.evaluate(()=>{cloudSaveEnabled=false;cloudSessionMaintenancePending=true;});
  const phoneContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let phoneCalls=0;
  try{
   await phoneContext.route('https://**/*',route=>route.fulfill({status:503,body:'Independent synthetic phone; real services blocked'}));
   await phoneContext.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',route=>{
    phoneCalls++;assert.equal(route.request().postDataJSON().refresh_token,'synthetic-phone-refresh');return route.fulfill({json:{access_token:'synthetic-phone-renewed',refresh_token:'synthetic-phone-next',expires_in:3600,user:{id:owner}}});
   });
   const phone=await phoneContext.newPage();await phone.clock.install({time:new Date('2026-10-17T08:00:00+08:00')});await phone.goto(url.href);
   const records=await p.evaluate(()=>getStateForStorage());
   await phone.evaluate(async({records,owner})=>{
    state=rehydrateState(records);applyBoardToState(state,'two');saveState({skipCloud:true});await flushDeviceWrites();
    saveCloudSession({user:{id:owner},access_token:'synthetic-phone-expired',refresh_token:'synthetic-phone-refresh',expires_at:1});cloudSaveEnabled=false;cloudSessionMaintenancePending=true;
   },{records,owner});
   await expire(p);for(const page of [q,r])await page.waitForFunction(()=>JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY)).expires_at===1);
   const tokens=await Promise.all([ensure(p),ensure(q),ensure(r),ensure(phone)]);
   assert.deepEqual(tokens,['synthetic-renewed-access','synthetic-renewed-access','synthetic-renewed-access','synthetic-phone-renewed']);assert.equal(calls(),1);assert.equal(phoneCalls,1);
   await phone.reload();assert.equal(await ensure(phone),'synthetic-phone-renewed');assert.equal(phoneCalls,1);assert.equal(await ensure(p),'synthetic-renewed-access');assert.equal(calls(),1);
   assert.equal(await phone.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY).includes('synthetic-original-refresh')),false);
   assert.equal(await p.evaluate(()=>localStorage.getItem(CLOUD_SESSION_KEY).includes('synthetic-phone')),false);
  }finally{await phoneContext.close();}
 });
 await run('preview cannot renew a real session or open a renewal receipt database',async(p,q,context,requests)=>{
  const preview=new URL(url);preview.searchParams.set('preview','1');await q.goto(preview.href);
  await q.evaluate(()=>{
   window.receiptOpens=0;const open=indexedDB.open;
   indexedDB.open=function(name,...args){if(name.includes('life-os-auth-renewal-v1'))receiptOpens++;return open.call(this,name,...args);};
  });
  requests.length=0;await assert.rejects(ensure(q),/disabled in this preview/);assert.equal(await q.evaluate(()=>receiptOpens),0);assert.equal(requests.length,0);
  assert.equal(await ensure(p),'synthetic-original-access');
 });
 fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(row=>!row.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
