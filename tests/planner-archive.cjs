const engines=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-planner-archive';
fs.mkdirSync(out,{recursive:true});const results=[];
async function seed(page,{completed=false}={}) {
  return page.evaluate(async completed=>{
    const source=makeCard({type:'planner',title:'Archive source',category:'Personal'});source.id='archive-source';
    LifePlanner.add(source,getTodayKey(),'Archive regression task','archive-task',1000);
    if(completed)LifePlanner.complete(source,'archive-task',getTodayKey());
    LifePlanner.project(source);
    const view=makeCard({type:'planlist',title:'Archive view',category:'Personal',planlistView:'today'});
    state.boards=[createBoardRecord({id:'archive-board',name:'Test archive',cards:[source,view],archivedCards:[]}),createBoardRecord({id:'other-board',name:'Other',cards:[LifeStateMerge.copy(source),makeCard({type:'quote',description:'Keep my original note\nSecond line'})]})];
    applyBoardToState(state,'archive-board');saveState({skipCloud:true});await flushDeviceWrites();render();
    return LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]);
  },completed);
}
const task=page=>page.evaluate(()=>getPlannerSourceCards().find(c=>c.id==='archive-source').plannerTasks[0]);
const archive=page=>page.evaluate(()=>archivePlannerTask(getPlannerSourceItems().find(i=>i.taskId==='archive-task')));
const flush=page=>page.evaluate(async()=>{LifeDeviceStore.configure(commitDeviceWrites);await flushDeviceWrites();});
async function absent(page) {
  assert.equal(await page.evaluate(()=>getPlannerViewData('today','Personal',{},getTodayKey()).items.filter(i=>i.taskId==='archive-task').length),0);
  assert.equal(await page.evaluate(()=>getWorkspaceTaskItems().filter(i=>i.taskId==='archive-task').length),0);
  assert.equal(await page.evaluate(()=>getPlannerSourceItems().filter(i=>i.taskId==='archive-task').length),0);
}
(async()=>{
  const browser=await engines[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'External services blocked in synthetic tests'}));
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.stack));
    try{await page.goto(URL+'?preview=1');await fn(page,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,pageErrors:errors});await page.screenshot({path:out+'/failure-'+results.length+'.png'}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Actual task menu archive survives immediate reload with an unapplied journal and is recoverable',async page=>{
    const before=await seed(page);await page.evaluate(()=>LifeDeviceStore.configure(()=>false));
    await page.locator('.planner-task-menu-toggle').first().click();await page.locator('.planner-task-menu').getByRole('button',{name:'Archive',exact:true}).click();
    await page.reload();await absent(page);const after=await task(page);assert.ok(after.archivedAt);assert.equal(after.done,false);assert.equal(after.id,before.id);
    const text=await page.evaluate(()=>renderArchivedPlannerTasks().innerText);assert.match(text,/Archive regression task/);
    assert.equal(await page.evaluate(()=>restorePlannerTask('archive-source','archive-task')),true);await flush(page);await page.reload();assert.equal((await task(page)).archivedAt,0);
  });
  for(const edit of ['rename','complete'])for(const order of ['archive-first','edit-first'])await run(`Two-tab stale ${edit}, ${order}, cannot revive an archive after reload`,async(page,context)=>{
    const before=await seed(page),other=await context.newPage();await other.goto(URL+'?preview=1');
    for(const p of [page,other])await p.evaluate(()=>LifeDeviceStore.configure(()=>false));
    async function stale(){await other.evaluate(edit=>{
      const card=getPlannerSourceCards()[0];if(edit==='rename')LifePlanner.change(card,'archive-task',{title:'Stale tab renamed task'});else LifePlanner.complete(card,'archive-task',getTodayKey());
      LifePlanner.project(card);saveState({skipCloud:true});
    },edit);}
    if(order==='archive-first'){assert.equal(await archive(page),true);await stale();}else{await stale();assert.equal(await archive(page),true);}
    await flush(page);await page.reload();await absent(page);const after=await task(page);assert.ok(after.archivedAt);assert.equal(after.title,before.title);assert.equal(after.done,before.done);
    const conflicts=await page.evaluate(()=>state.syncConflicts.filter(c=>c.kind==='planner-task'));assert.equal(conflicts.length,1);assert.ok([conflicts[0].local,conflicts[0].remote].some(t=>edit==='rename'?t.title==='Stale tab renamed task':t.done));
  });
  await run('Archiving a completed task preserves original completion date, timestamp and event history through reload',async page=>{
    const before=await seed(page,{completed:true});assert.equal(await archive(page),true);await flush(page);await page.reload();await absent(page);
    const after=await task(page);for(const key of ['done','completedOn','completedAt','completionRecordedAt','completionEvents'])assert.deepEqual(after[key],before[key]);
    assert.equal(await page.evaluate(()=>restorePlannerTask('archive-source','archive-task')),true);await flush(page);await page.reload();assert.deepEqual((await task(page)).completionEvents,before.completionEvents);
  });
  await run('Failed archive and restore journal writes roll back without pretending success; retry persists',async page=>{
    const before=await seed(page);
    await page.evaluate(()=>{window.originalStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Injected journal failure');};});
    assert.equal(await archive(page),false);assert.deepEqual(await task(page),before);
    await page.evaluate(()=>LifeDeviceStore.stage=window.originalStage);assert.equal(await archive(page),true);await flush(page);const archived=await task(page);
    await page.evaluate(()=>LifeDeviceStore.stage=()=>{throw new Error('Injected journal failure');});
    assert.equal(await page.evaluate(()=>restorePlannerTask('archive-source','archive-task')),false);assert.deepEqual(await task(page),archived);
    await page.evaluate(()=>LifeDeviceStore.stage=window.originalStage);assert.equal(await page.evaluate(()=>restorePlannerTask('archive-source','archive-task')),true);await flush(page);await page.reload();assert.equal((await task(page)).archivedAt,0);
  });
  await run('Captured task and Undo cannot archive or restore matching IDs on a different board',async page=>{
    await seed(page);await page.evaluate(()=>window.capturedItem=getPlannerSourceItems()[0]);assert.equal(await archive(page),true);const expected=await task(page);
    await page.evaluate(()=>switchBoard('other-board'));const other=await task(page);
    assert.equal(await page.evaluate(()=>archivePlannerTask(window.capturedItem)),false);
    assert.equal(await page.evaluate(expected=>restorePlannerTask('archive-source','archive-task',{boardId:'archive-board',expected}),expected),false);
    assert.deepEqual(await task(page),other);await flush(page);await page.reload();assert.deepEqual(await task(page),other);
  });
  await run('Undo refuses a newer archived task instead of overwriting later edits',async page=>{
    await seed(page);await archive(page);const expected=await task(page);
    await page.evaluate(async()=>{const c=getPlannerSourceCards()[0];LifePlanner.change(c,'archive-task',{title:'Newer archived wording'});LifePlanner.project(c);saveState({skipCloud:true});await flushDeviceWrites();});
    assert.equal(await page.evaluate(expected=>restorePlannerTask('archive-source','archive-task',{boardId:state.activeBoardId,expected}),expected),false);assert.equal((await task(page)).title,'Newer archived wording');assert.ok((await task(page)).archivedAt);
  });
  await run('Older stored active-versus-archive conflicts stay out of active views until explicit version review',async page=>{
    await seed(page);const before=await page.evaluate(async()=>{
      const base=getStateForStorage(),remote=LifeStateMerge.copy(base),c=getPlannerSourceCards()[0];
      LifePlanner.change(c,'archive-task',{title:'Older conflicting edit'});LifePlanner.project(c);syncActiveBoard({touchBoard:false});
      const other=remote.boards[0].cards.find(c=>c.id==='archive-source');LifePlanner.change(other,'archive-task',{archivedAt:Date.now()});
      state.syncConflicts=LifeStateMerge.registerConflicts(LifeStateMerge.merge(base,getStateForStorage(),remote).conflicts,{},createId);
      saveState({skipCloud:true});await flushDeviceWrites();return LifeStateMerge.copy(c.plannerTasks[0]);
    });
    await page.reload();assert.deepEqual(await task(page),before);await absent(page);
    assert.match(await page.evaluate(()=>renderArchivedPlannerTasks().innerText),/Review versions/);
    await page.evaluate(()=>openRecovery());await page.getByRole('radio',{name:'Current task',exact:true}).check();await page.getByLabel('Apply this version to this task only.',{exact:true}).check();await page.getByRole('button',{name:'Save task version',exact:true}).click();await page.getByText(/Task version saved/).waitFor();
    await page.reload();assert.equal(await page.evaluate(()=>state.syncConflicts.length),0);assert.equal(await page.evaluate(()=>getPlannerSourceItems().length),1);
  });
  await run('Task menu and Archive restore remain reachable on phone and portrait layouts',async page=>{
    await seed(page);for(const width of [320,390,768,1024]){
      await page.setViewportSize({width,height:1000});const toggle=page.locator('.planner-task-menu-toggle').first();await toggle.click();
      const action=page.locator('.planner-task-menu').getByRole('button',{name:'Archive',exact:true});await action.waitFor({state:'visible'});
      assert.equal(await action.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
      await page.screenshot({path:out+'/menu-'+width+'.png'});await page.evaluate(()=>closeCardActionMenus());
    }
    await archive(page);await flush(page);await page.reload();await absent(page);
  });
  fs.writeFileSync(out+'/planner-archive-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
