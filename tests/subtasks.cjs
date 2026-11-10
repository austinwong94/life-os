const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-subtasks';fs.mkdirSync(out,{recursive:true});
const results=[];
const tasks=async p=>{await workspace(p,'tasks');await p.getByRole('group',{name:'Task view'}).getByRole('button',{name:'All tasks',exact:true}).click();};
const add=async(p,parent,title)=>{await p.getByLabel('Add a subtask to '+parent,{exact:true}).fill(title);await p.getByLabel('Add a subtask to '+parent,{exact:true}).press('Enter');};
const open=async(p,parent)=>{await p.getByRole('button',{name:'Task options: '+parent,exact:true}).click();await p.getByRole('button',{name:'Subtasks',exact:true}).click();};
const confirm=async(p,action='Complete task')=>{await p.locator('#taskConfirmationDialog').getByRole('button',{name:action,exact:true}).click();await p.locator('#taskConfirmationDialog').waitFor({state:'detached'});};
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,fn){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic test'}));
    const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(6500);await p.clock.setFixedTime(new Date('2026-10-12T04:00:00Z'));
    try{
      await p.goto(url+'?preview=1&liveReload=0');await p.evaluate(async()=>{
        const source={...makeCard({type:'planner',title:'Planning',category:'Personal'}),id:'source'};LifePlanner.add(source,getTodayKey(),"Sister's birthday",'birthday');
        const daily={...makeCard({type:'daily',title:'To-Do',category:'Personal'}),id:'todo',items:[{id:'trip',text:'Prepare trip',done:false}]};
        state.cards=[source,daily];state.boards.push(createBoardRecord({id:'other',name:'Other',cards:[]}));saveState();await flushDeviceWrites();renderCardsOnly({force:true});
      });await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('birthday checklist: add four steps, Enter clears input, tick updates progress without completing parent, reload retains all',async p=>{
    await tasks(p);await open(p,"Sister's birthday");
    for(const title of ['Buy cake','Order food','Invite friends','Buy gifts'])await add(p,"Sister's birthday",title);
    assert.equal(await p.getByLabel("Add a subtask to Sister's birthday",{exact:true}).inputValue(),'');
    await p.getByRole('checkbox',{name:'Complete subtask: Buy cake',exact:true}).click();
    assert.equal(await p.getByRole('checkbox',{name:"Mark done: Sister's birthday",exact:true}).isChecked(),false);assert.match(await p.locator('.subtask-progress').first().innerText(),/1\/4.*25%/);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await tasks(p);assert.equal(await p.getByRole('checkbox',{name:'Reopen subtask: Buy cake',exact:true}).isChecked(),true);
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks.length),4);const html=await p.evaluate(()=>buildReadableDataArchive(getStateForStorage()));assert.match(html,/Buy cake/);assert.match(html,/Completed 2026-10-12/);
  });
  await run('rename, delete confirmation, Undo and source To-Do card use the same original records',async p=>{
    await tasks(p);await open(p,'Prepare trip');await add(p,'Prepare trip','Book hotel');
    await p.getByRole('button',{name:'Subtask options: Book hotel',exact:true}).click();await p.getByLabel('Subtask name',{exact:true}).fill('Book accessible hotel');await p.getByRole('button',{name:'Save subtask',exact:true}).click();
    await p.getByRole('button',{name:'Subtask options: Book accessible hotel',exact:true}).click();await p.getByRole('button',{name:'Delete subtask',exact:true}).click();await confirm(p,'Cancel');assert.equal(await p.evaluate(()=>LifeSubtasks.active(state.cards.find(c=>c.id==='todo').items[0]).length),1);
    await p.getByRole('button',{name:'Delete subtask',exact:true}).click();await confirm(p,'Delete subtask');assert.equal(await p.evaluate(()=>LifeSubtasks.active(state.cards.find(c=>c.id==='todo').items[0]).length),0);
    await p.getByRole('button',{name:'Undo',exact:true}).click();await workspace(p,'board');assert.equal(await p.getByRole('checkbox',{name:'Complete subtask: Book accessible hotel',exact:true}).count(),1);
    await p.getByRole('checkbox',{name:'Complete subtask: Book accessible hotel',exact:true}).click();await tasks(p);assert.equal(await p.getByRole('checkbox',{name:'Reopen subtask: Book accessible hotel',exact:true}).isChecked(),true);
  });
  await run('unfinished drafts survive pauses, collapsing, navigation and reload; failed saves roll back with retry',async p=>{
    await tasks(p);await open(p,"Sister's birthday");const input=p.getByLabel("Add a subtask to Sister's birthday",{exact:true});await input.pressSequentially('Purchase a birthday gift and write a thoughtful note',{delay:5});
    await p.locator('.task-subtasks summary').first().click();await workspace(p,'today');await tasks(p);await p.locator('.task-subtasks summary').first().click();assert.equal(await input.inputValue(),'Purchase a birthday gift and write a thoughtful note');
    await p.reload();await tasks(p);assert.equal(await input.inputValue(),'Purchase a birthday gift and write a thoughtful note');
    await p.evaluate(()=>{window.originalStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Synthetic storage failure');};});await input.press('Enter');assert.match(await p.locator('.task-subtasks:not([hidden]) .subtask-add [role=status]').first().innerText(),/Not saved/);assert.equal(await p.evaluate(()=>LifeSubtasks.active(getPlannerSourceItems()[0]).length),0);
    await p.evaluate(()=>{LifeDeviceStore.stage=window.originalStage;});await input.press('Enter');assert.equal(await input.inputValue(),'');assert.equal(await p.evaluate(()=>LifeSubtasks.active(getPlannerSourceItems()[0]).length),1);
  });
  await run('parent completion requires confirmation for unfinished steps, retains checklist and late-completed parent',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');await p.getByRole('checkbox',{name:"Mark done: Sister's birthday",exact:true}).click();await confirm(p,'Cancel');assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),false);
    await p.getByRole('checkbox',{name:"Mark done: Sister's birthday",exact:true}).click();await confirm(p);assert.equal(await p.getByRole('checkbox',{name:"Mark open: Sister's birthday",exact:true}).isChecked(),true);assert.equal(await p.getByRole('checkbox',{name:'Complete subtask: Buy cake',exact:true}).isChecked(),false);
    await p.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await p.getByRole('checkbox',{name:"Mark done: Sister's birthday",exact:true}).isChecked(),false);
    await p.evaluate(()=>{const task=getPlannerSourceItems()[0];LifePlanner.change(task.card,task.taskId,{dateKey:LifePlanning.shift(getTodayKey(),-1)});saveState();renderCardsOnly({force:true});});await p.getByRole('checkbox',{name:"Mark done: Sister's birthday",exact:true}).click();await confirm(p);
    await p.getByRole('group',{name:'Task view'}).getByRole('button',{name:'Today',exact:true}).click();assert.equal(await p.getByRole('checkbox',{name:"Mark open: Sister's birthday",exact:true}).isChecked(),true);
  });
  await run('Today planner checkbox uses visible confirmation, Escape cancels, completion persists and unfinished children stay unchanged',async p=>{
    await p.evaluate(()=>{
      window.confirm=()=>{throw new Error('Native confirmation must not be used');};
      const source=state.cards.find(c=>c.id==='source');LifeSubtasks.change(source.plannerTasks[0],{type:'add',id:'cake',title:'Buy cake'});
      state.cards=[...state.cards.filter(c=>c.id!=='source'),{...makeCard({type:'planlist',title:'Today planner',category:'Personal'}),id:'view',plannerViewMode:'today'}];
      state.archivedCards.push(source);saveState();renderCardsOnly({force:true});
    });await workspace(p,'board');
    const check=p.getByRole('checkbox',{name:"Mark done: Sister's birthday",exact:true});await check.click();
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),false);assert.equal(await check.isChecked(),false);
    await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/today-confirmation-phone.png'});
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await p.keyboard.press('Escape');await p.locator('#taskConfirmationDialog').waitFor({state:'detached'});
    await p.waitForFunction(label=>document.activeElement?.matches('.planner-linked-check') && document.activeElement.getAttribute('aria-label')===label,"Mark done: Sister's birthday");
    const focus=()=>p.evaluate(()=>{const ticks=[...document.querySelectorAll('.task-card[data-id="view"] .planner-linked-check')].filter(n=>n.getAttribute('aria-label')==="Mark done: Sister's birthday");return {count:ticks.length,focused:ticks[0]?.isConnected===true && ticks[0]===document.activeElement};});
    assert.deepEqual(await focus(),{count:1,focused:true});
    await p.evaluate(()=>renderCardsOnly({force:true}));assert.deepEqual(await focus(),{count:1,focused:true});
    await check.click();await confirm(p);assert.equal(await p.getByRole('checkbox',{name:"Mark open: Sister's birthday",exact:true}).isChecked(),true);
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks[0].done),false);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.getByRole('checkbox',{name:"Mark open: Sister's birthday",exact:true}).isChecked(),true);
    await p.getByRole('checkbox',{name:"Mark open: Sister's birthday",exact:true}).click();assert.equal(await check.isChecked(),false);assert.equal(await p.locator('#taskConfirmationDialog').count(),0);
    await p.getByRole('button',{name:"Mark done: Sister's birthday",exact:true}).click();await confirm(p);
    await p.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await check.isChecked(),false);
  });
  await run('pending completion rejects changed parent or another board and rolls back a failed write',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');
    const check=p.getByRole('checkbox',{name:"Mark done: Sister's birthday",exact:true});await check.click();
    await p.evaluate(()=>{const t=getPlannerSourceItems()[0];LifePlanner.change(t.card,t.taskId,{title:'Changed elsewhere'});saveState();});await confirm(p);
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),false);assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].title),'Changed elsewhere');
    await p.getByRole('checkbox',{name:'Mark done: Changed elsewhere',exact:true}).click();await p.evaluate(()=>switchBoard('other'));await confirm(p);
    assert.equal(await p.evaluate(()=>state.activeBoardId),'other');assert.equal(await p.evaluate(()=>getPlannerSourceItems().length),0);
    await p.evaluate(()=>switchBoard(state.boards.find(b=>b.id!=='other').id));await tasks(p);
    await p.getByRole('checkbox',{name:'Mark done: Changed elsewhere',exact:true}).click();
    await p.evaluate(()=>{window.originalStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Synthetic storage failure');};});await confirm(p);
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),false);assert.equal(await p.getByRole('checkbox',{name:'Mark done: Changed elsewhere',exact:true}).isChecked(),false);
    await p.evaluate(()=>{LifeDeviceStore.stage=window.originalStage;});
  });
  await run('focus returns to the clicked planner card when two views show the same original task',async p=>{
    await p.evaluate(()=>{
      const source=state.cards.find(c=>c.id==='source');LifeSubtasks.change(source.plannerTasks[0],{type:'add',id:'cake',title:'Buy cake'});
      state.cards=['first-view','second-view'].map(id=>({...makeCard({type:'planlist',title:id,category:'Personal'}),id,plannerViewMode:'today'}));
      state.archivedCards.push(source);saveState();renderCardsOnly({force:true});
    });await workspace(p,'board');
    const check=p.locator('.task-card[data-id="second-view"]').getByRole('checkbox',{name:"Mark done: Sister's birthday",exact:true});
    await check.click();await confirm(p,'Cancel');await p.evaluate(()=>renderCardsOnly({force:true}));
    await p.waitForFunction(()=>document.activeElement?.closest('.task-card')?.dataset.id==='second-view');
    assert.equal(await check.evaluate(el=>el===document.activeElement),true);
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),false);
  });
  await run('focus session waits for confirmation and keeps the session open on Cancel',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');
    await p.evaluate(()=>openDailyStart(getPlannerSourceItems()[0]));await p.locator('#dailyDialog').getByRole('button',{name:'Mark done',exact:true}).click();
    await confirm(p,'Cancel');assert.equal(await p.locator('#dailyDialog').isVisible(),true);assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),false);
    await p.locator('#dailyDialog').getByRole('button',{name:'Mark done',exact:true}).click();await confirm(p);
    await p.locator('#dailyDialog').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),true);
  });
  await run('original To-Do, Project and single-task checkboxes confirm visibly and preserve child records',async p=>{
    await p.evaluate(()=>{
      window.confirm=()=>{throw new Error('Native confirmation must not be used');};
      const todo=state.cards.find(c=>c.id==='todo');LifeSubtasks.change(todo.items[0],{type:'add',id:'hotel',title:'Book hotel'});
      const project={...makeCard({type:'checklist',title:'Birthday project',category:'Personal'}),id:'project',items:[{id:'party',text:'Organize party',done:false}]};
      LifeSubtasks.change(project.items[0],{type:'add',id:'family',title:'Invite family'});
      const single={...makeCard({type:'single',title:'Book appointment',category:'Personal'}),id:'single',done:false};LifeSubtasks.change(single,{type:'add',id:'call',title:'Call clinic'});
      state.cards=[todo,project,single];saveState();renderCardsOnly({force:true});
    });await workspace(p,'board');
    for(const id of ['todo','project','single']){
      const check=p.locator('.task-card[data-id="'+id+'"] input[type=checkbox]').first();
      await check.click();assert.equal(await check.isChecked(),false);await confirm(p,'Cancel');assert.equal(await check.isChecked(),false);
      await check.click();await confirm(p);assert.equal(await check.isChecked(),true);
      assert.equal(await p.evaluate(id=>{const c=state.cards.find(c=>c.id===id);return (c.items?.[0] || c).subtasks[0].done;},id),false);
    }
    await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.locator('.checklist input:checked,.daily-list > label input:checked').count(),3);
  });
  await run('Planner Delete confirms in-app, never completes the task, and failed deletion keeps its original data',async p=>{
    await tasks(p);await p.getByRole('button',{name:"Task options: Sister's birthday",exact:true}).click();await p.getByRole('button',{name:'Delete',exact:true}).click();await confirm(p,'Cancel');
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),false);
    await p.getByRole('button',{name:"Task options: Sister's birthday",exact:true}).click();await p.getByRole('button',{name:'Delete',exact:true}).click();
    await p.evaluate(()=>{window.originalStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Synthetic storage failure');};});await confirm(p,'Delete task');
    assert.equal(await p.evaluate(()=>getPlannerSourceItems().length),1);assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].done),false);
    await p.evaluate(()=>{LifeDeviceStore.stage=window.originalStage;});
    await p.getByRole('button',{name:"Task options: Sister's birthday",exact:true}).click();await p.getByRole('button',{name:'Delete',exact:true}).click();await confirm(p,'Delete task');
    assert.equal(await p.evaluate(()=>getPlannerSourceItems().length),0);
  });
  await run('multiple tabs keep independent child changes and separate boards; stale editor cannot overwrite newer child',async(p,context)=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');await add(p,"Sister's birthday",'Order food');await p.evaluate(()=>flushDeviceWrites());
    const q=await context.newPage();await q.goto(url+'?preview=1&liveReload=0');await tasks(q);await open(q,"Sister's birthday");
    await p.getByRole('checkbox',{name:'Complete subtask: Buy cake',exact:true}).click();await q.getByRole('checkbox',{name:'Complete subtask: Order food',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await q.evaluate(()=>flushDeviceWrites());await p.waitForFunction(()=>getPlannerSourceItems()[0].subtasks.every(t=>t.done));
    await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();await p.getByLabel('Subtask name',{exact:true}).fill('Unsaved rename');
    await q.getByRole('checkbox',{name:'Reopen subtask: Buy cake',exact:true}).click();await q.evaluate(()=>flushDeviceWrites());await p.evaluate(()=>flushDeviceWrites());await p.getByRole('button',{name:'Save subtask',exact:true}).click();assert.match(await p.locator('#dailyDialog [role=status]').innerText(),/changed elsewhere/);assert.equal(await p.getByLabel('Subtask name',{exact:true}).inputValue(),'Unsaved rename');await p.getByRole('button',{name:'Discard draft',exact:true}).click();
    await q.evaluate(()=>switchBoard('other'));await tasks(q);await q.getByLabel('New task',{exact:true}).fill('Other board');await q.getByLabel('New task',{exact:true}).press('Enter');await open(q,'Other board');await add(q,'Other board','Private step');
    await add(p,"Sister's birthday",'Buy gifts');await p.evaluate(()=>flushDeviceWrites());await q.evaluate(()=>flushDeviceWrites());await p.reload();await tasks(p);assert.equal(await p.getByText('Private step',{exact:true}).count(),0);assert.equal(await p.evaluate(()=>{const b=state.boards.find(b=>b.id==='other');return [...b.cards,...(b.archivedCards || [])].find(c=>c.type==='planner').plannerTasks[0].subtasks[0].title;}),'Private step');
  });
  await run('phone, portrait and desktop expand, edit and show long task names without clipping',async p=>{
    await tasks(p);await open(p,"Sister's birthday");for(const title of ['Buy cake','Order food','Invite friends and confirm dietary requirements with everybody','Buy gifts'])await add(p,"Sister's birthday",title);
    await p.getByRole('button',{name:'3 task columns',exact:true}).click();
    for(const width of [320,390,768,1080,1440]){await p.setViewportSize({width,height:1100});await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(await p.locator('.task-subtasks:not([hidden])').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className)),[]);
      await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();assert.equal(await p.getByLabel('Subtask name',{exact:true}).isVisible(),true);await p.getByRole('button',{name:'Discard draft',exact:true}).click();
      if([390,1080].includes(width))await p.screenshot({path:out+'/subtasks-'+width+'.png',fullPage:true});
    }
  });
  await run('Project checklist survives metadata edits, rejects bulk removal and renames safely through its original task',async p=>{
    await p.evaluate(()=>{state.cards.push({...makeCard({type:'checklist',title:'Birthday project',category:'Personal'}),id:'project',items:[{id:'party',text:'Organize party',done:false}]});saveState();});await tasks(p);await open(p,'Organize party');await add(p,'Organize party','Invite family');
    await p.evaluate(()=>{const card=state.cards.find(c=>c.id==='project');editingCardId=card.id;updateExistingCard({...card,description:'New description',items:[{id:'new',text:'Organize party',done:false}]});editingCardId=null;saveState();renderCardsOnly({force:true});});
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='project').items[0].subtasks[0].title),'Invite family');
    p.once('dialog',d=>d.accept());assert.equal(await p.evaluate(()=>{const card=state.cards.find(c=>c.id==='project');editingCardId=card.id;const result=updateExistingCard({...card,items:[]});editingCardId=null;return result;}),false);
    await p.getByRole('button',{name:'Task options: Organize party',exact:true}).click();await p.getByRole('button',{name:'Edit task',exact:true}).click();await p.getByLabel('Task name',{exact:true}).fill('Plan family party');await p.getByRole('button',{name:'Save task',exact:true}).click();await workspace(p,'board');assert.equal(await p.getByRole('checkbox',{name:'Complete subtask: Invite family',exact:true}).count(),1);
  });
  await run('same-child conflict offers coherent version choice and keeps the other children',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');await add(p,"Sister's birthday",'Order food');
    await p.evaluate(async()=>{
      await flushDeviceWrites();const base=getStateForStorage(),local=LifeStateMerge.copy(base),remote=LifeStateMerge.copy(base);
      const target=s=>s.boards.find(b=>b.id===state.activeBoardId).cards.find(c=>c.id==='source').plannerTasks[0];
      const a=target(local),b=target(remote);LifeSubtasks.change(a,{type:'rename',id:a.subtasks[0].id,title:'Buy chocolate cake'},a.subtasks[0]);LifeSubtasks.change(b,{type:'remove',id:b.subtasks[0].id},b.subtasks[0]);
      state.cards.find(c=>c.id==='source').plannerTasks[0].subtasks=a.subtasks;state.syncConflicts=LifeStateMerge.registerConflicts(LifeStateMerge.merge(base,local,remote).conflicts,{},createId);saveState();await flushDeviceWrites();openRecovery();
    });
    const save=p.getByRole('button',{name:'Save subtask version',exact:true});assert.equal(await save.isDisabled(),true);await p.getByRole('radio',{name:'Other tab version',exact:true}).check();await p.getByLabel('Apply this version to this subtask only.',{exact:true}).check();await save.click();await p.getByText('Subtask version saved. Other checklist steps were kept.',{exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>LifeSubtasks.active(getPlannerSourceItems()[0])[0].title),'Order food');assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);
  });
  await run('subtask safety: detached controls cannot change records or persist drafts into another board',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');
    await p.evaluate(()=>{
      window.oldSubtaskInput=document.querySelector('.subtask-add input');window.oldSubtaskCheck=document.querySelector('.subtask-row input');window.oldSubtaskOptions=document.querySelector('.subtask-row button');
      window.originalSubtaskBoard=state.activeBoardId;window.beforeSubtaskRecords=JSON.stringify(getStateForStorage().boards);
      window.beforeSubtaskSession=JSON.stringify(planningSession());switchBoard('other');
      window.otherSubtaskSession=JSON.stringify(planningSession());
      oldSubtaskInput.value='Detached writing';oldSubtaskInput.dispatchEvent(new Event('input',{bubbles:true}));oldSubtaskInput.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));oldSubtaskCheck.dispatchEvent(new Event('change',{bubbles:true}));oldSubtaskOptions.click();
    });
    assert.equal(await p.locator('#dailyDialog').count(),0);
    assert.equal(await p.evaluate(()=>JSON.stringify(planningSession())===otherSubtaskSession),true);
    assert.equal(await p.evaluate(()=>JSON.stringify(planningSessions.get(originalSubtaskBoard))===beforeSubtaskSession),true);
    await p.evaluate(()=>switchBoard(originalSubtaskBoard));
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks[0].done),false);
  });
  await run('subtask safety: stale same-board checkbox and closed editor cannot mutate a retained draft',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');
    await p.evaluate(()=>{window.oldSubtaskCheck=document.querySelector('.subtask-row input');renderCardsOnly({force:true});oldSubtaskCheck.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks[0].done),false);
    await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();await p.getByLabel('Subtask name',{exact:true}).fill('Chocolate cake');
    await p.evaluate(()=>{window.closedSubtaskInput=document.querySelector('#dailyDialog input');document.querySelector('#dailyDialog').close();});await p.locator('#dailyDialog').waitFor({state:'detached'});
    await p.evaluate(()=>{closedSubtaskInput.value='Detached corruption';closedSubtaskInput.dispatchEvent(new Event('input',{bubbles:true}));closedSubtaskInput.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();assert.equal(await p.getByLabel('Subtask name',{exact:true}).inputValue(),'Chocolate cake');
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks[0].title),'Buy cake');
  });
  await run('subtask safety: failed draft discard stays open and preserves the stored and visible wording',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();await p.getByLabel('Subtask name',{exact:true}).fill('Keep every word');
    await p.evaluate(()=>{window.originalSubtaskSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).includes('life-os-planning:'))throw new DOMException('Synthetic quota','QuotaExceededError');return originalSubtaskSet.call(this,k,v);};});
    await p.getByRole('button',{name:'Discard draft',exact:true}).click();assert.equal(await p.locator('#dailyDialog').count(),1);assert.equal(await p.getByLabel('Subtask name',{exact:true}).inputValue(),'Keep every word');assert.match(await p.locator('#dailyDialog [role=status]').innerText(),/not discarded|could not discard/i);
    await p.evaluate(()=>{Storage.prototype.setItem=originalSubtaskSet;});await p.getByRole('button',{name:'Discard draft',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks[0].title),'Buy cake');
  });
  await run('subtask safety: interrupted successful-add cleanup cannot create a duplicate after reload',async p=>{
    await tasks(p);await open(p,"Sister's birthday");const input=p.getByLabel("Add a subtask to Sister's birthday",{exact:true});await input.fill('Buy cake');
    await p.evaluate(()=>{window.originalSubtaskSave=saveState;window.originalSubtaskSet=Storage.prototype.setItem;window.blockSubtaskCleanup=false;saveState=function(...args){const ok=originalSubtaskSave(...args);if(ok)blockSubtaskCleanup=true;return ok;};Storage.prototype.setItem=function(k,v){if(blockSubtaskCleanup && String(k).includes('life-os-planning:'))throw new DOMException('Synthetic cleanup refusal','QuotaExceededError');return originalSubtaskSet.call(this,k,v);};});
    await input.press('Enter');await p.evaluate(async()=>{Storage.prototype.setItem=originalSubtaskSet;saveState=originalSubtaskSave;await flushDeviceWrites();});await p.reload();await tasks(p);
    if(await input.inputValue())await input.press('Enter');
    assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks.length),1);assert.equal(await input.inputValue(),'');
  });
  await run('subtask safety: a refused add receipt leaves canonical records and the prior stored draft unchanged',async p=>{
    await tasks(p);await open(p,"Sister's birthday");const input=p.getByLabel("Add a subtask to Sister's birthday",{exact:true});await input.fill('Buy a thoughtful gift');
    const before=await p.evaluate(()=>({task:LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]),session:sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId))}));
    await p.evaluate(()=>{window.originalSubtaskSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).includes('life-os-planning:'))throw new DOMException('Synthetic quota','QuotaExceededError');return originalSubtaskSet.call(this,k,v);};});
    await input.press('Enter');assert.match(await p.locator('.subtask-add [role=status]').first().innerText(),/Draft storage is unavailable/);assert.equal(await input.inputValue(),'Buy a thoughtful gift');
    assert.deepEqual(await p.evaluate(()=>({task:LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]),session:sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId))})),before);
    await p.evaluate(()=>{Storage.prototype.setItem=originalSubtaskSet;});await input.press('Enter');assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks.length),1);
  });
  await run('subtask safety: successful rename with failed cleanup retries without replaying the canonical change',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();await p.getByLabel('Subtask name',{exact:true}).fill('Buy chocolate cake');
    await p.evaluate(()=>{window.originalSubtaskSave=saveState;window.originalSubtaskSet=Storage.prototype.setItem;window.blockSubtaskCleanup=false;window.subtaskSourceSaves=0;saveState=function(...args){subtaskSourceSaves++;const ok=originalSubtaskSave(...args);if(ok)blockSubtaskCleanup=true;return ok;};Storage.prototype.setItem=function(k,v){if(blockSubtaskCleanup && String(k).includes('life-os-planning:'))throw new DOMException('Synthetic cleanup refusal','QuotaExceededError');return originalSubtaskSet.call(this,k,v);};});
    await p.getByRole('button',{name:'Save subtask',exact:true}).click();assert.match(await p.locator('#dailyDialog [role=status]').innerText(),/Subtask saved/);assert.equal(await p.getByLabel('Subtask name',{exact:true}).inputValue(),'Buy chocolate cake');
    const saved=await p.evaluate(()=>LifeStateMerge.copy(getPlannerSourceItems()[0].subtasks[0]));
    await p.evaluate(()=>{Storage.prototype.setItem=originalSubtaskSet;});await p.getByRole('button',{name:'Save subtask',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>subtaskSourceSaves),1);assert.deepEqual(await p.evaluate(()=>LifeStateMerge.copy(getPlannerSourceItems()[0].subtasks[0])),saved);
    await p.evaluate(async()=>{saveState=originalSubtaskSave;await flushDeviceWrites();});await p.reload();await tasks(p);assert.equal(await p.getByRole('checkbox',{name:'Complete subtask: Buy chocolate cake',exact:true}).count(),1);
  });
  await run('subtask safety: pending delete refuses a board switch and never removes another board record',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();await p.getByLabel('Subtask name',{exact:true}).fill('My pending draft');
    await p.getByRole('button',{name:'Delete subtask',exact:true}).click();await p.evaluate(()=>{window.originalSubtaskBoard=state.activeBoardId;switchBoard('other');});await confirm(p,'Delete subtask');
    assert.equal(await p.evaluate(()=>state.activeBoardId),'other');await p.evaluate(()=>switchBoard(originalSubtaskBoard));
    assert.equal(await p.evaluate(()=>LifeSubtasks.active(getPlannerSourceItems()[0])[0].title),'Buy cake');
    await p.locator('#dailyDialog').getByRole('button',{name:'Close',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});await tasks(p);await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();assert.equal(await p.getByLabel('Subtask name',{exact:true}).inputValue(),'My pending draft');
  });
  await run('subtask safety: an already-added step changed elsewhere is not duplicated and discarding only clears its draft',async p=>{
    await tasks(p);await open(p,"Sister's birthday");const input=p.getByLabel("Add a subtask to Sister's birthday",{exact:true});await input.fill('Buy cake');
    await p.evaluate(()=>{window.originalSubtaskSave=saveState;window.originalSubtaskSet=Storage.prototype.setItem;window.blockSubtaskCleanup=false;saveState=function(...args){const ok=originalSubtaskSave(...args);if(ok)blockSubtaskCleanup=true;return ok;};Storage.prototype.setItem=function(k,v){if(blockSubtaskCleanup && String(k).includes('life-os-planning:'))throw new DOMException('Synthetic cleanup refusal','QuotaExceededError');return originalSubtaskSet.call(this,k,v);};});
    await input.press('Enter');await p.evaluate(async()=>{Storage.prototype.setItem=originalSubtaskSet;saveState=originalSubtaskSave;const task=getPlannerSourceCards()[0].plannerTasks[0];LifeSubtasks.change(task,{type:'rename',id:task.subtasks[0].id,title:'Cake ordered elsewhere'},task.subtasks[0]);saveState();await flushDeviceWrites();});await p.reload();await tasks(p);
    await input.press('Enter');assert.match(await p.locator('.subtask-add [role=status]').first().innerText(),/already added and later changed/);assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks.length),1);
    const before=await p.evaluate(()=>LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]));await p.getByRole('button',{name:'Discard subtask draft',exact:true}).click();assert.equal(await input.inputValue(),'');assert.deepEqual(await p.evaluate(()=>LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0])),before);
    await add(p,"Sister's birthday",'Order food');assert.equal(await p.evaluate(()=>getPlannerSourceItems()[0].subtasks.length),2);
  });
  await run('subtask safety: protected draft and retry controls fit phone, short phone and portrait desktop layouts',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');await p.getByRole('button',{name:'Subtask options: Buy cake',exact:true}).click();await p.getByLabel('Subtask name',{exact:true}).fill('Order birthday cake with a personal message');
    for(const [width,height] of [[320,844],[390,480],[390,844],[768,1000],[1080,1100],[1440,1000]]){
      await p.setViewportSize({width,height});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      for(const label of ['Save subtask','Discard draft','Delete subtask']){const button=p.getByRole('button',{name:label,exact:true});await button.scrollIntoViewIfNeeded();assert.equal(await button.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.height>=44 && r.width>=44;}),true);}
      await p.screenshot({path:out+'/protected-subtask-'+width+'x'+height+'.png'});
    }
  });
  await run('subtask safety: CSS-hidden checklist controls cannot write or open editors',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');
    const before=await p.evaluate(()=>({task:LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]),session:JSON.stringify(planningSession())}));
    await p.evaluate(()=>{const details=document.querySelector('.task-subtasks');details.style.display='none';const input=details.querySelector('.subtask-add input');input.value='Hidden writing';input.dispatchEvent(new Event('input',{bubbles:true}));input.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));details.querySelector('.subtask-row input').dispatchEvent(new Event('change',{bubbles:true}));details.querySelector('.subtask-row button').click();});
    assert.equal(await p.locator('#dailyDialog').count(),0);assert.deepEqual(await p.evaluate(()=>({task:LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]),session:JSON.stringify(planningSession())})),before);
  });
  await run('subtask safety: malformed stored draft maps are preserved rather than silently dropping receipts',async p=>{
    await tasks(p);await open(p,"Sister's birthday");await add(p,"Sister's birthday",'Buy cake');
    for(const property of ['subtaskDrafts','subtaskPendingAdds'])for(const value of [[],null,false,'Unreadable draft']){
      const before=await p.evaluate(({property,value})=>{const session=planningSession();session.subtaskDrafts={};session.subtaskPendingAdds={};session[property]=value;savePlanningSession();const before={task:LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]),raw:sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId))};renderCardsOnly({force:true});return before;},{property,value});
      assert.equal(await p.getByText('This checklist draft needs review. Its stored copy was kept.',{exact:true}).count()>0,true);
      assert.deepEqual(await p.evaluate(()=>({task:LifeStateMerge.copy(getPlannerSourceCards()[0].plannerTasks[0]),raw:sessionStorage.getItem(LifeStorageScope.key('life-os-planning:'+state.activeBoardId))})),before);
    }
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
