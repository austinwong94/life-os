const assert=require('node:assert/strict');
const fs=require('node:fs');
const browsers=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-task-sources';fs.mkdirSync(out,{recursive:true});
const results=[];
const all=async p=>{await workspace(p,'tasks');await p.getByRole('group',{name:'Task view'}).getByRole('button',{name:'All tasks',exact:true}).click();};
const row=(p,id)=>p.locator('.card-source-task[data-source-task="'+id+'"]');
const edit=async(p,id)=>{await row(p,id).getByRole('button',{name:/Task options:/}).click();await p.getByRole('button',{name:'Edit task',exact:true}).click();};
const seed=async p=>p.evaluate(async()=>{
  const card=(type,id,title)=>({...makeCard({type,title,category:'Personal'}),id});
  const project={...card('checklist','project-a','Culturely launch'),category:'Culturely',layoutColumn:2,custom:{keep:'all metadata'},items:[
    {id:'one',text:'Contact partner',done:false,custom:'keep'},
    {id:'two',text:'Contact partner',done:false},
    {id:'old',text:'Already done',done:true}
  ]};
  const source=card('planner','planner-a','Planning');LifePlanner.add(source,getTodayKey(),'Planner task','planned');
  state.cards=[project,{...card('daily','todo-a','Personal list'),plannedDate:getTodayKey(),items:[{id:'daily-one',text:'Read a chapter',done:false}]},
    {...card('single','single-a','Book appointment'),done:false},
    {...card('routine','routine-a','Recurring routine'),items:[{id:'repeat',text:'Recurring walk',done:false}]},source];
  state.boards.push(createBoardRecord({id:'other-board',name:'Other board',cards:[{...card('checklist','other-project','Other project'),items:[{id:'one',text:'Other board task',done:false}]}]}));
  saveState();await flushDeviceWrites();renderCardsOnly({force:true});
});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,action){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'Synthetic test only'}));
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(6500);page.on('pageerror',e=>errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));
    try{await page.goto(url+'?preview=1&liveReload=0');await seed(page);await action(page,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await page.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('All tasks includes each original one-off task once, excludes routines and supports source search',async p=>{
    const before=await p.evaluate(()=>JSON.stringify(state.cards));await all(p);
    assert.equal(await p.locator('.workspace-task-list .planner-linked-item').count(),6);
    assert.equal(await p.locator('.card-source-task').count(),5);assert.equal(await p.getByText('Recurring walk',{exact:true}).count(),0);
    assert.match(await row(p,'old').innerText(),/Date not recorded/);
    await p.getByLabel('Search tasks and projects').fill('Culturely launch');assert.equal(await p.locator('.card-source-task').count(),3);
    await p.getByLabel('Search tasks and projects').fill('');await p.getByLabel('Filter by area').selectOption('Personal');assert.equal(await p.locator('.card-source-task').count(),2);
    assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)),before);
  });
  await run('Completion and rename update original records, same titles stay independent, reload and source card agree',async p=>{
    await all(p);await row(p,'one').getByRole('checkbox').check();assert.equal(await row(p,'one').getByRole('checkbox').isChecked(),true);assert.equal(await row(p,'two').getByRole('checkbox').isChecked(),false);
    await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Call partner with the revised plan');await p.getByRole('button',{name:'Save task',exact:true}).click();
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await all(p);
    const original=await p.evaluate(()=>state.cards.find(c=>c.id==='project-a'));
    assert.equal(original.items[0].taskCompletion.on,'2026-09-22');assert.equal(original.items[0].taskCompletionEvents.length,1);const first={...original.items[0]};delete first.taskCompletion;delete first.taskCompletionEvents;assert.deepEqual(first,{id:'one',text:'Call partner with the revised plan',done:true,custom:'keep'});assert.equal(original.items[1].text,'Contact partner');assert.equal(original.layoutColumn,2);assert.deepEqual(original.custom,{keep:'all metadata'});
    await workspace(p,'board');const card=p.locator('.task-card[data-id="project-a"]');await card.getByRole('checkbox',{name:'Call partner with the revised plan',exact:true}).uncheck();
    await all(p);assert.equal(await row(p,'one').getByRole('checkbox').isChecked(),false);
  });
  await run('Drafts survive closing, filtering, pauses and reload, with full text and no partial source writes',async p=>{
    await all(p);await edit(p,'one');const text='A complete replacement thought, not only its first character';
    await p.getByRole('textbox',{name:'Task name',exact:true}).pressSequentially(text,{delay:5});
    const value=await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue();await p.keyboard.press('Escape');
    await p.getByLabel('Search tasks and projects').fill('not a matching task');await p.getByRole('button',{name:'Continue task draft',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),value);
    await p.reload();await all(p);await p.getByRole('button',{name:'Continue task draft',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),value);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Contact partner');
    await p.getByRole('button',{name:'Save task',exact:true}).click();assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),value);
  });
  await run('Failed saves restore the original task and retain a retryable draft, without duplicates',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Retain this draft');
    await p.evaluate(()=>{window.savedStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Synthetic quota failure');};});
    await p.getByRole('button',{name:'Save task',exact:true}).click();assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/Not saved yet/);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Contact partner');assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Retain this draft');
    await p.evaluate(()=>{LifeDeviceStore.stage=window.savedStage;});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();await all(p);
    assert.equal(await row(p,'one').getByRole('button',{name:'Mark done: Retain this draft',exact:true}).count(),1);assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items.length),3);
  });
  await run('Two tabs can update different source items and different boards without losing either change',async(p,context)=>{
    await all(p);const q=await context.newPage();await q.goto(url+'?preview=1&liveReload=0');await all(q);
    await row(p,'one').getByRole('checkbox').check();await row(q,'two').getByRole('checkbox').check();await p.evaluate(()=>flushDeviceWrites());await q.evaluate(()=>flushDeviceWrites());
    await p.waitForFunction(()=>state.cards.find(c=>c.id==='project-a').items.slice(0,2).every(i=>i.done));
    await q.evaluate(()=>switchBoard('other-board'));await all(q);await row(q,'one').getByRole('checkbox').check();
    await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Still on the original board');await p.getByRole('button',{name:'Save task',exact:true}).click();
    await p.evaluate(()=>flushDeviceWrites());await q.evaluate(()=>flushDeviceWrites());await p.reload();await all(p);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Still on the original board');
    assert.equal(await p.evaluate(()=>state.boards.find(b=>b.id==='other-board').cards[0].items[0].done),true);assert.equal(await p.locator('.card-source-task').count(),5);
  });
  await run('Stale same-task edits and archived sources cannot overwrite a newer record; draft stays available',async(p,context)=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Unsaved local rename');
    const q=await context.newPage();await q.goto(url+'?preview=1&liveReload=0');await all(q);await row(q,'one').getByRole('checkbox').check();await q.evaluate(()=>flushDeviceWrites());await p.evaluate(()=>flushDeviceWrites());
    await p.getByRole('button',{name:'Save task',exact:true}).click();assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/changed elsewhere/);assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Unsaved local rename');
    await p.evaluate(()=>{const card=state.cards.find(c=>c.id==='project-a');window.archivedFixture=card;state.cards=state.cards.filter(c=>c.id!=='project-a');state.archivedCards ||= [];state.archivedCards.push(card);});
    await p.getByRole('button',{name:'Save task',exact:true}).click();assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/source card changed/);assert.equal(await p.evaluate(()=>window.archivedFixture.items[0].text),'Contact partner');
  });
  await run('Today can complete a specific source task with new dated history without guessing old dates',async p=>{
    await workspace(p,'today');await p.getByRole('button',{name:'Choose',exact:true}).click();
    await p.getByRole('searchbox',{name:'Find a next step',exact:true}).fill('Culturely launch');
    await p.getByRole('checkbox',{name:'Contact partner',exact:true}).first().check();await p.getByRole('button',{name:'Keep next steps',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    await row(p,'one').getByRole('checkbox').check();assert.equal(await row(p,'one').getByRole('checkbox').isChecked(),true);
    assert.deepEqual(await p.evaluate(()=>dailyCompletedTasks('2026-09-01','2026-09-30').map(t=>[t.title,t.completedOn])),[['Contact partner','2026-09-22']]);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.equal(await row(p,'one').getByRole('checkbox').isChecked(),true);
    await all(p);await p.getByRole('group',{name:'Task view'}).getByRole('button',{name:'Completed',exact:true}).click();assert.equal(await p.locator('.card-source-task').count(),2);
  });
  await run('ID-less checklist records preserve both completion states on source-card metadata edits and remain read-only in Tasks',async p=>{
    await p.evaluate(async()=>{
      const card=state.cards.find(c=>c.id==='project-a');card.items=[{text:'Same',done:true},{text:'Same',done:false},{text:'Other',done:true}];
      editingCardId=card.id;updateExistingCard({...card,description:'Metadata update',items:card.items.map((item,index)=>({id:'fresh-'+index,text:item.text,done:false}))});editingCardId=null;
      saveState();await flushDeviceWrites();
    });await all(p);
    assert.deepEqual(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items),[{text:'Same',done:true},{text:'Same',done:false},{text:'Other',done:true}]);
    const checks=p.locator('.card-source-task[data-source-card="project-a"] input[type=checkbox]');assert.equal(await checks.count(),3);for(const check of await checks.all())assert.equal(await check.isDisabled(),true);
  });
  await run('Source archive and restore keep original items and expose no writable stale workspace copy',async p=>{
    await all(p);const before=await p.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='project-a').items));
    await p.evaluate(async()=>{archiveCard('project-a');await flushDeviceWrites();});assert.equal(await p.locator('.card-source-task[data-source-card="project-a"]').count(),0);
    await p.reload();await all(p);assert.equal(await p.locator('.card-source-task[data-source-card="project-a"]').count(),0);
    assert.equal(await p.evaluate(()=>JSON.stringify(getArchivedCards().find(c=>c.id==='project-a').items)),before);
    await p.evaluate(async()=>{restoreArchivedCard('project-a');await flushDeviceWrites();});await all(p);assert.equal(await p.locator('.card-source-task[data-source-card="project-a"]').count(),3);
    assert.equal(await p.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='project-a').items)),before);
  });
  await run('Failed completion visibly reverts; retry and Undo persist, including single-task cards',async p=>{
    await all(p);await p.evaluate(()=>{window.savedStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Synthetic quota failure');};});
    // click rather than check(): this intentionally expects the checkbox to revert.
    await row(p,'one').getByRole('checkbox').click();assert.equal(await row(p,'one').getByRole('checkbox').isChecked(),false);assert.match(await row(p,'one').innerText(),/Not saved yet/);
    await p.evaluate(()=>{LifeDeviceStore.stage=window.savedStage;});await row(p,'one').getByRole('checkbox').check();await p.getByRole('button',{name:'Undo',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.card-source-task[data-source-task="one"] input[type=checkbox]')?.checked===false);assert.equal(await row(p,'one').getByRole('checkbox').isChecked(),false);
    const single=p.locator('.card-source-task[data-source-card="single-a"]');await single.getByRole('checkbox').check();await p.evaluate(()=>flushDeviceWrites());await p.reload();await all(p);assert.equal(await single.getByRole('checkbox').isChecked(),true);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='single-a').done),true);
  });
  await run('Source labels, long titles, three-column results and task controls fit phone, portrait and desktop',async p=>{
    await p.evaluate(()=>{state.cards.find(c=>c.id==='project-a').items[0].text='Discuss a detailed customer research plan with the Culturely launch partner and record the follow-up';});await all(p);
    await p.getByRole('button',{name:'3 task columns',exact:true}).click();
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:1100});
      await p.waitForTimeout(250);
      const violations=await p.evaluate(()=>[...document.querySelectorAll('.card-source-task')].flatMap(row=>{
        const r=row.getBoundingClientRect(),nodes=[row.querySelector('.planner-linked-copy'),row.querySelector('.planner-linked-actions')];
        return nodes.filter(n=>{const b=n.getBoundingClientRect();return b.left<r.left-1 || b.right>r.right+1 || n.scrollWidth>n.clientWidth+1;}).map(n=>n.className);
      }));assert.deepEqual(violations,[],'Task geometry at '+width);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await row(p,'one').getByRole('button',{name:/Task options:/}).click();await p.getByRole('button',{name:'Edit task',exact:true}).click();
      assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).isVisible(),true);await p.getByRole('button',{name:'Discard draft',exact:true}).click();
      if([390,1080].includes(width))await p.screenshot({path:out+'/task-sources-'+width+'.png',fullPage:true});
    }
  });
  await run('source editor safety: detached editor fields and Save cannot write or contaminate another board session',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('My original-board draft');
    await p.evaluate(()=>{window.oldCardTaskInput=document.querySelector('.card-task-editor input');window.oldCardTaskForm=oldCardTaskInput.form;window.sourceBoard=state.activeBoardId;window.sourceDraft=JSON.stringify(planningSession().cardTaskDraft);document.getElementById('dailyDialog').close();});await p.locator('#dailyDialog').waitFor({state:'detached'});
    await p.evaluate(()=>{switchBoard('other-board');window.otherSession=JSON.stringify(planningSession());oldCardTaskInput.value='Detached corruption';oldCardTaskInput.dispatchEvent(new Event('input',{bubbles:true}));oldCardTaskForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    assert.equal(await p.evaluate(()=>JSON.stringify(planningSession())===otherSession),true);assert.equal(await p.evaluate(()=>JSON.stringify(planningSessions.get(sourceBoard).cardTaskDraft)===sourceDraft),true);
    await p.evaluate(()=>switchBoard(sourceBoard));await all(p);await p.getByRole('button',{name:'Continue task draft',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'My original-board draft');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Contact partner');
  });
  await run('source editor safety: failed discard preserves the visible draft and its exact stored copy',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Keep all of these words');
    const before=await p.evaluate(()=>sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId)));
    await p.evaluate(()=>{window.originalCardSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).includes('life-os-planning:'))throw new DOMException('Synthetic quota','QuotaExceededError');return originalCardSet.call(this,k,v);};});
    await p.getByRole('button',{name:'Discard draft',exact:true}).click();assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/not discarded|could not discard/i);assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Keep all of these words');assert.equal(await p.evaluate(()=>sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId))),before);
    await p.evaluate(()=>{Storage.prototype.setItem=originalCardSet;});await p.getByRole('button',{name:'Discard draft',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Contact partner');
  });
  await run('source editor safety: detached and CSS-hidden source task controls never complete a task or open options',async p=>{
    await all(p);await p.evaluate(()=>{window.oldSourceRow=document.querySelector('.card-source-task[data-source-task="one"]');renderCardsOnly({force:true});oldSourceRow.querySelector('input').dispatchEvent(new Event('change',{bubbles:true}));oldSourceRow.querySelector('.planner-linked-actions button').click();});
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].done),false);assert.equal(await p.locator('#dailyDialog').count(),0);
    await p.evaluate(()=>{const row=document.querySelector('.card-source-task[data-source-task="one"]');row.style.display='none';row.querySelector('input').dispatchEvent(new Event('change',{bubbles:true}));row.querySelector('.planner-linked-copy').click();row.querySelector('.planner-linked-actions button').click();});
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].done),false);assert.equal(await p.locator('#dailyDialog').count(),0);
  });
  await run('source editor safety: a stale same-board Edit command uses the current canonical source name',async p=>{
    await all(p);await row(p,'one').getByRole('button',{name:/Task options:/}).click();
    await p.evaluate(()=>{state.cards.find(c=>c.id==='project-a').items[0].text='Latest source wording';});await p.getByRole('button',{name:'Edit task',exact:true}).click();
    assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Latest source wording');await p.getByRole('button',{name:'Save task',exact:true}).click();assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Latest source wording');
  });
  await run('source editor safety: interrupted cleanup recovers the saved name and completion date without repeating history',async p=>{
    await all(p);await row(p,'one').getByRole('checkbox').check();await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Call the Culturely partner');await p.getByLabel('Completion date (optional)',{exact:true}).fill('2026-09-21');
    await p.evaluate(()=>{window.originalCardSave=saveState;window.originalCardSet=Storage.prototype.setItem;window.blockCardCleanup=false;saveState=function(...args){const ok=originalCardSave(...args);if(ok)blockCardCleanup=true;return ok;};Storage.prototype.setItem=function(k,v){if(blockCardCleanup && String(k).includes('life-os-planning:'))throw new DOMException('Synthetic cleanup refusal','QuotaExceededError');return originalCardSet.call(this,k,v);};});
    await p.getByRole('button',{name:'Save task',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.card-task-editor [role=status]')?.textContent.includes('Task saved'));assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/Task saved/);
    const saved=await p.evaluate(()=>LifeStateMerge.copy(state.cards.find(c=>c.id==='project-a').items[0]));assert.equal(saved.taskCompletion.on,'2026-09-21');assert.equal(saved.taskCompletionEvents.length,2);
    await p.evaluate(async()=>{Storage.prototype.setItem=originalCardSet;saveState=originalCardSave;await flushDeviceWrites();});await p.reload();await all(p);await p.getByRole('button',{name:'Continue task draft',exact:true}).click();
    assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Call the Culturely partner');assert.equal(await p.getByLabel('Completion date (optional)',{exact:true}).inputValue(),'2026-09-21');
    await p.evaluate(()=>{window.originalCardSave=saveState;window.replayedCardSaves=0;saveState=function(...args){replayedCardSaves++;return originalCardSave(...args);};});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>replayedCardSaves),0);assert.deepEqual(await p.evaluate(()=>LifeStateMerge.copy(state.cards.find(c=>c.id==='project-a').items[0])),saved);assert.equal(await p.getByRole('button',{name:'Continue task draft',exact:true}).count(),0);
  });
  await run('source editor safety: unavailable receipt storage rolls back the exact task while retaining retryable wording',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('My protected task draft');const before=await p.evaluate(()=>LifeStateMerge.copy(state.cards));
    await p.evaluate(()=>{window.originalCardSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).includes('life-os-planning:'))throw new DOMException('Synthetic quota','QuotaExceededError');return originalCardSet.call(this,k,v);};});
    await p.getByRole('button',{name:'Save task',exact:true}).click();assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/Draft storage is unavailable/);assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'My protected task draft');assert.deepEqual(await p.evaluate(()=>LifeStateMerge.copy(state.cards)),before);assert.match(await p.locator('.card-task-draft-status').innerText(),/Memory only/);
    await p.evaluate(()=>{Storage.prototype.setItem=originalCardSet;});await p.getByRole('button',{name:'Save task',exact:true}).click();assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'My protected task draft');
  });
  await run('source editor safety: newer changes after an interrupted successful save cannot be overwritten by its retained receipt',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Saved before interruption');
    await p.evaluate(()=>{window.originalCardSave=saveState;window.originalCardSet=Storage.prototype.setItem;window.blockCardCleanup=false;saveState=function(...args){const ok=originalCardSave(...args);if(ok)blockCardCleanup=true;return ok;};Storage.prototype.setItem=function(k,v){if(blockCardCleanup && String(k).includes('life-os-planning:'))throw new DOMException('Synthetic cleanup refusal','QuotaExceededError');return originalCardSet.call(this,k,v);};});
    await p.getByRole('button',{name:'Save task',exact:true}).click();await p.evaluate(async()=>{Storage.prototype.setItem=originalCardSet;saveState=originalCardSave;state.cards.find(c=>c.id==='project-a').items[0].text='Newer source edit';saveState();await flushDeviceWrites();});await p.reload();await all(p);await p.getByRole('button',{name:'Continue task draft',exact:true}).click();await p.getByRole('button',{name:'Save task',exact:true}).click();
    assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/changed elsewhere/);assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Saved before interruption');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Newer source edit');
  });
  await run('source editor safety: malformed draft envelopes remain stored and are not replaced by a new edit',async p=>{
    await all(p);for(const value of [false,null,[],{}, {version:2,title:'Keep this unknown version'}, {ref:{boardId:'other-board'},title:'Wrong-board draft'}]){
      const raw=await p.evaluate(value=>{planningSession().cardTaskDraft=value;savePlanningSession();return sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId));},value);
      await edit(p,'one');assert.equal(await p.locator('.card-task-editor').count(),0);assert.equal(await p.evaluate(()=>sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId))),raw);assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Contact partner');
    }
  });
  await run('source editor safety: completion confirmation cannot act after switching to a board with copied IDs',async p=>{
    await p.evaluate(()=>{const other=state.boards.find(b=>b.id==='other-board');other.cards[0].id='project-a';LifeSubtasks.change(state.cards.find(c=>c.id==='project-a').items[0],{type:'add',id:'step',title:'Prepare discussion notes'});saveState();});await all(p);
    await row(p,'one').getByRole('checkbox').click();await p.locator('#taskConfirmationDialog').waitFor();await p.evaluate(()=>{window.sourceBoard=state.activeBoardId;switchBoard('other-board');});await p.locator('#taskConfirmationDialog').getByRole('button',{name:'Complete task',exact:true}).click();await p.locator('#taskConfirmationDialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].done),false);await p.evaluate(()=>switchBoard(sourceBoard));assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].done),false);
  });
  await run('source editor safety: closed completion-date fields cannot contaminate the retained original-board draft',async p=>{
    await all(p);await row(p,'one').getByRole('checkbox').check();await edit(p,'one');await p.getByLabel('Completion date (optional)',{exact:true}).fill('2026-09-21');
    await p.evaluate(()=>{window.oldCardDate=document.querySelector('.card-task-editor input[type=date]');window.sourceBoard=state.activeBoardId;window.beforeDateDraft=JSON.stringify(planningSession().cardTaskDraft);document.getElementById('dailyDialog').close();});await p.locator('#dailyDialog').waitFor({state:'detached'});
    await p.evaluate(()=>{switchBoard('other-board');oldCardDate.value='2026-09-01';oldCardDate.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await p.evaluate(()=>JSON.stringify(planningSessions.get(sourceBoard).cardTaskDraft)===beforeDateDraft),true);assert.equal(await p.evaluate(()=>Object.hasOwn(planningSession(),'cardTaskDraft')),false);
  });
  await run('source editor safety: protected card-task editor fits short phones portrait desktops and wide screens',async p=>{
    await all(p);await row(p,'one').getByRole('checkbox').check();await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Contact the Culturely partner about the launch');
    for(const [width,height] of [[320,844],[390,480],[390,844],[768,1000],[1080,1100],[1440,1000]]){
      await p.setViewportSize({width,height});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      for(const label of ['Save task','Discard draft','Edit source card']){const button=p.getByRole('button',{name:label,exact:true});await button.scrollIntoViewIfNeeded();assert.equal(await button.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.width>=44 && r.height>=44;}),true);}
      await p.screenshot({path:out+'/protected-card-task-'+width+'x'+height+'.png'});
    }
  });
  await run('source editor safety: legacy drafts stay recoverable and invalid completion dates need explicit repair',async p=>{
    await all(p);await row(p,'one').getByRole('checkbox').check();
    const before=await p.evaluate(()=>{const source=LifeTaskRepository.collect(workspaceTaskBoard()).find(task=>task.ref.itemId==='one');planningSession().cardTaskDraft={ref:source.ref,base:LifeStateMerge.copy(source.base),title:'Recovered legacy wording',sourceTitle:source.sourceTitle,completedOn:'2026-02-30'};savePlanningSession();return LifeStateMerge.copy(state.cards.find(c=>c.id==='project-a').items);});
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await all(p);await p.getByRole('button',{name:'Continue task draft',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Recovered legacy wording');
    await p.getByRole('button',{name:'Save task',exact:true}).click();assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/valid completion date/);assert.equal(await p.evaluate(()=>planningSession().cardTaskDraft.completedOn),'2026-02-30');assert.deepEqual(await p.evaluate(()=>LifeStateMerge.copy(state.cards.find(c=>c.id==='project-a').items)),before);
    await p.getByLabel('Completion date (optional)',{exact:true}).fill('2026-09-21');await p.getByRole('button',{name:'Save task',exact:true}).click();const items=await p.evaluate(()=>LifeStateMerge.copy(state.cards.find(c=>c.id==='project-a').items));assert.equal(items[0].text,'Recovered legacy wording');assert.equal(items[0].taskCompletion.on,'2026-09-21');assert.equal(items[0].custom,'keep');assert.deepEqual(items.slice(1),before.slice(1));
  });
  await run('source save confirmation: false receipt keeps the complete name date and history for an idempotent retry',async p=>{
    await all(p);await row(p,'one').getByRole('checkbox').check();await p.evaluate(()=>clearUndoToast());await edit(p,'one');
    await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Call the Culturely partner with the full launch plan');
    await p.getByLabel('Completion date (optional)',{exact:true}).fill('2026-09-21');
    await p.evaluate(()=>{window.actualCardFlush=flushDeviceWrites;window.actualCardSave=saveState;window.actualCardUndo=showCardTaskUndo;window.cardUndoCalls=0;showCardTaskUndo=(...args)=>{cardUndoCalls++;return actualCardUndo(...args);};window.cardWrites=0;saveState=(...args)=>{cardWrites++;return actualCardSave(...args);};flushDeviceWrites=async()=>false;});
    await p.getByRole('button',{name:'Save task',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('.card-task-editor [role=status]')?.textContent.includes('Device save is not confirmed'));
    const before=await p.evaluate(()=>({draft:LifeStateMerge.copy(planningSession().cardTaskDraft),items:LifeStateMerge.copy(state.cards.find(c=>c.id==='project-a').items),stored:JSON.parse(sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId))).cardTaskDraft}));
    assert.equal(before.draft.title,'Call the Culturely partner with the full launch plan');assert.equal(before.draft.completedOn,'2026-09-21');assert.deepEqual(before.stored,before.draft);
    assert.equal(before.items[0].taskCompletionEvents.length,2);assert.equal(before.items[0].custom,'keep');assert.equal(before.items[1].text,'Contact partner');
    assert.equal(await p.evaluate(()=>cardUndoCalls),0);assert.equal(await p.locator('#undoToast').isVisible(),false);
    for(const [width,height] of [[390,844],[1080,1100]]){
      await p.setViewportSize({width,height});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const button=p.getByRole('button',{name:'Save task',exact:true});await button.scrollIntoViewIfNeeded();assert.equal(await button.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.width>=44 && r.height>=44;}),true);
      await p.screenshot({path:out+'/source-save-retry-'+width+'.png'});
    }
    await p.evaluate(()=>{flushDeviceWrites=actualCardFlush;});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>cardWrites),1);assert.equal(await p.evaluate(()=>cardUndoCalls),1);assert.deepEqual(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items),before.items);assert.equal(await p.evaluate(()=>Object.hasOwn(planningSession(),'cardTaskDraft')),false);
    await p.reload();await all(p);assert.deepEqual(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items),before.items);
    await p.evaluate(()=>flushDeviceWrites());
    for(const [width,height] of [[390,844],[1080,1100]]){
      await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.evaluate(()=>document.querySelector('.card-source-task[data-source-task="one"]')?.scrollIntoView({block:'center'}));
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:out+'/source-save-confirmed-'+width+'.png'});
    }
  });
  await run('source save confirmation: pending receipt locks editor actions and duplicate submissions do not write twice',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Keep the whole pending task');
    const saveBounds=await p.getByRole('button',{name:'Save task',exact:true}).boundingBox();
    await p.evaluate(()=>{window.actualCardFlush=flushDeviceWrites;window.actualCardSave=saveState;window.cardWrites=0;saveState=(...args)=>{cardWrites++;return actualCardSave(...args);};window.cardReceipts=[];flushDeviceWrites=()=>new Promise(resolve=>cardReceipts.push(resolve));});
    await p.getByRole('button',{name:'Save task',exact:true}).click();await p.waitForFunction(()=>cardReceipts.length>=2);
    assert.equal(await p.locator('.card-task-editor').getAttribute('aria-busy'),'true');
    const pendingBounds=await p.getByRole('button',{name:'Save task',exact:true}).boundingBox();assert.equal(pendingBounds.width,saveBounds.width);assert.equal(pendingBounds.height,saveBounds.height);
    for(const control of await p.locator('.card-task-editor input,.card-task-editor button').all())assert.equal(await control.isDisabled(),true);
    await p.evaluate(()=>{const form=document.querySelector('.card-task-editor');form.onsubmit({preventDefault(){}});document.querySelector('.card-task-editor input').oninput?.();});
    assert.equal(await p.evaluate(()=>cardWrites),1);assert.equal(await p.evaluate(()=>cardReceipts.length),2);
    const pending=await p.evaluate(()=>LifeStateMerge.copy(planningSession().cardTaskDraft));assert.equal(pending.title,'Keep the whole pending task');
    await p.evaluate(async()=>{await actualCardFlush();cardReceipts.splice(0).forEach(resolve=>resolve(true));});await p.locator('#dailyDialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>Object.hasOwn(planningSession(),'cardTaskDraft')),false);assert.equal(await p.evaluate(()=>cardWrites),1);
  });
  await run('source save confirmation: rejected storage receipt keeps draft without exposing private error details',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Keep this after a rejected receipt');
    await p.evaluate(()=>{window.actualCardFlush=flushDeviceWrites;window.cardReceiptCalls=0;flushDeviceWrites=(...args)=>++cardReceiptCalls===2?Promise.reject(new Error('private synthetic storage detail')):actualCardFlush(...args);});
    await p.getByRole('button',{name:'Save task',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.card-task-editor')?.hasAttribute('aria-busy'));
    assert.match(await p.locator('.card-task-editor [role=status]').innerText(),/Device save is not confirmed/);assert.doesNotMatch(await p.locator('.card-task-editor').innerText(),/private synthetic/);
    assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Keep this after a rejected receipt');
    await p.evaluate(()=>{flushDeviceWrites=actualCardFlush;});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
  });
  for(const mutation of ['board','day','view','owner','restore','session','draft','draft contents','source','ambiguous source','hidden','closed'])await run('source save confirmation: '+mutation+' change cannot clear a pending draft or overwrite either version',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Original full pending wording');
    await p.evaluate(()=>{window.actualCardFlush=flushDeviceWrites;window.sourceSession=planningSession();window.sourceBoard=state.activeBoardId;window.sourceForm=document.querySelector('.card-task-editor');window.sourceDialog=document.getElementById('dailyDialog');window.cardReceipts=[];flushDeviceWrites=()=>new Promise(resolve=>cardReceipts.push(resolve));});
    await p.getByRole('button',{name:'Save task',exact:true}).click();await p.waitForFunction(()=>cardReceipts.length>=2);
    const originalDraft=await p.evaluate(()=>LifeStateMerge.copy(sourceSession.cardTaskDraft));
    await p.evaluate(kind=>{
      if(kind==='board')switchBoard('other-board');
      if(kind==='day'){const actual=getTodayKey;getTodayKey=()=>LifePlanning.shift(actual(),1);}
      if(kind==='view')state.ui.workspaceMode='board';
      if(kind==='owner')state.cloudOwnerId='synthetic-other-owner';
      if(kind==='restore'){const actual=readRestoreGuard;readRestoreGuard=()=>({...actual(),id:'synthetic-new-restore'});}
      if(kind==='session')planningSessions.set(state.activeBoardId,{cardTaskDraft:{...sourceSession.cardTaskDraft,title:'Replacement session draft'}});
      if(kind==='draft')sourceSession.cardTaskDraft={...sourceSession.cardTaskDraft,title:'Replacement full draft'};
      if(kind==='draft contents')sourceSession.cardTaskDraft.title='A newer thought in the same draft';
      if(kind==='source')state.cards.find(c=>c.id==='project-a').items[0].text='Newer source wording';
      if(kind==='ambiguous source')state.cards.find(c=>c.id==='project-a').items.push({...state.cards.find(c=>c.id==='project-a').items[0],text:'Ambiguous source wording'});
      if(kind==='hidden')sourceDialog.hidden=true;
      if(kind==='closed')sourceDialog.close();
      cardReceipts.splice(0).forEach(resolve=>resolve(true));
    },mutation);
    await p.waitForFunction(()=>!sourceForm.hasAttribute('aria-busy'));
    if(!['source','ambiguous source','draft contents'].includes(mutation))assert.equal(await p.evaluate(()=>[...sourceForm.querySelectorAll('input,button')].every(control=>control.disabled)),true);
    const kept=await p.evaluate(()=>LifeStateMerge.copy(sourceSession.cardTaskDraft));
    assert.deepEqual(kept,mutation==='draft'?{...originalDraft,title:'Replacement full draft'}:mutation==='draft contents'?{...originalDraft,title:'A newer thought in the same draft'}:originalDraft);
    assert.deepEqual(await p.evaluate(()=>JSON.parse(sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+sourceBoard))).cardTaskDraft),originalDraft);
    if(mutation==='board')assert.equal(await p.evaluate(()=>Object.hasOwn(planningSession(),'cardTaskDraft')),false);
    else if(mutation==='session')assert.equal(await p.evaluate(()=>planningSession().cardTaskDraft.title),'Replacement session draft');
    else assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),mutation==='source'?'Newer source wording':'Original full pending wording');
  });
  await run('source save confirmation: reload resumes an unconfirmed receipt without repeating the source update',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Retained after a reload');
    await p.evaluate(()=>{window.actualCardFlush=flushDeviceWrites;flushDeviceWrites=async()=>false;});await p.getByRole('button',{name:'Save task',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('.card-task-editor [role=status]')?.textContent.includes('not confirmed'));
    const before=await p.evaluate(()=>LifeStateMerge.copy(state.cards));await p.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>actualCardFlush());await p.reload();await all(p);await p.getByRole('button',{name:'Continue task draft',exact:true}).click();
    assert.equal(await p.getByRole('textbox',{name:'Task name',exact:true}).inputValue(),'Retained after a reload');
    await p.evaluate(()=>{window.actualCardSave=saveState;window.cardWrites=0;saveState=(...args)=>{cardWrites++;return actualCardSave(...args);};});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>cardWrites),0);assert.deepEqual(await p.evaluate(()=>state.cards),before);assert.equal(await p.evaluate(()=>Object.hasOwn(planningSession(),'cardTaskDraft')),false);
  });
  await run('source save confirmation: a revised draft after a failed receipt saves once without repeating its completion history',async p=>{
    await all(p);await row(p,'one').getByRole('checkbox').check();await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('First complete wording');await p.getByLabel('Completion date (optional)',{exact:true}).fill('2026-09-21');
    await p.evaluate(()=>{window.actualCardFlush=flushDeviceWrites;flushDeviceWrites=async()=>false;});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.card-task-editor [role=status]')?.textContent.includes('not confirmed'));
    const events=await p.evaluate(()=>LifeStateMerge.copy(state.cards.find(c=>c.id==='project-a').items[0].taskCompletionEvents));
    await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Revised complete wording');await p.evaluate(()=>{flushDeviceWrites=actualCardFlush;});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    const task=await p.evaluate(()=>LifeStateMerge.copy(state.cards.find(c=>c.id==='project-a').items[0]));assert.equal(task.text,'Revised complete wording');assert.equal(task.taskCompletion.on,'2026-09-21');assert.deepEqual(task.taskCompletionEvents,events);assert.equal(task.custom,'keep');
  });
  for(const kind of ['owner','restore'])await run('source save confirmation: confirmed Undo refuses a changed '+kind+' without altering any source',async p=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Confirmed task update');await p.getByRole('button',{name:'Save task',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    const before=await p.evaluate(()=>LifeStateMerge.copy(state.cards));await p.evaluate(kind=>{if(kind==='owner')state.cloudOwnerId='other-synthetic-owner';else readRestoreGuard=()=>({id:'other-synthetic-restore'});},kind);
    await p.locator('#undoToast').getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await p.evaluate(()=>state.cards),before);assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);
  });
  await run('source save confirmation: independent tabs retain separate board drafts and save each original source once',async(p,context)=>{
    await all(p);await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('Original board draft');
    const q=await context.newPage();await q.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));await q.goto(url+'?preview=1&liveReload=0');await q.evaluate(()=>switchBoard('other-board'));await all(q);await edit(q,'one');await q.getByRole('textbox',{name:'Task name',exact:true}).fill('Independent board draft');
    await p.evaluate(()=>{window.actualCardFlush=flushDeviceWrites;flushDeviceWrites=async()=>false;});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.card-task-editor [role=status]')?.textContent.includes('not confirmed'));
    const kept=await p.evaluate(()=>LifeStateMerge.copy(planningSession().cardTaskDraft));await q.getByRole('button',{name:'Save task',exact:true}).click();await q.locator('#dailyDialog').waitFor({state:'detached'});assert.deepEqual(await p.evaluate(()=>planningSession().cardTaskDraft),kept);
    await p.evaluate(()=>{flushDeviceWrites=actualCardFlush;});await p.getByRole('button',{name:'Save task',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});await p.reload();await q.reload();await all(p);await all(q);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'Original board draft');assert.equal(await q.evaluate(()=>state.cards.find(c=>c.id==='other-project').items[0].text),'Independent board draft');
    assert.equal(await p.evaluate(()=>Object.hasOwn(planningSession(),'cardTaskDraft')),false);assert.equal(await q.evaluate(()=>Object.hasOwn(planningSession(),'cardTaskDraft')),false);assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);assert.equal(await q.evaluate(()=>state.syncConflicts.length),0);await q.close();
  });
  async function undoFixture(p){
    await all(p);await p.evaluate(()=>{window.originalUndoCards=LifeStateMerge.copy(state.cards);});await row(p,'one').getByRole('checkbox').check();await p.evaluate(async()=>{await flushDeviceWrites();window.beforeTaskUndo=LifeStateMerge.copy(state.cards);window.originalTaskFlush=flushDeviceWrites;window.originalTaskSave=saveState;window.originalTaskStage=LifeDeviceStore.stage;window.taskUndoWrites=0;window.savedTaskUndo=pendingUndoAction;saveState=(...args)=>{taskUndoWrites++;return originalTaskSave(...args);};});
  }
  await run('task undo confirmation: failed staging keeps a usable retry and the exact original completed task',async p=>{
    await undoFixture(p);await p.evaluate(()=>{LifeDeviceStore.stage=()=>{throw Error('Synthetic quota failure');};});await p.locator('#undoToastButton').click();
    assert.deepEqual(await p.evaluate(()=>state.cards),await p.evaluate(()=>beforeTaskUndo));assert.equal(await p.locator('#undoToast').isVisible(),true);assert.match(await p.locator('#undoToastText').innerText(),/Retry Undo/);
    await p.evaluate(()=>{LifeDeviceStore.stage=originalTaskStage;});await p.locator('#undoToastButton').click();await p.locator('#undoToast').waitFor({state:'hidden'});assert.deepEqual(await p.evaluate(()=>state.cards),await p.evaluate(()=>originalUndoCards));
  });
  await run('task undo confirmation: false receipt keeps a retry and does not replay restoration or completion history',async p=>{
    await undoFixture(p);const original=await p.evaluate(()=>originalUndoCards);await p.evaluate(()=>{flushDeviceWrites=async()=>false;});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>document.querySelector('#undoToastText')?.textContent.includes('not confirmed'));
    assert.equal(await p.locator('#undoToast').isVisible(),true);assert.deepEqual(await p.evaluate(()=>state.cards),await p.evaluate(()=>originalUndoCards));const writes=await p.evaluate(()=>taskUndoWrites);
    for(const [width,height] of [[320,844],[390,844],[768,1000],[1080,1100],[1440,1000]]){
      await p.setViewportSize({width,height});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const toast=p.locator('#undoToast');assert.equal(await toast.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight && el.scrollWidth<=el.clientWidth+1;}),true);
      for(const id of ['undoToastButton','undoToastCloseButton'])assert.equal(await p.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44 && r.height>=44;}),true);
      if(width===390 || width===1080)await p.screenshot({path:out+'/task-undo-retry-'+width+'.png'});
    }
    assert.equal(writes,1);await p.evaluate(()=>{flushDeviceWrites=originalTaskFlush;});await p.locator('#undoToastButton').click();await p.locator('#undoToast').waitFor({state:'hidden'});
    assert.equal(await p.evaluate(()=>taskUndoWrites),writes);assert.deepEqual(await p.evaluate(()=>state.cards),original);await p.reload();await all(p);assert.deepEqual(await p.evaluate(()=>state.cards),original);await p.evaluate(()=>flushDeviceWrites());
    for(const [width,height] of [[390,844],[1080,1100]]){await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:out+'/task-undo-confirmed-'+width+'.png'});}
  });
  await run('task undo confirmation: a pending receipt locks Undo and repeated callbacks do not stage twice',async p=>{
    await undoFixture(p);await p.evaluate(()=>{window.taskUndoReceipts=[];flushDeviceWrites=()=>new Promise(resolve=>taskUndoReceipts.push(resolve));});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>taskUndoReceipts.length>=2);
    assert.equal(await p.locator('#undoToast').getAttribute('aria-busy'),'true');assert.equal(await p.locator('#undoToastButton').isDisabled(),true);await p.evaluate(()=>{void savedTaskUndo();void savedTaskUndo();});assert.equal(await p.evaluate(()=>taskUndoWrites),1);assert.equal(await p.evaluate(()=>taskUndoReceipts.length),2);
    await p.evaluate(async()=>{await originalTaskFlush();taskUndoReceipts.splice(0).forEach(resolve=>resolve(true));});await p.locator('#undoToast').waitFor({state:'hidden'});assert.deepEqual(await p.evaluate(()=>state.cards),await p.evaluate(()=>originalUndoCards));
  });
  await run('task undo confirmation: rejected receipt retains retry without leaking private storage errors',async p=>{
    await undoFixture(p);await p.evaluate(()=>{window.undoFlushCalls=0;flushDeviceWrites=(...args)=>++undoFlushCalls===2?Promise.reject(Error('Private synthetic receipt detail')):originalTaskFlush(...args);});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>document.querySelector('#undoToastText')?.textContent.includes('not confirmed'));
    assert.doesNotMatch(await p.locator('#undoToastText').innerText(),/Private synthetic/);assert.equal(await p.locator('#undoToastButton').isEnabled(),true);assert.equal(await p.evaluate(()=>taskUndoWrites),1);
    await p.evaluate(()=>{flushDeviceWrites=originalTaskFlush;});await p.locator('#undoToastButton').click();await p.locator('#undoToast').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>taskUndoWrites),1);assert.deepEqual(await p.evaluate(()=>state.cards),await p.evaluate(()=>originalUndoCards));
  });
  for(const reason of ['owner','restore','day','board','source','ambiguous source','editor','hidden'])await run('task undo confirmation: stale '+reason+' before Undo cannot change any source record',async p=>{
    await undoFixture(p);await p.evaluate(reason=>{
      if(reason==='owner')state.cloudOwnerId='other-synthetic-owner';if(reason==='restore')readRestoreGuard=()=>({id:'other-synthetic-restore'});if(reason==='day')getTodayKey=()=> '2026-09-23';if(reason==='board')switchBoard('other-board');
      if(reason==='source')state.cards.find(c=>c.id==='project-a').items[0].text='Newer complete wording';if(reason==='ambiguous source')state.cards.find(c=>c.id==='project-a').items.push({...state.cards.find(c=>c.id==='project-a').items[0],custom:'Keep the second identity'});
      if(reason==='editor'){const dialog=dailyDialog('My full note');const input=planningInput('text','Keep every word of my new note',()=>{});input.id='undo-protected-draft';dialog.append(input);input.focus();}
      if(reason==='hidden')elements.undoToast.style.display='none';
    },reason);
    const before=await p.evaluate(()=>LifeStateMerge.copy({cards:state.cards,boards:state.boards}));const writes=await p.evaluate(()=>taskUndoWrites);await p.evaluate(()=>savedTaskUndo());
    assert.deepEqual(await p.evaluate(()=>({cards:state.cards,boards:state.boards})),before);assert.equal(await p.evaluate(()=>taskUndoWrites),writes);if(reason==='editor')assert.equal(await p.locator('#undo-protected-draft').inputValue(),'Keep every word of my new note');
  });
  for(const reason of ['owner','restore','day','board','source','ambiguous source','editor'])await run('task undo confirmation: '+reason+' changes during saving keep the newer version and cannot replay Undo',async p=>{
    await undoFixture(p);await p.evaluate(()=>{window.undoReceipts=[];flushDeviceWrites=()=>new Promise(resolve=>undoReceipts.push(resolve));});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>undoReceipts.length>=2);
    await p.evaluate(reason=>{
      if(reason==='owner')state.cloudOwnerId='other-synthetic-owner';if(reason==='restore')readRestoreGuard=()=>({id:'other-synthetic-restore'});if(reason==='day')getTodayKey=()=> '2026-09-23';if(reason==='board')switchBoard('other-board');
      if(reason==='source')state.cards.find(c=>c.id==='project-a').items[0].text='Newer wording during Undo';if(reason==='ambiguous source')state.cards.find(c=>c.id==='project-a').items.push({...state.cards.find(c=>c.id==='project-a').items[0],custom:'Preserve ambiguous record'});
      if(reason==='editor'){const dialog=dailyDialog('My protected note');const input=planningInput('text','All my new words remain',()=>{});input.id='undo-protected-draft';dialog.append(input);input.focus();}
      window.pendingUndoSnapshot=LifeStateMerge.copy({cards:state.cards,boards:state.boards});undoReceipts.splice(0).forEach(resolve=>resolve(true));
    },reason);
    await p.waitForFunction(()=>!document.querySelector('#undoToast').hasAttribute('aria-busy'));assert.deepEqual(await p.evaluate(()=>({cards:state.cards,boards:state.boards})),await p.evaluate(()=>pendingUndoSnapshot));assert.equal(await p.locator('#undoToastButton').isDisabled(),true);
    const writes=await p.evaluate(()=>taskUndoWrites);await p.evaluate(()=>savedTaskUndo());assert.equal(await p.evaluate(()=>taskUndoWrites),writes);assert.deepEqual(await p.evaluate(()=>({cards:state.cards,boards:state.boards})),await p.evaluate(()=>pendingUndoSnapshot));if(reason==='editor')assert.equal(await p.locator('#undo-protected-draft').inputValue(),'All my new words remain');
  });
  for(const outcome of [true,false,'reject'])await run('task undo confirmation: a '+outcome+' receipt cannot replace a newer notification',async p=>{
    await undoFixture(p);await p.evaluate(()=>{window.undoReceipts=[];flushDeviceWrites=()=>new Promise((resolve,reject)=>undoReceipts.push({resolve,reject}));});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>undoReceipts.length>=2);
    await p.evaluate(outcome=>{window.newUndoCalls=0;showUndoToast({message:'Keep the newer action',onUndo:()=>newUndoCalls++,persistent:true});undoReceipts.splice(0).forEach((r,index)=>{if(outcome==='reject' && index===1)r.reject(Error('Synthetic private detail'));else r.resolve(outcome===true);});},outcome);
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await p.locator('#undoToastText').innerText(),'Keep the newer action');assert.equal(await p.locator('#undoToastButton').isEnabled(),true);await p.locator('#undoToastButton').click();assert.equal(await p.evaluate(()=>newUndoCalls),1);assert.equal(await p.evaluate(()=>taskUndoWrites),1);assert.deepEqual(await p.evaluate(()=>state.cards),await p.evaluate(()=>originalUndoCards));
  });
  await run('task undo confirmation: old expiry callbacks cannot clear persistent retry or a newer action',async p=>{
    await all(p);const before=await p.evaluate(()=>LifeStateMerge.copy(state.cards));
    const result=await p.evaluate(()=>{
      const timeout=window.setTimeout,callbacks=[];window.setTimeout=(fn,ms,...args)=>{if(ms===12000)callbacks.push(fn);return timeout(fn,ms,...args);};
      try{showUndoToast({message:'Ordinary action',onUndo:()=>{}});callbacks[0]();const ordinaryExpired=elements.undoToast.hidden;
        showUndoToast({message:'Older action',onUndo:()=>{}});const stale=callbacks.at(-1),count=callbacks.length;showUndoToast({message:'Persistent retry',onUndo:()=>{},persistent:true});stale();return {ordinaryExpired,scheduled:callbacks.length-count,visible:!elements.undoToast.hidden,message:elements.undoToastText.textContent};
      }finally{window.setTimeout=timeout;}
    });assert.deepEqual(result,{ordinaryExpired:true,scheduled:0,visible:true,message:'Persistent retry'});assert.deepEqual(await p.evaluate(()=>state.cards),before);
  });
  await run('task undo confirmation: closing a pending message does not replay Undo or reopen the notification',async p=>{
    await undoFixture(p);await p.evaluate(()=>{window.undoReceipts=[];flushDeviceWrites=()=>new Promise(resolve=>undoReceipts.push(resolve));});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>undoReceipts.length>=2);await p.locator('#undoToastCloseButton').click();await p.evaluate(async()=>{await originalTaskFlush();undoReceipts.splice(0).forEach(resolve=>resolve(true));});
    await p.evaluate(()=>savedTaskUndo());assert.equal(await p.locator('#undoToast').isHidden(),true);assert.equal(await p.evaluate(()=>taskUndoWrites),1);assert.deepEqual(await p.evaluate(()=>state.cards),await p.evaluate(()=>originalUndoCards));
  });
  await run('task undo confirmation: rollback refuses to overwrite a competing same-task edit',async p=>{
    await undoFixture(p);await p.evaluate(()=>{saveState=()=>{taskUndoWrites++;state.cards.find(c=>c.id==='project-a').items[0].text='A newer competing edit';return false;};});await p.locator('#undoToastButton').click();assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].text),'A newer competing edit');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].custom),'keep');assert.deepEqual(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items.slice(1)),await p.evaluate(()=>beforeTaskUndo.find(c=>c.id==='project-a').items.slice(1)));assert.equal(await p.locator('#undoToast').isHidden(),true);
  });
  for(const [cardId,itemId] of [['todo-a','daily-one'],['single-a','']])await run('task undo confirmation: '+cardId+' retains every original field and restores only once',async p=>{
    await all(p);const original=await p.evaluate(()=>LifeStateMerge.copy(state.cards));const target=p.locator('.card-source-task[data-source-card="'+cardId+'"][data-source-task="'+itemId+'"]');await target.getByRole('checkbox').check();await p.evaluate(async()=>{await flushDeviceWrites();window.originalTaskFlush=flushDeviceWrites;window.originalTaskSave=saveState;window.taskUndoWrites=0;saveState=(...args)=>{taskUndoWrites++;return originalTaskSave(...args);};flushDeviceWrites=async()=>false;});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>document.querySelector('#undoToastText')?.textContent.includes('not confirmed'));
    assert.deepEqual(await p.evaluate(()=>state.cards),original);await p.evaluate(()=>{flushDeviceWrites=originalTaskFlush;});await p.locator('#undoToastButton').click();await p.locator('#undoToast').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>taskUndoWrites),1);await p.reload();await all(p);assert.deepEqual(await p.evaluate(()=>state.cards),original);
  });
  await run('task undo confirmation: renamed completed task restores its original name date and history without duplicate events',async p=>{
    await all(p);await row(p,'one').getByRole('checkbox').check();await p.evaluate(()=>flushDeviceWrites());const original=await p.evaluate(()=>LifeStateMerge.copy(state.cards));await edit(p,'one');await p.getByRole('textbox',{name:'Task name',exact:true}).fill('A revised completed task');await p.getByLabel('Completion date (optional)',{exact:true}).fill('2026-09-21');await p.getByRole('button',{name:'Save task',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    await p.evaluate(()=>{window.originalTaskFlush=flushDeviceWrites;flushDeviceWrites=async()=>false;});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>document.querySelector('#undoToastText')?.textContent.includes('not confirmed'));assert.deepEqual(await p.evaluate(()=>state.cards),original);await p.evaluate(()=>{flushDeviceWrites=originalTaskFlush;});await p.locator('#undoToastButton').click();await p.locator('#undoToast').waitFor({state:'hidden'});await p.reload();await all(p);assert.deepEqual(await p.evaluate(()=>state.cards),original);
  });
  await run('task undo confirmation: independent tabs keep both boards without duplicate records or losing either change',async(p,context)=>{
    await undoFixture(p);const original=await p.evaluate(()=>originalUndoCards);const q=await context.newPage();await q.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));await q.goto(url+'?preview=1&liveReload=0');await q.evaluate(()=>switchBoard('other-board'));await all(q);
    await p.evaluate(()=>{flushDeviceWrites=async()=>false;});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>document.querySelector('#undoToastText')?.textContent.includes('not confirmed'));await row(q,'one').getByRole('checkbox').check();await q.evaluate(()=>flushDeviceWrites());
    await p.evaluate(()=>{flushDeviceWrites=originalTaskFlush;});await p.locator('#undoToastButton').click();await p.locator('#undoToast').waitFor({state:'hidden'});await p.reload();await q.reload();await all(p);await all(q);
    assert.deepEqual(await p.evaluate(()=>state.cards),original);assert.equal(await q.evaluate(()=>state.cards.find(c=>c.id==='other-project').items[0].done),true);assert.equal(await q.evaluate(()=>state.cards.find(c=>c.id==='other-project').items.length),1);assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);assert.equal(await q.evaluate(()=>state.syncConflicts.length),0);await q.close();
  });
  await run('task undo confirmation: a late receipt preserves the complete inline diary text node focus and cursor',async p=>{
    await undoFixture(p);await p.evaluate(async()=>{state.cards.push({...makeCard({type:'diary',title:'Separate sample diary'}),id:'undo-diary'});if(!saveState())throw Error('Synthetic diary fixture was not saved');await flushDeviceWrites();});await workspace(p,'board');
    await p.evaluate(()=>{window.undoReceipts=[];flushDeviceWrites=()=>new Promise(resolve=>undoReceipts.push(resolve));});await p.locator('#undoToastButton').click();await p.waitForFunction(()=>undoReceipts.length>=2);
    const text='A complete first line about my day\nEvery word of the second line stays.';const input=p.locator('.task-card[data-id="undo-diary"] textarea').last();await input.fill(text);await input.focus();await input.evaluate(el=>{window.undoDiaryInput=el;el.setSelectionRange(7,7);});
    await p.evaluate(async()=>{await originalTaskFlush();undoReceipts.splice(0).forEach(resolve=>resolve(true));});await p.locator('#undoToast').waitFor({state:'hidden'});
    assert.deepEqual(await p.evaluate(()=>({connected:undoDiaryInput.isConnected,focused:document.activeElement===undoDiaryInput,start:undoDiaryInput.selectionStart,end:undoDiaryInput.selectionEnd,value:undoDiaryInput.value})),{connected:true,focused:true,start:7,end:7,value:text});
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='undo-diary').diaryEntries[getTodayKey()].thoughts),text);assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project-a').items[0].done),false);
    await p.evaluate(async()=>{flushDeviceWrites=originalTaskFlush;document.activeElement.blur();await flushDeviceWrites();});await p.reload();await workspace(p,'board');assert.equal(await p.locator('.task-card[data-id="undo-diary"] textarea').last().inputValue(),text);
  });
  await run('task undo confirmation: an unexpected guard error fails closed without leaking details or changing a task',async p=>{
    await undoFixture(p);await p.evaluate(()=>{const task=LifeTaskRepository.collect(workspaceTaskBoard()).find(t=>t.ref.itemId==='one');showCardTaskUndo({ref:task.ref,before:originalUndoCards.find(c=>c.id==='project-a').items[0],after:task.base},()=>{throw Error('Private synthetic guard detail');});});const before=await p.evaluate(()=>LifeStateMerge.copy(state.cards));await p.locator('#undoToastButton').click();assert.deepEqual(await p.evaluate(()=>state.cards),before);assert.equal(await p.evaluate(()=>taskUndoWrites),0);assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);assert.doesNotMatch(await p.locator('#headerSaveStatus').innerText(),/Private synthetic/);
  });
  await browser.close();fs.writeFileSync(out+'/task-sources-results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
