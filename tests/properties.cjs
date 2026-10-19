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
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
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
  await run('automatic calendar status shows success, retained failure, overdue and unavailable states without saving',async({page,context,getRow,writes})=>{
    let mode='success';const last='2026-10-16T23:07:02Z',original=JSON.stringify(getRow().data);
    await context.route('https://**/rest/v1/property_calendar_sync_status?**',route=>mode==='unavailable'?route.fulfill({status:503,body:'private internal details'}):route.fulfill({json:[{owner_id:owner,status:mode==='error'?'error':'success',last_attempt_at:last,last_success_at:mode==='overdue'?'2026-10-16T00:07:02Z':last,block_count:0}]}));
    const frame=await open(page),status=frame.getByRole('region',{name:'Automatic calendar sync',exact:true});
    await status.getByText('Calendar up to date',{exact:true}).waitFor();assert.match(await status.innerText(),/0 availability blocks/);const timestamp=await status.locator('time').getAttribute('datetime');assert.equal(timestamp,last.replace('Z','.000Z'));
    mode='error';await status.getByRole('button',{name:'Check status',exact:true}).click();await status.getByText('Calendar sync failed',{exact:true}).waitFor();assert.equal(await status.locator('time').getAttribute('datetime'),timestamp);
    mode='unavailable';await status.getByRole('button',{name:'Check status',exact:true}).click();await status.getByText('Calendar status unavailable',{exact:true}).waitFor();assert.equal(await status.locator('time').getAttribute('datetime'),timestamp);assert.doesNotMatch(await status.innerText(),/private internal/);
    mode='overdue';await status.getByRole('button',{name:'Check status',exact:true}).click();await status.getByText('Calendar refresh overdue',{exact:true}).waitFor();
    for(const width of [1440,1080,390,320]){await page.setViewportSize({width,height:1000});const size=await status.evaluate(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,width:n.ownerDocument.documentElement.clientWidth,scroll:n.scrollWidth,client:n.clientWidth}));assert(size.left>=0 && size.right<=size.width+1 && size.scroll<=size.client+1,JSON.stringify(size));await page.screenshot({path:path.join(out,'calendar-status-'+width+'.png'),fullPage:true});}
    assert.equal(writes(),0);assert.equal(JSON.stringify(getRow().data),original);
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
  await run('imported calendar links refuse unsafe destinations without hiding or rewriting availability',async({page,getRow,writes})=>{
    const urls=['https://www.airbnb.com/hosting/reservations/details/SYNTHETIC?source=calendar','https://admin.booking.com/hotel/hoteladmin/reservation.html?res_id=SYNTHETIC','javascript:window.propertyLinkExecuted=true','https://airbnb.com.evil.invalid/reservation','https://user:password@airbnb.com/reservation','http://airbnb.com/reservation','https://booking.com:8443/reservation',''];
    const imported=urls.map((reservationUrl,i)=>({villa:'Sunrise',uid:'synthetic-link-'+i,start:'2026-10-'+String(i+1).padStart(2,'0'),end:'2026-10-'+String(i+2).padStart(2,'0'),reservationUrl,customHistory:{keep:true}}));
    getRow().data.appSettings.ical={sources:[],imported:structuredClone(imported)};const original=JSON.stringify(getRow().data),frame=await open(page);await frame.locator('[data-view="calendar"]').click();
    const chips=frame.locator('.airbnb-import');assert.equal(await chips.count(),urls.length);assert.equal(await frame.locator('a.airbnb-import').count(),2);
    assert.deepEqual(await frame.locator('a.airbnb-import').evaluateAll(nodes=>nodes.map(n=>({href:n.href,target:n.target,rel:n.rel}))),urls.slice(0,2).map(href=>({href,target:'_blank',rel:'noopener noreferrer'})));
    assert.match(await chips.nth(0).innerText(),/Airbnb/);assert.match(await chips.nth(1).innerText(),/Booking\.com/);
    for(let i=2;i<urls.length;i++){assert.equal(await chips.nth(i).evaluate(node=>node.tagName),'DIV');assert.match(await chips.nth(i).innerText(),/Imported/);assert.equal(await chips.nth(i).getAttribute('href'),null);}
    assert.equal(JSON.stringify(getRow().data),original);assert.equal(writes(),0);
    assert.deepEqual(await page.evaluate(()=>document.querySelector('iframe').contentWindow.PropertyOperations.export().appSettings.ical.imported),imported);
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(out,'property-calendar-links-'+width+'.png'),fullPage:true});assert.equal(await chips.count(),urls.length);
      const layout=await page.evaluate(()=>{const w=document.querySelector('iframe').contentWindow;return {width:w.innerWidth,scroll:w.document.documentElement.scrollWidth};});assert(layout.scroll<=layout.width+1,JSON.stringify(layout));
    }
    assert.equal(await frame.getByRole('checkbox',{name:'WhatsApp sent',exact:true}).count(),1);
    const tableScroll=await frame.locator('.quick-view-card').evaluate(node=>{node.scrollLeft=node.scrollWidth;return {left:node.scrollLeft,last:node.querySelector('th:last-child').getBoundingClientRect().right,right:node.getBoundingClientRect().right};});assert(tableScroll.left>0);assert(tableScroll.last<=tableScroll.right+1);
    await page.reload();await open(page);assert.equal(await frame.locator('a.airbnb-import').count(),2);assert.equal(JSON.stringify(getRow().data),original);assert.equal(writes(),0);
  });
  await run('server-refreshed reservation links use the same rendering guard without changing saved records',async({page,context,getRow})=>{
    const rows=[{villa:'Sunrise',uid:'server-safe',start_date:'2026-10-02',end_date:'2026-10-03',reservation_url:'https://admin.booking.com/reservation/SYNTHETIC',synced_at:'2026-10-17T00:00:00Z'},{villa:'Sunrise',uid:'server-unsafe',start_date:'2026-10-03',end_date:'2026-10-04',reservation_url:'data:text/html,SYNTHETIC',synced_at:'2026-10-17T00:00:00Z'}];
    await context.route('https://**/rest/v1/property_ical_blocks?**',route=>route.fulfill({json:rows}));const frame=await open(page);await frame.locator('[data-view="calendar"]').click();await frame.locator('.airbnb-import').nth(1).waitFor();
    assert.equal(await frame.locator('a.airbnb-import').count(),1);assert.match(await frame.locator('a.airbnb-import').innerText(),/Booking\.com/);
    assert.equal(await frame.locator('.airbnb-import').nth(1).evaluate(n=>n.tagName),'DIV');
    await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations.pending()===false);
    for(const key of ['bookings','documents'])for(const original of base[key]){const saved=getRow().data[key].find(row=>row.id===original.id);for(const [field,value] of Object.entries(original))assert.deepEqual(saved[field],value);}
    assert.equal(getRow().data.appSettings.ical.imported[1].reservationUrl,rows[1].reservation_url);
  });
  await run('calendar day details show every booking and availability block without saving or mixing villas',async({page,getRow,writes})=>{
    const row=getRow();row.data.bookings=Array.from({length:5},(_,i)=>({...structuredClone(base.bookings[0]),id:'day-booking-'+i,guest:'Synthetic day guest '+(i+1)}));row.data.bookings.push({...structuredClone(base.bookings[0]),id:'other-villa',guest:'Other villa private guest',villa:'Windmill'});
    row.data.appSettings.ical={imported:Array.from({length:5},(_,i)=>({villa:'Sunrise',uid:'day-import-'+i,start:'2026-10-20',end:'2026-10-22',reservationUrl:i===0?'https://www.airbnb.com/reservation/SYNTHETIC':'javascript:void(0)'})).concat([{villa:'Windmill',uid:'other-villa-import',start:'2026-10-20',end:'2026-10-22',reservationUrl:''}])};
    const original=JSON.stringify(row.data),frame=await open(page);await frame.getByRole('button',{name:'Calendar',exact:true}).click();
    await frame.locator('[data-property-day="2026-10-20"]').first().click();const dialog=frame.getByRole('dialog',{name:/20 October 2026/});await dialog.waitFor();
    assert.equal(await dialog.locator('[data-day-booking]').count(),5);assert.equal(await dialog.locator('[data-day-availability]').count(),5);assert.equal(await dialog.locator('a').count(),1);assert.doesNotMatch(await dialog.innerText(),/Other villa/);assert.match(await dialog.locator('[data-day-availability]').first().innerText(),/21 Oct 2026/);assert.doesNotMatch(await dialog.locator('[data-day-availability]').first().innerText(),/22 Oct 2026/);
    for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(out,'property-day-normal-'+width+'.png'),fullPage:true});}await page.setViewportSize({width:1440,height:1000});
    assert.equal(JSON.stringify(row.data),original);assert.equal(writes(),0);
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await frame.locator('.property-day-more[data-property-day="2026-10-20"]').click();await dialog.waitFor();assert.equal(await dialog.locator('[data-day-booking]').count(),5);
    await dialog.getByRole('button',{name:/Synthetic day guest 5/}).click();await frame.locator('#bookingWorkspace').waitFor();assert.equal(await dialog.count(),0);assert.match(await frame.locator('#bookingWorkspace').innerText(),/Synthetic day guest 5/);assert.equal(JSON.stringify(row.data),original);assert.equal(writes(),0);
  });
  await run('calendar day details support phone reading, keyboard dismissal and focus return',async({page,getRow,writes})=>{
    getRow().data.bookings[0].guest='Synthetic guest with a very long unbroken name '+ 'LongName'.repeat(20);
    getRow().data.appSettings.ical={imported:Array.from({length:18},(_,i)=>({villa:'Sunrise',uid:'long-day-'+i,start:'2026-10-20',end:'2026-10-22',reservationUrl:'https://www.airbnb.com/reservation/SYNTHETIC-'+i}))};
    const original=JSON.stringify(getRow().data),frame=await open(page);await frame.getByRole('button',{name:'Calendar',exact:true}).click();const date=frame.locator('.property-day-button[data-property-day="2026-10-20"]');await date.press('Enter');
    const dialog=frame.getByRole('dialog',{name:/20 October 2026/});await dialog.waitFor();assert.equal(await dialog.locator('[data-day-availability]').count(),18);
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});const bounds=await dialog.evaluate(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,width:n.ownerDocument.documentElement.clientWidth,scroll:n.scrollWidth,client:n.clientWidth,height:n.getBoundingClientRect().height}));assert(bounds.left>=0 && bounds.right<=bounds.width+1,JSON.stringify(bounds));assert(bounds.scroll<=bounds.client+1);assert(bounds.height<=900);await page.screenshot({path:path.join(out,'property-day-'+width+'.png'),fullPage:true});}
    const targets=await dialog.locator('button,a').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert(targets.every(n=>n.width>=44 && n.height>=44));
    await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert(await dialog.evaluate(n=>n.contains(n.ownerDocument.activeElement)));
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await date.evaluate(n=>n===n.ownerDocument.activeElement),true);
    const dateSize=await date.evaluate(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}));assert(dateSize.width>=24 && dateSize.height>=24);
    assert.equal(JSON.stringify(getRow().data),original);assert.equal(writes(),0);
  });
  await run('calendar day details respect checkout boundaries and keep guest markup inert',async({page,getRow,writes})=>{
    getRow().data.bookings[0].guest='Synthetic <img src=x onerror=alert(1)> & guest';getRow().data.appSettings.ical={imported:[{villa:'Sunrise',uid:'checkout',start:'2026-10-20',end:'2026-10-22',reservationUrl:'data:text/html,synthetic'}]};
    const original=JSON.stringify(getRow().data),frame=await open(page);await frame.getByRole('button',{name:'Calendar',exact:true}).click();await frame.locator('.property-day-button[data-property-day="2026-10-20"]').click();let dialog=frame.getByRole('dialog',{name:/20 October 2026/});await dialog.waitFor();assert.match(await dialog.innerText(),/Synthetic <img/);assert.equal(await dialog.locator('img,a').count(),0);await dialog.getByRole('button',{name:'Close',exact:true}).click();
    await frame.locator('.property-day-button[data-property-day="2026-10-22"]').click();dialog=frame.getByRole('dialog',{name:/22 October 2026/});await dialog.waitFor();assert.equal(await dialog.locator('[data-day-booking],[data-day-availability]').count(),0);assert.match(await dialog.innerText(),/No bookings for this day/);assert.equal(JSON.stringify(getRow().data),original);assert.equal(writes(),0);
  });
  await run('an open calendar day stays private when the Life OS account is disconnected or replaced',async({page,getRow})=>{
    const original=JSON.stringify(getRow().data);await native(page);const frame=page.frameLocator('#propertyOperationsFrame');await frame.getByRole('button',{name:'Calendar',exact:true}).click();await frame.locator('.property-day-button[data-property-day="2026-10-20"]').click();const dialog=frame.getByRole('dialog',{name:/20 October 2026/});await dialog.waitFor();
    await page.evaluate(()=>saveCloudSession(null));await page.waitForFunction(()=>document.querySelector('#propertyOperationsFrame').hidden && document.querySelector('#propertyOperationsFrame').inert);assert.equal(await dialog.isVisible(),false);
    await page.evaluate(()=>{saveCloudSession({user:{id:'33333333-3333-4333-8333-333333333333',email:'other@example.invalid'},access_token:'synthetic-other',expires_at:Date.now()+3600000});renderPropertiesWorkspace();});await page.getByRole('button',{name:'Reconnect properties',exact:true}).click();assert.equal(await dialog.isVisible(),false);assert.equal(JSON.stringify(getRow().data),original);
  });
  await run('one month navigator works on desktop and phones without changing business records',async({page,getRow})=>{
    const raw=structuredClone(getRow().data),frame=await open(page);
    const fields=data=>({bookings:data.bookings,documents:data.documents,taxPlan:data.taxPlan,profitData:data.profitData,futureRoot:data.futureRoot});
    const original=fields(await page.evaluate(()=>document.querySelector('iframe').contentWindow.PropertyOperations.export()));
    // Sparse test fixtures receive existing normalizer defaults on load. Retain
    // every original value, then compare the entire loaded model through saves.
    function retained(actual,expected){for(const [key,value] of Object.entries(expected)){if(value && typeof value==='object')retained(actual[key],value);else assert.equal(actual[key],value);}}
    retained(original,fields(raw));await frame.getByRole('button',{name:'Calendar',exact:true}).click();
    const bar=frame.getByRole('group',{name:'Working month',exact:true}),picker=bar.locator('.property-period'),summary=picker.locator('summary');
    for(const width of [1440,1080,768,390,320]){
      await page.setViewportSize({width,height:1000});assert.equal(await bar.isVisible(),true);assert.equal(await bar.getByRole('button',{name:'Previous month',exact:true}).count(),1);assert.equal(await frame.locator('.property-period').count(),1);
      await summary.click();assert.equal(await picker.getAttribute('open'),'');assert.equal(await picker.locator('[data-month-value]').count(),12);
      const layout=await picker.evaluate(n=>{const r=n.getBoundingClientRect(),d=n.ownerDocument;return {left:r.left,right:r.right,width:d.documentElement.clientWidth,scroll:d.documentElement.scrollWidth,overflow:[...d.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>d.documentElement.clientWidth+1).slice(0,12).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right}))};});assert(layout.left>=0 && layout.right<=layout.width+1,JSON.stringify(layout));assert(layout.scroll<=layout.width+1,JSON.stringify(layout));
      const sizes=await bar.locator('button,summary').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert(sizes.every(n=>n.width>=44 && n.height>=44),JSON.stringify(sizes));
      await page.screenshot({path:path.join(out,'property-month-'+width+'.png'),fullPage:true});await summary.press('Escape');assert.equal(await picker.getAttribute('open'),null);assert.equal(await summary.evaluate(n=>n===n.ownerDocument.activeElement),true);
    }
    await summary.click();await picker.locator('[data-month-value="2026-12"]').click();assert.match(await summary.innerText(),/December 2026/);assert.equal(await picker.getAttribute('open'),null);assert.equal(await summary.evaluate(n=>n===n.ownerDocument.activeElement),true);
    await bar.getByRole('button',{name:'Next month',exact:true}).click();assert.match(await summary.innerText(),/January 2027/);await bar.getByRole('button',{name:'Previous month',exact:true}).click();assert.match(await summary.innerText(),/December 2026/);
    await summary.click();await picker.getByRole('button',{name:'This month',exact:true}).click();assert.match(await summary.innerText(),/October 2026/);assert.equal(await picker.getAttribute('open'),null);
    await summary.click();await frame.locator('#pageTitle').click();assert.equal(await picker.getAttribute('open'),null);
    await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.PropertyOperations.pending()===false);
    assert.deepEqual(fields(getRow().data),original);retained(getRow().data,fields(raw));
    await page.reload();await open(page);assert.match(await summary.innerText(),/October 2026/);
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
  await run('Properties reports storage failure without demanding another login and recovers when the shared session updates',async({page,writes})=>{
    await page.goto(url+'?liveReload=0');await page.evaluate(owner=>{
      state.cloudOwnerId=owner;cloudSaveEnabled=false;saveCloudSession({user:{id:owner},access_token:'synthetic-access',expires_at:Date.now()+3600000});
      window.originalEnsureProperties=ensureCloudSession;ensureCloudSession=async()=>{const error=new Error('Private internal details');error.name='AuthRenewalStorageError';throw error;};
    },owner);
    const before=await page.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage())));
    await page.locator('#propertiesModeButton').click();await page.locator('.properties-workspace[data-connection="storage"]').waitFor();
    assert.equal(await page.getByRole('button',{name:'Reconnect Life OS',exact:true}).isVisible(),false);assert.equal(await page.getByRole('button',{name:'Recover save space',exact:true}).isVisible(),true);
    assert.doesNotMatch(await page.locator('.properties-status').innerText(),/Private internal|Sign in to Life OS in Settings/);
    await page.evaluate(()=>{ensureCloudSession=originalEnsureProperties;window.dispatchEvent(new StorageEvent('storage',{key:CLOUD_SESSION_KEY}));});
    await page.frameLocator('#propertyOperationsFrame').locator('#appShell:not([hidden])').waitFor();assert.equal(await page.locator('.properties-workspace').getAttribute('data-connection'),'connected');
    assert.equal(await page.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage()))),before);assert.equal(writes(),0);
  });
  await run('Properties retries a temporary shared-session failure without a separate login',async({page,writes})=>{
    await page.goto(url+'?liveReload=0');await page.evaluate(owner=>{
      state.cloudOwnerId=owner;cloudSaveEnabled=false;saveCloudSession({user:{id:owner},access_token:'synthetic-access',expires_at:Date.now()+3600000});
      window.originalEnsureProperties=ensureCloudSession;window.propertySessionAttempts=0;
      ensureCloudSession=async()=>{if(++propertySessionAttempts===1){const error=new Error('Private token details');error.retryable=true;throw error;}return originalEnsureProperties();};
    },owner);
    await page.locator('#propertiesModeButton').click();await page.locator('.properties-workspace[data-connection="connection"]').waitFor();assert.equal(await page.getByRole('button',{name:'Reconnect Life OS',exact:true}).isVisible(),false);
    await page.clock.runFor(5100);await page.frameLocator('#propertyOperationsFrame').locator('#appShell:not([hidden])').waitFor();assert.equal(writes(),0);
  });
  await run('Properties only offers account reconnection when the existing session really expired',async({page})=>{
    await page.goto(url+'?liveReload=0');await page.evaluate(owner=>{
      state.cloudOwnerId=owner;cloudSaveEnabled=false;saveCloudSession({user:{id:owner},access_token:'synthetic-access',expires_at:Date.now()+3600000});
      ensureCloudSession=async()=>{throw new Error('Cloud session expired or was revoked.');};
    },owner);
    await page.locator('#propertiesModeButton').click();await page.locator('.properties-workspace[data-connection="signin"]').waitFor();assert.equal(await page.getByRole('button',{name:'Reconnect Life OS',exact:true}).isVisible(),true);assert.equal(await page.locator('#propertyOperationsFrame').count(),0);
  });
  await run('migration history verifies and downloads cloud originals and the newer browser backup',async({page,context})=>{
    const payload=JSON.stringify({data:base,updated_at:'2026-10-16T00:00:00Z'}),browserPayload=JSON.stringify({...base,ownerId:owner,exportedAt:'2026-10-17T00:00:00Z'}),digest=s=>createHash('sha256').update(s).digest('hex');
    await context.route('https://**/rest/v1/property_transfer_batches?**',r=>r.fulfill({json:[{batch_id:'synthetic-batch',manifest:{records:[{resource:'public.app_data',source_key:'synthetic-original',sha256:digest(payload)}]}}]}));
    await context.route('https://**/rest/v1/property_transfer_records?**',r=>r.fulfill({json:[{resource:'public.app_data',source_key:'synthetic-original',payload_text:payload,sha256:digest(payload)}]}));
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
  await run('reconnecting the original account unlocks the exact unfinished form without rebuilding it',async({page})=>{
    await native(page);assert.equal(await page.getByRole('button',{name:'Open properties',exact:true}).isVisible(),false);const frame=page.frameLocator('#propertyOperationsFrame');await booking(frame);await frame.locator('[data-booking-section="overview"]').click();await frame.getByRole('button',{name:'Edit booking',exact:true}).click();await frame.locator('#guestInput').fill('Keep this exact unsaved draft');
    await page.evaluate(()=>{window.originalPropertyFrame=document.querySelector('#propertyOperationsFrame');saveCloudSession(null);});
    await page.waitForFunction(()=>document.querySelector('#propertyOperationsFrame').hidden);const foreign='33333333-3333-4333-8333-333333333333';
    await page.evaluate(id=>{saveCloudSession({user:{id,email:'different@example.invalid'},access_token:'different-access',expires_at:Date.now()+3600000});renderPropertiesWorkspace();},foreign);
    await page.getByRole('button',{name:'Reconnect properties',exact:true}).click();assert.equal(await page.locator('#propertyOperationsFrame').isVisible(),false);assert.equal(await frame.locator('#guestInput').inputValue(),'Keep this exact unsaved draft');
    await page.evaluate(id=>{saveCloudSession({user:{id,email:'synthetic@example.invalid'},access_token:'synthetic-access',expires_at:Date.now()+3600000});renderPropertiesWorkspace();},owner);
    await page.getByRole('button',{name:'Reconnect properties',exact:true}).click();
    await page.locator('#propertyOperationsFrame').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.originalPropertyFrame===document.querySelector('#propertyOperationsFrame')),true);assert.equal(await frame.locator('#guestInput').inputValue(),'Keep this exact unsaved draft');assert.equal(await page.getByRole('button',{name:'Open properties',exact:true}).isVisible(),false);
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>saveCloudSession(null));await page.waitForFunction(()=>document.querySelector('#propertyOperationsFrame').hidden);await page.screenshot({path:path.join(out,'properties-reconnect-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(await page.getByRole('button',{name:'Reconnect properties',exact:true}).isVisible(),true);
  });
  await run('migration originals disappear on account change even when the property view is hidden',async({page,context})=>{
    const payload=JSON.stringify({data:base,updated_at:'PRIVATE-ORIGINAL-SNAPSHOT'}),sha256=createHash('sha256').update(payload).digest('hex');
    await context.route('https://**/rest/v1/property_transfer_batches?**',r=>r.fulfill({json:[{batch_id:'synthetic-batch',manifest:{records:[{resource:'public.app_data',source_key:'original',sha256}]}}]}));
    await context.route('https://**/rest/v1/property_transfer_records?**',r=>r.fulfill({json:[{resource:'public.app_data',source_key:'original',payload_text:payload,sha256}]}));
    await native(page);await page.getByRole('button',{name:'Migration history',exact:true}).click();await page.getByText('PRIVATE-ORIGINAL-SNAPSHOT',{exact:false}).waitFor();
    await page.evaluate(()=>{setWorkspaceMode('board');saveCloudSession(null);});await page.waitForFunction(()=>!document.querySelector('#dailyDialog')?.open);
    assert.equal(await page.locator('body').textContent().then(s=>s.includes('PRIVATE-ORIGINAL-SNAPSHOT')),false);assert.equal(await page.getByRole('button',{name:'Download original migration copies',exact:true}).count(),0);
  });
  await run('matching counts and self-consistent payload hashes cannot substitute an original manifest entry',async({page,context})=>{
    const payload=JSON.stringify({data:base,updated_at:'2026-10-16T00:00:00Z'}),sha256=createHash('sha256').update(payload).digest('hex');
    await context.route('https://**/rest/v1/property_transfer_batches?**',r=>r.fulfill({json:[{batch_id:'synthetic-batch',manifest:{records:[{resource:'public.app_data',source_key:'expected-original',sha256}]}}]}));
    await context.route('https://**/rest/v1/property_transfer_records?**',r=>r.fulfill({json:[{resource:'public.app_data',source_key:'different-original',payload_text:payload,sha256}]}));
    await native(page);await page.getByRole('button',{name:'Migration history',exact:true}).click();await page.getByText('Could not verify the original copies.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Download original migration copies',exact:true}).count(),0);
  });
  await run('duplicate originals cannot hide a missing record behind a matching total',async({page,context})=>{
    const payload=JSON.stringify({data:base,updated_at:'2026-10-16T00:00:00Z'}),sha256=createHash('sha256').update(payload).digest('hex'),record={resource:'public.app_data',source_key:'first',payload_text:payload,sha256};
    await context.route('https://**/rest/v1/property_transfer_batches?**',r=>r.fulfill({json:[{batch_id:'synthetic-batch',manifest:{records:[record,{...record,source_key:'second'}]}}]}));
    await context.route('https://**/rest/v1/property_transfer_records?**',r=>r.fulfill({json:[record,record]}));
    await native(page);await page.getByRole('button',{name:'Migration history',exact:true}).click();await page.getByText('Could not verify the original copies.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Download original migration copies',exact:true}).count(),0);
  });
  await run('a late migration response cannot populate a replacement dialog or continue reading after sign-out',async({page,context})=>{
    let release,requested=false,reads=0;const held=new Promise(resolve=>{release=resolve;});
    await context.route('https://**/rest/v1/property_transfer_batches?**',async route=>{requested=true;await held;await route.fulfill({json:[{batch_id:'synthetic-batch',manifest:{records:[]}}]}).catch(()=>{});});
    await context.route('https://**/rest/v1/property_transfer_records?**',route=>{reads++;return route.fulfill({json:[]});});
    await native(page);await page.getByRole('button',{name:'Migration history',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#dailyDialog')?.textContent.includes('Loading protected'));
    const deadline=Date.now()+5000;while(!requested && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(requested,true);
    await page.evaluate(()=>{saveCloudSession(null);renderPropertiesWorkspace();dailyDialog('Different action');});release();await page.waitForTimeout(150);
    assert.equal(reads,0);assert.equal(await page.getByRole('dialog',{name:'Different action',exact:true}).isVisible(),true);assert.equal(await page.getByRole('button',{name:'Download original migration copies',exact:true}).count(),0);assert.doesNotMatch(await page.locator('#dailyDialog').innerText(),/verified|Could not verify/);
  });
  await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
