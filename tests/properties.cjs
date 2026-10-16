const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{buildRelease}=require('../build-release.cjs'),browsers=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.TEST_OUTPUT || '/private/tmp/life-os-properties-20261017',engine=process.env.TEST_BROWSER || 'chromium';fs.mkdirSync(out,{recursive:true});
const artifact=path.join(out,'candidate');buildRelease({output:artifact});
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const base={version:3,bookings:[{id:'synthetic-booking',guest:'Synthetic Guest',arrival:'2026-10-20',nights:2,revenue:1200,paid:300,channel:'Direct',customHistory:{retained:'Original future field'}}],documents:[{id:'synthetic-invoice',bookingId:'synthetic-booking',type:'Invoice',code:'ORIGINAL-2025-INVOICE-18',issuer:'Sunrise Villa Ventures',guestName:'Synthetic Guest',date:'2026-10-01',checkIn:'2026-10-20',checkOut:'2026-10-22',nights:2,accommodationFee:1200,securityDeposit:500,customAudit:{retained:'Original document history'}}],taxPlan:{expenses:[],assets:[],earnings:[],earningsDocs:[],lhdnDocs:[]},profitData:{},appSettings:{activeVilla:'Sunrise'},futureRoot:{retained:'Unknown root field'}};
const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:owner,exp:2000000000})).toString('base64url'),'test-signature'].join('.');
const harness=`<!doctype html><html><body style="margin:0"><iframe id="propertyOperationsFrame" style="width:100%;height:100vh;border:0" src="property-operations.html"></iframe><script>window.LifePropertiesHost={url:'https://shrmhjulhfuodtrsqhpu.supabase.co',key:'synthetic-key',accepts:w=>document.querySelector('iframe').contentWindow===w,session:async()=>({access_token:${JSON.stringify(token)},user:{id:${JSON.stringify(owner)},email:'synthetic@example.invalid'}}),account(){}};</script></body></html>`;
(async()=>{
  const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://test').pathname.slice(1);if(name==='harness.html'){res.setHeader('content-type','text/html');return res.end(harness);}const file=name || 'index.html';if(!/^[a-z0-9-]+\.(html|js|css|json)$/.test(file) || !fs.existsSync(path.join(artifact,file)))return res.writeHead(404).end();res.setHeader('content-type',({'html':'text/html','js':'text/javascript','css':'text/css','json':'application/json'})[file.split('.').pop()]);res.end(fs.readFileSync(path.join(artifact,file)));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/',browser=await browsers[engine].launch({headless:true}),results=[];
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kuala_Lumpur'}),page=await context.newPage(),errors=[],logs=[];await page.clock.install({time:new Date('2026-10-17T08:00:00+08:00')});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});
    let row={id,user_id:owner,updated_at:'2026-10-16T00:00:00+00:00',data:structuredClone(base)},writes=0,stale=false;
    await context.route('https://**/*',async route=>{
      const req=route.request(),u=new URL(req.url());if(!u.pathname.startsWith('/rest/v1/'))return route.fulfill({status:503,body:'Synthetic tests only'});
      const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'*'};
      if(req.method()==='OPTIONS')return route.fulfill({status:200,headers,body:''});
      let data=[];
      if(u.pathname.endsWith('/property_workspaces')){
        if(req.method()==='PATCH'){
          if(!stale){row={...row,...req.postDataJSON(),updated_at:'2026-10-17T00:00:'+String(++writes).padStart(2,'0')+'+00:00'};data=row;}else data=null;
        }else data=[row];
      }
      return route.fulfill({status:200,headers,body:JSON.stringify(data)});
    });
    try{await fn({page,context,url,getRow:()=>row,writes:()=>writes,makeStale:()=>{stale=true;}});assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,errors,logs});await page.screenshot({path:path.join(out,'failure-'+results.length+'.png'),fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  const open=async page=>{await page.goto(url+'harness.html');const frame=page.frameLocator('#propertyOperationsFrame');await frame.locator('#appShell:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations);return frame;};
  const booking=async frame=>{await frame.locator('[data-view="bookings"]').click();await frame.locator('[data-workspace-booking="synthetic-booking"]:visible').first().click();};
  const edit=async(frame,guest)=>{await booking(frame);await frame.locator('[data-booking-section="overview"]').click();await frame.getByRole('button',{name:'Edit booking',exact:true}).click();await frame.locator('#guestInput').fill(guest);await frame.locator('#saveBooking').click();};
  await run('properties uses shared Life OS session; no original project or main workspace writes',async({page})=>{
    const calls=[];page.on('request',r=>calls.push(r.url()));const frame=await open(page);
    assert.equal(await frame.locator('#appShell').isVisible(),true);assert(calls.some(s=>s.includes('/property_workspaces')));assert(!calls.some(s=>s.includes('nigzeyamrzrozftbujmm') || s.includes('/user_states')));
    assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentWindow.PropertyOperations.export().bookings[0].customHistory.retained),'Original future field');
  });
  await run('booking edits save, preserve unknown fields and reload from the separate repository',async({page,getRow,writes})=>{
    const frame=await open(page);await edit(frame,'Updated synthetic guest');
    await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations.pending()===false);assert(writes()>0);assert.equal(getRow().data.bookings[0].guest,'Updated synthetic guest');assert.deepEqual(getRow().data.futureRoot,base.futureRoot);
    await page.reload();await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations?.export().bookings[0].guest==='Updated synthetic guest');
  });
  await run('a stale browser cannot overwrite newer property data',async({page,getRow,makeStale})=>{
    const frame=await open(page);makeStale();await edit(frame,'Pending conflicting draft');await page.waitForTimeout(1200);
    assert.equal(getRow().data.bookings[0].guest,'Synthetic Guest');assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentWindow.PropertyOperations.export().bookings[0].guest),'Pending conflicting draft');assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentWindow.PropertyOperations.pending()),true);
  });
  await run('desktop, portrait and phone operations stay within the viewport',async({page})=>{
    await open(page);for(const width of [1440,1080,768,390,320]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);const sizes=await page.evaluate(()=>{const w=document.querySelector('iframe').contentWindow;return {page:document.documentElement.scrollWidth,width:innerWidth,child:w.document.documentElement.scrollWidth,childWidth:w.innerWidth};});assert(sizes.page<=sizes.width+1);assert(sizes.child<=sizes.childWidth+1,JSON.stringify(sizes));await page.screenshot({path:path.join(out,'properties-'+width+'.png'),fullPage:true});}
  });
  await run('direct operations access is refused without an authorized parent',async({page})=>{const requests=[];page.on('request',r=>{if(r.url().includes('/rest/v1/'))requests.push(r.url());});await page.goto(url+'property-operations.html');await page.getByRole('alert').waitFor();assert.equal(await page.locator('#appShell').isVisible(),false);assert.deepEqual(requests,[]);});
  await run('payments are recorded once, persist through reload and retain historical receipts',async({page,getRow})=>{
    const frame=await open(page);await booking(frame);await frame.locator('[data-booking-section="payments"]').click();await frame.getByLabel('Amount (RM)',{exact:true}).fill('125.45');await frame.getByLabel('Reference',{exact:true}).fill('SYNTHETIC-REF-1');await frame.getByRole('button',{name:'Record payment',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations.pending()===false);assert.equal(getRow().data.bookings[0].paid,425.45);const payments=getRow().data.bookings[0].paymentLedger;assert.equal(payments.filter(p=>p.kind==='payment').length,1);
    assert.equal(getRow().data.documents[0].code,base.documents[0].code);assert.deepEqual(getRow().data.documents[0].customAudit,base.documents[0].customAudit);
    await frame.getByLabel('Amount (RM)',{exact:true}).fill('125.45');await frame.getByLabel('Reference',{exact:true}).fill('SYNTHETIC-REF-1');await frame.getByRole('button',{name:'Record payment',exact:true}).click();await frame.locator('#workspacePaymentStatus').filter({hasText:'already recorded'}).waitFor();assert.equal(getRow().data.bookings[0].paid,425.45);
    await page.reload();await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations?.export().bookings[0].paid===425.45);
  });
  await run('Life OS navigation exposes Properties on desktop and mobile without accessing production',async({page})=>{
    await page.goto(url+'?preview=1&liveReload=0');await page.locator('#propertiesModeButton').click();await page.getByRole('heading',{name:'Properties',exact:true}).waitFor();assert.equal(await page.locator('iframe#propertyOperationsFrame').count(),0);
    await page.setViewportSize({width:390,height:844});await page.locator('#mobileMoreButton').click();await page.locator('#dailyDialog').getByRole('button',{name:'Properties',exact:true}).click();assert.equal(await page.locator('#mobileMoreButton').getAttribute('aria-pressed'),'true');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  });
  await run('editing a saved invoice keeps its original code, audit fields and booking payment total',async({page,getRow})=>{
    const frame=await open(page);await frame.locator('[data-view="documents"]').click();await frame.locator('[data-document-workspace="archive"]').click();await frame.locator('[data-open-document="synthetic-invoice"]').click();await frame.locator('#docRemarks').fill('Complete document note\nSecond line retained');await frame.locator('#saveDocument').click();await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations.pending()===false);
    assert.equal(getRow().data.documents.length,1);assert.equal(getRow().data.documents[0].code,base.documents[0].code);assert.deepEqual(getRow().data.documents[0].customAudit,base.documents[0].customAudit);assert.equal(getRow().data.documents[0].remarks,'Complete document note\nSecond line retained');assert.equal(getRow().data.bookings[0].paid,300);
    await page.reload();await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations?.export().documents[0].remarks==='Complete document note\nSecond line retained');
  });
  await run('one editing tab prevents mixed browser caches without affecting other Life OS storage',async({page})=>{
    await open(page);const result=await page.evaluate(async owner=>{try{await document.querySelector('iframe').contentWindow.LifePropertyCache.open(owner);return 'unexpected';}catch(e){return e.code;}},owner);assert.equal(result,'property_editor_busy');assert.equal(await page.evaluate(()=>localStorage.length),0);
  });
  await run('failed cache reads release the editing lock so a recovered browser can retry',async({page})=>{
    await page.goto(url+'property-operations.html');const result=await page.evaluate(async owner=>{
      const original=IDBObjectStore.prototype.openCursor;let fail=true;
      IDBObjectStore.prototype.openCursor=function(...args){if(fail && this.transaction.db.name==='life-os-properties-v1:'+owner)throw new DOMException('Synthetic cache read failure','UnknownError');return original.apply(this,args);};
      let refused=false;try{await LifePropertyCache.open(owner);}catch{refused=true;}
      fail=false;const cache=await LifePropertyCache.open(owner);cache.close();IDBObjectStore.prototype.openCursor=original;return refused;
    },owner);assert.equal(result,true);assert.equal(await page.evaluate(()=>localStorage.length),0);
  });
  await run('AI remains disabled and opening each section makes no automatic property writes',async({page,writes})=>{
    const frame=await open(page);for(const view of ['calendar','bookings','messages','dashboard','documents','tax','guide','today']){await frame.locator('[data-view="'+view+'"]').click();}assert.equal(await frame.locator('#aiDraftBtn').isEnabled(),false);assert.equal(writes(),0);assert.deepEqual(await page.evaluate(()=>document.querySelector('iframe').contentWindow.PropertyOperations.export().futureRoot),base.futureRoot);
  });
  await run('document preview settles without resizing itself or truncating invoice content',async({page})=>{
    const frame=await open(page);await frame.locator('[data-view="documents"]').click();await frame.locator('[data-document-workspace="archive"]').click();await frame.locator('[data-open-document="synthetic-invoice"]').click();
    await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.document.querySelector('iframe.doc-preview-frame')?.contentDocument?.querySelector('.doc-sheet'));
    const measure=()=>page.evaluate(()=>{const w=document.querySelector('iframe').contentWindow,f=w.document.querySelector('iframe.doc-preview-frame');return {frame:parseFloat(f.style.height),host:f.parentElement.getBoundingClientRect().height,text:f.contentDocument.body.textContent.includes('ORIGINAL-2025-INVOICE-18')};});
    await page.waitForTimeout(250);const before=await measure();await page.waitForTimeout(500);const after=await measure();assert(before.text && after.text);assert(before.frame<5000 && after.frame<5000);assert(Math.abs(before.host-after.host)<1,'preview height must settle');
  });
  async function native(page){
    await page.goto(url+'?liveReload=0');await page.evaluate(owner=>{state.cloudOwnerId=owner;cloudSaveEnabled=false;saveCloudSession({user:{id:owner,email:'synthetic@example.invalid'},access_token:'synthetic-access',expires_at:Date.now()+3600000});},owner);
    await page.locator('#propertiesModeButton').click();await page.locator('#propertyOperationsFrame').waitFor();await page.frameLocator('#propertyOperationsFrame').locator('#appShell:not([hidden])').waitFor();
  }
  await run('migration history verifies and downloads cloud originals and the newer browser backup',async({page,context})=>{
    const payload=JSON.stringify({data:base,updated_at:'2026-10-16T00:00:00Z'}),browserPayload=JSON.stringify({...base,ownerId:owner,exportedAt:'2026-10-17T00:00:00Z'}),digest=s=>createHash('sha256').update(s).digest('hex');
    await context.route('https://**/rest/v1/property_transfer_batches?**',r=>r.fulfill({json:[{batch_id:'synthetic-batch',manifest:{records:[{}]}}]}));
    await context.route('https://**/rest/v1/property_transfer_records?**',r=>r.fulfill({json:[{resource:'public.app_data',payload_text:payload,sha256:digest(payload)}]}));
    await context.route('https://**/rest/v1/property_browser_backups?**',r=>r.fulfill({json:[{payload_text:browserPayload,sha256:digest(browserPayload),comparison:{bookings:1,documents:1,exported_at:'2026-10-17T00:00:00Z'}}]}));
    await native(page);const before=await page.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage())));
    await page.getByRole('button',{name:'Migration history',exact:true}).click();await page.getByText('1 original cloud records and 1 browser backups verified.',{exact:false}).waitFor();
    const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download original migration copies',exact:true}).click();const download=await downloading,content=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(content.records[0].payload_text,payload);assert.equal(content.browser_backups[0].payload_text,browserPayload);assert.equal(await page.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage()))),before);
    await page.locator('#dailyDialog').getByRole('button',{name:'Close',exact:true}).click();
    await context.route('https://**/rest/v1/property_browser_backups?**',r=>r.fulfill({json:[{payload_text:browserPayload,sha256:'0'.repeat(64),comparison:{}}]}));
    await page.getByRole('button',{name:'Migration history',exact:true}).click();await page.getByText('Could not verify the original copies.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Download original migration copies',exact:true}).count(),0);
  });
  await run('main navigation retains an unfinished property form and account sign-out locks it',async({page})=>{
    await native(page);const frame=page.frameLocator('#propertyOperationsFrame');await booking(frame);await frame.locator('[data-booking-section="overview"]').click();await frame.getByRole('button',{name:'Edit booking',exact:true}).click();await frame.locator('#guestInput').fill('Unfinished synthetic draft');
    await page.evaluate(()=>setWorkspaceMode('board'));await page.locator('#propertiesModeButton').click();assert.equal(await frame.locator('#guestInput').inputValue(),'Unfinished synthetic draft');assert.equal(await page.locator('#propertyOperationsFrame').count(),1);
    await page.evaluate(()=>saveCloudSession(null));await page.waitForFunction(()=>document.querySelector('#propertyOperationsFrame').hidden && document.querySelector('#propertyOperationsFrame').inert);assert.equal(await frame.locator('#guestInput').inputValue(),'Unfinished synthetic draft');
  });
  await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
