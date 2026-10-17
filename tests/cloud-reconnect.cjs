const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const url=new URL(process.env.TEST_URL || 'http://127.0.0.1:5180/');url.searchParams.set('liveReload','0');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-cloud-reconnect',owner='11111111-1111-4111-8111-111111111111',copy=value=>JSON.parse(JSON.stringify(value));fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'}),errors=[];
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'External services blocked; synthetic cloud only'}));
    const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));
    await p.clock.install({time:new Date('2026-10-16T04:00:00Z')});
    try{await p.goto(url.href);const fixture=await setup(p);await fn(p,fixture,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function setup(p){
    const base=await p.evaluate(async owner=>{
      const diary=makeCard({type:'diary',title:'Private diary',category:'Personal'});diary.id='diary';diary.diaryEntries={'2026-10-16':{thoughts:'Original diary\nKeep every line',updatedAt:Date.now()}};
      const planner=makeCard({type:'planner',title:'Original planner',category:'Personal'});planner.id='planner';LifePlanner.add(planner,'2026-10-15','Archive this task','archive-me',1000);LifePlanner.add(planner,'2026-10-17','Keep this task','keep-me',1000);LifePlanner.project(planner);
      state.boards=[createBoardRecord({id:'one',name:'Personal',cards:[diary,planner,makeCard({type:'sidenote',title:'My notes'})],archivedCards:[]}),createBoardRecord({id:'two',name:'Work',cards:[makeCard({type:'quote',title:'Keep independent record',description:'Original work note\nSecond line'})],archivedCards:[]})];
      applyBoardToState(state,'one');state.cloudOwnerId=owner;saveState({skipCloud:true});await flushDeviceWrites();render();return getStateForStorage();
    },owner);
    const backend={state:copy(base),updated_at:'2026-10-16T03:00:00.000Z',reads:0,writes:0,readStatus:0,failReads:0,losePatch:false,readGate:null,patchGate:null,requests:[],token:'synthetic-only-token'};
    await p.route('https://**supabase.co/rest/v1/user_states**',async route=>{
      const req=route.request(),query=new URL(req.url());backend.requests.push({method:req.method(),owner:query.searchParams.get('owner_id')});
      assert.equal(query.searchParams.get('owner_id'),'eq.'+owner);assert.equal(req.headers().authorization,'Bearer '+backend.token);
      if(req.method()==='GET'){
        backend.reads++;
        if(backend.readGate){const gate=backend.readGate;backend.readGate=null;await gate;try{await route.fulfill({json:[{state:copy(backend.state),updated_at:backend.updated_at}]});}catch{}return;}
        if(backend.readStatus || backend.failReads-->0){await route.fulfill({status:backend.readStatus || 503,json:{message:'Synthetic service failure'}});return;}
        if(backend.invalidRead){await route.fulfill({json:{unexpected:'not a row list'}});return;}
        await route.fulfill({json:[{state:copy(backend.state),updated_at:backend.updated_at}]});return;
      }
      assert.equal(req.method(),'PATCH');
      if(query.searchParams.get('updated_at')!=='eq.'+backend.updated_at){await route.fulfill({json:[]});return;}
      const body=req.postDataJSON();backend.state=copy(body.state);backend.updated_at=body.updated_at;backend.writes++;
      if(backend.patchGate){const gate=backend.patchGate;backend.patchGate=null;await gate;try{await route.fulfill({json:[{updated_at:backend.updated_at}]});}catch{}return;}
      if(backend.losePatch){backend.losePatch=false;await route.abort('failed');return;}
      await route.fulfill({json:[{updated_at:backend.updated_at}]});
    });
    await p.evaluate(({owner,base,stamp})=>{
      saveCloudSession({user:{id:owner,email:'synthetic@example.invalid'},access_token:'synthetic-only-token',refresh_token:'synthetic-only-refresh',expires_at:Date.now()+3600000,cloud_updated_at:stamp});
      cloudMergeBase={ownerId:owner,state:JSON.parse(JSON.stringify(base))};rememberCloudBase(base,owner);cloudSaveEnabled=true;
    },{owner,base,stamp:backend.updated_at});
    return backend;
  }
  async function edit(p,text='Complete latest diary\nMy second line'){
    await p.locator('.diary-thoughts').fill(text);await p.evaluate(async()=>{window.clearTimeout(cloudSaveTimer);await flushDeviceWrites();});
  }
  const retryReady=p=>p.waitForFunction(()=>cloudSyncRetry.status().scheduled && !cloudPushInFlight);
  const verified=p=>p.waitForFunction(()=>!cloudPushInFlight && /^Cloud (saved and readback verified|copy verified current)/.test(cloudStatusMessage));
  async function waitForBackend(ready){const deadline=Date.now()+10000;while(!ready()){if(Date.now()>deadline)throw new Error('Synthetic request did not reach the backend');await new Promise(resolve=>setTimeout(resolve,10));}}
  const thoughts=backend=>backend.state.boards[0].cards.find(c=>c.id==='diary').diaryEntries['2026-10-16'].thoughts;
  await run('temporary renewal failure resumes the pending cloud save using the renewed same-owner session',async(p,b)=>{
    let authCalls=0;
    await p.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',route=>{
      if(++authCalls===1)return route.fulfill({status:503,json:{msg:'Synthetic renewal outage'}});
      b.token='synthetic-renewed-token';return route.fulfill({json:{access_token:b.token,refresh_token:'synthetic-renewed-refresh',expires_in:3600,user:{id:owner}}});
    });
    await p.evaluate(()=>saveCloudSession({...cloudSession,expires_at:Date.now()-1}));await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);
    assert.equal(authCalls,1);assert.equal(b.requests.length,0);await p.clock.runFor(5100);await verified(p);
    assert.equal(authCalls,2);assert.equal(b.writes,1);assert.equal(thoughts(b),'Complete latest diary\nMy second line');assert.equal(await p.evaluate(()=>cloudSession.access_token),b.token);
  });
  await run('offline diary, notes and archive persist locally, then reconnect verifies all latest records without another edit',async(p,b,context)=>{
    await context.setOffline(true);await p.waitForFunction(()=>navigator.onLine===false);await edit(p,'Offline complete diary\nNothing dropped');
    await p.evaluate(async()=>{addSideNote(state.cards.find(c=>c.type==='sidenote'),getTodayKey(),'Offline note\nAll lines');archivePlannerTask(getPlannerSourceItems().find(i=>i.taskId==='archive-me'));await flushDeviceWrites();});
    assert.equal(b.requests.length,0);assert.equal(await p.evaluate(()=>lastLocalSaveOk),true);
    await context.setOffline(false);await verified(p);
    assert.equal(thoughts(b),'Offline complete diary\nNothing dropped');assert.equal(b.writes,1);
    const planner=b.state.boards[0].cards.find(c=>c.id==='planner');assert(planner.plannerTasks.find(t=>t.id==='archive-me').archivedAt);assert.equal(planner.plannerTasks.find(t=>t.id==='keep-me').done,false);
    assert(JSON.stringify(b.state).includes('Offline note\\nAll lines'));assert.equal(b.state.boards[1].cards[0].description,'Original work note\nSecond line');
  });
  await run('temporary service failure retries without a new edit and includes writing added while waiting',async(p,b)=>{
    b.failReads=1;await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);
    assert.equal(b.writes,0);assert.match(await p.locator('#headerSaveStatus').innerText(),/retrying cloud/);
    await edit(p,'Latest writing while waiting\nStill all here');await p.clock.runFor(5100);await verified(p);
    assert.equal(thoughts(b),'Latest writing while waiting\nStill all here');assert.equal(b.writes,1);assert.equal(await p.evaluate(()=>cloudSyncRetry.status().attempt),0);
  });
  await run('lost upload response is read back before retry and does not duplicate a task or write the same snapshot again',async(p,b)=>{
    b.losePatch=true;await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);assert.equal(b.writes,1);
    await p.clock.runFor(5100);await verified(p);assert.equal(b.writes,1);assert.equal(thoughts(b),'Complete latest diary\nMy second line');
    assert.deepEqual(b.state.boards[0].cards.find(c=>c.id==='planner').plannerTasks.map(t=>t.id).sort(),['archive-me','keep-me']);
  });
  await run('retry budget stops after three retries and a later explicit save recovers without another login',async(p,b)=>{
    b.readStatus=503;await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);
    for(const ms of [5100,15100,45100]){await p.clock.runFor(ms);await p.waitForFunction(()=>!cloudPushInFlight);}
    assert.equal(b.reads,4);assert.equal(await p.evaluate(()=>cloudSyncRetry.status().scheduled),false);assert.match(await p.locator('#cloudNote').innerText(),/Automatic retries stopped/);
    await p.clock.runFor(120000);assert.equal(b.reads,4);assert.equal(await p.evaluate(()=>cloudSession.access_token),'synthetic-only-token');
    b.readStatus=0;await p.evaluate(()=>pushCloudState({manual:true}));await verified(p);assert.equal(b.writes,1);assert.equal(thoughts(b),'Complete latest diary\nMy second line');
  });
  await run('permission refusal does not trigger automatic retry or remove the complete device copy',async(p,b)=>{
    b.readStatus=403;await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));assert.equal(b.reads,1);assert.equal(await p.evaluate(()=>cloudSyncRetry.status().scheduled),false);
    await p.clock.runFor(120000);assert.equal(b.reads,1);assert.equal(b.writes,0);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='diary').diaryEntries[getTodayKey()].thoughts),'Complete latest diary\nMy second line');
  });
  await run('an unexpected successful response cannot be mistaken for an empty cloud or trigger an upload',async(p,b)=>{
    b.invalidRead=true;await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));
    assert.equal(b.requests.length,1);assert.equal(b.writes,0);assert.match(await p.locator('#cloudNote').innerText(),/could not be validated/);
    await p.clock.runFor(120000);assert.equal(b.requests.length,1);assert.equal(await p.evaluate(()=>cloudSyncRetry.status().scheduled),false);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='diary').diaryEntries[getTodayKey()].thoughts),'Complete latest diary\nMy second line');
  });
  await run('a real same-field change discovered on retry pauses instead of overwriting either diary version',async(p,b)=>{
    b.failReads=1;await edit(p,'My local full thoughts\nLocal second line');await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);
    b.state.boards[0].cards.find(c=>c.id==='diary').diaryEntries['2026-10-16'].thoughts='Other device full thoughts\nRemote second line';b.updated_at='2026-10-16T04:00:01.000Z';
    await p.clock.runFor(5100);await p.waitForFunction(()=>cloudConflictPending && !cloudPushInFlight);assert.equal(b.writes,0);
    assert.equal(thoughts(b),'Other device full thoughts\nRemote second line');
    const retained=await p.evaluate(()=>JSON.stringify({state,backups:readLocalJsonValue(CLOUD_RECOVERY_KEY,[])}));assert(retained.includes('My local full thoughts\\nLocal second line'));assert(retained.includes('Other device full thoughts\\nRemote second line'));
    const reads=b.reads;await p.clock.runFor(120000);assert.equal(b.reads,reads);assert.equal(await p.evaluate(()=>cloudSyncRetry.status().scheduled),false);
  });
  await run('queued retry stops for reauthentication or an owner change instead of uploading to another owner',async(p,b)=>{
    b.failReads=1;await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);
    await p.evaluate(()=>cloudSessionReauthRequired=true);await p.clock.runFor(5100);assert.equal(b.requests.length,1);
    b.failReads=1;await p.evaluate(()=>{cloudSessionReauthRequired=false;return pushCloudState({manual:true});});await retryReady(p);
    const before=await p.evaluate(()=>JSON.stringify(getStateForStorage().boards));
    await p.evaluate(()=>saveCloudSession({user:{id:'22222222-2222-4222-8222-222222222222'},access_token:'other-synthetic-token',expires_at:Date.now()+3600000}));
    await p.clock.runFor(5100);assert.equal(b.requests.length,2);assert.equal(b.writes,0);assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage().boards)),before);
  });
  await run('reviewed restore cancels retry and the uncertain-write receipt instead of uploading the restored copy automatically',async(p,b)=>{
    b.losePatch=true;await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);
    assert(await p.evaluate(()=>Boolean(unverifiedCloudWrite)));
    await p.evaluate(async()=>{
      const restored=rehydrateState(getStateForStorage());restored.boards[0].cards.find(c=>c.id==='diary').diaryEntries[getTodayKey()].thoughts='Deliberately restored diary\nKeep this chosen version';
      await applyReviewedRestore(restored,restoreComparable(localStorage.getItem(STORAGE_KEY)),'backup');
    });
    assert.equal(await p.evaluate(()=>unverifiedCloudWrite),null);assert.equal(await p.evaluate(()=>cloudSyncRetry.status().scheduled),false);
    const requests=b.requests.length;await p.clock.runFor(120000);assert.equal(b.requests.length,requests);assert.equal(b.writes,1);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='diary').diaryEntries[getTodayKey()].thoughts),'Deliberately restored diary\nKeep this chosen version');assert(await p.evaluate(()=>isRestoreSyncPaused()));
  });
  await run('a stalled cloud read times out, releases its lock and retries the latest writing',async(p,b)=>{
    let release;b.readGate=new Promise(resolve=>release=resolve);await edit(p);
    await p.evaluate(()=>{window.pushFinished=false;pushCloudState({manual:true}).then(()=>window.pushFinished=true);});
    await waitForBackend(()=>b.reads===1);await p.clock.runFor(15100);await p.waitForFunction(()=>window.pushFinished);await retryReady(p);
    assert.match(await p.locator('#cloudNote').innerText(),/timed out/);assert.equal(await p.evaluate(()=>LifeDeviceStore.cloudLocked(()=>true)),true);
    release();await p.clock.runFor(5100);await verified(p);assert.equal(b.writes,1);assert.equal(thoughts(b),'Complete latest diary\nMy second line');
  });
  await run('a stalled accepted upload keeps later writing and rechecks cloud before saving that later version',async(p,b)=>{
    let release;b.patchGate=new Promise(resolve=>release=resolve);await edit(p);
    await p.evaluate(()=>{window.pushFinished=false;pushCloudState({manual:true}).then(()=>window.pushFinished=true);});await waitForBackend(()=>b.writes===1);
    await edit(p,'Later writing during uncertain upload\nKeep the full final version');
    await p.clock.runFor(60100);await p.waitForFunction(()=>window.pushFinished);await retryReady(p);assert.match(await p.locator('#cloudNote').innerText(),/timed out/);
    release();await p.clock.runFor(5100);await verified(p);
    assert.equal(thoughts(b),'Later writing during uncertain upload\nKeep the full final version');assert.equal(b.writes,2);
    assert.equal(b.state.boards[0].cards.find(c=>c.id==='planner').plannerTasks.length,2);assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);
  });
  await run('an uncertain upload is not acknowledged when the returned server revision no longer matches',async(p,b)=>{
    b.losePatch=true;await edit(p,'First uploaded complete version\nOriginal second line');await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);
    await edit(p,'Later local complete version\nLocal second line');b.updated_at='2026-10-16T04:05:00.000Z';
    await p.clock.runFor(5100);await p.waitForFunction(()=>cloudConflictPending && !cloudPushInFlight);
    assert.equal(b.writes,1);assert.equal(thoughts(b),'First uploaded complete version\nOriginal second line');
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='diary').diaryEntries[getTodayKey()].thoughts),'Later local complete version\nLocal second line');
    assert(await p.evaluate(()=>state.syncConflicts.length>0));assert.equal(await p.evaluate(()=>cloudSyncRetry.status().scheduled),false);
  });
  await run('retry merges an independent board change without mixing records or duplicating canonical tasks',async(p,b)=>{
    b.failReads=1;await edit(p);await p.evaluate(()=>pushCloudState({manual:true}));await retryReady(p);
    b.state.boards[1].cards[0].description='New work note on another device\nKept separate';b.updated_at='2026-10-16T04:00:01.000Z';
    await p.clock.runFor(5100);await verified(p);assert.equal(thoughts(b),'Complete latest diary\nMy second line');assert.equal(b.state.boards[1].cards[0].description,'New work note on another device\nKept separate');
    assert.equal(b.state.boards[0].cards.find(c=>c.id==='planner').plannerTasks.length,2);assert.equal(await p.evaluate(()=>cloudConflictPending),false);
  });
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
