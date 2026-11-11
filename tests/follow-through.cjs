const assert=require('node:assert/strict');
const fs=require('node:fs');
const browsers=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const {workspace}=require('./navigation.cjs');
const fixture=require('./coaching-fixture.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-follow-through';fs.mkdirSync(out,{recursive:true});
const results=[];
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,action){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'Synthetic isolated records only'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
    await p.clock.setFixedTime(new Date('2026-10-11T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await action(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function seed(p){await p.evaluate(async program=>{
    const source=makeCard({type:'planner',title:'Dates',category:'Personal'});source.id='follow-source';
    for(const [id,title,date] of [['a','Late action','2026-10-08'],['b','Personal action','2026-10-11'],['c','Future action','2026-10-15']])LifePlanner.add(source,date,title,id);
    const project=makeCard({type:'checklist',title:'Original project',category:'Culturely'});project.id='follow-project';project.items=[{id:'new',text:'New project action',done:false,custom:'preserved'},{id:'old',text:'Old completed action',done:true}];
    state.cards=[source,project,makeCard({type:'diary',title:'Original diary'}),makeCard({type:'sidenote',title:'Notes'})];
    coachingStore().coachingPrograms.push(program);saveState();await flushDeviceWrites();renderCardsOnly({force:true});
  },fixture());}
  await run('new source completion dates appear in Today and reports; old unknown dates remain untouched',async p=>{
    await seed(p);await workspace(p,'board');await p.locator('[data-id=follow-project]').getByRole('checkbox',{name:'New project action',exact:true}).check();
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'tasks');
    assert.equal(await p.locator('.card-source-task').count(),1);assert.match(await p.locator('.card-source-task').innerText(),/Oct 11/);
    assert.deepEqual(await p.evaluate(()=>dailyCompletedTasks('2026-10-01','2026-10-31').map(t=>t.title)),['New project action']);
    const original=await p.evaluate(()=>state.cards.find(c=>c.id==='follow-project'));assert.equal(original.items[0].custom,'preserved');assert.equal(original.items[1].taskCompletion,undefined);
    await p.evaluate(()=>openReportsModal());await p.locator('[data-report-type=progress]').click();assert.match(await p.locator('#reportPrintArea').innerText(),/1 tasks completed/);assert.match(await p.locator('#reportPrintArea').innerText(),/no recorded completion date/);
  });
  await run('late completion stays visible; Undo removes its completion event; reopening keeps historical evidence',async p=>{
    await seed(p);await workspace(p,'tasks');await p.getByRole('checkbox',{name:'Mark done: Late action',exact:true}).click();
    assert.equal(await p.getByRole('checkbox',{name:'Mark open: Late action',exact:true}).isChecked(),true);
    assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-11','2026-10-11').length),1);
    await p.locator('#undoToastButton').click();assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-11','2026-10-11').length),0);
    await p.getByRole('checkbox',{name:'Mark done: Late action',exact:true}).click();await p.getByRole('checkbox',{name:'Mark open: Late action',exact:true}).click();
    assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-11','2026-10-11').length),1);assert.equal(await p.evaluate(()=>getPlannerSourceItems().find(t=>t.taskId==='a').dateKey),'2026-10-08');
  });
  await run('source-card save failure rolls back the checkbox and all completion metadata',async p=>{
    await seed(p);await workspace(p,'board');const before=await p.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='follow-project').items));
    await p.evaluate(()=>{window.originalStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Full');};});
    await p.locator('[data-id=follow-project]').getByRole('checkbox',{name:'New project action',exact:true}).click();
    assert.deepEqual(await p.evaluate(()=>state.cards.find(c=>c.id==='follow-project').items),JSON.parse(before));
    await p.evaluate(()=>LifeDeviceStore.stage=window.originalStage);await p.locator('[data-id=follow-project]').getByRole('checkbox',{name:'New project action',exact:true}).check();assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-11','2026-10-11').length),1);
  });
  await run('daily next-action drafts survive pauses, closing and reload; estimates do not change goal outcomes',async p=>{
    await seed(p);await workspace(p,'today');await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Late action',exact:true}).check();
    const choice=p.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'Late action',exact:true})});await choice.locator('summary').click();
    await p.getByLabel('Next action: Late action',{exact:true}).fill('Write the first paragraph, then ask for feedback');await p.getByLabel('Estimated minutes: Late action',{exact:true}).fill('25');await p.getByLabel('Available minutes (optional)',{exact:true}).fill('20');
    await p.keyboard.press('Escape');await p.reload();await workspace(p,'today');await p.getByRole('button',{name:'Choose',exact:true}).click();
    assert.equal(await p.getByLabel('Next action: Late action').inputValue(),'Write the first paragraph, then ask for feedback');assert.equal(await p.getByLabel('Estimated minutes: Late action').inputValue(),'25');
    await p.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.match(await p.locator('.daily-capacity').innerText(),/25 minutes estimated \/ 20 available/);
    await p.getByRole('button',{name:'Start',exact:true}).click();await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();assert.equal(await p.locator('.daily-focus-clock').innerText(),'05:00');await p.getByRole('button',{name:'Pause timer',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Resume timer',exact:true}).isVisible(),true);await p.getByRole('button',{name:'Mark done',exact:true}).click();
    assert.equal(await p.evaluate(()=>coachingProgram().entries.length),0);assert.equal(await p.evaluate(()=>dailyFollowThrough('2026-10-11','2026-10-11')[0].done),1);
  });
  await run('focus presets custom typing pause resume and reload preserve source records and do not silently restart active timers',async p=>{
    await seed(p);await p.clock.install({time:new Date('2026-10-11T04:00:00Z')});
    await p.clock.pauseAt(new Date('2026-10-11T04:00:01Z'));
    const before=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));
    const open=()=>p.evaluate(()=>openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='a')));
    await open();
    for(const minutes of [5,15,25]){
      await p.getByRole('button',{name:'Start '+minutes+' minutes',exact:true}).click();assert.equal(await p.locator('.daily-focus-clock').innerText(),String(minutes).padStart(2,'0')+':00');
      const deadline=await p.evaluate(()=>dailySession().focusTimer.endAt);await p.clock.runFor(1100);
      await p.evaluate(()=>[...document.querySelectorAll('.daily-start-choices button')][0].onclick());assert.equal(await p.evaluate(()=>dailySession().focusTimer.endAt),deadline);
      await p.getByRole('button',{name:'Pause timer',exact:true}).click();const remaining=await p.evaluate(()=>dailySession().focusTimer.remaining);await p.clock.runFor(2000);assert.equal(await p.evaluate(()=>dailySession().focusTimer.remaining),remaining);
      await p.getByRole('button',{name:'Resume timer',exact:true}).click();assert.equal(await p.evaluate(()=>dailySession().focusTimer.endAt-Date.now()),remaining);
      await p.getByRole('button',{name:'Reset timer',exact:true}).click();assert.equal(await p.locator('.daily-focus-clock').innerText(),'Ready to begin');
    }
    await p.locator('.daily-start-custom > summary').click();const input=p.getByLabel('Custom minutes',{exact:true});await input.pressSequentially('137');await p.clock.runFor(1600);assert.equal(await input.inputValue(),'137');assert(await input.evaluate(el=>el===document.activeElement));
    await p.getByRole('button',{name:'Start custom session',exact:true}).click();assert.equal(await p.locator('.daily-focus-clock').innerText(),'137:00');
    const deadline=await p.evaluate(()=>dailySession().focusTimer.endAt);await p.getByRole('button',{name:'Close',exact:true}).click();await p.reload();await open();assert.equal(await p.evaluate(()=>dailySession().focusTimer.endAt),deadline);
    assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);
  });
  for(const command of ['start','pause','resume','reset'])await run('focus timer '+command+' save failure preserves the exact timer and allows retry',async p=>{
    await seed(p);await workspace(p,'today');await p.clock.install({time:new Date('2026-10-11T04:00:00Z')});await p.clock.pauseAt(new Date('2026-10-11T04:00:01Z'));
    await p.evaluate(()=>openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='a')));
    if(command!=='start')await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();
    if(command==='resume')await p.getByRole('button',{name:'Pause timer',exact:true}).click();
    await p.evaluate(()=>{dailySession().retainedDraft={text:'Keep every character\nAnd this line',custom:[1,2]};if(dailySession().focusTimer)dailySession().focusTimer.custom={imported:'Keep this field'};saveDailyDraft();});
    const before=await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),session:LifeStateMerge.copy(dailySession()),draft:sessionStorage.getItem(LifeStorageScope.key('life-os-daily:'+state.activeBoardId))}));
    await p.evaluate(()=>{window.timerSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===sessionStorage && key===LifeStorageScope.key('life-os-daily:'+state.activeBoardId))throw Error('Synthetic draft quota failure');return timerSetItem.call(this,key,value);};});
    const button=p.getByRole('button',{name:{start:'Start 5 minutes',pause:'Pause timer',resume:'Resume timer',reset:'Reset timer'}[command],exact:true});await button.click();
    assert.deepEqual(await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),session:LifeStateMerge.copy(dailySession()),draft:sessionStorage.getItem(LifeStorageScope.key('life-os-daily:'+state.activeBoardId))})),before);
    assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/not saved.*retry/i);
    if(command==='pause')assert.equal(await p.locator('#dailyDialog .daily-focus-clock').innerText(),'05:00');
    if(command==='resume')assert.equal(await p.locator('#dailyDialog .daily-muted').innerText(),'Paused');
    if(command==='reset')assert.equal(await p.locator('#dailyDialog .daily-focus-clock').innerText(),'05:00');
    if(command==='start')assert.equal(await p.locator('#dailyDialog .daily-focus-clock').innerText(),'Ready to begin');
    await p.evaluate(()=>Storage.prototype.setItem=timerSetItem);await button.click();
    const after=await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),timer:LifeStateMerge.copy(dailySession().focusTimer),draft:JSON.parse(sessionStorage.getItem(LifeStorageScope.key('life-os-daily:'+state.activeBoardId)))}));
    assert.deepEqual(after.records,before.records);assert.deepEqual(after.timer,after.draft.focusTimer);
    assert.deepEqual(after.draft.retainedDraft,before.session.retainedDraft);if(command==='pause' || command==='resume')assert.deepEqual(after.timer.custom,before.session.focusTimer.custom);
    if(command==='reset')assert.equal(after.timer,undefined);else if(command==='pause')assert.equal(after.timer.endAt,undefined);else assert.equal(typeof after.timer.endAt,'number');
    await p.getByRole('button',{name:'Close',exact:true}).click();await p.reload();assert.deepEqual(await p.evaluate(()=>dailySession().focusTimer),after.timer);
  });
  for(const phase of ['running','paused','finished'])await run('focus timer for another task cannot be reset from a '+phase+' session',async p=>{
    await seed(p);await workspace(p,'today');await p.clock.install({time:new Date('2026-10-11T04:00:00Z')});await p.clock.pauseAt(new Date('2026-10-11T04:00:01Z'));
    await p.evaluate(()=>openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='a')));await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();
    if(phase==='paused')await p.getByRole('button',{name:'Pause timer',exact:true}).click();
    if(phase==='finished')await p.clock.runFor(300600);
    await p.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='b')));
    const before=await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),session:LifeStateMerge.copy(dailySession()),draft:sessionStorage.getItem(LifeStorageScope.key('life-os-daily:'+state.activeBoardId))}));
    assert(await p.getByRole('button',{name:'Reset timer',exact:true}).isDisabled());await p.evaluate(()=>[...document.querySelectorAll('#dailyDialog button')].find(b=>b.getAttribute('aria-label')==='Reset timer').onclick());
    assert.deepEqual(await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),session:LifeStateMerge.copy(dailySession()),draft:sessionStorage.getItem(LifeStorageScope.key('life-os-daily:'+state.activeBoardId))})),before);
  });
  await run('failed timer replacement keeps a finished session and the source tasks unchanged',async p=>{
    await seed(p);await workspace(p,'today');await p.clock.install({time:new Date('2026-10-11T04:00:00Z')});await p.clock.pauseAt(new Date('2026-10-11T04:00:01Z'));
    await p.evaluate(()=>{dailySession().focusTimer={key:dailyFocusKey(getWorkspaceTaskItems().find(t=>t.taskId==='b')),endAt:Date.now()-1,custom:{history:'Original finished session'}};saveDailyDraft();openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='a'));});
    const before=await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),session:LifeStateMerge.copy(dailySession())}));await p.evaluate(()=>{window.draftWriter=saveDailyDraft;saveDailyDraft=()=>false;});
    await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();assert.deepEqual(await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),session:LifeStateMerge.copy(dailySession())})),before);assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/not saved/);
    await p.evaluate(()=>saveDailyDraft=draftWriter);await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();assert.equal(await p.evaluate(()=>dailySession().focusTimer.key),JSON.stringify(['follow-source','a']));assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before.records);
  });
  await run('timer save feedback fits phone portrait and desktop and leaves the active session visible',async p=>{
    await seed(p);await workspace(p,'today');await p.clock.install({time:new Date('2026-10-11T04:00:00Z')});await p.clock.pauseAt(new Date('2026-10-11T04:00:01Z'));
    await p.evaluate(()=>openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='a')));await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();await p.evaluate(()=>{window.draftWriter=saveDailyDraft;saveDailyDraft=()=>false;});await p.getByRole('button',{name:'Pause timer',exact:true}).click();
    for(const width of [320,390,768,1080,1440]){await p.setViewportSize({width,height:width<500?844:1100});assert(await p.locator('#dailyDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().right<=innerWidth+1));assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/not saved.*retry/);assert.equal(await p.locator('#dailyDialog .daily-focus-clock').innerText(),'05:00');await p.screenshot({path:out+'/timer-save-error-'+width+'.png'});}
    await p.evaluate(()=>saveDailyDraft=draftWriter);await p.getByRole('button',{name:'Pause timer',exact:true}).click();await p.getByRole('button',{name:'Close',exact:true}).click();await p.setViewportSize({width:390,height:844});assert.match(await p.getByRole('region',{name:'Current focus session',exact:true}).innerText(),/Paused/);await p.screenshot({path:out+'/timer-save-retried-390.png'});
  });
  await run('focus custom duration rejects invalid values and timer expiry never completes a task or invents progress',async p=>{
    await seed(p);await p.clock.install({time:new Date('2026-10-11T04:00:00Z')});await p.evaluate(()=>openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='b')));
    await p.locator('.daily-start-custom > summary').click();for(const value of ['','0','-1','0.5','181']){await p.getByLabel('Custom minutes',{exact:true}).fill(value);await p.getByRole('button',{name:'Start custom session',exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/whole minutes/);assert.equal(await p.evaluate(()=>dailySession().focusTimer),undefined);}
    await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();await p.clock.runFor(300600);assert.equal(await p.locator('.daily-focus-clock').innerText(),'Session finished');assert(await p.getByRole('button',{name:'Pause timer',exact:true}).isHidden());assert(await p.getByRole('button',{name:'Resume timer',exact:true}).isHidden());assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='follow-source')).find(t=>t.id==='b').done),false);assert.equal(await p.evaluate(()=>dailyRecords().length),0);assert.equal(await p.evaluate(()=>coachingProgram().entries.length),0);
  });
  for(const reason of ['closed','hidden','detached','superseded','board','day','task'])await run('stale focus '+reason+' controls cannot start a timer or complete records',async p=>{
    await seed(p);await p.clock.install({time:new Date('2026-10-11T04:00:00Z')});
    await p.evaluate(reason=>{
      openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='a'));const dialog=document.getElementById('dailyDialog'),start=dialog.querySelector('.daily-start-choices button'),done=[...dialog.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Mark done');
      window.staleFocusControls={start,done};
      if(reason==='closed')dialog.close();if(reason==='hidden')dialog.hidden=true;if(reason==='detached')dialog.remove();if(reason==='superseded')openSaveDetails();
      if(reason==='board'){state.boards.push(createBoardRecord({id:'focus-other',name:'Other board',cards:[]}));syncActiveBoard({touchBoard:false});applyBoardToState(state,'focus-other');}
      if(reason==='task')LifePlanner.change(state.cards.find(c=>c.id==='follow-source'),'a',{title:'A newer title'});
    },reason);
    if(reason==='day')await p.clock.setSystemTime(new Date('2026-10-12T04:00:00Z'));
    const result=await p.evaluate(async()=>{const before=JSON.stringify({records:LifeCloudCopies.records(getStateForStorage()),drafts:[...dailySessions]});await staleFocusControls.start.onclick();await staleFocusControls.done.onclick();return before===JSON.stringify({records:LifeCloudCopies.records(getStateForStorage()),drafts:[...dailySessions]});});assert.equal(result,true);
  });
  await run('focus completion rechecks context after subtask confirmation for planner and project tasks',async p=>{
    await seed(p);
    for(const kind of ['planner','card']){
      const result=await p.evaluate(async kind=>{
        const task=getWorkspaceTaskItems().find(t=>kind==='card'?t.sourceKind==='card' && t.ref.itemId==='new':t.taskId==='a');openDailyStart(task);const done=[...document.querySelectorAll('#dailyDialog button')].find(b=>b.getAttribute('aria-label')==='Mark done'),original=confirmParentTaskCompletion;
        let release;confirmParentTaskCompletion=()=>new Promise(resolve=>release=resolve);const saving=done.onclick();document.getElementById('dailyDialog').hidden=true;
        const before=JSON.stringify(LifeCloudCopies.records(getStateForStorage()));release(true);await saving;confirmParentTaskCompletion=original;return before===JSON.stringify(LifeCloudCopies.records(getStateForStorage()));
      },kind);assert.equal(result,true);
    }
  });
  await run('focus controls stay usable on phone portrait and desktop without changing source records',async p=>{
    await seed(p);const before=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));await p.evaluate(()=>openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='a')));
    for(const width of [320,390,768,1080,1440]){await p.setViewportSize({width,height:850});assert(await p.locator('#dailyDialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1 && n.getBoundingClientRect().right<=innerWidth+1));assert(await p.locator('.daily-start-choices button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44 && n.getBoundingClientRect().width>=44)));await p.screenshot({path:out+'/focus-start-'+width+'.png'});}
    assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);
  });
  const startSession=async p=>{
    await seed(p);await p.clock.install({time:new Date('2026-10-11T04:00:00Z')});await p.clock.pauseAt(new Date('2026-10-11T04:01:00Z'));await workspace(p,'today');
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Late action',exact:true}).check();await p.getByRole('button',{name:'Keep next steps',exact:true}).click();
    await p.getByRole('button',{name:'Start',exact:true}).click();await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();await p.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());
  };
  await run('Today keeps a closed focus session visible and returns to the same original task without restarting it',async p=>{
    await startSession(p);const row=p.getByRole('region',{name:'Current focus session',exact:true});assert(await row.isVisible());assert.match(await row.innerText(),/Late action.*Running/s);
    assert(await p.getByRole('button',{name:'Open session',exact:true}).isVisible());
    const before=await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),timer:dailySession().focusTimer}));await p.clock.runFor(2100);assert.equal(await row.locator('output').innerText(),'04:58');
    await row.getByRole('button',{name:'Return to focus session',exact:true}).click();assert.equal(await p.locator('#dailyDialog h2').innerText(),'Late action');assert.equal(await p.evaluate(()=>dailySession().focusTimer.endAt),before.timer.endAt);await p.getByRole('button',{name:'Pause timer',exact:true}).click();await p.getByRole('button',{name:'Close',exact:true}).click();assert.match(await row.innerText(),/Paused/);
    await p.clock.runFor(2100);assert.equal(await row.locator('output').innerText(),'04:58');assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before.records);
    await p.reload();await workspace(p,'today');assert.match(await row.innerText(),/Paused/);assert.equal(await row.locator('output').innerText(),'04:58');assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before.records);
  });
  await run('Today focus seconds preserve the diary node cursor draft and original records without staging new saves',async p=>{
    await startSession(p);const writer=p.getByLabel('Diary thoughts',{exact:true});await writer.fill('My complete thought\nEvery word stays.');await p.evaluate(()=>flushDeviceWrites());await writer.evaluate(n=>n.setSelectionRange(3,11));
    await p.evaluate(()=>{window.focusWriter=document.activeElement;window.focusStage=LifeDeviceStore.stage;window.focusStageCount=0;LifeDeviceStore.stage=(...args)=>{focusStageCount++;return focusStage(...args);};window.focusRecords=LifeStateMerge.copy(LifeCloudCopies.records(getStateForStorage()));});await p.clock.runFor(3100);
    assert.equal(await writer.inputValue(),'My complete thought\nEvery word stays.');assert(await p.evaluate(()=>focusWriter===document.activeElement && focusWriter.isConnected && focusWriter.selectionStart===3 && focusWriter.selectionEnd===11));assert.equal(await p.evaluate(()=>focusStageCount),0);assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),await p.evaluate(()=>focusRecords));
  });
  await run('finished Today sessions stay visible without completing tasks and dismissal preserves every source record',async p=>{
    await startSession(p);const before=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));await p.clock.runFor(301100);const row=p.getByRole('region',{name:'Current focus session',exact:true});assert.match(await row.innerText(),/Session finished/);assert.equal(await row.locator('output').innerText(),'00:00');assert.equal(await p.evaluate(()=>dailyCompletedTasks(getTodayKey(),getTodayKey()).length),0);assert.equal(await p.evaluate(()=>coachingProgram().entries.length),0);
    await row.getByRole('button',{name:'Dismiss focus session',exact:true}).click();assert(await row.isHidden());assert(await p.getByRole('button',{name:'Start',exact:true}).isVisible());assert.equal(await p.evaluate(()=>dailySession().focusTimer),undefined);assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);await p.reload();await workspace(p,'today');assert(await row.isHidden());
  });
  await run('failed session dismissal rolls back and retries without removing a task or unfinished writing',async p=>{
    await startSession(p);const before=await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),timer:dailySession().focusTimer}));await p.evaluate(()=>{window.focusStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===sessionStorage)throw Error('Synthetic full draft storage');return focusStorageSet.call(this,key,value);};});
    const row=p.getByRole('region',{name:'Current focus session',exact:true});await row.getByRole('button',{name:'Dismiss focus session',exact:true}).click();assert.match(await row.locator('.daily-message').innerText(),/not dismissed/);assert.deepEqual(await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),timer:dailySession().focusTimer})),before);
    await p.evaluate(()=>Storage.prototype.setItem=focusStorageSet);await row.getByRole('button',{name:'Dismiss focus session',exact:true}).click();assert(await row.isHidden());assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before.records);
  });
  for(const reason of ['hidden','detached','board','day','replaced timer','open draft'])await run('stale Today session '+reason+' controls cannot clear or replace a timer or saved records',async p=>{
    await startSession(p);await p.evaluate(reason=>{
      const view=dailyFocusSessionView;window.oldFocusControls={open:view.open,dismiss:view.dismiss};
      if(reason==='hidden')view.root.hidden=true;if(reason==='detached')view.root.remove();
      if(reason==='board'){state.boards.push(createBoardRecord({id:'session-other',name:'Other board',cards:[]}));syncActiveBoard({touchBoard:false});applyBoardToState(state,'session-other');}
      if(reason==='replaced timer')dailySession().focusTimer={key:JSON.stringify(['follow-source','b']),endAt:Date.now()+60000};
      if(reason==='open draft')openDailyCapture();
    },reason);if(reason==='day')await p.clock.setSystemTime(new Date('2026-10-12T04:00:00Z'));
    assert(await p.evaluate(()=>{const snapshot=()=>JSON.stringify({records:LifeCloudCopies.records(getStateForStorage()),drafts:[...dailySessions]}),before=snapshot();oldFocusControls.open.onclick();oldFocusControls.dismiss.onclick();return snapshot()===before;}));
  });
  await run('completed or unavailable session tasks stay intact and unknown timer formats cannot be silently reset',async p=>{
    await startSession(p);const row=p.getByRole('region',{name:'Current focus session',exact:true});await p.evaluate(()=>{LifePlanner.complete(state.cards.find(c=>c.id==='follow-source'),'a',getTodayKey());refreshDailyFocusSession();});assert.match(await row.innerText(),/Task completed/);assert(await row.getByRole('button',{name:'Return to focus session',exact:true}).isDisabled());
    const before=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));await row.getByRole('button',{name:'Dismiss focus session',exact:true}).click();assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);
    await p.evaluate(()=>{dailySession().focusTimer={originalFutureFormat:{keep:'Everything'}};refreshDailyFocusSession();});assert.match(await row.innerText(),/needs review/);assert(await row.getByRole('button',{name:'Dismiss focus session',exact:true}).isDisabled());await p.evaluate(()=>openDailyStart(getWorkspaceTaskItems().find(t=>t.taskId==='b')));
    assert(await p.getByRole('button',{name:'Start 5 minutes',exact:true}).isDisabled());assert(await p.getByRole('button',{name:'Reset timer',exact:true}).isDisabled());assert.deepEqual(await p.evaluate(()=>dailySession().focusTimer),{originalFutureFormat:{keep:'Everything'}});
  });
  await run('Today session controls fit phone portrait and desktop and remain available in lighter mode',async p=>{
    await startSession(p);await p.getByRole('button',{name:'Lighter day',exact:true}).click();const before=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));const row=p.getByRole('region',{name:'Current focus session',exact:true});
    for(const width of [320,390,768,1080,1440]){await p.setViewportSize({width,height:900});assert(await row.isVisible());assert(await row.evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert(await row.locator('button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().width>=44 && n.getBoundingClientRect().height>=44)));await p.screenshot({path:out+'/today-session-'+width+'.png'});}
    assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);
  });
  const stepOptions=async p=>p.getByRole('button',{name:'Next-step options: Late action',exact:true}).click();
  await run('next-step removal and Undo revise only the plan and preserve original choices task dates timer and unknown fields',async p=>{
    await startSession(p);await p.evaluate(()=>{latestDailyRecord('focus',getTodayKey()).custom={original:'Keep this information'};saveState();});await p.evaluate(()=>flushDeviceWrites());
    const before=await p.evaluate(()=>({cards:LifeStateMerge.copy(state.cards),focus:LifeStateMerge.copy(dailyRecords().filter(r=>r.kind==='focus')),timer:LifeStateMerge.copy(dailySession().focusTimer),tasks:LifeStateMerge.copy(getWorkspaceTaskItems())}));
    await stepOptions(p);await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();assert.equal(await p.locator('.daily-focus-step').count(),0);assert(await p.getByRole('region',{name:'Current focus session',exact:true}).isVisible());
    assert.deepEqual(await p.evaluate(()=>({cards:state.cards,timer:dailySession().focusTimer,tasks:getWorkspaceTaskItems()})),{cards:before.cards,timer:before.timer,tasks:before.tasks});
    assert.deepEqual(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').slice(0,-1)),before.focus);assert.deepEqual(await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).custom),{original:'Keep this information'});assert.deepEqual(await p.evaluate(()=>dailyFollowThrough(getTodayKey(),getTodayKey())),[{date:'2026-10-11',total:1,done:0,revised:true}]);
    await p.locator('#undoToastButton').click();assert.equal(await p.locator('.daily-focus-step').count(),1);assert.deepEqual(await p.evaluate(()=>({cards:state.cards,timer:dailySession().focusTimer})),{cards:before.cards,timer:before.timer});assert.deepEqual(await p.evaluate(()=>dailyFollowThrough(getTodayKey(),getTodayKey())),[{date:'2026-10-11',total:1,done:0,revised:false}]);await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.equal(await p.locator('.daily-focus-step').count(),1);assert.deepEqual(await p.evaluate(()=>state.cards),before.cards);
  });
  await run('next-step removal supports Project tasks without changing source completion history or checklist fields',async p=>{
    await seed(p);await workspace(p,'today');await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'New project action',exact:true}).check();await p.getByRole('button',{name:'Keep next steps',exact:true}).click();const before=await p.evaluate(()=>LifeStateMerge.copy(state.cards));
    await p.getByRole('button',{name:'Next-step options: New project action',exact:true}).click();await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();assert.equal(await p.locator('.daily-focus-step').count(),0);assert.deepEqual(await p.evaluate(()=>state.cards),before);await p.locator('#undoToastButton').click();assert.equal(await p.locator('.daily-focus-step').count(),1);assert.deepEqual(await p.evaluate(()=>state.cards),before);
  });
  await run('next-step failed removal and failed Undo roll back with exact retry and no duplicated revisions',async p=>{
    await startSession(p);await stepOptions(p);const before=await p.evaluate(()=>({cards:LifeStateMerge.copy(state.cards),focus:LifeStateMerge.copy(dailyRecords().filter(r=>r.kind==='focus'))}));await p.evaluate(()=>{window.optionStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw Error('Synthetic full storage');};});
    await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/Not saved/);assert.deepEqual(await p.evaluate(()=>({cards:state.cards,focus:dailyRecords().filter(r=>r.kind==='focus')})),before);
    await p.evaluate(()=>LifeDeviceStore.stage=optionStage);await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),before.focus.length+1);
    await p.evaluate(()=>{LifeDeviceStore.stage=()=>{throw Error('Synthetic full storage');};});await p.locator('#undoToastButton').click();assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),before.focus.length+1);assert.match(await p.locator('#undoToastText').innerText(),/Retry Undo/);
    await p.evaluate(()=>LifeDeviceStore.stage=optionStage);await p.locator('#undoToastButton').click();assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),before.focus.length+2);assert.deepEqual(await p.evaluate(()=>state.cards),before.cards);
  });
  await run('next-step retained drafts older arrivals and malformed plans block removal without losing original information',async p=>{
    await startSession(p);await p.evaluate(()=>{dailySession().focusDrafts={[getTodayKey()]:{taskKeys:[],nextAction:'Keep my full draft'}};});await stepOptions(p);const before=await p.evaluate(()=>JSON.stringify({records:LifeCloudCopies.records(getStateForStorage()),session:dailySession()}));await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/draft is kept/);assert.equal(await p.evaluate(()=>JSON.stringify({records:LifeCloudCopies.records(getStateForStorage()),session:dailySession()})),before);
    await p.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>delete dailySession().focusDrafts[getTodayKey()]);await stepOptions(p);
    await p.evaluate(()=>{const baseline=latestDailyRecord('focus',getTodayKey());window.optionLatest=baseline.id;getArchivedCards().find(c=>c.dailyWorkspaceStore).workspaceRecords.push({...LifeStateMerge.copy(baseline),id:'older-plan-arrival',recordedAt:baseline.recordedAt-1,taskKeys:[]});});const records=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/plan changed/);assert.equal(await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).id===optionLatest),true);assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),records);
    await p.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).plans='Keep this original imported value');await stepOptions(p);const malformed=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/needs review/);assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),malformed);
  });
  await run('next-step second-tab plan changes cannot be overwritten by removal or Undo from the older tab',async(p,context)=>{
    await startSession(p);await stepOptions(p);const other=await context.newPage();await other.clock.setFixedTime(new Date('2026-10-11T04:01:00Z'));await other.goto(url+'?preview=1&liveReload=0');
    await other.evaluate(async()=>{saveDailyRecord({...LifeStateMerge.copy(latestDailyRecord('focus',getTodayKey())),taskKeys:[JSON.stringify(['follow-source','b'])]});await flushDeviceWrites();});await p.waitForFunction(()=>latestDailyRecord('focus',getTodayKey()).taskKeys.includes(JSON.stringify(['follow-source','b'])));const before=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/plan changed/);assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);
    await p.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>renderCardsOnly({force:true}));await p.getByRole('button',{name:'Next-step options: Personal action',exact:true}).click();await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await other.waitForFunction(()=>latestDailyRecord('focus',getTodayKey()).taskKeys.length===0);
    await other.evaluate(async()=>{saveDailyRecord({...LifeStateMerge.copy(latestDailyRecord('focus',getTodayKey())),taskKeys:[JSON.stringify(['follow-source','c'])]});await flushDeviceWrites();});await p.waitForFunction(()=>latestDailyRecord('focus',getTodayKey()).taskKeys.includes(JSON.stringify(['follow-source','c'])));const latest=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));await p.locator('#undoToastButton').click();assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),latest);assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);await other.close();
  });
  for(const reason of ['closed','hidden','detached','superseded','board','day','task','view'])await run('next-step stale '+reason+' controls cannot remove wait park reschedule or open another editor',async p=>{
    await startSession(p);await stepOptions(p);await p.evaluate(reason=>{
      const dialog=document.getElementById('dailyDialog');window.optionControls=[...dialog.querySelectorAll('button')].filter(b=>['Continue',"Remove from today's plan",'Waiting','Park','Reschedule'].includes(b.getAttribute('aria-label')));
      if(reason==='closed')dialog.close();if(reason==='hidden')dialog.hidden=true;if(reason==='detached')dialog.remove();if(reason==='superseded')openSaveDetails();
      if(reason==='board'){state.boards.push(createBoardRecord({id:'option-other',name:'Other board',cards:LifeStateMerge.copy(state.cards)}));syncActiveBoard({touchBoard:false});applyBoardToState(state,'option-other');}
      if(reason==='task')LifePlanner.change(state.cards.find(c=>c.id==='follow-source'),'a',{title:'The newer task name'});
      if(reason==='view')state.ui.workspaceMode='board';
    },reason);if(reason==='day')await p.clock.setSystemTime(new Date('2026-10-12T04:00:00Z'));
    assert(await p.evaluate(()=>{const snapshot=()=>JSON.stringify({records:LifeCloudCopies.records(getStateForStorage()),sessions:[...dailySessions]}),before=snapshot();optionControls.forEach(b=>b.onclick());return before===snapshot();}));
  });
  await run('next-step Undo refuses a newer plan and preserves all revised history',async p=>{
    await startSession(p);await stepOptions(p);await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();await p.evaluate(()=>saveDailyRecord({...LifeStateMerge.copy(latestDailyRecord('focus',getTodayKey())),taskKeys:[JSON.stringify(['follow-source','b'])]}));const before=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));await p.locator('#undoToastButton').click();assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);
  });
  for(const reason of ['board','day','view','open draft'])await run('next-step Undo refuses a changed '+reason+' and leaves all records and drafts intact',async p=>{
    await startSession(p);await stepOptions(p);await p.getByRole('button',{name:"Remove from today's plan",exact:true}).click();
    await p.evaluate(()=>flushDeviceWrites());
    if(reason==='board')await p.evaluate(async()=>{state.boards.push(createBoardRecord({id:'undo-option-other',name:'Other board',cards:LifeStateMerge.copy(state.cards)}));saveState({skipCloud:true});await flushDeviceWrites();switchBoard('undo-option-other');await flushDeviceWrites();});
    if(reason==='day')await p.clock.setSystemTime(new Date('2026-10-12T04:00:00Z'));if(reason==='view')await workspace(p,'board');if(reason==='open draft'){await p.locator('#railAddButton').click();await p.getByLabel('What is on your mind?',{exact:true}).fill('Keep my complete new draft\nEvery character stays.');}
    const result=await p.evaluate(()=>{const snapshot=()=>LifeStateMerge.copy({records:LifeCloudCopies.records(getStateForStorage()),sessions:[...dailySessions]}),before=snapshot();runPendingUndo();return {before,after:snapshot()};});assert.deepEqual(result.after,result.before);if(reason==='open draft')assert.equal(await p.getByLabel('What is on your mind?',{exact:true}).inputValue(),'Keep my complete new draft\nEvery character stays.');
  });
  await run('next-step options expose invalid date errors and fit phone portrait and desktop without altering sources',async p=>{
    await startSession(p);await stepOptions(p);const before=await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage()));
    for(const width of [320,390,768,1080,1440]){await p.setViewportSize({width,height:width<500?844:1200});assert(await p.locator('#dailyDialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1 && n.getBoundingClientRect().right<=innerWidth+1));assert(await p.getByRole('button',{name:"Remove from today's plan",exact:true}).evaluate(n=>n.getBoundingClientRect().height>=44));await p.screenshot({path:out+'/replan-options-'+width+'.png'});}
    await p.getByLabel('New planned day',{exact:true}).fill('');await p.getByRole('button',{name:'Reschedule',exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/valid planned day/);assert.deepEqual(await p.evaluate(()=>LifeCloudCopies.records(getStateForStorage())),before);
  });
  await run('changing the daily plan does not inflate original-choice follow-through',async p=>{
    await seed(p);await workspace(p,'today');await p.getByRole('button',{name:'Choose',exact:true}).click();for(const name of ['Late action','Personal action'])await p.getByRole('checkbox',{name,exact:true}).check();await p.getByRole('button',{name:'Keep next steps',exact:true}).click();
    await p.getByRole('checkbox',{name:'Mark done: Late action',exact:true}).click();await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Personal action',exact:true}).uncheck();await p.getByRole('button',{name:'Keep next steps',exact:true}).click();
    assert.deepEqual(await p.evaluate(()=>dailyFollowThrough('2026-10-11','2026-10-11')), [{date:'2026-10-11',total:2,done:1,revised:true}]);await workspace(p,'priorities');assert.match(await p.locator('.progress-measures').innerText(),/1 \/ 2 completed/);
  });
  await run('coming up and weekly review combine tasks and activities without copying either record',async p=>{
    await seed(p);await p.evaluate(()=>{const event=makeCard({type:'event',title:'Walk with a friend'});event.activity=LifePlanning.activityFromDraft({title:event.title,area:'Personal',allDay:true,startDate:'2026-10-13',endDate:'2026-10-13'});state.cards.push(event);saveState();});
    const before=await p.evaluate(()=>getPlannerSourceItems().length);await workspace(p,'today');const agenda=p.locator('.daily-section').filter({has:p.getByRole('heading',{name:'Coming up',exact:true})});assert.match(await agenda.innerText(),/Future action/);assert.match(await agenda.innerText(),/Walk with a friend/);
    await p.locator('#weeklyReviewButton').click();await p.locator('.daily-review-evidence > summary').click();assert.match(await p.locator('#dailyDialog').innerText(),/Future action/);assert.match(await p.locator('#dailyDialog').innerText(),/Walk with a friend/);assert.equal(await p.evaluate(()=>getPlannerSourceItems().length),before);
  });
  await run('checkpoint plans save independently of measured outcomes and overdue coaching stays visible',async p=>{
    await seed(p);await workspace(p,'priorities');await p.getByRole('navigation',{name:'Progress sections',exact:true}).getByRole('button',{name:'Goals & check-ins',exact:true}).click();assert.match(await p.locator('.coaching-overdue-checkin').innerText(),/Oct 10/);
    await p.getByRole('button',{name:'Focus on Real outcomes',exact:true}).click();await p.getByRole('button',{name:'Plan checkpoints: Paying customers',exact:true}).click();await p.getByRole('button',{name:'Add checkpoint',exact:true}).click();
    await p.getByLabel('Checkpoint 1 date',{exact:true}).fill('2026-10-01');await p.getByLabel('Checkpoint 1 customers',{exact:true}).fill('10');await p.getByRole('button',{name:'Save checkpoints',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();
    assert.deepEqual(await p.evaluate(()=>LifeCoaching.metrics(coachingProgram()).find(m=>m.id==='customers').pacePlan),[{date:'2026-10-01',value:10}]);assert.equal(await p.evaluate(()=>coachingProgram().entries.length),0);assert.equal(await p.evaluate(()=>LifeCoaching.pace(coachingProgram(),LifeCoaching.metrics(coachingProgram()).find(m=>m.id==='customers'),getTodayKey()).status),'Not recorded');
  });
  await run('progress remains useful without a goals import; phone and portrait use four primary destinations',async p=>{
    await workspace(p,'priorities');assert.match(await p.locator('.progress-measures').innerText(),/Not recorded/);
    for(const width of [320,390,768,1080,1440]){await p.setViewportSize({width,height:1000});for(const mode of ['today','tasks','calendar','board','priorities']){await workspace(p,mode);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
      await workspace(p,'today');await p.screenshot({path:out+'/today-'+width+'.png',fullPage:true});
      if(width<=980){assert.equal(await p.locator('.rail-nav .mobile-daily-nav').evaluateAll(nodes=>nodes.filter(e=>e.getBoundingClientRect().width>0).length),4);assert.equal(await p.locator('#boardColumnQuickControl').isVisible(),false);}
    }
  });
  await run('unresolved completion comparisons are not counted as confirmed progress',async p=>{
    await seed(p);await p.evaluate(()=>{
      const source=state.cards.find(c=>c.id==='follow-source');LifePlanner.complete(source,'a',getTodayKey());
      const project=state.cards.find(c=>c.id==='follow-project');LifeTaskRepository.complete(project.items[0],true,getTodayKey());
      state.syncConflicts=[{kind:'planner-task',segments:['boards',state.activeBoardId,'cards','follow-source','plannerTasks','a']},{kind:'task-completion',segments:['boards',state.activeBoardId,'cards','follow-project','items','new','taskCompletion']}];
    });assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-01','2026-10-31').length),0);
    await p.evaluate(()=>openReportsModal());await p.locator('[data-report-type=progress]').click();assert.match(await p.locator('#reportPrintArea').innerText(),/unresolved sync comparisons/);
  });
  await run('readable downloads include chosen plans and source completion history without changing records',async p=>{
    await seed(p);const result=await p.evaluate(()=>{
      const card=state.cards.find(c=>c.id==='follow-project');LifeTaskRepository.complete(card.items[0],true,getTodayKey());
      saveDailyRecord({kind:'focus',date:getTodayKey(),taskKeys:[JSON.stringify(['follow-source','a'])],plans:{[JSON.stringify(['follow-source','a'])]:{nextAction:'Draft <the first> paragraph\nAsk for feedback',minutes:25,startTime:'15:00'}},budgetMinutes:30});
      const board=LifeStateMerge.copy(workspaceTaskBoard());board.archivedCards=LifeStateMerge.copy(getArchivedCards());const before=JSON.stringify(board),html=dailyReadableRecords(board)+renderReadableCardContent(card);
      return {html,unchanged:before===JSON.stringify(board)};
    });assert.equal(result.unchanged,true);assert.match(result.html,/Chosen next-step plans/);assert.match(result.html,/Late action/);assert.match(result.html,/Draft &lt;the first&gt; paragraph/);assert.match(result.html,/Estimate: 25 minutes/);assert.match(result.html,/Completed 2026-10-11/);
  });
  await run('failed next-step changes can be retried, and timer updates never conceal saving errors',async p=>{
    await seed(p);const before=await p.evaluate(()=>LifeStateMerge.copy(LifePlanner.ensure(state.cards.find(c=>c.id==='follow-source'))[0]));
    await p.evaluate(()=>{openDailyStepOptions(getPlannerSourceItems().find(t=>t.taskId==='a'));window.originalStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Full');};});
    await p.getByRole('button',{name:'Park',exact:true}).click();assert.deepEqual(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='follow-source'))[0]),before);
    await p.evaluate(()=>LifeDeviceStore.stage=window.originalStage);await p.getByRole('button',{name:'Park',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='follow-source'))[0].status),'parked');
    await p.evaluate(()=>{openDailyStart(getPlannerSourceItems().find(t=>t.taskId==='b'));LifeDeviceStore.stage=()=>{throw new Error('Full');};});await p.getByRole('button',{name:'Mark done',exact:true}).click();await p.waitForTimeout(700);
    assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/not saved/);assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='follow-source')).find(t=>t.id==='b').done),false);
    await p.evaluate(()=>LifeDeviceStore.stage=window.originalStage);await p.getByRole('button',{name:'Mark done',exact:true}).click();assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='follow-source')).find(t=>t.id==='b').done),true);
    await p.evaluate(()=>openDailyStart(getPlannerSourceItems().find(t=>t.taskId==='b')));await p.getByRole('button',{name:'Mark done',exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/already completed/);assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='follow-source')).find(t=>t.id==='b').done),true);
  });
  await run('malformed history stays intact, cannot crash reports, and archived or stale task history is safe',async p=>{
    await seed(p);const unchanged=await p.evaluate(()=>{
      const source=state.cards.find(c=>c.id==='follow-source'),project=state.cards.find(c=>c.id==='follow-project');
      LifePlanner.ensure(source)[0].completionEvents=[null,'Original array value',{done:true,completedOn:getTodayKey(),completedAt:'not a timestamp'}];
      project.items[0].taskCompletionEvents='Original imported value';const before=JSON.stringify([source,project]);
      dailyCompletedTasks('2026-10-01','2026-10-31');openTaskHistory(getWorkspaceTaskItems().find(t=>t.sourceKind==='card' && t.ref.itemId==='new'));
      return before===JSON.stringify([source,project]);
    });assert.equal(unchanged,true);assert.match(await p.locator('#dailyDialog').innerText(),/No completion actions/);
    await p.keyboard.press('Escape');await workspace(p,'board');await p.locator('[data-id=follow-project]').getByRole('checkbox',{name:'New project action',exact:true}).click();
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='follow-project').items[0].done),false);assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='follow-project').items[0].taskCompletionEvents),'Original imported value');
    await p.evaluate(()=>{const card=state.cards.find(c=>c.id==='follow-project');card.items[0].taskCompletionEvents=[];LifeTaskRepository.complete(card.items[0],true,getTodayKey());window.historyRef=LifeTaskRepository.collect(workspaceTaskBoard())[0];card.archivedAt=Date.now();state.cards=state.cards.filter(c=>c!==card);getArchivedCards().push(card);openTaskHistory(window.historyRef);});
    assert.match(await p.locator('#dailyDialog').innerText(),/Completed · 2026-10-11/);await p.keyboard.press('Escape');
    await p.evaluate(()=>{getArchivedCards().splice(0);openTaskHistory(window.historyRef);});assert.match(await p.locator('#dailyDialog').innerText(),/Task changed elsewhere/);
  });
  await browser.close();fs.writeFileSync(out+'/follow-through-results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
