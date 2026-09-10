const browsers=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-planning-tests';fs.mkdirSync(out,{recursive:true});
const results=[];
(async()=>{
 const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
 async function run(name,fn){
  const context=await browser.newContext({viewport:{width:1080,height:1600},timezoneId:'Asia/Kuala_Lumpur'});
  await context.route('https://**/*',route=>route.fulfill({status:503,body:'No external requests in tests'}));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6500);page.on('pageerror',error=>errors.push(error.stack));page.on('dialog',dialog=>dialog.accept());
  try{await page.goto(URL+'?preview=1');await fn(page,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
  catch(error){results.push({name,pass:false,error:error.stack,pageErrors:errors});await page.screenshot({path:out+'/planning-failure-'+results.length+'.png'}).catch(()=>{});}
  console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 const tasks=p=>p.locator('#tasksModeButton').click();
 const add=async(p,title,area='Culturely',date)=>{await p.getByLabel('New task',{exact:true}).fill(title);await p.locator('.task-capture').getByLabel('Area',{exact:true}).selectOption(area);if(date==='')await p.getByRole('button',{name:'Clear planned day',exact:true}).click();else if(date!==undefined)await p.getByLabel('Planned day (optional)',{exact:true}).fill(date);await p.getByLabel('New task',{exact:true}).press('Enter');};
 const edit=async(p,title)=>{await p.getByRole('button',{name:'Task options: '+title,exact:true}).click();await p.getByRole('button',{name:'Edit planner task: '+title,exact:true}).click();};
 await run('categorized task entry, metadata edit, undated capture, search and reload retain original records',async p=>{
  await tasks(p);await add(p,'Prepare Culturely launch');await edit(p,'Prepare Culturely launch');
  await p.locator('.task-edit-details').getByLabel('Project',{exact:true}).fill('Website launch');await p.getByLabel('Status',{exact:true}).selectOption('waiting');await p.getByLabel('Task notes',{exact:true}).fill('First line\nSecond line');await p.getByLabel('Deadline (optional)',{exact:true}).fill('2027-01-01');await p.getByLabel('Save planner task',{exact:true}).click();
  await edit(p,'Prepare Culturely launch');await p.getByRole('button',{name:'Clear deadline',exact:true}).click();await p.getByLabel('Save planner task',{exact:true}).click();assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].deadline),'');
  await add(p,'Book a workout','Fitness','');assert.equal(await p.getByRole('group',{name:'Task view'}).getByRole('button',{name:'All tasks',exact:true}).getAttribute('aria-pressed'),'true');
  await p.getByLabel('Filter by area',{exact:true}).selectOption('Culturely');assert.equal(await p.locator('.planner-linked-copy').count(),1);assert.match(await p.locator('.task-results').innerText(),/Website launch/);
  await p.getByLabel('Search tasks and projects').fill('missing');assert.equal(await p.locator('.planner-linked-copy').count(),0);await p.getByLabel('Search tasks and projects').fill('launch');assert.equal(await p.locator('.planner-linked-copy').count(),1);
  await p.evaluate(()=>flushDeviceWrites());await p.reload();await tasks(p);assert.equal(await p.locator('.planner-linked-copy').innerText(),'Prepare Culturely launch');
  const task=await p.evaluate(()=>getPlannerSourceItems().find(t=>t.title==='Prepare Culturely launch'));assert.equal(task.notes,'First line\nSecond line');assert.equal(task.status,'waiting');
 });
 await run('historical completion and late completion retain the selected completion day in old and new planner views',async p=>{
  await tasks(p);const dates=await p.evaluate(()=>({today:getTodayKey(),yesterday:LifePlanning.shift(getTodayKey(),-1)}));
  await p.getByLabel('Selected day',{exact:true}).fill(dates.yesterday);await add(p,'Done yesterday','Personal');await p.getByRole('checkbox',{name:'Mark done: Done yesterday',exact:true}).click();
  await p.getByLabel('Selected day',{exact:true}).fill(dates.today);assert.equal(await p.locator('.planner-linked-copy').count(),0);
  await add(p,'Late task','Personal',dates.yesterday);await p.getByRole('checkbox',{name:'Mark done: Late task',exact:true}).click();assert.equal(await p.locator('.planner-linked-copy').count(),1);
  await p.locator('#boardModeButton').click();assert.equal(await p.locator('.planner-linked-copy').filter({hasText:'Late task'}).count(),1);assert.equal(await p.locator('.planner-linked-copy').filter({hasText:'Done yesterday'}).count(),0);
 });
 await run('unfinished capture and calendar drafts survive typing pauses, view changes and reload',async p=>{
  await tasks(p);await p.getByLabel('New task',{exact:true}).pressSequentially('Keep every character',{delay:25});await p.locator('#todayModeButton').click();await tasks(p);assert.equal(await p.getByLabel('New task',{exact:true}).inputValue(),'Keep every character');
  await p.reload();await tasks(p);assert.equal(await p.getByLabel('New task',{exact:true}).inputValue(),'Keep every character');
  await p.locator('#calendarModeButton').click();await p.getByRole('button',{name:'Add activity',exact:true}).click();await p.getByLabel('Activity name',{exact:true}).fill('Trip planning');await p.getByLabel('Activity notes',{exact:true}).fill('Keep my entire draft\nSecond line');await p.locator('#todayModeButton').click();await p.locator('#calendarModeButton').click();assert.equal(await p.getByLabel('Activity notes',{exact:true}).inputValue(),'Keep my entire draft\nSecond line');await p.reload();await p.locator('#calendarModeButton').click();assert.equal(await p.getByLabel('Activity name',{exact:true}).inputValue(),'Trip planning');
 });
 await run('activities validate, save, edit, export and archive without adding board clutter',async p=>{
  await p.locator('#calendarModeButton').click();await p.getByRole('button',{name:'Add activity',exact:true}).click();await p.getByLabel('Activity name',{exact:true}).fill('Culturely planning meeting');await p.getByLabel('Activity area',{exact:true}).selectOption('Culturely');
  await p.getByLabel('Start date',{exact:true}).fill('2026-12-10');await p.getByLabel('End date',{exact:true}).fill('2026-12-10');await p.getByLabel('Start time',{exact:true}).fill('14:00');await p.getByLabel('End time',{exact:true}).fill('13:00');await p.getByRole('button',{name:'Save activity',exact:true}).click();assert.match(await p.locator('.activity-editor [role=alert]').innerText(),/after/);
  await p.getByLabel('End time',{exact:true}).fill('15:00');await p.getByLabel('Location',{exact:true}).fill('Office');await p.getByLabel('Activity notes',{exact:true}).fill('Agenda\nReview launch');await p.getByRole('button',{name:'Save activity',exact:true}).click();assert.equal(await p.locator('.activity-row h4').innerText(),'Culturely planning meeting');
  await p.getByRole('button',{name:'Edit activity: Culturely planning meeting',exact:true}).click();await p.getByLabel('Activity name',{exact:true}).fill('Culturely launch review');await p.getByRole('button',{name:'Save activity',exact:true}).click();assert.equal(await p.locator('.activity-row h4').innerText(),'Culturely launch review');
  await p.evaluate(()=>flushDeviceWrites());await p.reload();await p.locator('#calendarModeButton').click();assert.equal(await p.locator('.activity-row h4').innerText(),'Culturely launch review');
  const data=await p.evaluate(()=>{saveCurrentLayout();commitCustomLayoutColumns(getCustomLayoutColumns(2));syncActiveBoard();return {html:buildReadableDataArchive(getStateForStorage()),visible:getOrderedCards().filter(c=>c.calendarOnly).length,link:LifePlanning.googleLink(calendarActivities()[0].activity)};});assert.equal(data.visible,0);assert.match(data.html,/Agenda\nReview launch/);assert.match(data.link,/calendar.google.com/);
  await p.locator('.activity-more summary').click();await p.locator('.activity-more').getByRole('button',{name:'Archive',exact:true}).click();assert.equal(await p.locator('.activity-row').count(),0);assert.equal(await p.evaluate(()=>getArchivedCards().filter(c=>c.activity).length),1);
 });
 await run('phone and portrait desktop expose all task and activity controls without horizontal overflow',async p=>{
  await tasks(p);await add(p,'Review the Sunrise Villa bookings and prepare the next guest arrival checklist','Sunrise Villa');
  for(const [width,height] of [[320,740],[390,844],[768,1024],[1080,1920]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(150);
   for(const mode of ['tasks','calendar']){
    await p.locator('#'+mode+'ModeButton').click();if(mode==='calendar')await p.getByRole('button',{name:'Add activity',exact:true}).click();
    const issues=await p.locator('.planning-workspace').evaluate(e=>({overflow:e.scrollWidth-e.clientWidth,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}));assert.ok(issues.overflow<=1&&issues.right<=width+1,JSON.stringify({width,mode,issues}));
    assert.ok(await p.locator('.planning-workspace input,.planning-workspace select,.planning-workspace textarea').evaluateAll(nodes=>nodes.every(e=>e.getBoundingClientRect().right<=innerWidth+1)));
    await p.screenshot({path:out+'/'+mode+'-'+width+'.png',fullPage:true});
    if(mode==='tasks'){
     if(width===320)assert.ok(await p.getByLabel('Planned day (optional)',{exact:true}).evaluate(e=>e.getBoundingClientRect().width>=200));
     await edit(p,'Review the Sunrise Villa bookings and prepare the next guest arrival checklist');
     assert.ok(await p.locator('.planner-linked-edit-form').evaluate(e=>e.getBoundingClientRect().width>=240&&e.scrollWidth<=e.clientWidth+1));
     await p.getByLabel('Task notes',{exact:true}).fill('A complete thought across\nmultiple lines');
     await p.screenshot({path:out+'/task-editor-'+width+'.png',fullPage:true});
     await p.getByLabel('Cancel planner task edit',{exact:true}).click();
    }
    if(mode==='calendar')await p.getByRole('button',{name:'Cancel',exact:true}).click();
   }
  }
 });
 await run('separate tabs writing tasks and activities to separate boards both survive reload',async(p,c)=>{
  const ids=await p.evaluate(()=>{const a=state.activeBoardId,b=createBoardRecord({name:'Other board'});state.boards.push(b);saveState();return {a,b:b.id};});await p.evaluate(()=>flushDeviceWrites());
  const second=await c.newPage();await second.goto(URL+'?preview=1');await second.evaluate(id=>{switchBoard(id);},ids.b);
  await tasks(p);await add(p,'Culturely task on first board');
  await second.locator('#calendarModeButton').click();await second.getByRole('button',{name:'Add activity',exact:true}).click();await second.getByLabel('Activity name',{exact:true}).fill('Private second board activity');await second.getByRole('button',{name:'Save activity',exact:true}).click();
  await p.evaluate(()=>flushDeviceWrites());await second.evaluate(()=>flushDeviceWrites());await p.reload();await second.reload();
  await tasks(p);assert.equal(await p.locator('.planner-linked-copy').innerText(),'Culturely task on first board');assert.equal(await p.evaluate(()=>calendarActivities().length),0);
  assert.equal(await second.evaluate(()=>getPlannerSourceItems().length),0);assert.equal(await second.evaluate(()=>calendarActivities()[0].activity.title),'Private second board activity');
 });
 await run('task edits reject a newer record instead of overwriting its completion',async p=>{
  await tasks(p);await add(p,'Concurrent task');await edit(p,'Concurrent task');await p.getByLabel('Task name',{exact:true}).fill('Draft rename');
  await p.evaluate(()=>{const item=getPlannerSourceItems()[0];LifePlanner.complete(item.card,item.taskId,getTodayKey());});
  await p.getByLabel('Save planner task',{exact:true}).click();assert.equal(await p.getByLabel('Task name',{exact:true}).inputValue(),'Draft rename');assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),true);
 });
 await run('activity conflict review requires a chosen complete version and preserves unrelated records',async p=>{
  await p.evaluate(async()=>{
   const activity=LifePlanning.activityFromDraft({title:'Review meeting',area:'Culturely',allDay:true,startDate:'2026-12-10',endDate:'2026-12-10',notes:'Original'});
   const card=makeCard({type:'event',title:activity.title});card.calendarOnly=true;card.activity=activity;state.cards.push(card);saveState();await flushDeviceWrites();
   const base=getStateForStorage();card.activity={...activity,notes:'This version'};saveState();await flushDeviceWrites();
   const remote=LifeStateMerge.copy(base);remote.boards.find(b=>b.id===state.activeBoardId).cards.find(c=>c.id===card.id).activity.notes='Other version';
   state.syncConflicts=LifeStateMerge.registerConflicts(LifeStateMerge.merge(base,getStateForStorage(),remote).conflicts,{},createId);saveState();await flushDeviceWrites();openRecovery();
  });
  const save=p.getByRole('button',{name:'Save activity version',exact:true});assert.equal(await save.isDisabled(),true);
  await p.getByRole('radio',{name:'Other tab version',exact:true}).check();await p.getByLabel('Apply this version to this activity only.',{exact:true}).check();await save.click();await p.getByText(/Activity version saved/).waitFor();
  assert.equal(await p.evaluate(()=>calendarActivities()[0].activity.notes),'Other version');assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);
 });
 await run('failed device writes retain task and activity drafts and retries do not duplicate records',async p=>{
  await tasks(p);await p.evaluate(()=>flushDeviceWrites());
  const fail=()=>p.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===localStorage)throw new DOMException('Test quota','QuotaExceededError');return window.originalSetItem.call(this,key,value);};});
  const recover=()=>p.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});
  await fail();await add(p,'Keep my whole task');assert.equal(await p.getByLabel('New task',{exact:true}).inputValue(),'Keep my whole task');assert.match(await p.locator('.task-capture [role=status]').innerText(),/Not saved/);
  await recover();await p.getByLabel('New task',{exact:true}).press('Enter');await p.evaluate(()=>flushDeviceWrites());assert.equal(await p.evaluate(()=>getPlannerSourceItems().filter(t=>t.title==='Keep my whole task').length),1);
  await edit(p,'Keep my whole task');await p.getByLabel('Task notes',{exact:true}).fill('Do not lose these notes');await fail();await p.getByLabel('Save planner task',{exact:true}).click();assert.equal(await p.getByLabel('Task notes',{exact:true}).inputValue(),'Do not lose these notes');await recover();await p.getByLabel('Save planner task',{exact:true}).click();assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].notes),'Do not lose these notes');
  await p.locator('#calendarModeButton').click();await p.getByRole('button',{name:'Add activity',exact:true}).click();await p.getByLabel('Activity name',{exact:true}).fill('Keep my activity');await fail();await p.getByRole('button',{name:'Save activity',exact:true}).click();assert.equal(await p.getByLabel('Activity name',{exact:true}).inputValue(),'Keep my activity');assert.match(await p.locator('.activity-editor [role=alert]').innerText(),/Not saved/);
  await recover();await p.getByRole('button',{name:'Save activity',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.evaluate(()=>calendarActivities().filter(e=>e.activity.title==='Keep my activity').length),1);
 });
 fs.writeFileSync(out+'/planning-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
