const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const URL = process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out = process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(out, {recursive:true});
const results = [];

async function seed(page) {
  return page.evaluate(async () => {
    const note = makeCard({type:'sidenote',title:'Quick thoughts',category:'Personal'});
    note.id='capture-notes'; note.sideNoteEntries[getTodayKey()] = normalizeSideNoteEntry({notes:[
      {id:'source-note',text:'Book a quiet weekend away.\nAsk about train times.',createdAt:1750000000000,updatedAt:1750000000123}
    ]});
    note.sideNoteDrafts[getTodayKey()]='An unfinished thought stays here';
    const planner = makeCard({type:'planlist',title:'My planner',category:'Personal',plannerView:'today'});
    planner.id='capture-view';
    const other = makeCard({type:'sidenote',title:'Other board notes',category:'Personal'}); other.id='other-notes';
    state.boards=[createBoardRecord({id:'capture-board',name:'My personal board',cards:[note,planner]}),
      createBoardRecord({id:'other-board',name:'Other board',cards:[other]})];
    applyBoardToState(state,'capture-board'); saveState(); await flushDeviceWrites(); render();
    return {note:JSON.stringify(state.cards.find(c=>c.id==='capture-notes')),other:JSON.stringify(state.boards[1].cards),today:getTodayKey()};
  });
}
async function open(page) {
  await page.locator('.side-note-actions .card-menu-toggle').click();
  await page.locator('.note-action-menu').getByRole('button',{name:'Add to planner',exact:true}).click();
  await page.locator('#noteTaskDialog').waitFor({state:'visible'});
}
const tasks = page => page.evaluate(() => getPlannerSourceCards().flatMap(c=>LifePlanner.ensure(c)));
async function assertOriginal(page,before) {
  assert.equal(await page.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='capture-notes'))),before.note);
  assert.equal(await page.evaluate(()=>JSON.stringify(state.boards.find(b=>b.id==='other-board').cards)),before.other);
}

