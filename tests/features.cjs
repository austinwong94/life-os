const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(out,{recursive:true});
const results=[];
(async()=>{
 const browser=await chromium.launch({headless:true});
 async function run(name,fn){
  const c=await browser.newContext({viewport:{width:1440,height:960},timezoneId:'Asia/Kuala_Lumpur'});await c.route('https://**/*',r=>r.fulfill({status:503,body:'No external requests in tests'}));
  const p=await c.newPage();p.setDefaultTimeout(6000);const errors=[];p.on('pageerror',e=>errors.push(e.stack));p.on('dialog',d=>d.accept());
  try{await p.goto(URL);await fn(p,c);assert.deepEqual(errors,[]);results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack,pageErrors:errors});await p.screenshot({path:out+'/failure-'+results.length+'.png'}).catch(()=>{});}
  console.log(JSON.stringify(results.at(-1)));await c.close();
 }
 await run('fitness decimal input, tab switching and body-metric disclosure',async p=>{
  await p.evaluate(()=>{state.cards=[makeCard({type:'fitness',title:'Test fitness',category:'Health'})];saveState();renderCardsOnly({force:true});});
  await p.locator('.fitness-metrics > summary').click();const weight=p.getByLabel('Weight (kg)',{exact:true});await weight.pressSequentially('72.35',{delay:40});assert.equal(await weight.inputValue(),'72.35');
  await p.getByLabel('Height (cm)',{exact:true}).fill('175');await p.locator('.fitness-metrics > summary').click();
  await p.locator('.fitness-parts').getByRole('button',{name:'Running',exact:true}).click();assert.equal(await p.locator('.fitness-metrics').getAttribute('open'),null);
  const minutes=p.locator('.fitness-active').getByLabel('Minutes',{exact:true});await minutes.fill('30');const km=p.locator('.fitness-active').getByLabel('Km',{exact:true});await km.fill('5');
  await p.locator('.fitness-parts').getByRole('button',{name:'Chest',exact:true}).click();assert.equal(await p.locator('.fitness-metrics').getAttribute('open'),null);
  const values=await p.evaluate(()=>({metrics:getFitnessEntry(state.cards[0]).metrics,running:getFitnessEntry(state.cards[0]).parts.running,bmi:calculateBMI(72.35,175),bad:calculateBMI(-1,175)}));
  assert.equal(values.metrics.weightKg,72.35);assert.equal(values.metrics.bmi,23.6);assert.equal(values.running.distanceKm,5);assert.equal(values.running.durationMinutes,30);assert.equal(values.bad,'');
  await p.screenshot({path:out+'/fitness-desktop.png'});await p.setViewportSize({width:390,height:844});await p.waitForTimeout(1600);await p.screenshot({path:out+'/fitness-mobile.png'});
 });
 await run('food units preserve quantity, library edits preserve historical totals, meal five reachable',async p=>{
  await p.evaluate(()=>{const card=makeCard({type:'food',title:'Nutrition',category:'Health'});state.cards=[card];const entry=getFoodEntry(card);const egg=card.foodLibrary.find(f=>/egg/i.test(f.name));addFoodItemToMeal(card,getTodayKey(),entry.meals[0].id,egg.id);saveState();renderCardsOnly({force:true});});
  await p.getByLabel('Egg unit',{exact:true}).selectOption('g');
  const input=p.getByLabel('Egg amount',{exact:true});await input.fill('100');await input.press('Tab');
  const before=await p.evaluate(()=>getFoodEntryTotals(state.cards[0],getFoodEntry(state.cards[0])));
  await p.getByLabel('Egg unit',{exact:true}).selectOption('serving');const after=await p.evaluate(()=>getFoodEntryTotals(state.cards[0],getFoodEntry(state.cards[0])));assert.deepEqual(after,before);
  await p.evaluate(()=>{const c=state.cards[0],egg=c.foodLibrary.find(f=>/egg/i.test(f.name));updateFoodDefinition(c,egg.id,{calories:999});addFoodMeal(c,getTodayKey(),'Dinner');addFoodMeal(c,getTodayKey(),'Supper');});
  assert.equal(await p.evaluate(()=>getFoodEntryTotals(state.cards[0],getFoodEntry(state.cards[0])).calories),before.calories);
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(1600);await p.locator('.food-meal-tabs').getByRole('tab').filter({hasText:'Supper'}).click();await p.screenshot({path:out+'/food-mobile.png'});
  assert.equal(await p.evaluate(()=>getActiveFoodMeal(state.cards[0],getFoodEntry(state.cards[0])).name),'Supper');
 });
 await run('all card types render without crashes and respect mobile width',async p=>{
  const count=await p.evaluate(()=>{state.cards=Object.keys(TYPE_META).map((type,i)=>({...makeCard({type,title:'Test '+type,description:'Sample line one\nSample line two',category:'Personal',items:[{id:'item-'+i,text:'A task to complete',done:false}]}),order:i}));saveState();renderCardsOnly({force:true});return state.cards.length;});
  assert.equal(await p.locator('#boardGrid .task-card').count(),count);
  for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});await p.waitForTimeout(1600);const issues=await p.evaluate(()=>[...document.querySelectorAll('#boardGrid .task-card')].flatMap(card=>{const r=card.getBoundingClientRect();return r.right>innerWidth+1||r.left<0?[{type:card.className,left:r.left,right:r.right,width:innerWidth}]:[]}));assert.deepEqual(issues,[]);}
 });
 await run('project item handlers survive saving and a concurrent diary edit',async p=>{
  await p.evaluate(()=>{state.cards.push(makeCard({type:'checklist',title:'My project',items:[{id:'a',text:'First step',done:false},{id:'b',text:'Second step',done:false}]}));saveState();renderCardsOnly({force:true});});
  await p.locator('.diary-thoughts').fill('A diary draft while thinking about my project.');await p.locator('.type-checklist input[type=checkbox]').first().check();await p.locator('.type-checklist input[type=checkbox]').nth(1).check();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.locator('.type-checklist input:checked').count(),2);
 });
 await run('Today dates reset on a fresh visit and both views retain all records',async p=>{
  await p.locator('[aria-label="Previous planner day"]').click();assert.match(await p.locator('.planner-linked-title-row').innerText(),/Yesterday/);await p.reload();assert.match(await p.locator('.planner-linked-title-row').innerText(),/Today/);
  await p.evaluate(()=>{const c=state.cards.find(c=>c.type==='planlist');for(let i=0;i<8;i++)addPlannerTaskFromPlannerView(c,'2026-01-01','Earlier '+i);});await p.locator('#todayModeButton').click();assert.equal(await p.locator('.earlier-plans .planner-linked-copy').count(),8);await p.locator('.earlier-plans summary').click();assert.ok(await p.locator('.earlier-plans .planner-linked-copy').first().isVisible());await p.locator('#boardModeButton').click();assert.equal(await p.locator('.planner-linked-copy').count(),8);
 });
 await run('readable export preserves duplicate task completion and multiline diary',async p=>{
  const html=await p.evaluate(()=>{const v=state.cards.find(c=>c.type==='planlist');addPlannerTaskFromPlannerView(v,getTodayKey(),'Same task');addPlannerTaskFromPlannerView(v,getTodayKey(),'Same task');const task=getPlannerViewData('today','Personal',{},getTodayKey()).items[0];togglePlannerTaskDone(task);updateDiaryEntry(state.cards.find(c=>c.type==='diary'),getTodayKey(),{thoughts:'My line one\nMy line two'});syncActiveBoard();return buildReadableDataArchive(getStateForStorage());});
  assert.match(html,/My line one\nMy line two/);assert.equal((html.match(/Same task/g)||[]).length,2);assert.match(html,/Unfinished/);assert.match(html,/Completion time/);
 });
 await run('food-card render does not move vertical scroll or create edit-save loops',async p=>{
  await p.evaluate(()=>{state.cards=[...Array.from({length:12},(_,i)=>({...makeCard({type:'diary',title:'Test diary '+i}),order:i})),...Array.from({length:3},(_,i)=>({...makeCard({type:'food',title:'Test food '+i}),order:12+i}))];saveState();renderCardsOnly({force:true});});await p.evaluate(()=>flushDeviceWrites());await p.waitForTimeout(300);
  const before=await p.evaluate(()=>{window.scrollTo(0,400);return {y:scrollY,updatedAt:state.updatedAt};});await p.evaluate(()=>renderCardsOnly({force:true}));await p.waitForTimeout(400);
  assert.equal(await p.evaluate(()=>scrollY),before.y);assert.equal(await p.evaluate(()=>state.updatedAt),before.updatedAt);
 });
 await run('mobile header content stays visible without overlapping controls',async p=>{
  for(const width of [320,390,768]){await p.setViewportSize({width,height:844});await p.waitForTimeout(1600);const r=await p.evaluate(()=>{const button=document.getElementById('boardSwitcherButton'),name=document.getElementById('boardSwitcherName'),title=button.getBoundingClientRect(),controls=elements.topControlsToggleButton.getBoundingClientRect();return {titleWidth:title.width,height:title.height,right:title.right,left:controls.left,textFits:name.scrollWidth<=name.clientWidth+1,clickable:button.contains(document.elementFromPoint(title.x+title.width/2,title.y+title.height/2))};});assert.ok(r.titleWidth>=44&&r.height>=44&&r.textFits&&r.clickable,JSON.stringify(r));assert.ok(r.right<=r.left,JSON.stringify(r));}
 });
 await run('publishable key is not used as a user bearer token',async p=>{const headers=await p.evaluate(()=>({anon:getCloudHeaders(),user:getCloudHeaders({access_token:'test-jwt'})}));assert.equal(headers.anon.Authorization,undefined);assert.equal(headers.user.Authorization,'Bearer test-jwt');});
 await run('routine history is retained beyond one year',async p=>{
  assert.equal(await p.evaluate(()=>{const c={history:Array.from({length:500},(_,i)=>({date:getTodayKey(addDays(new Date('2024-01-01T12:00:00'),i)),done:1,total:1,percent:100,items:[]}))};normalizeRoutineHistory(c);return c.history.length;}),500);
 });
 await run('new diary does not invent a feeling',async p=>{assert.equal(await p.locator('.mood-picker .is-active').count(),0);});
 await run('preview updates wait for unfinished drafts and saving errors without hiding save status',async p=>{
  const result=await p.evaluate(()=>{
   textEditGuardUntil=0;
   state.cards[0].plannerDraftText='I have not finished thinking';
   const unfinished=canReloadLocalDevPage();state.cards[0].plannerDraftText='';
   lastLocalSaveOk=false;const failed=canReloadLocalDevPage();
   setSaveStatus('Not saved on device','error');markLocalDevReloadPending();
   return {unfinished,failed,label:elements.savedState.textContent};
  });
  assert.equal(result.unfinished,false);assert.equal(result.failed,false);assert.equal(result.label,'Not saved on device');
 });
 await run('preview does not allow cloud authentication or saving',async p=>{
  let requests=0;await p.route('https://**supabase.co/**',r=>{requests++;return r.fulfill({status:503,body:'Blocked'});});await p.goto(URL+'?preview=1');await p.evaluate(()=>{checkCloudSetup();pushCloudState({manual:true});});await p.waitForTimeout(200);assert.equal(requests,0);assert.equal(await p.locator('#cloudSignInButton').isDisabled(),true);
 });
 await run('multi-page life review prints beyond the first screen',async p=>{
  await p.evaluate(()=>{const v=state.cards.find(c=>c.type==='planlist'),src=getPlannerWriteSourceCard(v,getTodayKey());for(let i=0;i<100;i++){const t=LifePlanner.add(src,getTodayKey(),'Completed item '+i,createId());LifePlanner.complete(src,t.id,getTodayKey());}activeReportType='progress';openReportsModal();document.body.classList.add('print-report');});
  await p.emulateMedia({media:'print'});assert.ok(await p.locator('#reportPrintArea').evaluate(e=>e.getBoundingClientRect().height>2000));await p.pdf({path:out+'/review-sample.pdf',format:'A4'});
 });
 fs.writeFileSync(out+'/features-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
