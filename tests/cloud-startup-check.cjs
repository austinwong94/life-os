const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const url=new URL(process.env.TEST_URL || 'http://127.0.0.1:5180/');url.searchParams.set('liveReload','0');
assert(['127.0.0.1','localhost','::1'].includes(url.hostname),'Cloud fault tests require an isolated local server');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-cloud-startup-check',owner='11111111-1111-4111-8111-111111111111',copy=x=>JSON.parse(JSON.stringify(x));
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  async function run(name,fn){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1080,height:1000},timezoneId:'Asia/Kuala_Lumpur'}),errors=[];
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'External services blocked; synthetic records only'}));
    const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
    await p.clock.setFixedTime(new Date('2026-11-02T04:00:00Z'));
    try{await p.goto(url.href);const b=await setup(p,context);await fn(p,b,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function setup(p,context){
    const base=await p.evaluate(async owner=>{
      const diary=makeCard({type:'diary',title:'Sample diary'});diary.id='diary';diary.diaryEntries={'2026-11-02':{thoughts:'Every line is preserved.\nSynthetic writing only.',updatedAt:Date.now()}};
      const planner=makeCard({type:'planner',title:'Sample planner'});planner.id='planner';LifePlanner.add(planner,'2026-11-02','Keep sample task','keep-task',Date.now());LifePlanner.project(planner);
      state.boards=[createBoardRecord({id:'one',name:'SAMPLE - Personal',cards:[diary,planner,makeCard({type:'sidenote',title:'Sample notes'})],archivedCards:[]}),createBoardRecord({id:'two',name:'SAMPLE - Work',cards:[makeCard({type:'quote',title:'Sample work note',description:'Keep this independent board'})],archivedCards:[]})];
      applyBoardToState(state,'one');state.cloudOwnerId=owner;saveState({skipCloud:true});await flushDeviceWrites();render();
      const base=getStateForStorage();saveCloudSession({user:{id:owner,email:'sample@example.invalid'},access_token:'synthetic-only-token',refresh_token:'synthetic-only-refresh',expires_at:Date.now()+3600000});rememberCloudBase(base,owner);return base;
    },owner);
    const b={base,state:copy(base),stamp:'2026-11-02T03:00:00.000Z',requests:[],status:200,empty:false,invalid:false,gate:null,token:'synthetic-only-token'};
    await context.route('https://**supabase.co/rest/v1/user_states**',async route=>{
      const req=route.request();b.requests.push(req.method());assert.equal(req.method(),'GET','Startup must never write records');
      assert.equal(new URL(req.url()).searchParams.get('owner_id'),'eq.'+owner);assert.equal(req.headers().authorization,'Bearer '+b.token);
      const response=b.invalid?{not:'a row array'}:b.empty?[]:[{state:copy(b.state),updated_at:b.stamp}];
      if(b.gate)await b.gate;
      try{await route.fulfill({status:b.status,json:b.status===200?response:{message:'Synthetic cloud outage'}});}catch{}
    });return b;
  }
  const done=p=>p.waitForFunction(()=>typeof cloudStartupCheck!=='undefined' && !cloudStartupCheck.pending && cloudStartupCheck.checkedAt>0);
  const started=p=>p.waitForFunction(()=>typeof cloudStartupCheck!=='undefined' && cloudStartupCheck.pending);
  async function readStarted(b){const until=Date.now()+10000;while(!b.requests.length){if(Date.now()>until)throw Error('Synthetic startup read did not start');await new Promise(r=>setTimeout(r,10));}}
  const sameRecords=(p,b)=>p.evaluate(base=>LifeCloudCopies.equal(LifeCloudCopies.records(base),LifeCloudCopies.records(getStateForStorage())),b.base);
  async function fresh(p){await p.reload();await done(p);}
  await run('fresh signed-in startup performs one read and verifies matching records without any upload',async(p,b)=>{
    await fresh(p);assert.deepEqual(b.requests,['GET']);assert.equal(await sameRecords(p,b),true);
    assert.match(await p.locator('#headerSaveStatus').innerText(),/Cloud copy matches this device/);
    assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'matched');
    await p.locator('#headerSaveStatus').click();const d=p.locator('#dailyDialog');assert.match(await d.innerText(),/Read-only cloud check/);assert.match(await d.innerText(),/No records uploaded or replaced/);
    await p.screenshot({path:out+'/matching-desktop.png',fullPage:false});
    await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await p.screenshot({path:out+'/matching-phone.png',fullPage:false});
  });
  await run('another selected board is navigation, not a cloud record mismatch',async(p,b)=>{
    await p.evaluate(async()=>{switchBoard('two');await flushDeviceWrites();});await fresh(p);
    assert.equal(await p.evaluate(()=>state.activeBoardId),'two');assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'matched');assert.deepEqual(b.requests,['GET']);
  });
  await run('different cloud diary stays different without importing, uploading or replacing either copy',async(p,b)=>{
    b.state.boards[0].cards[0].diaryEntries['2026-11-02'].thoughts='Different cloud writing\nDo not replace';await fresh(p);
    assert.equal(await sameRecords(p,b),true);assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'different');assert.deepEqual(b.requests,['GET']);
    assert.match(await p.locator('#headerSaveStatus').innerText(),/Device and cloud differ/);assert.equal(await p.evaluate(()=>cloudConflictPending),false);
  });
  await run('an absent cloud copy is not treated as permission to insert a new row',async(p,b)=>{
    b.empty=true;await fresh(p);assert.equal(await sameRecords(p,b),true);assert.deepEqual(b.requests,['GET']);assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'missing');
  });
  for(const kind of ['invalid','payload','stamp','owner'])await run('rejects '+kind+' cloud response without changing device records',async(p,b)=>{
    if(kind==='invalid')b.invalid=true;
    if(kind==='payload')b.state={boards:[{id:'bad'}]};
    if(kind==='stamp')b.stamp='not a timestamp';
    if(kind==='owner')b.state.cloudOwnerId='22222222-2222-4222-8222-222222222222';
    await fresh(p);assert.equal(await sameRecords(p,b),true);assert.deepEqual(b.requests,['GET']);assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'failed');
  });
  await run('service failure ends checking, retains sign-in and never schedules a hidden upload',async(p,b)=>{
    b.status=503;await fresh(p);assert.equal(await sameRecords(p,b),true);assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'failed');assert.deepEqual(b.requests,['GET']);
    assert.equal(await p.evaluate(()=>cloudSyncRetry.status().scheduled),false);assert.equal(await p.evaluate(()=>cloudSession.access_token),b.token);
    assert.doesNotMatch(await p.locator('#headerSaveStatus').innerText(),/checking cloud/);
  });
  await run('editing while the read is outstanding cannot receive a stale matching receipt',async(p,b)=>{
    let release;b.gate=new Promise(r=>release=r);await p.reload();await started(p);await readStarted(b);
    await p.evaluate(async()=>{state.cards.find(c=>c.id==='diary').diaryEntries[getTodayKey()].thoughts='Latest local writing\nKeep all words';saveState({skipCloud:true});await flushDeviceWrites();});
    release();await p.waitForFunction(()=>!cloudStartupCheck.pending);assert.notEqual(await p.evaluate(()=>cloudStartupCheck.result),'matched');
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='diary').diaryEntries[getTodayKey()].thoughts),'Latest local writing\nKeep all words');
    assert.doesNotMatch(await p.locator('#headerSaveStatus').innerText(),/Cloud copy matches/);assert(b.requests.every(m=>m==='GET'));
  });
  await run('another save wins over a late read response even when the saved contents still match',async(p,b)=>{
    let release;b.gate=new Promise(r=>release=r);await p.reload();await started(p);await readStarted(b);
    await p.evaluate(()=>{queueCloudSave({silent:true});window.clearTimeout(cloudSaveTimer);setSaveStatus('Saving latest changes','saving');});
    release();await p.waitForFunction(()=>!cloudStartupCheck.pending);assert.equal(await p.locator('#headerSaveStatus').innerText(),'Saving latest changes');assert.notEqual(await p.evaluate(()=>cloudStartupCheck.result),'matched');
  });
  await run('sign-out in another tab cannot be overwritten by a late successful read',async(p,b)=>{
    let release;b.gate=new Promise(r=>release=r);await p.reload();await started(p);await readStarted(b);
    await p.evaluate(async()=>{localStorage.removeItem(CLOUD_SESSION_KEY);await adoptCloudSessionFromAnotherTab();});release();await p.waitForFunction(()=>!cloudStartupCheck.pending);
    assert.match(await p.locator('#headerSaveStatus').innerText(),/Account changed/);assert.equal(await p.evaluate(()=>cloudSession),null);assert.equal(await sameRecords(p,b),true);
  });
  await run('restore pause prevents a startup cloud request',async(p,b)=>{
    await p.evaluate(()=>localStorage.setItem(RESTORE_GUARD_KEY,JSON.stringify({id:'sample-restore',syncPaused:true,restoredAt:Date.now()})));await p.reload();
    await p.waitForFunction(()=>isRestoreSyncPaused());assert.deepEqual(b.requests,[]);assert.match(await p.locator('#headerSaveStatus').innerText(),/cloud paused/);
  });
  await run('wrong local owner refuses the read rather than verifying another account',async(p,b)=>{
    await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem(STORAGE_KEY));s.cloudOwnerId='22222222-2222-4222-8222-222222222222';localStorage.setItem(STORAGE_KEY,JSON.stringify(s));});
    await fresh(p);assert.deepEqual(b.requests,[]);assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'failed');
  });
  await run('expired same-owner session renews once before the read without uploading records',async(p,b,context)=>{
    let renewals=0;await context.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',r=>{
      renewals++;b.token='synthetic-renewed-token';return r.fulfill({json:{access_token:b.token,refresh_token:'synthetic-renewed-refresh',expires_in:3600,user:{id:owner}}});
    });await p.evaluate(()=>saveCloudSession({...cloudSession,expires_at:Date.now()-1}));await fresh(p);
    assert.equal(renewals,1);assert.deepEqual(b.requests,['GET']);assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'matched');assert.equal(await sameRecords(p,b),true);
  });
  await run('stalled startup read reaches its deadline without a write or endless checking',async(p,b)=>{
    let release;b.gate=new Promise(r=>release=r);await p.clock.install({time:new Date('2026-11-02T04:00:00Z')});await p.reload();await started(p);await readStarted(b);
    await p.clock.runFor(15100);await done(p);assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'failed');assert.match(await p.locator('#cloudNote').innerText(),/timed out/);
    release();await p.clock.runFor(1000);assert.deepEqual(b.requests,['GET']);assert.equal(await sameRecords(p,b),true);
  });
  await run('an auth lock held by another tab cannot leave startup checking forever',async(p,b,context)=>{
    const holder=await context.newPage();await holder.clock.setFixedTime(new Date('2026-11-02T04:00:00Z'));await holder.goto(url.href);await done(holder);
    await holder.evaluate(()=>{window.authHeld=false;navigator.locks.request(LifeStorageScope.key('life-os-auth-refresh-v1'),async()=>{authHeld=true;await new Promise(resolve=>window.releaseAuth=resolve);});});
    await holder.waitForFunction(()=>window.authHeld);b.requests.length=0;
    await p.evaluate(()=>saveCloudSession({...cloudSession,expires_at:Date.now()-1}));await p.clock.install({time:new Date('2026-11-02T04:00:00Z')});
    await p.reload();await started(p);await p.clock.runFor(20100);await done(p);
    assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'failed');assert.match(await p.locator('#cloudNote').innerText(),/timed out/);assert.deepEqual(b.requests,[]);assert.equal(await sameRecords(p,b),true);
    await holder.evaluate(()=>window.releaseAuth());
  });
  await run('a late failure cannot hide an unsaved device draft',async(p,b)=>{
    let release;b.status=503;b.gate=new Promise(r=>release=r);await p.reload();await started(p);await readStarted(b);
    await p.evaluate(()=>{lastLocalSaveOk=false;setSaveStatus('Not saved on device - keep this draft','error');});release();await done(p);
    assert.equal(await p.locator('#headerSaveStatus').innerText(),'Not saved on device - keep this draft');assert.equal(await p.evaluate(()=>cloudStartupCheck.result),'superseded');
  });
  await run('preview never reads an existing normal-workspace cloud account',async(p,b)=>{
    const preview=new URL(url);preview.searchParams.set('preview','1');await p.goto(preview.href);assert.equal(await p.evaluate(()=>PREVIEW_MODE),true);assert.deepEqual(b.requests,[]);
  });
  await run('signed-out startup never reads cloud or asks for a new login',async(p,b)=>{
    await p.evaluate(()=>localStorage.removeItem(CLOUD_SESSION_KEY));await p.reload();assert.deepEqual(b.requests,[]);assert.equal(await p.evaluate(()=>cloudSession),null);assert.equal(await p.evaluate(()=>cloudStartupCheck.pending),false);
    assert.doesNotMatch(await p.locator('#headerSaveStatus').innerText(),/checking cloud/);
  });
  await run('two tabs on different boards both verify without uploads or changing the other tab selection',async(p,b,context)=>{
    await fresh(p);const second=await context.newPage();await second.clock.setFixedTime(new Date('2026-11-02T04:00:00Z'));await second.goto(url.href);await done(second);
    await second.evaluate(async()=>{switchBoard('two');await flushDeviceWrites();});await second.reload();await done(second);
    assert.equal(await p.evaluate(()=>state.activeBoardId),'one');assert.equal(await second.evaluate(()=>state.activeBoardId),'two');
    assert.equal(await second.evaluate(()=>cloudStartupCheck.result),'matched');assert(b.requests.length>=3);assert(b.requests.every(m=>m==='GET'));assert.equal(await sameRecords(p,b),true);
  });
  await run('local workspace navigation never invents a cloud upload after a matching read-only check',async(p,b)=>{
    await fresh(p);await p.locator('#todayModeButton').click();await p.evaluate(()=>flushDeviceWrites());assert.equal(await p.locator('#headerSaveStatus').innerText(),'Saved on device');assert.equal(await p.evaluate(()=>cloudSaveTimer),null);assert.equal(await p.evaluate(()=>cloudPushInFlight),false);assert.equal(await sameRecords(p,b),true);assert.deepEqual(b.requests,['GET']);
    for(const width of [390,1080]){await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:out+'/local-navigation-header-'+width+'.png'});}
    await p.locator('#headerSaveStatus').click();const dialog=p.locator('#dailyDialog');assert.match(await dialog.innerText(),/No records uploaded or replaced/);assert.doesNotMatch(await dialog.innerText(),/Cloud save queued/);for(const width of [390,1080]){await p.setViewportSize({width,height:1000});assert(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1));await p.screenshot({path:out+'/local-navigation-'+width+'.png'});}
  });
  await run('queued cloud work is labelled queued and cancellation cannot become a cloud save receipt',async(p,b)=>{
    await fresh(p);await p.clock.install({time:new Date('2026-11-02T04:00:00Z')});await p.evaluate(()=>saveState({quiet:true}));const queued=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));assert.match(await p.locator('#headerSaveStatus').innerText(),/cloud save queued/);assert(await p.evaluate(()=>cloudSaveTimer!==null));assert.equal(await p.evaluate(()=>cloudPushInFlight),false);assert.deepEqual(b.requests,['GET']);await p.locator('#headerSaveStatus').click();assert.match(await p.locator('#dailyDialog').innerText(),/Cloud save queued \(not saved to cloud\)/);await p.locator('#dailyDialog').getByRole('button',{name:'Close',exact:true}).click();
    await p.evaluate(()=>{clearQueuedCloudSave();saveState({touch:false,skipCloud:true});});assert.equal(await p.locator('#headerSaveStatus').innerText(),'Saved on device');assert.equal(await p.evaluate(()=>cloudSaveTimer),null);assert.deepEqual(b.requests,['GET']);assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),queued);
  });
  await run('offline local navigation shows offline rather than syncing and preserves all saved records',async(p,b,context)=>{
    await fresh(p);await context.setOffline(true);await p.locator('#todayModeButton').click();await p.evaluate(()=>flushDeviceWrites());assert.equal(await p.locator('#headerSaveStatus').innerText(),'Offline - saved on device');assert.equal(await p.evaluate(()=>cloudSaveTimer),null);assert.equal(await sameRecords(p,b),true);assert(b.requests.every(method=>method==='GET'));
  });
  await run('local-only workspace navigation on another board cannot cancel a queued save in the first tab or claim it has uploaded',async(p,b,context)=>{
    await fresh(p);const second=await context.newPage();await second.clock.setFixedTime(new Date('2026-11-02T04:00:00Z'));await second.goto(url.href);await done(second);
    await second.evaluate(async()=>{switchBoard('two');await flushDeviceWrites();clearQueuedCloudSave();});const before=await second.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));
    await p.clock.install({time:new Date('2026-11-02T04:00:00Z')});await p.clock.pauseAt(new Date('2026-11-02T04:00:01Z'));await p.evaluate(()=>queueCloudSave({silent:true}));const firstTimer=await p.evaluate(()=>cloudSaveTimer);assert(firstTimer!==null);await second.locator('#todayModeButton').click();await second.evaluate(()=>flushDeviceWrites());
    assert.equal(await p.evaluate(()=>state.activeBoardId),'one');assert.equal(await second.evaluate(()=>state.activeBoardId),'two');assert.equal(await p.evaluate(()=>cloudSaveTimer),firstTimer);assert.equal(await second.evaluate(()=>cloudSaveTimer),null);assert.equal(await second.locator('#headerSaveStatus').innerText(),'Saved on device');assert.deepEqual(await second.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);assert(b.requests.every(method=>method==='GET'));await p.evaluate(()=>clearQueuedCloudSave());
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
