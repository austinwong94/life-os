const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
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
   saveCloudSession(cloudSession);
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
  const c=await context(),a=await fresh(c),b=await fresh(c);let calls=0;
  await c.route('https://**supabase.co/auth/v1/token?grant_type=refresh_token',async r=>{
   calls++;assert.equal(r.request().postDataJSON().refresh_token,'synthetic-refresh-old');await new Promise(resolve=>setTimeout(resolve,75));
   await r.fulfill({json:{access_token:'synthetic-renewed',refresh_token:'synthetic-refresh-new',expires_in:3600,user:{id:user}}});
  });
  for(const p of [a,b])await p.evaluate(user=>{state.cloudOwnerId=user;saveState({skipCloud:true});saveCloudSession({access_token:'synthetic-expired',refresh_token:'synthetic-refresh-old',expires_at:1,user:{id:user}});cloudSaveEnabled=false;},user);
  await a.evaluate(()=>flushDeviceWrites());await b.evaluate(()=>flushDeviceWrites());
  const before=await a.evaluate(()=>JSON.stringify(getStateForStorage().boards));
  const values=await Promise.all([a,b,a,b].map(p=>p.evaluate(async()=>{const s=await ensureCloudSession();return s.access_token;})));
  assert.deepEqual(values,Array(4).fill('synthetic-renewed'));assert.equal(calls,1);
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
   return {token:loadCloudSession().access_token,refresh:loadCloudSession().refresh_token,stamp:loadCloudSession().cloud_updated_at};
  },user);
  assert.equal(result.token,'synthetic-current');assert.equal(result.refresh,'synthetic-current-refresh');assert.equal(result.stamp,'2026-10-14T00:00:00.000Z');
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
 async function missingHistory(context) {
  const f=await setup(context,{planner:true});
  f.backend.state.boards[0].cards.find(c=>c.type==='diary').diaryEntries={'2026-05-19':{thoughts:'Earlier cloud-only writing',sentence:'',feeling:'',updatedAt:10}};
  const old=clone(f.backend.state);
  await f.a.evaluate(async()=>{
   cloudMergeBase=null;localStorage.removeItem(CLOUD_BASE_KEY);
   updateDiaryEntry(state.cards.find(c=>c.type==='diary'),'2026-10-13',{thoughts:'Latest full diary.\nKeep every character.'});
   const c=getPlannerSourceCards().find(c=>c.id==='sync-review-source');LifePlanner.change(c,'sync-review-task',{title:'Current renamed task',done:true,completedOn:'2026-10-13',archivedAt:2000});LifePlanner.project(c);
   saveState({skipCloud:true});await flushDeviceWrites();
   window.copySaveFinished=false;pushCloudState({manual:true}).then(()=>window.copySaveFinished=true);
  });
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
 fs.writeFileSync(output+'/sync-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
