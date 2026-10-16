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
    await p.getByRole('button',{name:'Start',exact:true}).click();await p.getByRole('button',{name:'Start 5 minutes',exact:true}).click();assert.equal(await p.locator('.daily-focus-clock').innerText(),'05:00');await p.getByRole('button',{name:'Pause / resume',exact:true}).click();await p.getByRole('button',{name:'Mark done',exact:true}).click();
    assert.equal(await p.evaluate(()=>coachingProgram().entries.length),0);assert.equal(await p.evaluate(()=>dailyFollowThrough('2026-10-11','2026-10-11')[0].done),1);
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
