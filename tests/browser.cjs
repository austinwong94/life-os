const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const OUT=process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(OUT,{recursive:true});
const results=[];
(async()=>{
 const browser=await chromium.launch({headless:true});
 async function run(name,fn,init){
  const ctx=await browser.newContext({viewport:{width:1440,height:960},timezoneId:'Asia/Kuala_Lumpur'});
  // No test can read or write the real personal database.
  await ctx.route('https://**supabase.co/**',route=>route.fulfill({status:503,body:'Test isolation: network blocked'}));
  if(init)await ctx.addInitScript(init);
  const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.stack));p.on('dialog',d=>d.accept());p.setDefaultTimeout(6000);
  try{await p.goto(URL);await p.waitForTimeout(150);await fn(p,ctx);assert.deepEqual(errors,[]);results.push({name,pass:true});}
  catch(e){results.push({name,pass:false,error:e.stack,pageErrors:errors});}
  console.log(JSON.stringify(results.at(-1)));await ctx.close();
 }
 await run('planner late completion, independent duplicate, rename and history',async p=>{
  const result=await p.evaluate(()=>{
   const view=state.cards.find(c=>c.type==='planlist');const day=getTodayKey();const yesterday=getTodayKey(addDays(new Date(),-1));
   addPlannerTaskFromPlannerView(view,yesterday,'Send proposal');addPlannerTaskFromPlannerView(view,yesterday,'Buy groceries');
   const get=()=>getPlannerViewData('today','Personal',{},day).items;
   togglePlannerTaskDone(get().find(x=>x.title==='Send proposal'));
   const late=get().map(x=>[x.title,x.done]);
   const unfinished=get().find(x=>x.title==='Buy groceries');updatePlannerTask(unfinished,'Buy fruit',yesterday);
   addPlannerTaskFromPlannerView(view,day,'Duplicate');addPlannerTaskFromPlannerView(view,day,'Duplicate');togglePlannerTaskDone(get().filter(x=>x.title==='Duplicate')[0]);
   renderCardsOnly({force:true});saveState();
   return {late,names:get().map(x=>x.title),duplicates:get().filter(x=>x.title==='Duplicate').map(x=>x.done),sourceCount:getPlannerSourceCards().length};
  });
  assert.deepEqual(result.late.sort((a,b)=>a[0].localeCompare(b[0])),[['Buy groceries',false],['Send proposal',true]]);assert.ok(result.names.includes('Buy fruit'));assert.ok(!result.names.includes('Buy groceries'));assert.deepEqual(result.duplicates.sort(),[false,true]);assert.equal(result.sourceCount,1);
  await p.reload();assert.equal(await p.locator('.planner-linked-copy').filter({hasText:'Buy fruit'}).count(),1);
 });
 await run('planner add input clears and all 20 tasks can be reached',async p=>{
  const input=p.locator('.planner-linked-add-input');await input.fill('Keep every character');await input.press('Enter');assert.equal(await input.inputValue(),'');
  await p.evaluate(()=>{const v=state.cards.find(c=>c.type==='planlist');for(let i=0;i<20;i++)addPlannerTaskFromPlannerView(v,getTodayKey(),'Task '+i);renderCardsOnly({force:true});});
  assert.equal(await p.locator('.planner-linked-copy').count(),21);
 });
 await run('diary survives slow typing, pauses, blur and refresh',async p=>{
  const input=p.locator('.diary-thoughts');await input.fill('Today is tiring.\n');await input.press('End');await input.pressSequentially('I still want every word kept.',{delay:20});await p.waitForTimeout(2000);
  const text=await input.inputValue();await p.locator('#railSettingsButton').click();await p.evaluate(()=>closeSettingsModal());await p.reload();assert.equal(await p.locator('.diary-thoughts').inputValue(),text);
 });
 await run('two tabs keep different boards and complete diary text',async(p,ctx)=>{
  const ids=await p.evaluate(()=>{const b=createBoardRecord({id:'second',name:'Second',cards:[makeCard({type:'diary',title:'Other diary'})]});state.boards.push(b);saveState();return {first:state.activeBoardId,second:b.id};});
  const q=await ctx.newPage();await q.goto(URL);await q.evaluate(id=>switchBoard(id),ids.second);
  await p.locator('.diary-thoughts').fill('This is a long diary on my first board.');
  await q.locator('.diary-thoughts').fill('A completely separate diary on the second board.');
  await p.waitForTimeout(300);await p.locator('.diary-thoughts').press('End');await p.locator('.diary-thoughts').pressSequentially(' Still here.');
  await q.waitForTimeout(300);await q.reload();
  const data=await p.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)).boards.map(b=>({id:b.id,text:b.cards.find(c=>c.type==='diary')?.diaryEntries[getTodayKey()]?.thoughts})));
  assert.equal(data.find(b=>b.id===ids.first).text,'This is a long diary on my first board. Still here.');assert.equal(data.find(b=>b.id===ids.second).text,'A completely separate diary on the second board.');
 });
 await run('removed source card retains linked records, archived tasks restore',async p=>{
  const result=await p.evaluate(()=>{const v=state.cards.find(c=>c.type==='planlist');addPlannerTaskFromPlannerView(v,getTodayKey(),'Recover this task');const i=getPlannerViewData('today','Personal',{},getTodayKey()).items[0];archivePlannerTask(i);renderRecordsModal();const visible=elements.recordsModalList.innerText;restorePlannerTask(i.card.id,i.taskId);return {visible,tasks:getPlannerViewData('today','Personal',{},getTodayKey()).items.length,done:LifePlanner.ensure(i.card)[0].done};});
  assert.match(result.visible,/Recover this task/);assert.equal(result.tasks,1);assert.equal(result.done,false);
 });
 await run('corrupt storage is never replaced by autosave or diary input',async p=>{
  await p.evaluate(()=>{saveState();const d=state.cards.find(c=>c.type==='diary');updateDiaryEntry(d,getTodayKey(),{thoughts:'A draft'});});
  assert.equal(await p.evaluate(()=>localStorage.getItem(STORAGE_KEY)),'{"important":"truncated');
 },()=>localStorage.setItem('progress-board-v1','{"important":"truncated'));
 await run('blocked storage boots with an explicit recovery warning',async p=>{assert.match(await p.locator('#headerSaveStatus').innerText(),/Recovery/);},()=>{Storage.prototype.getItem=()=>{throw new DOMException('Blocked','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};});
 await run('an unstaged diary draft survives a quota failure and can be saved after recovery',async p=>{
  const result=await p.evaluate(async()=>{
   saveState();await flushDeviceWrites();
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(key.startsWith(LifeDeviceStore.prefix))throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};
   updateDiaryEntry(state.cards.find(c=>c.type==='diary'),getTodayKey(),{thoughts:'My unsaved words must remain visible.'});
   const flushed=await flushDeviceWrites();
   const retained=state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts;
   Storage.prototype.setItem=original;saveState();await flushDeviceWrites();
   return {flushed,retained,saved:JSON.parse(localStorage.getItem(STORAGE_KEY)).boards[0].cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts};
  });
  assert.equal(result.flushed,false);assert.equal(result.retained,'My unsaved words must remain visible.');assert.equal(result.saved,result.retained);
 });
 await run('restore preserves legacy boards instead of adding or deleting templates',async p=>{
  const x=await p.evaluate(()=>{const old={boards:[{id:'ai-starter-course',name:'My old notes',cards:[]}],activeBoardId:'ai-starter-course'};return rehydrateState(old).boards.map(b=>b.id);});assert.deepEqual(x,['ai-starter-course']);
 });
 await run('upgrade retains the untouched original snapshot and older diary text',async p=>{
  const result=await p.evaluate(async()=>{
   const before=localStorage.getItem(PRE_UPGRADE_KEY);
   saveState();await flushDeviceWrites();
   return {before,after:localStorage.getItem(PRE_UPGRADE_KEY),original:window.testOriginalSnapshot,text:state.cards[0].diaryEntries['2025-01-02'].thoughts,version:JSON.parse(localStorage.getItem(STORAGE_KEY)).storageSchemaVersion};
  });
  assert.equal(result.before,result.original);assert.equal(result.after,result.original);
  assert.equal(result.text,'An older entry.\nEvery line is important.');assert.equal(result.version,3);
 },()=>{
  window.testOriginalSnapshot=JSON.stringify({activeBoardId:'legacy-board',boards:[{id:'legacy-board',name:'My existing board',cards:[{id:'legacy-diary',type:'diary',title:'Existing diary',diaryEntries:{'2025-01-02':{thoughts:'An older entry.\nEvery line is important.',sentence:'A memorable day',feeling:'Calm',updatedAt:1735804800000}}}],archivedCards:[]}]});
  localStorage.setItem('progress-board-v1',window.testOriginalSnapshot);
 });
 await run('mobile and desktop fit, navigation and reports open',async p=>{
  await p.screenshot({path:path.join(OUT,'desktop.png')});
  await p.locator('#todayModeButton').click();await p.locator('#boardModeButton').click();await p.locator('#weeklyReviewButton').click();assert.match(await p.locator('#reportPrintArea').innerText(),/Life review/);await p.evaluate(()=>closeReportsModal());
  for(const width of [390,320,768,1440]){await p.setViewportSize({width,height:844});await p.waitForTimeout(1600);const dims=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dims.scroll<=dims.width+1,JSON.stringify(dims));}
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(1600);assert.ok((await p.locator('.task-card').first().boundingBox()).y<230);await p.screenshot({path:path.join(OUT,'mobile.png')});
  await p.locator('#railAddButton').click();
  for (const width of [320,390,768]) {
   await p.setViewportSize({width,height:844});
   const title=p.locator('#cardTitle');await title.scrollIntoViewIfNeeded();await title.fill('A small next step');
   const box=await title.boundingBox();assert.ok(box.y>=0 && box.y+box.height<760,JSON.stringify(box));
   assert.ok(await title.evaluate(el=>el.contains(document.elementFromPoint(el.getBoundingClientRect().x+20,el.getBoundingClientRect().y+10))));
   await p.locator('.composer-inline-preview > summary').click();
   assert.equal(await p.locator('#cardPreview .task-card').isVisible(),true);
   await p.locator('.composer-inline-preview > summary').click();
  }
  await p.setViewportSize({width:390,height:844});await p.locator('#cardComposerPanel').evaluate(el=>el.scrollTop=0);await p.locator('#cardTitle').focus();
  await p.screenshot({path:path.join(OUT,'mobile-add.png')});
  await p.locator('#submitCardButton').click();
  assert.equal(await p.locator('#cardComposerPanel').isVisible(),false);
  assert.equal(await p.locator('#boardGrid').getByRole('heading',{name:'A small next step',exact:true}).count(),1);
 });
 fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify(results,null,2));await browser.close();if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
