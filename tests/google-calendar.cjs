const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const {workspace}=require('./navigation.cjs');
const root=path.resolve(__dirname,'..'),url=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const live='https://austinwong94.github.io/life-os/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-google-controls';
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await ({chromium,webkit}[process.env.TEST_BROWSER || 'chromium']).launch({headless:true}),results=[];
  async function run(name,action,options={}) {
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Kuala_Lumpur'}),p=await context.newPage(),errors=[],calls=[];
    p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(7000);
    await context.route('https://**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(u.origin==='https://austinwong94.github.io'){
        const file=u.pathname.replace(/^\/life-os\//,'') || 'index.html';
        if(!require('../release-files.json').includes(file))return route.fulfill({status:404,body:'Not found'});
        let body=fs.readFileSync(path.join(root,file),'utf8');
        if(file==='google-calendar.js' && options.integrationReady!==false)body=body.replace('const GOOGLE_CALENDAR_SYNC_READY=false;','const GOOGLE_CALENDAR_SYNC_READY=true;');
        return route.fulfill({status:200,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body});
      }
      if(u.pathname==='/rest/v1/user_states')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{state:await p.evaluate(()=>getStateForStorage()),updated_at:'2026-10-11T03:00:00.000Z'}])});
      if(u.pathname==='/functions/v1/google-calendar'){
        const data=req.postDataJSON();calls.push(data);
        const result=options.backend?await options.backend(data,p):{configured:true,connected:false,calendarReady:false,boardIds:[],lastSyncAt:null};
        return route.fulfill({status:result.httpStatus || 200,contentType:'application/json',body:JSON.stringify(result),headers:{'Access-Control-Allow-Origin':'https://austinwong94.github.io'}});
      }
      return route.fulfill({status:503,body:'Synthetic isolated test'});
    });
    try {
      await p.goto(options.local?url+'?preview=1&liveReload=0':live+'?liveReload=0');await p.waitForFunction(()=>typeof state!=='undefined');
      await p.evaluate(async()=>{
        const card=makeCard({type:'planner',title:'Test planner'});card.id='google-source';LifePlanner.add(card,getTodayKey(),'Sample walk','google-task');
        state.cards=[card];state.archivedCards=[];saveState({skipCloud:true});await flushDeviceWrites();
        const session={user:{id:'test-user'},access_token:'synthetic-only',expires_at:Date.now()+3600000};
        // Live controls must use a retained sign-in, not bypass the guard that
        // rejects credentials removed by another tab. Preview never saves it.
        if(PREVIEW_MODE)cloudSession=session;else saveCloudSession(session);
        cloudSaveEnabled=false;cloudSessionMaintenancePending=true;
      });
      await workspace(p,'calendar');await action(p,calls);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(e){results.push({name,pass:false,error:e.stack});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Published release defers Google setup and makes no integration requests, including after cloud saving',async(p,calls)=>{
    const before=await p.evaluate(()=>JSON.stringify(state.cards));await p.locator('.google-calendar-panel summary').click();
    assert.match(await p.locator('.google-calendar-panel').innerText(),/setup pending/);
    assert.equal(await p.getByRole('button',{name:'Check connection',exact:true}).count(),0);
    assert.equal(await p.getByRole('button',{name:'Connect Google',exact:true}).count(),0);
    await p.evaluate(async()=>{await googleCalendarAutoSync();await googleCalendarAction('status');saveState();await flushDeviceWrites();});
    assert.deepEqual(calls,[]);assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)),before);
  },{integrationReady:false});
  await run('Preview cannot access Google or expose connection buttons',async(p,calls)=>{
    await p.locator('.google-calendar-panel summary').click();assert.equal(await p.getByRole('button',{name:'Connect Google',exact:true}).count(),0);
    await p.evaluate(()=>googleCalendarAction('status'));assert.equal(calls.length,0);
  },{local:true});
  await run('Setup guide remains available on phone without needing a deployed backend',async(p,calls)=>{
    await p.locator('.google-calendar-panel summary').click();await p.getByRole('button',{name:'Setup guide',exact:true}).click();
    await p.getByRole('dialog').getByText('https://shrmhjulhfuodtrsqhpu.supabase.co/functions/v1/google-calendar/callback',{exact:true}).waitFor();
    assert.equal(await p.getByRole('link',{name:'Google Cloud Console',exact:true}).getAttribute('href'),'https://console.cloud.google.com/');assert.equal(calls.length,0);
    const overflow=await p.locator('#dailyDialog').evaluate(e=>e.scrollWidth-e.clientWidth);assert.ok(overflow<=1);
  },{local:true});
  await run('Real-site controls probe setup without modifying boards or redirecting automatically',async(p,calls)=>{
    const before=await p.evaluate(()=>JSON.stringify(state.cards));await p.locator('.google-calendar-panel summary').click();await p.getByRole('button',{name:'Check connection',exact:true}).click();
    await p.getByRole('button',{name:'Connect Google',exact:true}).waitFor();assert.deepEqual(calls.map(c=>c.action),['status']);assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)),before);
  });
  await run('Missing backend reports an actionable error without deleting information',async(p,calls)=>{
    await p.locator('.google-calendar-panel summary').click();await p.getByRole('button',{name:'Check connection',exact:true}).click();
    await p.getByText('Google connection backend is not deployed yet.',{exact:true}).waitFor();assert.equal(calls.length,1);assert.equal(await p.evaluate(()=>state.cards[0].plannerTasks.length),1);
  },{backend:()=>({httpStatus:404,error:'Missing'})});
  await run('First sync requires review, keeps source records and sends only a cloud receipt',async(p,calls)=>{
    const before=await p.evaluate(()=>JSON.stringify(state.cards));await p.locator('.google-calendar-panel summary').click();await p.getByRole('button',{name:'Check connection',exact:true}).click();
    await p.getByRole('button',{name:'Review & sync board',exact:true}).click();await p.getByRole('dialog').getByText('Sample walk',{exact:true}).waitFor();
    await p.getByRole('button',{name:'Sync & enable this board',exact:true}).click();await p.getByText('1 added, 0 updated, 0 unchanged. 0 waiting. 0 previous events retained.',{exact:true}).waitFor();
    const sync=calls.find(c=>c.action==='sync');assert.ok(sync.boardId);assert.equal(sync.cloudVersion,'2026-10-11T03:00:00.000Z');assert.equal(sync.enableAuto,true);assert.ok(!sync.items && !sync.state && !sync.tokens);
    assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)),before);
    await p.screenshot({path:out+'/google-connected-phone.png',fullPage:true});
  },{backend:async(data,p)=>data.action==='status'?{configured:true,connected:true,calendarReady:true,boardIds:[],lastSyncAt:null}:data.action==='preview'?{count:1,items:[{id:'one',title:'Sample walk',date:'2026-10-11'}]}:{created:1,updated:0,unchanged:0,remaining:0,retained:0,conflicts:[]}});
  await run('Review from a different board cannot sync the current board accidentally',async(p,calls)=>{
    await p.evaluate(()=>googleCalendarAction('sync','another-board'));assert.equal(calls.length,0);await p.getByText('The active board changed. Review its Google sync before continuing.',{exact:true}).waitFor();
  });
  await run('Denied, incomplete or cancelled consent cannot navigate to an arbitrary site',async(p,calls)=>{
    p.on('dialog',d=>d.accept());await p.evaluate(()=>googleCalendarAction('connect'));assert.equal(p.url(),live+'?liveReload=0');assert.deepEqual(calls.map(c=>c.action),['connect']);
    await p.getByText('Unexpected authorization address. Connection stopped.',{exact:true}).waitFor();
  },{backend:()=>({url:'https://attacker.example/steal'})});
  await run('Automatic sync needs board enrolment and never sends private record payloads',async(p,calls)=>{
    const before=await p.evaluate(()=>JSON.stringify(state.cards));await p.evaluate(()=>googleCalendarAutoSync());
    const sync=calls.find(c=>c.action==='sync');assert.ok(sync);assert.equal(sync.enableAuto,undefined);assert.deepEqual(Object.keys(sync).sort(),['action','boardId','cloudVersion']);
    assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)),before);
  },{backend:async(data,p)=>data.action==='status'?{configured:true,connected:true,calendarReady:true,boardIds:[await p.evaluate(()=>state.activeBoardId)],lastSyncAt:null}:{created:0,updated:0,unchanged:1,remaining:0,retained:0,conflicts:[]}});
  await run('Pausing stays available without disrupting an unfinished activity draft',async(p,calls)=>{
    await p.getByRole('button',{name:'Add activity',exact:true}).click();await p.getByLabel('Activity name',{exact:true}).fill('Unsaved activity');
    await p.evaluate(()=>googleCalendarAction('pause'));
    assert.deepEqual(calls.map(c=>c.action),['pause','status']);assert.equal(calls[0].cloudVersion,undefined);assert.equal(await p.getByLabel('Activity name',{exact:true}).inputValue(),'Unsaved activity');
    assert.equal(await p.evaluate(()=>planningSession().activityDraft.title),'Unsaved activity');
  });
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
