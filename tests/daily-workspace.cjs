const {workspace}=require('./navigation.cjs');
const {strict:assert}=require('node:assert');
const fs=require('node:fs');
const browsers=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fixture=require('./coaching-fixture.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-daily-tests';fs.mkdirSync(out,{recursive:true});
const results=[];
(async()=>{
 const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
 async function run(name,fn){
  const context=await browser.newContext({viewport:{width:1080,height:1200},timezoneId:'Asia/Kuala_Lumpur'});
  await context.route('https://**/*',r=>r.fulfill({status:503,body:'Isolated sample data only'}));
  const p=await context.newPage(),errors=[];p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.stack));p.on('dialog',d=>d.accept());
  await p.clock.setFixedTime(new Date('2026-09-21T04:00:00Z'));
  try{await p.goto(url+'?preview=1&liveReload=0');await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
  catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
  console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 const seed=async p=>p.evaluate(async program=>{
  const source=getPlannerWriteSourceCard({category:'Personal'},getTodayKey());
  for(let i=0;i<5;i++)LifePlanner.add(source,getTodayKey(),'Next step '+i,'sample-task-'+i);
  const store=coachingStore();store.coachingPrograms.push(program);saveState();await flushDeviceWrites();renderCardsOnly({force:true});
 },fixture());
 const capture=async(p,kind,text)=>{await p.locator('#railAddButton').click();await p.getByLabel('Capture as',{exact:true}).selectOption(kind);await p.getByLabel('What is on your mind?',{exact:true}).fill(text);};
 const edit=async(p,title)=>{await p.getByRole('button',{name:'Task options: '+title,exact:true}).click();await p.getByRole('button',{name:'Edit planner task: '+title,exact:true}).click();};
 const view=async(p,label)=>{await p.getByRole('button',{name:'More task views',exact:true}).click();await p.locator('#dailyDialog').getByRole('button',{name:label,exact:true}).click();};
 await run('capture preserves full drafts through closing, reload and independent board selection',async p=>{
  const before=await p.evaluate(()=>getPlannerSourceItems().length);
  await capture(p,'task','Every character is kept\nAnother line');await p.getByRole('button',{name:'Close',exact:true}).click();await p.reload();await p.locator('#railAddButton').click();assert.equal(await p.getByLabel('What is on your mind?').inputValue(),'Every character is kept\nAnother line');
  await p.getByRole('button',{name:'Save capture',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());assert.equal(await p.evaluate(()=>getPlannerSourceItems().length),before+1);
  await p.locator('#railAddButton').click();assert.equal(await p.getByLabel('What is on your mind?').inputValue(),'');await p.getByRole('button',{name:'Close',exact:true}).click();
  await capture(p,'note','An unhurried thought\nNot just its first character');await p.getByRole('button',{name:'Save capture',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.evaluate(()=>state.cards.filter(c=>c.type==='sidenote').flatMap(c=>Object.values(c.sideNoteEntries)).flatMap(e=>e.notes).some(n=>n.text.includes('An unhurried thought'))),true);
  await capture(p,'task','Unfinished idea on board A');await p.keyboard.press('Escape');
  await p.evaluate(()=>{state.boards.push(createBoardRecord({id:'independent-daily',name:'Board B',cards:[]}));saveState();switchBoard('independent-daily');});
  await p.locator('#railAddButton').click();assert.equal(await p.getByLabel('What is on your mind?').inputValue(),'');
 });
 await run('failed capture retries save exactly one note or task, and retain every typed character',async p=>{
  for(const kind of ['note','task']){
   await capture(p,kind,'A complete '+kind+' with many words');await p.evaluate(()=>{window.originalDailyStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Storage full');};});
   await p.getByRole('button',{name:'Save capture',exact:true}).click();assert.match(await p.locator('#dailyDialog [role=status]').innerText(),/Not saved/);assert.equal(await p.getByLabel('What is on your mind?').inputValue(),'A complete '+kind+' with many words');
   await p.evaluate(()=>{LifeDeviceStore.stage=window.originalDailyStage;});await p.getByRole('button',{name:'Save capture',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();
   const count=await p.evaluate(kind=>kind==='task'?getPlannerSourceItems().filter(t=>t.title==='A complete task with many words').length:state.cards.filter(c=>c.type==='sidenote').flatMap(c=>Object.values(c.sideNoteEntries)).flatMap(e=>e.notes).filter(n=>n.text==='A complete note with many words').length,kind);assert.equal(count,1);
  }
 });
 await run('Today focus caps at three, keeps completed tasks, preserves all records and offers lighter mode',async p=>{
  await seed(p);const before=await p.evaluate(()=>getPlannerSourceItems().map(t=>t.taskId));await workspace(p,'today');await p.getByRole('button',{name:'Choose',exact:true}).click();
  for(let i=0;i<4;i++)await p.locator('#dailyDialog').getByRole('checkbox',{name:'Next step '+i,exact:true}).click();
  assert.equal(await p.locator('#dailyDialog input:checked').count(),3);assert.match(await p.locator('#dailyDialog [role=status]').innerText(),/Three/);await p.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.equal(await p.locator('.daily-columns .planner-linked-copy').count(),3);
  await p.getByRole('checkbox',{name:'Mark done: Next step 0',exact:true}).click();assert.equal(await p.locator('.daily-columns .planner-linked-copy').count(),3);assert.match(await p.locator('.daily-completed summary').innerText(),/1/);
  await p.getByRole('button',{name:'Lighter day',exact:true}).click();assert.equal(await p.locator('.daily-columns .planner-linked-copy').count(),1);await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.equal(await p.getByRole('button',{name:'Lighter day',exact:true}).getAttribute('aria-pressed'),'true');assert.deepEqual(await p.evaluate(()=>getPlannerSourceItems().map(t=>t.taskId).sort()),before.sort());
  await p.getByRole('button',{name:'All tasks (5)',exact:true}).click();assert.equal(await p.locator('.workspace-task-list .planner-linked-copy').count(),5);
 });
 await run('existing tasks link to a key result, waiting follow-ups sort, parked tasks retain identity and dates',async p=>{
  await seed(p);await workspace(p,'tasks');await edit(p,'Next step 0');const goal=JSON.stringify(['synthetic-coaching','work','launch']);await p.getByLabel('Contributes to',{exact:true}).selectOption(goal);await p.getByLabel('Status',{exact:true}).selectOption('waiting');await p.getByLabel('Follow-up date',{exact:true}).fill('2026-09-25');await p.getByLabel('Save planner task',{exact:true}).click();
  await view(p,'Waiting on');assert.match(await p.locator('.task-results').innerText(),/Next step 0/);assert.match(await p.locator('.task-goal').innerText(),/Launch an idea/);
  await edit(p,'Next step 0');await p.getByLabel('Status',{exact:true}).selectOption('parked');await p.getByLabel('Save planner task',{exact:true}).click();await view(p,'Parked');assert.equal(await p.locator('.planner-linked-copy').count(),1);
  await p.getByRole('group',{name:'Task view'}).getByRole('button',{name:'Today',exact:true}).click();assert.equal(await p.locator('.planner-linked-copy').count(),4);
  await view(p,'Parked');await edit(p,'Next step 0');await p.getByLabel('Status',{exact:true}).selectOption('todo');await p.getByLabel('Task kind',{exact:true}).selectOption('experience');await p.getByLabel('Save planner task',{exact:true}).click();await view(p,'Experiences');assert.equal(await p.locator('.planner-linked-copy').count(),1);
  await p.getByRole('checkbox',{name:'Mark done: Next step 0',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();const task=await p.evaluate(()=>getPlannerSourceItems().find(t=>t.taskId==='sample-task-0'));assert.equal(task.done,true);assert.equal(task.dateKey,'2026-09-21');assert.equal(task.coachingKrId,'launch');assert.equal(await p.evaluate(()=>coachingProgram().entries.length),0);
 });
 await run('weekly review saves full reflections, keeps prior versions, exports escaped text and preserves drafts',async p=>{
  await seed(p);await p.locator('#weeklyReviewButton').click();const thoughts='A meaningful walk <script>not executable</script>\nEvery word matters.';
  await p.getByLabel('What mattered?',{exact:true}).pressSequentially(thoughts,{delay:4});await p.getByLabel('What would make next week easier?',{exact:true}).fill('Less pressure. One small step.');await p.keyboard.press('Escape');await p.reload();await p.locator('#weeklyReviewButton').click();assert.equal(await p.getByLabel('What mattered?').inputValue(),thoughts);
  await p.getByRole('button',{name:'Keep reflection',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.getByLabel('What mattered?').fill('Another reflection');await p.keyboard.press('Escape');await p.reload();await p.locator('#weeklyReviewButton').click();assert.equal(await p.getByLabel('What mattered?').inputValue(),'Another reflection');await p.getByRole('button',{name:'Keep reflection',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());
  assert.equal(await p.evaluate(()=>dailyRecords().filter(e=>e.kind==='review').length),2);const html=await p.evaluate(()=>buildReadableDataArchive(getExportSnapshot()));assert.match(html,/Every word matters/);assert.match(html,/Another reflection/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>not executable/);
  const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download weekly summary',exact:true}).click()]);assert.match(download.suggestedFilename(),/life-os-week/);
  await p.keyboard.press('Escape');await p.reload();await p.locator('#weeklyReviewButton').click();assert.equal(await p.getByLabel('What mattered?').inputValue(),'Another reflection');
 });
 await run('same-board concurrent reflections survive, background saves do not erase an open draft',async(p,context)=>{
  await seed(p);await p.evaluate(()=>flushDeviceWrites());const other=await context.newPage();await other.clock.setFixedTime(new Date('2026-09-21T04:00:00Z'));await other.goto(url+'?preview=1&liveReload=0');
  await p.locator('#weeklyReviewButton').click();await other.locator('#weeklyReviewButton').click();await p.getByLabel('What mattered?').fill('My full thought in the first tab');await other.getByLabel('What mattered?').fill('My second tab reflection');await other.getByRole('button',{name:'Keep reflection',exact:true}).click();await other.evaluate(()=>flushDeviceWrites());await p.waitForTimeout(1700);assert.equal(await p.getByLabel('What mattered?').inputValue(),'My full thought in the first tab');await p.getByRole('button',{name:'Keep reflection',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.evaluate(()=>dailyRecords().filter(e=>e.kind==='review').length),2);assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);await other.close();
 });
 await run('simultaneous independent boards save separate reviews without mixing focus or diary records',async(p,context)=>{
  await seed(p);await p.evaluate(async()=>{state.boards.push(createBoardRecord({id:'daily-other',name:'Independent',cards:[]}));saveState();await flushDeviceWrites();});
  const other=await context.newPage();await other.goto(url+'?preview=1&liveReload=0');await other.evaluate(()=>switchBoard('daily-other'));await p.locator('#weeklyReviewButton').click();await other.locator('#weeklyReviewButton').click();await p.getByLabel('What mattered?').fill('Board A reflection');await other.getByLabel('What mattered?').fill('Board B reflection');await p.getByRole('button',{name:'Keep reflection',exact:true}).click();await other.getByRole('button',{name:'Keep reflection',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await other.evaluate(()=>flushDeviceWrites());await p.reload();await other.reload();assert.equal(await p.evaluate(()=>dailyRecords().at(-1).mattered),'Board A reflection');assert.equal(await other.evaluate(()=>dailyRecords().at(-1).mattered),'Board B reflection');assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);await other.close();
 });
 await run('saving details distinguish preview, pending, conflicts and cloud version without contacting cloud',async p=>{
  await p.locator('#headerSaveStatus').click();assert.match(await p.locator('.daily-save-details').innerText(),/cloud disabled/);assert.ok((await p.locator('.daily-save-details').innerText()).includes(await p.evaluate(()=>LIFE_OS_BUILD)));assert.equal(await p.evaluate(()=>cloudSession),null);await p.getByRole('button',{name:'Recovery',exact:true}).click();await p.locator('#recoveryModal').waitFor({state:'visible'});assert.equal(await p.locator('#recoveryModal').isVisible(),true);
 });
 await run('failed weekly save retains its draft, rollback is clean and board backup normalization retains reflections',async p=>{
  await p.locator('#weeklyReviewButton').click();await p.getByLabel('What mattered?').fill('Everything I meant to keep.');await p.evaluate(()=>{window.reviewStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Full');};});
  await p.getByRole('button',{name:'Keep reflection',exact:true}).click();assert.match(await p.locator('#dailyDialog [role=status]').innerText(),/Not saved/);assert.equal(await p.evaluate(()=>dailyRecords().length),0);assert.equal(await p.getByLabel('What mattered?').inputValue(),'Everything I meant to keep.');
  await p.evaluate(()=>LifeDeviceStore.stage=window.reviewStage);await p.getByRole('button',{name:'Keep reflection',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());
  const roundtrip=await p.evaluate(()=>{const snapshot=getStateForStorage(),restored=rehydrateState(snapshot);return {valid:isValidBackup(snapshot),text:dailyRecords(restored.boards.find(b=>b.id===restored.activeBoardId))[0].mattered,planner:state.archivedCards.find(c=>c.dailyWorkspaceStore).type};});assert.equal(roundtrip.valid,true);assert.equal(roundtrip.text,'Everything I meant to keep.');assert.notEqual(roundtrip.planner,'planner');
 });
 await run('archived completions remain in weekly history and Today checklist records do not invent goal outcomes',async p=>{
  await seed(p);await p.evaluate(()=>{const source=getPlannerSourceCards()[0];LifePlanner.complete(source,'sample-task-0',getTodayKey());LifePlanner.change(source,'sample-task-0',{archivedAt:Date.now()});saveState();});
  await workspace(p,'today');assert.match(await p.locator('.daily-completed').innerText(),/Completed this week \(1\)/);
  // The onchange handler can replace the checkbox; verify the fresh control and saved record.
  await p.getByRole('checkbox',{name:'Programme week: Rest',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('input[aria-label="Programme week: Rest"]')?.checked && LifeCoaching.latestWeeks(coachingProgram(),getTodayKey()).some(e=>e.rest));
  await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');
  assert.equal(await p.getByRole('checkbox',{name:'Programme week: Rest',exact:true}).isChecked(),true);
  assert.equal(await p.evaluate(()=>LifeCoaching.latestWeeks(coachingProgram(),getTodayKey()).some(e=>e.rest)),true);
  await p.locator('#weeklyReviewButton').click();await p.locator('.daily-review-evidence > summary').click();assert.match(await p.locator('#dailyDialog').innerText(),/Next step 0/);assert.equal(await p.evaluate(()=>coachingProgram().entries.filter(e=>e.kind==='measurement').length),0);
 });
 await run('Today chooses between diary cards without rewriting either diary and remembers hidden sections',async p=>{
  await p.evaluate(()=>{state.cards.push(makeCard({type:'diary',title:'Private second diary',thoughts:'Every old thought stays.'}));saveState();});await workspace(p,'today');await p.getByRole('button',{name:'Customize Today',exact:true}).click();
  await p.getByLabel('Diary card',{exact:true}).selectOption({label:'Private second diary'});await p.getByRole('checkbox',{name:'Upcoming activities',exact:true}).uncheck();await p.keyboard.press('Escape');assert.equal(await p.locator('.type-diary').getByRole('heading',{name:'Private second diary',exact:true}).isVisible(),true);assert.equal(await p.locator('.diary-thoughts').inputValue(),'Every old thought stays.');await p.reload();await workspace(p,'today');assert.equal(await p.locator('.type-diary').getByRole('heading',{name:'Private second diary',exact:true}).isVisible(),true);assert.equal(await p.getByRole('heading',{name:'Coming up',exact:true}).count(),0);assert.equal(await p.evaluate(()=>state.cards.filter(c=>c.type==='diary').length),2);
 });
 await run('phone and portrait controls fit without clipping; all mobile destinations remain reachable',async p=>{
  await seed(p);await workspace(p,'today');
  for(const width of [320,390,768,1080,1440]){
   await p.setViewportSize({width,height:1000});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.ok(await p.locator('.daily-columns').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await p.screenshot({path:out+'/today-'+width+'.png',fullPage:true});
   await p.getByRole('button',{name:'Customize Today',exact:true}).click();assert.ok(await p.locator('#dailyDialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth+1;}));await p.keyboard.press('Escape');
   if(width<=980){await p.locator('#mobileTasksButton').click();assert.equal(await p.locator('.task-workspace').isVisible(),true);await p.locator('#planCalendarButton').click();assert.equal(await p.locator('.calendar-toolbar').isVisible(),true);await p.locator('#mobileMoreButton').click();await p.locator('#dailyDialog').getByRole('button',{name:'Archive',exact:true}).click();assert.equal(await p.locator('#recordsModal').isVisible(),true);await p.evaluate(()=>closeRecordsModal());await p.locator('#mobileTodayButton').click();}
  }
 });
 await run('focus references the exact source when separate planner cards contain the same task ID',async p=>{
  await p.evaluate(()=>{for(const [id,title] of [['source-a','Task A'],['source-b','Task B']]){const card=makeCard({type:'planner',title:id});card.id=id;LifePlanner.add(card,getTodayKey(),title,'same-id');state.cards.push(card);}saveState();});
  await workspace(p,'today');await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Task B',exact:true}).check();await p.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.equal(await p.locator('.daily-columns .planner-linked-copy').innerText(),'Task B');await p.getByRole('checkbox',{name:'Mark done: Task B',exact:true}).click();assert.equal(await p.getByRole('checkbox',{name:'Mark open: Task B',exact:true}).isChecked(),true);await p.evaluate(()=>flushDeviceWrites());assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='source-a'))[0].done),false);assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='source-b'))[0].done),true);
 });
 await browser.close();fs.writeFileSync(out+'/daily-results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
