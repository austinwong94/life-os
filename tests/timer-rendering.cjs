const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-timer-rendering';
assert(['localhost','127.0.0.1'].includes(new URL(url).hostname));fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic timer checks; cloud blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.stack));
    await p.clock.install({time:new Date('2026-10-16T04:00:00Z')});
    try{await p.goto(url+'?preview=1&liveReload=0');await seed(p);await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function seed(p){
    await p.evaluate(async()=>{
      const manual=makeCard({type:'single',title:'A timed step',timerMode:'hours',duration:600});manual.id='clock-manual';manual.remaining=120;manual.runningSince=Date.now();
      const event=makeCard({type:'event',title:'Upcoming appointment',timerMode:'date',duration:600,targetAt:new Date(Date.now()+120000).toISOString()});event.id='clock-event';event.showTimerSeconds=true;
      const diary=makeCard({type:'diary',title:'My diary'});diary.id='clock-diary';diary.diaryEntries={'2026-10-15':{thoughts:'Original writing\nEvery line stays.',updatedAt:1}};
      const planner=makeCard({type:'planner',title:'My actions'});planner.id='clock-planner';LifePlanner.add(planner,getTodayKey(),'An existing task','clock-task');
      const routine=makeCard({type:'routine',title:'A daily routine',items:['Rest']});routine.id='clock-routine';
      state.cards=[manual,event,diary,planner,routine];state.archivedCards=[];state.board.layout='custom';state.board.columnCount=3;state.cards.forEach((c,i)=>{c.layoutColumn=i%3;c.order=i;});state.activeFilter='all';state.focusFilter='all';state.searchQuery='';
      saveState();await flushDeviceWrites();renderCardsOnly({force:true});
    });
    await workspace(p,'board');await p.evaluate(()=>flushDeviceWrites());await p.clock.runFor(1100);
  }
  const card=(p,id)=>p.locator('.task-card[data-id="'+id+'"]');
  await run('live clocks advance during paused writing without replacing the writer, drafts or card positions',async p=>{
    const text='I am still thinking about this.\nKeep every character while I pause.';
    await card(p,'clock-planner').getByLabel('Planner task',{exact:true}).fill('An unfinished task draft');
    const writer=card(p,'clock-diary').getByLabel('Diary thoughts',{exact:true});await writer.fill(text);await writer.evaluate(n=>n.setSelectionRange(5,13));
    await p.evaluate(()=>{window.clockWriter=document.activeElement;window.clockRows=[...document.querySelectorAll('#boardGrid .task-card')];window.clockPositions=state.cards.map(c=>[c.id,c.layoutColumn,c.order]);});
    const before=await card(p,'clock-manual').locator('.timer-display strong').innerText();await p.clock.runFor(3100);
    assert.notEqual(await card(p,'clock-manual').locator('.timer-display strong').innerText(),before);
    assert.equal(await writer.inputValue(),text);assert.equal(await card(p,'clock-planner').getByLabel('Planner task',{exact:true}).inputValue(),'An unfinished task draft');
    assert(await p.evaluate(()=>clockWriter===document.activeElement && clockWriter.isConnected && clockWriter.selectionStart===5 && clockWriter.selectionEnd===13 && clockRows.every(n=>n.isConnected)));
    assert.deepEqual(await p.evaluate(()=>state.cards.map(c=>[c.id,c.layoutColumn,c.order])),await p.evaluate(()=>clockPositions));
    await p.screenshot({path:out+'/paused-writing.png',fullPage:false});
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'board');assert.equal(await writer.inputValue(),text);assert.equal(await card(p,'clock-planner').getByLabel('Planner task',{exact:true}).inputValue(),'An unfinished task draft');
  });
  await run('ordinary seconds preserve floating menus and never stage a new data save or mutate records',async p=>{
    await card(p,'clock-event').getByRole('button',{name:'Card options',exact:true}).click();
    const before=await p.evaluate(()=>{window.clockOriginal=JSON.stringify(state.cards);window.clockStage=LifeDeviceStore.stage;window.clockStages=0;LifeDeviceStore.stage=(...args)=>{clockStages++;return clockStage(...args);};return document.querySelector('[data-id="clock-event"] .timer-display strong').textContent;});
    await p.clock.runFor(5100);assert.notEqual(await card(p,'clock-event').locator('.timer-display strong').innerText(),before);
    assert(await p.getByRole('menu',{name:'Card options',exact:true}).isVisible());assert(await p.getByRole('menuitem',{name:'Edit',exact:true}).isVisible());
    assert.equal(await p.evaluate(()=>clockStages),0);assert(await p.evaluate(()=>JSON.stringify(state.cards)===clockOriginal));
    await p.keyboard.press('Escape');await p.evaluate(()=>LifeDeviceStore.stage=clockStage);
  });
  await run('automatic countdown reaches zero on the seconds scheduler and appears in the completed filter',async p=>{
    await p.evaluate(async()=>{const event=state.cards.find(c=>c.id==='clock-event');event.targetAt=new Date(Date.now()+2000).toISOString();state.activeFilter='done';saveState();await flushDeviceWrites();renderCardsOnly({force:true});});
    const originalDone=await p.evaluate(()=>state.cards.find(c=>c.id==='clock-event').done);
    assert.equal(await card(p,'clock-event').count(),0);await p.clock.runFor(3100);
    await card(p,'clock-event').waitFor({state:'visible'});assert.equal(await card(p,'clock-event').locator('.timer-display strong').innerText(),'Reached');assert.equal(await card(p,'clock-event').locator('.timer-caption').textContent(),'Reached');assert.equal(await card(p,'clock-event').locator('.card-percent').innerText(),'100%');
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-event').done),originalDone);
  });
  await run('a reached live countdown paints its final second and stops unnecessary seconds refreshes',async p=>{
    await p.evaluate(async()=>{
      state.cards=state.cards.filter(c=>['clock-event','clock-diary'].includes(c.id));state.cards.find(c=>c.id==='clock-event').targetAt=new Date(Date.now()+2000).toISOString();saveState();await flushDeviceWrites();renderCardsOnly({force:true});
      window.clockRefresh=refreshTimerDisplays;window.clockRefreshCount=0;refreshTimerDisplays=(...args)=>{clockRefreshCount++;return clockRefresh(...args);};
    });
    await p.clock.runFor(4100);assert.equal(await card(p,'clock-event').locator('.timer-display strong').innerText(),'Reached');
    const calls=await p.evaluate(()=>clockRefreshCount);assert(calls>0);await p.clock.runFor(4100);assert.equal(await p.evaluate(()=>clockRefreshCount),calls);
  });
  await run('manual expiry records dated history, saves once, and never clears a diary editor',async p=>{
    await p.evaluate(async()=>{const manual=state.cards.find(c=>c.id==='clock-manual');manual.remaining=2;manual.runningSince=Date.now();saveState();await flushDeviceWrites();renderCardsOnly({force:true});});
    const writer=card(p,'clock-diary').getByLabel('Diary thoughts',{exact:true});await writer.fill('My writing continues after the timer ends.');await p.evaluate(()=>{window.expiryWriter=document.activeElement;window.expiryStage=LifeDeviceStore.stage;window.expirySaves=0;LifeDeviceStore.stage=(...args)=>{expirySaves++;return expiryStage(...args);};});
    await p.clock.runFor(4100);assert.equal(await card(p,'clock-manual').locator('.timer-display strong').innerText(),'00:00:00');
    assert.equal(await card(p,'clock-manual').getByRole('button',{name:'Start timer',exact:true}).count(),1);
    assert.deepEqual(await p.evaluate(()=>{const c=state.cards.find(c=>c.id==='clock-manual');return {done:c.done,running:c.runningSince,remaining:c.remaining};}),{done:true,running:null,remaining:0});
    const completion=await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').taskCompletion);
    assert.equal(completion.on,'2026-10-16');assert(completion.at<=completion.recordedAt);
    assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-16','2026-10-16').filter(t=>t.ref?.cardId==='clock-manual').length),1);
    assert.equal(await p.evaluate(()=>expirySaves),1);assert(await p.evaluate(()=>expiryWriter===document.activeElement && expiryWriter.isConnected));assert.equal(await writer.inputValue(),'My writing continues after the timer ends.');await p.evaluate(()=>LifeDeviceStore.stage=expiryStage);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'board');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').done),true);assert.equal(await writer.inputValue(),'My writing continues after the timer ends.');
    assert.deepEqual(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').taskCompletion),completion);assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').taskCompletionEvents.length),1);
    await p.evaluate(()=>openReportsModal());await p.locator('[data-report-type=progress]').click();assert.match(await p.locator('#reportPrintArea').innerText(),/1 tasks completed/);assert.match(await p.locator('#reportPrintArea').innerText(),/A timed step/);
  });
  await run('failed expiry saving rolls back, retries intact and creates only one completion',async p=>{
    await p.evaluate(async()=>{const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=2;c.runningSince=Date.now();saveState();await flushDeviceWrites();window.expiryBefore=LifeStateMerge.copy(c);window.expiryStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new DOMException('Full','QuotaExceededError');};});
    await p.clock.runFor(4100);
    assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards.find(c=>c.id==='clock-manual'),expiryBefore)));assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);
    assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-16','2026-10-16').filter(t=>t.ref?.cardId==='clock-manual').length),0);
    await p.evaluate(()=>LifeDeviceStore.stage=expiryStage);await p.clock.runFor(2100);await p.evaluate(()=>flushDeviceWrites());
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').taskCompletionEvents.length),1);
    await p.reload();await workspace(p,'board');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').taskCompletionEvents.length),1);
  });
  await run('malformed history keeps its source intact without preventing another timer from saving',async p=>{
    await p.evaluate(async()=>{const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=2;c.runningSince=Date.now();c.taskCompletionEvents='Original imported history';const other={...LifeStateMerge.copy(c),id:'clock-healthy',title:'A valid timer'};delete other.taskCompletionEvents;const invalid={...LifeStateMerge.copy(other),id:'clock-invalid-current',taskCompletion:'Original imported completion'};state.cards.push(other,invalid);saveState();await flushDeviceWrites();window.badTimer=LifeStateMerge.copy(c);window.badCurrent=LifeStateMerge.copy(invalid);});
    await p.clock.runFor(4100);
    assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards.find(c=>c.id==='clock-manual'),badTimer)));
    assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards.find(c=>c.id==='clock-invalid-current'),badCurrent)));
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-healthy').taskCompletionEvents.length),1);
    assert.match(await p.locator('#headerSaveStatus').innerText(),/history needs review/);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'board');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').taskCompletionEvents),'Original imported history');
  });
  await run('expiry Undo reopens the task with a stopped clock and persists without completing again',async p=>{
    await p.evaluate(async()=>{const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=2;c.runningSince=Date.now();saveState();await flushDeviceWrites();});
    await p.clock.runFor(3100);assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').done),true);
    await p.locator('#undoToastButton').click();await p.clock.runFor(3100);
    assert.deepEqual(await p.evaluate(()=>{const c=state.cards.find(c=>c.id==='clock-manual');return {done:c.done,running:c.runningSince,remaining:c.remaining,events:c.taskCompletionEvents || []};}),{done:false,running:null,remaining:0,events:[]});
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'board');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').done),false);
  });
  await run('failed Undo keeps the saved completion and stale Undo cannot overwrite a restarted timer',async p=>{
    await p.evaluate(async()=>{const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=2;c.runningSince=Date.now();saveState();await flushDeviceWrites();});await p.clock.runFor(3100);await p.evaluate(()=>flushDeviceWrites());
    await p.evaluate(()=>{window.savedExpiry=LifeStateMerge.copy(state.cards.find(c=>c.id==='clock-manual'));window.capturedUndo=pendingUndoAction;window.expiryStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new DOMException('Full','QuotaExceededError');};runPendingUndo();});
    assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards.find(c=>c.id==='clock-manual'),savedExpiry)));assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);
    await p.evaluate(async()=>{LifeDeviceStore.stage=expiryStage;toggleTimer('clock-manual');await flushDeviceWrites();window.restartedTimer=LifeStateMerge.copy(state.cards.find(c=>c.id==='clock-manual'));capturedUndo();});
    assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards.find(c=>c.id==='clock-manual'),restartedTimer)));assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);
  });
  await run('suspended timers use their original finish day, and expiry does not fabricate old completion dates',async p=>{
    await p.evaluate(async()=>{
      const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=60;c.runningSince=new Date('2026-10-15T15:58:00Z').getTime();
      const old={...LifeStateMerge.copy(c),id:'clock-legacy',title:'Previously completed',done:true};state.cards.push(old);
      saveState();await flushDeviceWrites();settleExpiredTimers();await flushDeviceWrites();
    });
    assert.deepEqual(await p.evaluate(()=>{const c=state.cards.find(c=>c.id==='clock-manual');return {on:c.taskCompletion.on,at:c.taskCompletion.at,recorded:c.taskCompletion.recordedAt>c.taskCompletion.at};}),{on:'2026-10-15',at:Date.parse('2026-10-15T15:59:00Z'),recorded:true});
    assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-15','2026-10-15').filter(t=>t.ref?.cardId==='clock-manual').length),1);
    assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-16','2026-10-16').filter(t=>t.ref?.cardId==='clock-manual').length),0);
    assert(await p.evaluate(()=>{const c=state.cards.find(c=>c.id==='clock-legacy');return c.done && !Object.hasOwn(c,'taskCompletion') && !Object.hasOwn(c,'taskCompletionEvents');}));
  });
  await run('pause, resume and reset remain functional after targeted clock updates',async p=>{
    const manual=card(p,'clock-manual');await manual.getByRole('button',{name:'Pause timer',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());
    const stopped=await manual.locator('.timer-display strong').innerText();await p.clock.runFor(2100);assert.equal(await manual.locator('.timer-display strong').innerText(),stopped);
    await manual.getByRole('button',{name:'Start timer',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.clock.runFor(2100);assert.notEqual(await manual.locator('.timer-display strong').innerText(),stopped);
    await manual.getByRole('button',{name:'Reset timer',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());assert.equal(await manual.locator('.timer-display strong').innerText(),'00:10:00');assert.equal(await manual.getByRole('button',{name:'Start timer',exact:true}).count(),1);
  });
  await run('explicitly reopening an already expired task is not overridden by late timer settlement',async p=>{
    await p.evaluate(async()=>{const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=2;c.runningSince=Date.now()-10000;LifeTaskRepository.complete(c,false,getTodayKey());window.explicitReopen=LifeStateMerge.copy(c.taskCompletionEvents);saveState();await flushDeviceWrites();settleExpiredTimers();await flushDeviceWrites();});
    await p.clock.runFor(3100);
    assert(await p.evaluate(()=>{const c=state.cards.find(c=>c.id==='clock-manual');return !c.done && c.runningSince===null && c.remaining===0 && LifeStateMerge.equal(c.taskCompletionEvents,explicitReopen);}));
    assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-16','2026-10-16').filter(t=>t.ref?.cardId==='clock-manual').length),0);
    await p.reload();await workspace(p,'board');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-manual').done),false);
  });
  await run('an unresolved comparison prevents timer auto-completion without changing its source',async p=>{
    await p.evaluate(async()=>{
      const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=2;c.runningSince=Date.now();
      state.syncConflicts=[{id:'timer-comparison',kind:'task-completion',segments:['boards',state.activeBoardId,'cards',c.id,'taskCompletion'],local:{done:false},remote:{done:true}}];
      saveState();await flushDeviceWrites();window.comparedTimer=LifeStateMerge.copy(c);
    });
    await p.clock.runFor(3100);assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards.find(c=>c.id==='clock-manual'),comparedTimer)));
    assert.equal(await p.evaluate(()=>dailyCompletedTasks('2026-10-16','2026-10-16').filter(t=>t.ref?.cardId==='clock-manual').length),0);
  });
  await run('a new comparison prevents expiry Undo from modifying the reviewed source',async p=>{
    await p.evaluate(async()=>{const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=2;c.runningSince=Date.now();saveState();await flushDeviceWrites();});await p.clock.runFor(3100);await p.evaluate(()=>flushDeviceWrites());
    await p.evaluate(()=>{window.expiryUndo=pendingUndoAction;window.finishedTimer=LifeStateMerge.copy(state.cards.find(c=>c.id==='clock-manual'));});
    assert.equal(await p.evaluate(()=>typeof expiryUndo),'function');
    await p.evaluate(()=>{state.syncConflicts=[{id:'new-review',kind:'task-completion',segments:['boards',state.activeBoardId,'cards','clock-manual','taskCompletion']}];expiryUndo();});
    assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards.find(c=>c.id==='clock-manual'),finishedTimer)));
    assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);
  });
  await run('duplicate timer identities cannot auto-complete either record',async p=>{
    await p.evaluate(async()=>{await flushDeviceWrites();const c=state.cards.find(c=>c.id==='clock-manual');c.runningSince=Date.now()-10000;c.remaining=2;state.cards.push(LifeStateMerge.copy(c));window.duplicateTimers=LifeStateMerge.copy(state.cards.filter(c=>c.id==='clock-manual'));});
    assert.equal(await p.evaluate(()=>settleExpiredTimers()),false);
    await p.clock.runFor(2100);assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards.filter(c=>c.id==='clock-manual'),duplicateTimers)));
  });
  await run('expiry Undo is board-scoped even when another board has the same card ID',async p=>{
    await p.evaluate(async()=>{const c=state.cards.find(c=>c.id==='clock-manual');c.remaining=2;c.runningSince=Date.now();state.boards.push(createBoardRecord({id:'timer-other-board',name:'Another board',cards:[{...LifeStateMerge.copy(c),title:'A different task',runningSince:null,remaining:120}]}));saveState();await flushDeviceWrites();});
    await p.clock.runFor(3100);
    await p.evaluate(async()=>{window.expiryUndo=pendingUndoAction;switchBoard('timer-other-board');await flushDeviceWrites();window.otherBoardTimer=LifeStateMerge.copy(state.cards[0]);expiryUndo();});
    assert(await p.evaluate(()=>LifeStateMerge.equal(state.cards[0],otherBoardTimer)));assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);
  });
  await run('board identities and duplicate card IDs cannot paint another record clock',async p=>{
    await p.evaluate(async()=>{
      const other=makeCard({type:'event',title:'Other board appointment',timerMode:'date',duration:600,targetAt:new Date(Date.now()+3600000).toISOString()});other.id='clock-event';other.showTimerSeconds=true;
      state.boards.push(createBoardRecord({id:'clock-other',name:'Other board',cards:[other]}));saveState();await flushDeviceWrites();window.clockFirstBoard=state.activeBoardId;
    });
    await p.evaluate(()=>switchBoard('clock-other'));await workspace(p,'board');assert.equal(await card(p,'clock-event').locator('h3').innerText(),'Other board appointment');assert.equal(await card(p,'clock-event').getAttribute('data-clock-board'),'clock-other');
    const otherText=await card(p,'clock-event').locator('.timer-display strong').innerText();await p.clock.runFor(2100);assert.notEqual(await card(p,'clock-event').locator('.timer-display strong').innerText(),otherText);
    await p.evaluate(async()=>{switchBoard(clockFirstBoard);await flushDeviceWrites();renderCardsOnly({force:true});});await workspace(p,'board');await p.evaluate(()=>flushDeviceWrites());assert.equal(await card(p,'clock-event').locator('h3').innerText(),'Upcoming appointment');
    await p.evaluate(()=>{const c=state.cards.find(c=>c.id==='clock-event');state.cards.push({...c,title:'Ambiguous record',targetAt:new Date(Date.now()+900000).toISOString()});renderCardsOnly({force:true});});
    assert.equal(await card(p,'clock-event').count(),2);
    const before=await card(p,'clock-event').locator('.timer-display strong').allTextContents();await p.clock.runFor(2100);assert.deepEqual(await card(p,'clock-event').locator('.timer-display strong').allTextContents(),before);
  });
  await run('minute refreshes and midnight rollover keep old writing and routine history',async p=>{
    await p.evaluate(async()=>{window.clockOldDay=getTodayKey();const routine=state.cards.find(c=>c.id==='clock-routine');routine.items[0].done=true;syncRoutineTodayHistory(routine);saveState();await flushDeviceWrites();});
    const writer=card(p,'clock-diary').getByLabel('Diary thoughts',{exact:true});await writer.fill('A full thought across midnight.\nStill mine.');await p.evaluate(()=>window.midnightWriter=document.activeElement);
    await p.clock.setSystemTime(new Date('2026-10-16T16:00:01Z'));await p.clock.runFor(61000);
    assert.equal(await writer.inputValue(),'A full thought across midnight.\nStill mine.');assert(await p.evaluate(()=>midnightWriter.isConnected));
    await writer.blur();await p.clock.runFor(2100);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-diary').diaryEntries[clockOldDay].thoughts),'A full thought across midnight.\nStill mine.');
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-routine').lastResetDate),'2026-10-17');
    assert(await p.evaluate(()=>state.cards.find(c=>c.id==='clock-routine').history.some(e=>e.date===clockOldDay && e.done===1)));
  });
  await run('a failed diary save remains visible through clock ticks and can be retried intact',async p=>{
    await p.evaluate(()=>{window.failedStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new DOMException('Full','QuotaExceededError');};});
    const writer=card(p,'clock-diary').getByLabel('Diary thoughts',{exact:true});await writer.fill('Every unsaved character stays in the editor.');const before=await card(p,'clock-event').locator('.timer-display strong').innerText();await p.clock.runFor(3100);
    assert.notEqual(await card(p,'clock-event').locator('.timer-display strong').innerText(),before);assert.match(await p.locator('#headerSaveStatus').innerText(),/Not saved|storage is full|recovery copy only/);assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);assert.equal(await writer.inputValue(),'Every unsaved character stays in the editor.');
    await p.evaluate(async()=>{LifeDeviceStore.stage=failedStage;saveState();await flushDeviceWrites();});await p.reload();await workspace(p,'board');assert.equal(await writer.inputValue(),'Every unsaved character stays in the editor.');
  });
  await run('phone and desktop task entry remains attached while an unrelated card timer is running',async p=>{
    for(const width of [320,390,1080,1440]){
      await p.setViewportSize({width,height:width<500?844:1100});await workspace(p,'tasks');const input=p.getByLabel('New task',{exact:true});await input.fill('My complete task draft at '+width);await p.evaluate(()=>window.taskClockInput=document.activeElement);await p.clock.runFor(2100);
      assert(await p.evaluate(()=>taskClockInput===document.activeElement && taskClockInput.isConnected));assert.equal(await input.inputValue(),'My complete task draft at '+width);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await p.screenshot({path:out+'/tasks-'+width+'.png',fullPage:false});
    }
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
