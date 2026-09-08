const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(out,{recursive:true});const results=[];

async function seed(page,{conflict=true,archived=false,remotePatch={}}={}) {
  // Leave the old app first so its in-flight journal cannot repopulate a fixture.
  await page.goto(URL+'__test_reset__');
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.goto(URL+'?preview=1');
  return page.evaluate(async({conflict,archived,remotePatch})=>{
    const source=makeCard({type:'planner',title:'Personal planner',category:'Personal'});source.id='review-source';
    LifePlanner.add(source,'2026-09-01','Call the clinic','review-task',1000);
    LifePlanner.add(source,'2026-09-01','Call the clinic','same-name-independent',1001);LifePlanner.project(source);
    const view=makeCard({type:'planlist',title:'My planner',category:'Personal'});
    state.boards=[createBoardRecord({id:'review-board',name:'Personal',cards:archived?[view]:[source,view],archivedCards:archived?[{...source,archivedAt:2000}]:[]}),
      createBoardRecord({id:'untouched',name:'Other board',cards:[makeCard({type:'quote',title:'Keep this note',description:'Original thoughts\nSecond line'})]})];
    applyBoardToState(state,'review-board');saveState({skipCloud:true});await flushDeviceWrites();
    const base=getStateForStorage(),key=archived?'archivedCards':'cards';
    if(conflict) {
      LifePlanner.complete(getPlannerSourceCards()[0],'review-task','2026-09-07',new Date('2026-09-08T12:30:00').getTime());
      LifePlanner.project(getPlannerSourceCards()[0]);saveState({skipCloud:true});await flushDeviceWrites();
      const remote=LifeStateMerge.copy(base),other=remote.boards[0][key].find(card=>card.id==='review-source');
      LifePlanner.change(other,'review-task',{dateKey:'2026-09-15',...remotePatch},new Date('2026-09-08T13:00:00').getTime());
      state.syncConflicts=LifeStateMerge.registerConflicts(LifeStateMerge.merge(base,getStateForStorage(),remote).conflicts.map(c=>({...c,source:'device'})),{},createId);
      saveState({skipCloud:true});await flushDeviceWrites();
    }
    render();if(conflict)openRecovery();
    return {task:LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]),other:JSON.stringify(state.boards[1].cards),independent:JSON.stringify(getPlannerSourceCards()[0].plannerTasks[1])};
  },{conflict,archived,remotePatch});
}
const task=page=>page.evaluate(()=>getPlannerSourceCards()[0].plannerTasks.find(task=>task.id==='review-task'));
async function choose(page,label) {
  await page.getByRole('radio',{name:label,exact:true}).check();
  await page.getByLabel('Apply this version to this task only.',{exact:true}).check();
  await page.getByRole('button',{name:'Save task version',exact:true}).click();
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'No external services in tests'}));
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.accept());
    try {await page.goto(URL+'?preview=1');await fn(page,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,pageErrors:errors});await page.screenshot({path:out+'/planner-review-failure-'+results.length+'.png'}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Complete task versions require explicit choice and consent, then survive reload without changing other records',async page=>{
    const before=await seed(page);assert.equal(await page.locator('.planner-conflict-form').count(),1);
    const save=page.getByRole('button',{name:'Save task version',exact:true});assert.equal(await save.isDisabled(),true);
    await page.getByRole('radio',{name:'Other tab version',exact:true}).check();assert.equal(await save.isDisabled(),true);
    await page.getByLabel('Apply this version to this task only.',{exact:true}).check();await save.click();await page.getByText(/Task version saved/).waitFor();
    await page.reload();const result=await task(page);assert.equal(result.done,false);assert.equal(result.completedAt,0);assert.equal(result.dateKey,'2026-09-15');
    assert.equal(await page.evaluate(()=>JSON.stringify(state.boards[1].cards)),before.other);
    assert.equal(await page.evaluate(()=>JSON.stringify(getPlannerSourceCards()[0].plannerTasks[1])),before.independent);
    assert.equal(await page.evaluate(()=>state.syncConflicts.length),0);
    const copies=await page.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]));assert.match(JSON.stringify(copies),/2026-09-07/);assert.match(JSON.stringify(copies),/2026-09-15/);
  });
  await run('Keeping completion retains its selected historical day and real recording timestamp',async page=>{
    const before=await seed(page);await page.locator('.planner-conflict-history summary').first().click();
    assert.match(await page.locator('.planner-conflict-history').first().innerText(),/12:30:00\.000/);
    assert.match(await page.locator('.planner-conflict-history').first().innerText(),/GMT\+8/);
    await choose(page,'Current task');await page.getByText(/Task version saved/).waitFor();
    const kept=await task(page);assert.equal(kept.done,true);assert.equal(kept.completedOn,'2026-09-07');assert.equal(kept.completedAt,before.task.completedAt);assert.equal(kept.completionRecordedAt,before.task.completionRecordedAt);
    assert.equal(await page.evaluate(()=>LifePlanner.forDay(getPlannerSourceCards()[0],'2026-09-08').some(t=>t.id==='review-task')),false);
    assert.equal(await page.evaluate(()=>LifePlanner.forDay(getPlannerSourceCards()[0],'2026-09-07').find(t=>t.id==='review-task').done),true);
  });
  await run('A newer edit blocks stale review and refresh requires a new selection and consent',async page=>{
    await seed(page);await page.evaluate(async()=>{LifePlanner.change(getPlannerSourceCards()[0],'review-task',{title:'Newer wording'});saveState({skipCloud:true});await flushDeviceWrites();});
    await choose(page,'Other tab version');await page.getByText(/task changed after you opened/).waitFor();assert.equal((await task(page)).title,'Newer wording');
    await page.getByRole('button',{name:'Refresh comparison',exact:true}).click();await page.getByText(/Current task refreshed/).waitFor();
    assert.equal(await page.getByRole('button',{name:'Save task version',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('radio',{checked:true}).count(),0);
    await choose(page,'Current task');await page.getByText(/Task version saved/).waitFor();assert.equal((await task(page)).title,'Newer wording');
  });
  await run('Failed recovery or primary storage writes preserve the original task and unresolved comparison',async page=>{
    for(const key of ['recovery','primary']){
      await seed(page);const before=await task(page);
      await page.evaluate(key=>{window.nativeSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===(key==='recovery'?CLOUD_RECOVERY_KEY:STORAGE_KEY))throw new DOMException('Injected full storage','QuotaExceededError');return window.nativeSetItem.call(this,name,value);};},key);
      await choose(page,'Other tab version');await page.getByText(key==='recovery'?/recovery copy could not be saved/:/choice could not be saved/).waitFor();
      assert.deepEqual(await task(page),before);assert.equal(await page.evaluate(()=>state.syncConflicts.length),1);
      await page.evaluate(()=>{Storage.prototype.setItem=window.nativeSetItem;});await page.getByRole('button',{name:'Close recovery',exact:true}).click();
    }
  });
  await run('Review in one tab retains another board edit and stale conflict IDs cannot return',async(page,context)=>{
    await seed(page);const second=await context.newPage();await second.goto(URL+'?preview=1');
    const old=await second.evaluate(()=>LifeStateMerge.copy(state.syncConflicts));
    await second.evaluate(async()=>{switchBoard('untouched');state.cards[0].description='New writing on another board';saveState({skipCloud:true});await flushDeviceWrites();});
    await choose(page,'Other tab version');await page.getByText(/Task version saved/).waitFor();
    await second.evaluate(async old=>{state.syncConflicts=old;saveState({skipCloud:true});await flushDeviceWrites();},old);
    assert.equal(await second.evaluate(()=>state.syncConflicts.length),0);assert.equal(await second.evaluate(()=>state.cards[0].description),'New writing on another board');
    await page.reload();assert.equal((await task(page)).dateKey,'2026-09-15');
  });
  await run('Actual queued writes from two tabs produce one whole-task conflict, never mixed completion and schedule',async(page,context)=>{
    await seed(page,{conflict:false});const second=await context.newPage();await second.goto(URL+'?preview=1');
    for(const p of [page,second])await p.evaluate(()=>LifeDeviceStore.configure(()=>false));
    await page.evaluate(()=>{LifePlanner.complete(getPlannerSourceCards()[0],'review-task','2026-09-07',new Date('2026-09-08T12:30:00').getTime());LifePlanner.project(getPlannerSourceCards()[0]);saveState({skipCloud:true});});
    await second.evaluate(()=>{LifePlanner.change(getPlannerSourceCards()[0],'review-task',{dateKey:'2026-09-15'});LifePlanner.project(getPlannerSourceCards()[0]);saveState({skipCloud:true});});
    await page.evaluate(async()=>{LifeDeviceStore.configure(commitDeviceWrites);await flushDeviceWrites();openRecovery();});
    const current=await task(page),conflict=await page.evaluate(()=>state.syncConflicts[0]);
    assert.equal(conflict.kind,'planner-task');assert.equal(current.done&&current.dateKey==='2026-09-15',false);
    assert.equal(await page.locator('.planner-conflict-form').count(),1);
    await choose(page,'Other tab version');await page.getByText(/Task version saved/).waitFor();assert.equal(await page.evaluate(()=>state.syncConflicts.length),0);
  });
  await run('Archived planner sources and soft-removed task versions remain recoverable',async page=>{
    await seed(page,{archived:true});await choose(page,'Other tab version');await page.getByText(/Task version saved/).waitFor();assert.equal((await task(page)).dateKey,'2026-09-15');
    await page.getByRole('button',{name:'Close recovery',exact:true}).click();await seed(page,{remotePatch:{deletedAt:Date.now()}});
    await choose(page,'Other tab version');await page.getByText(/Task version saved/).waitFor();
    assert.ok((await task(page)).deletedAt);assert.equal(await page.evaluate(()=>getPlannerSourceCards()[0].plannerTasks.length),2);
    assert.equal((await task(page)).done,false);
  });
  await run('Missing or ambiguous legacy timestamps are not guessed or offered as an applicable version',async page=>{
    await seed(page,{remotePatch:{legacyNeedsReview:true}});
    assert.equal(await page.getByRole('button',{name:'Save task version',exact:true}).count(),0);
    assert.match(await page.locator('.planner-conflict-item').innerText(),/ambiguous history/);
    assert.equal(await page.evaluate(()=>state.syncConflicts.length),1);
  });
  await run('Whole-task review fits phone and desktop, with readable dates and literal untrusted titles',async page=>{
    await seed(page,{remotePatch:{title:'<img src=x onerror=alert(1)>\n'+ 'Long task text '.repeat(30)}});
    assert.equal(await page.locator('.planner-conflict-item img').count(),0);
    await page.getByRole('button',{name:'Close recovery',exact:true}).click();await seed(page);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});await page.locator('.planner-conflict-item').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.recovery-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
      assert.equal(await page.locator('.planner-conflict-version').evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth+1)),true);
      const save=page.getByRole('button',{name:'Save task version',exact:true});await page.getByRole('radio',{name:'Other tab version',exact:true}).check();
      await page.getByLabel('Apply this version to this task only.',{exact:true}).check();await save.scrollIntoViewIfNeeded();
      assert.equal(await save.evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44&&r.left>=0&&r.right<=innerWidth&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
      await page.screenshot({path:out+'/planner-review-'+width+'.png'});
    }
  });
  fs.writeFileSync(out+'/planner-review-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(result=>!result.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