(async () => {
  const browser=await chromium.launch({headless:true});
  async function run(name,fn) {
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Kuala_Lumpur',hasTouch:true});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'No external services in tests'}));
    const page=await context.newPage(),errors=[]; page.setDefaultTimeout(8000);
    page.on('pageerror',e=>errors.push(e.stack)); page.on('dialog',d=>d.accept());
    try {
      await page.goto(URL+'?preview=1'); const before=await seed(page);
      await fn(page,before,context); assert.deepEqual(errors,[]); results.push({name,pass:true});
    } catch(error) {
      results.push({name,pass:false,error:error.stack,pageErrors:errors});
      await page.screenshot({path:out+'/capture-failure-'+results.length+'.png'}).catch(()=>{});
    }
    console.log(JSON.stringify(results.at(-1))); await context.close();
  }
  await run('Opening and cancelling does not create tasks, mutate the note, or discard its draft',async(page,before)=>{
    await open(page);
    assert.equal(await page.locator('.note-task-destination').innerText(),'Board\nMy personal board\nArea\nPersonal');
    await page.locator('#noteTaskText').fill('I have not committed this');
    assert.equal(await page.evaluate(()=>canReloadLocalDevPage()),false);
    assert.equal(await page.evaluate(()=>hasUnfinishedRestoreEditor()),true);
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Cancel',exact:true}).click();
    await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    assert.deepEqual(await tasks(page),[]); await assertOriginal(page,before);
    assert.equal(await page.locator('.side-note-actions .card-menu-toggle').evaluate(e=>e===document.activeElement),true);
  });
  await run('Confirmed task appears immediately in Planner-view, keeps original note, and survives reload',async(page,before)=>{
    await open(page); await page.locator('#noteTaskText').fill('Ask about train times');
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();
    await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    const created=(await tasks(page))[0]; assert.equal(created.title,'Ask about train times'); assert.equal(created.dateKey,before.today);
    assert.equal(await page.locator('.planner-linked-item').filter({hasText:'Ask about train times'}).count(),1);
    await assertOriginal(page,before); await page.reload();
    assert.deepEqual(await tasks(page),[created]); await assertOriginal(page,before);
  });
  await run('Explicit future date and rapid repeated submission create one task, not copies per line',async(page,before)=>{
    await open(page); await page.locator('#noteTaskDate').fill('2035-12-14');
    await page.locator('#noteTaskText').fill('Train booking\nCheck the return journey');
    await page.locator('#noteTaskDialog form').evaluate(form=>{form.requestSubmit();form.requestSubmit();form.requestSubmit();});
    await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    const items=await tasks(page); assert.equal(items.length,1); assert.equal(items[0].dateKey,'2035-12-14'); assert.equal(items[0].title,'Train booking\nCheck the return journey');
    await assertOriginal(page,before);
  });
  await run('Existing same-area source is reused and existing independent tasks stay intact',async page=>{
    const original=await page.evaluate(async()=>{
      const source=makeCard({type:'planner',category:'Personal',title:'Existing planner'});source.id='existing-source';
      LifePlanner.add(source,getTodayKey(),'Already there','existing-task');LifePlanner.project(source);
      state.cards.push(source);saveState();await flushDeviceWrites();renderCardsOnly({force:true});return JSON.stringify(source.plannerTasks[0]);
    });
    await open(page);await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>getPlannerSourceCards().length),1);
    assert.equal(await page.evaluate(()=>JSON.stringify(getPlannerSourceCards()[0].plannerTasks[0])),original);
    assert.equal((await tasks(page)).length,2);
  });
  await run('Undo targets only its task even after switching boards and adding unrelated writing',async(page,before)=>{
    await open(page);await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    await page.evaluate(async()=>{switchBoard('other-board');updateSideNoteDraft(state.cards[0],getTodayKey(),'Other board edit after task creation');saveState();await flushDeviceWrites();});
    await page.locator('#undoToastButton').click();await page.evaluate(()=>flushDeviceWrites());
    assert.equal(await page.evaluate(()=>state.activeBoardId),'other-board');
    assert.equal(await page.evaluate(()=>getSideNoteDraft(state.cards[0],getTodayKey())),'Other board edit after task creation');
    await page.evaluate(async()=>{switchBoard('capture-board');await flushDeviceWrites();});
    const items=await tasks(page);assert.equal(items.length,1);assert.ok(items[0].deletedAt);assert.equal(items[0].done,false);
    assert.equal(await page.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='capture-notes'))),before.note);
    await page.reload();assert.ok((await tasks(page))[0].deletedAt);
  });
  await run('Another tab can save a different board during confirmation without mixing their data',async(page,before,context)=>{
    const second=await context.newPage();await second.goto(URL+'?preview=1');await second.evaluate(async()=>{switchBoard('other-board');await flushDeviceWrites();});
    await open(page);await page.locator('#noteTaskText').fill('A shared-store task');
    await second.evaluate(async()=>{updateSideNoteDraft(state.cards[0],getTodayKey(),'Concurrent other-board thought');await flushDeviceWrites();});
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    await second.evaluate(()=>flushDeviceWrites());assert.equal(await second.evaluate(()=>getPlannerSourceCards().length),0);
    assert.equal(await second.evaluate(()=>getSideNoteDraft(state.cards[0],getTodayKey())),'Concurrent other-board thought');
    await page.reload();assert.equal((await tasks(page)).length,1);
    assert.equal(await page.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='capture-notes'))),before.note);
  });
  await run('Undo refuses to erase a task edited and completed in another tab',async(page,before,context)=>{
    await open(page);await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    const second=await context.newPage();await second.goto(URL+'?preview=1');
    await second.evaluate(async()=>{const source=getPlannerSourceCards()[0],task=LifePlanner.ensure(source)[0];LifePlanner.change(source,task.id,{title:'Updated elsewhere'});LifePlanner.complete(source,task.id,getTodayKey());LifePlanner.project(source);saveState();await flushDeviceWrites();});
    const alert=page.waitForEvent('dialog');await page.locator('#undoToastButton').click();assert.match((await alert).message(),/changed/);
    const [item]=await tasks(page);assert.equal(item.title,'Updated elsewhere');assert.equal(item.done,true);assert.equal(item.deletedAt,0);
    await assertOriginal(page,before);
  });
  await run('Note edits, board switches and account changes during review block stale confirmation',async(page,before)=>{
    for (const mutation of ['note','board','account']) {
      await seed(page);await open(page);
      await page.evaluate(mutation=>{
        if(mutation==='note')state.cards.find(c=>c.id==='capture-notes').sideNoteEntries[getTodayKey()].notes[0].text='A newer thought';
        if(mutation==='board')switchBoard('other-board');
        if(mutation==='account')state.cloudOwnerId='a-different-account';
      },mutation);
      await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();
      assert.match(await page.locator('#noteTaskMessage').innerText(),/changed/);
      assert.equal(await page.evaluate(()=>state.boards.flatMap(b=>[...b.cards,...b.archivedCards]).filter(c=>c.type==='planner').length),0);
      await page.locator('#noteTaskDialog').getByRole('button',{name:'Cancel',exact:true}).click();
    }
  });
  await run('Failed staging retains the note and a retry saves exactly one task',async(page,before)=>{
    await open(page);
    await page.evaluate(()=>{window.originalStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Injected quota failure');};});
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Retry save',exact:true}).waitFor();
    assert.match(await page.locator('#noteTaskMessage').innerText(),/saving failed/);assert.equal((await tasks(page)).length,1);
    await assertOriginal(page,before);assert.equal(await page.locator('#noteTaskText').isDisabled(),true);
    await page.evaluate(()=>{LifeDeviceStore.stage=window.originalStage;});
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Retry save',exact:true}).click();await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    await page.reload();assert.equal((await tasks(page)).length,1);await assertOriginal(page,before);
  });
  await run('Narrow layouts, bottom-edge menus, keyboard dismissal and literal note text',async(page)=>{
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:844});await page.waitForTimeout(350);
      const toggle=page.locator('.side-note-actions .card-menu-toggle');
      await toggle.evaluate(e=>e.scrollIntoView({block:'end',behavior:'instant'}));await toggle.click();
      const menu=page.locator('.note-action-menu');
      assert.equal(await menu.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),true);
      assert.equal(await menu.getByRole('button',{name:'Delete note',exact:true}).evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
      await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await toggle.evaluate(e=>e===document.activeElement),true);
      await open(page);
      const dialog=page.locator('#noteTaskDialog');
      await dialog.locator('summary').click();
      assert.equal(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
      assert.equal(await page.locator('#noteTaskDate').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
      await page.screenshot({path:out+'/capture-'+width+'.png'});
      await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    }
    await page.evaluate(async()=>{state.cards.find(c=>c.id==='capture-notes').sideNoteEntries[getTodayKey()].notes[0].text='<img src=x onerror=alert(1)>\n'.repeat(300);saveState();await flushDeviceWrites();renderCardsOnly({force:true});});
    await open(page);await page.locator('.note-task-original summary').click();
    assert.equal(await page.locator('#noteTaskDialog img').count(),0);
    assert.ok((await page.locator('#noteTaskText').inputValue()).length>5000);
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    assert.ok((await tasks(page))[0].title.length>5000);
  });
  await run('Deleting a note still needs confirmation and does not remove its independently created task',async(page,before)=>{
    await open(page);await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();await page.locator('#noteTaskDialog').waitFor({state:'detached'});
    const created=await tasks(page);
    await page.locator('#undoToastCloseButton').click();
    page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());
    await page.locator('.side-note-actions .card-menu-toggle').click();await page.locator('.note-action-menu').getByRole('button',{name:'Delete note',exact:true}).click();
    await assertOriginal(page,before);
    page.once('dialog',d=>d.accept());
    await page.locator('.side-note-actions .card-menu-toggle').click();await page.locator('.note-action-menu').getByRole('button',{name:'Delete note',exact:true}).click();
    await page.evaluate(()=>flushDeviceWrites());
    assert.equal(await page.locator('.side-note-item').count(),0);assert.deepEqual(await tasks(page),created);
  });
  await run('Whitespace-only tasks and missing dates cannot create planner sources',async page=>{
    await open(page);await page.locator('#noteTaskText').fill('   \n ');
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();
    assert.match(await page.locator('#noteTaskMessage').innerText(),/Enter a task/);
    await page.locator('#noteTaskText').fill('A real task');await page.locator('#noteTaskDate').fill('');
    await page.locator('#noteTaskDialog').getByRole('button',{name:'Add task',exact:true}).click();
    assert.equal(await page.locator('#noteTaskDate').evaluate(e=>e.validity.valueMissing),true);
    assert.deepEqual(await tasks(page),[]);
  });
  fs.writeFileSync(out+'/capture-results.json',JSON.stringify(results,null,2));
  await browser.close();if(results.some(result=>!result.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
