const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-daily-support';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  async function run(name,fn){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});await context.route('https://**/*',route=>route.fulfill({status:503,body:'Isolated sample records; cloud blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await seed(p);await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function seed(p){await p.evaluate(async()=>{
    const card=makeCard({type:'planner',title:'My own actions',category:'Personal'});card.id='support-source';
    for(const [id,title,date,extra] of [
      ['today','A manageable step for today','2026-10-16',{area:'Culturely',nextAction:'Write the opening sentence',estimatedMinutes:15}],
      ['important','Make time for a walk','',{area:'Personal',priority:'high'}],
      ['past','Check the trip details','2026-10-12',{area:'Personal'}],
      ['future','Prepare next month','2026-11-01',{priority:'high'}],
      ['waiting','Wait for the venue reply','2026-10-16',{status:'waiting'}],
      ['parked','An idea for another season','',{status:'parked'}]
    ]){LifePlanner.add(card,date,title,id);LifePlanner.change(card,id,extra);}
    const diary=makeCard({type:'diary',title:'My diary'});diary.id='support-diary';diary.diaryEntries={'2026-10-14':{thoughts:'All my original words\nEvery line stays.',updatedAt:1}};
    state.cards=[card,diary];state.archivedCards=[];state.boards.push(createBoardRecord({id:'support-other',name:'Independent board',cards:[]}));saveState();await flushDeviceWrites();
    window.supportBoard=state.activeBoardId;window.supportOriginal=JSON.stringify(state.cards);
  });await workspace(p,'today');await p.evaluate(()=>flushDeviceWrites());}
  async function followUps(p){await p.evaluate(async()=>{
    const card=state.cards.find(c=>c.id==='support-source');
    for(const [id,title,date,extra] of [
      ['follow-1','Check the cake delivery','2026-12-01',{status:'waiting',followUp:'2026-10-14',area:'Personal'}],
      ['follow-2','Confirm the guest arrival','2026-10-01',{status:'waiting',followUp:'2026-10-15',area:'Sunrise Villa'}],
      ['follow-3','Ask about the venue availability','',{status:'waiting',followUp:'2026-10-16',area:'Culturely'}],
      ['follow-4','Check the supplier reply','',{status:'waiting',followUp:'2026-10-16'}],
      ['follow-future','Review next week','2026-10-01',{status:'waiting',followUp:'2026-10-20'}]
    ]){LifePlanner.add(card,date,title,id);LifePlanner.change(card,id,extra);}
    saveState();await flushDeviceWrites();renderCardsOnly({force:true});
  });}
  const preserved=p=>p.evaluate(()=>JSON.stringify({cards:state.cards,archive:getArchivedCards(),otherBoards:state.boards.filter(b=>b.id!==state.activeBoardId)}));
  await run('follow-ups show only explicit due waiting dates and preserve every original record across renders and reload',async p=>{
    await followUps(p);const before=await preserved(p),section=p.getByRole('region',{name:'Waiting task follow-ups'});
    assert.match(await section.innerText(),/4 follow-ups due/);assert.equal(await section.locator('.daily-follow-up-row').count(),3);
    assert.deepEqual(await section.locator('time').evaluateAll(nodes=>nodes.map(n=>n.dateTime)),['2026-10-14','2026-10-15','2026-10-16']);
    assert.match(await section.innerText(),/Due today/);assert.match(await section.innerText(),/1 more in Waiting on/);assert.match(await section.innerText(),/1 waiting task has no follow-up date/);
    assert.doesNotMatch(await section.innerText(),/Review next week/);assert.doesNotMatch(await p.locator('.daily-suggestion-list').innerText(),/cake delivery|guest arrival|venue availability|supplier reply/);
    assert.equal(await p.evaluate(()=>dailyRecords().length),0);await p.evaluate(()=>renderCardsOnly({force:true}));assert.equal(await preserved(p),before);
    await p.reload();await workspace(p,'today');assert.match(await section.innerText(),/4 follow-ups due/);assert.equal(await preserved(p),before);
  });
  await run('Waiting on opens all original waiting tasks without changing task data or retained planning drafts',async p=>{
    await followUps(p);await p.evaluate(()=>{planningSession().area='Culturely';planningSession().search='old search';planningSession().subtaskDrafts={'kept':'My full unsubmitted draft'};dailySession().focusDrafts ||= {};dailySession().focusDrafts[getTodayKey()]={taskKeys:[],plans:{},budgetMinutes:'60'};savePlanningSession();saveDailyDraft();});
    const before=await preserved(p),draft=await p.evaluate(()=>JSON.stringify({subtask:planningSession().subtaskDrafts,focus:dailySession().focusDrafts}));
    await p.getByRole('region',{name:'Waiting task follow-ups'}).getByRole('button',{name:'Waiting on',exact:true}).click();
    assert.deepEqual(await p.evaluate(()=>[state.ui.workspaceMode,planningSession().view,planningSession().area,planningSession().search]),['tasks','waiting','*','']);
    for(const title of ['Check the supplier reply','Review next week','Wait for the venue reply'])assert(await p.getByText(title,{exact:true}).isVisible());
    assert.equal(await preserved(p),before);assert.equal(await p.evaluate(()=>JSON.stringify({subtask:planningSession().subtaskDrafts,focus:dailySession().focusDrafts})),draft);
  });
  await run('follow-up navigation ignores stale, detached and modal-covered controls rather than switching another board or day',async p=>{
    await followUps(p);await p.evaluate(()=>window.oldFollowUp=document.querySelector('.daily-follow-ups button'));
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.evaluate(()=>oldFollowUp.click());assert.equal(await p.evaluate(()=>state.ui.workspaceMode),'today');assert(await p.locator('#dailyDialog').isVisible());await p.keyboard.press('Escape');
    await p.evaluate(()=>renderCardsOnly({force:true}));await p.evaluate(()=>oldFollowUp.click());assert.equal(await p.evaluate(()=>state.ui.workspaceMode),'today');
    await p.evaluate(()=>{window.oldFollowUp=document.querySelector('.daily-follow-ups button');switchBoard('support-other');});const other=await preserved(p);await p.evaluate(()=>oldFollowUp.click());assert.equal(await p.evaluate(()=>state.activeBoardId),'support-other');assert.equal(await preserved(p),other);
    await p.evaluate(()=>switchBoard(supportBoard));await workspace(p,'today');await p.evaluate(()=>window.oldFollowUp=document.querySelector('.daily-follow-ups button'));await p.clock.setFixedTime(new Date('2026-10-17T04:00:00Z'));await p.evaluate(()=>oldFollowUp.click());assert.equal(await p.evaluate(()=>state.ui.workspaceMode),'today');
  });
  await run('follow-up list updates when sources complete or park and flags conflicts without rewriting any history',async p=>{
    await followUps(p);await p.evaluate(()=>{
      const card=state.cards.find(c=>c.id==='support-source');LifePlanner.change(card,'follow-1',{done:true,completedOn:'2026-10-16',completedAt:Date.now()});LifePlanner.change(card,'follow-2',{status:'parked'});
      state.syncConflicts=[{kind:'planner-task',segments:['boards',state.activeBoardId,'cards','support-source','plannerTasks','follow-3']}];renderCardsOnly({force:true});
    });const before=await preserved(p),section=p.getByRole('region',{name:'Waiting task follow-ups'});
    assert.match(await section.innerText(),/1 follow-up due/);assert.match(await section.innerText(),/1 waiting entry needs review/);assert.doesNotMatch(await section.innerText(),/cake delivery|guest arrival|venue availability/);
    await p.evaluate(()=>renderCardsOnly({force:true}));assert.equal(await preserved(p),before);
  });
  await run('follow-ups can be hidden independently and Lighter day never adds a waiting-task burden',async p=>{
    await followUps(p);const before=await preserved(p);await p.getByRole('button',{name:'Customize Today',exact:true}).click();await p.locator('#dailyDialog').getByRole('checkbox',{name:'Waiting task follow-ups',exact:true}).uncheck();await p.keyboard.press('Escape');assert.equal(await p.locator('.daily-follow-ups').count(),0);
    await p.reload();await workspace(p,'today');assert.equal(await p.locator('.daily-follow-ups').count(),0);await p.getByRole('button',{name:'Customize Today',exact:true}).click();await p.locator('#dailyDialog').getByRole('checkbox',{name:'Waiting task follow-ups',exact:true}).check();await p.keyboard.press('Escape');assert.equal(await p.locator('.daily-follow-ups').count(),1);
    await p.getByRole('button',{name:'Lighter day',exact:true}).click();assert.equal(await p.locator('.daily-follow-ups').count(),0);await p.getByRole('button',{name:'Lighter day',exact:true}).click();assert.equal(await p.locator('.daily-follow-ups').count(),1);assert.equal(await preserved(p),before);
  });
  await run('invalid imported follow-up dates stay visible for review without crashing the Waiting on list or rewriting them',async p=>{
    await followUps(p);await p.evaluate(()=>{
      const card=state.cards.find(c=>c.id==='support-source');LifePlanner.change(card,'follow-1',{followUp:{legacy:'keep this value'}});LifePlanner.change(card,'follow-2',{followUp:'2026-02-30'});renderCardsOnly({force:true});
    });const before=await preserved(p),section=p.getByRole('region',{name:'Waiting task follow-ups'});
    assert.match(await section.innerText(),/2 waiting entries need review/);await section.getByRole('button',{name:'Waiting on',exact:true}).click();
    assert(await p.getByText('Check the cake delivery',{exact:true}).isVisible());assert.equal(await p.getByText('Follow-up date needs review',{exact:true}).count(),2);assert.equal(await preserved(p),before);
  });
  await run('follow-up section fits phone portrait and desktop with readable labels and keyboard-accessible navigation',async p=>{
    await followUps(p);await p.evaluate(()=>{LifePlanner.change(state.cards.find(c=>c.id==='support-source'),'follow-1',{title:'Check the cake delivery and the special dietary requirements with the bakery before the birthday celebration'});renderCardsOnly({force:true});});
    const before=await preserved(p),section=p.getByRole('region',{name:'Waiting task follow-ups'});
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:width<500?844:1100});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await section.scrollIntoViewIfNeeded();
      assert(await section.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'follow-ups overflow at '+width);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow at '+width);
      const button=section.getByRole('button',{name:'Waiting on',exact:true});const box=await button.boundingBox();assert(box.height>=44);await button.focus();assert(await button.evaluate(n=>n===document.activeElement));
      await section.screenshot({path:out+'/follow-ups-'+width+'.png'});if(width===1080){await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:out+'/today-follow-ups-desktop.png',fullPage:true});}
    }assert.equal(await preserved(p),before);await section.getByRole('button',{name:'Waiting on',exact:true}).press('Enter');assert.equal(await p.evaluate(()=>planningSession().view),'waiting');
  });
  await run('one-click selection uses an existing task, preserves dates and writing, caps focus and survives reload',async p=>{
    const original=await p.evaluate(()=>supportOriginal);
    assert.equal(await p.locator('.daily-suggestion-list li').count(),3);assert.equal(await p.locator('.daily-suggestions').getByText('Prepare next month',{exact:true}).count(),0);
    await p.getByRole('button',{name:'Choose for today: A manageable step for today',exact:true}).click();
    assert.match(await p.locator('.daily-focus-section').innerText(),/15 minutes estimated/);assert.equal(await p.locator('.daily-focus-section .planner-linked-copy').count(),1);
    assert(await p.evaluate(()=>supportOriginal===JSON.stringify(state.cards)));assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);
    await p.locator('.daily-suggestions > summary').click();await p.getByRole('button',{name:'Choose for today: Make time for a walk',exact:true}).click();
    await p.locator('.daily-suggestions > summary').click();await p.getByRole('button',{name:'Choose for today: Check the trip details',exact:true}).click();assert.equal(await p.locator('.daily-suggestions').count(),0);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.equal(await p.locator('.daily-focus-step').count(),3);assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)),original);
  });
  await run('Today puts actions and writing before the recap, with full-width readable suggestion targets',async p=>{
    const original=await p.evaluate(()=>JSON.stringify({cards:state.cards,archive:state.archivedCards}));
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:width<=390?844:1100});await workspace(p,'today');
      const layout=await p.evaluate(()=>{
        const focus=document.querySelector('.daily-focus-section'),journals=document.querySelector('.daily-journals'),recap=document.querySelector('.momentum-today');
        return {focus:focus.getBoundingClientRect().toJSON(),journals:journals.getBoundingClientRect().toJSON(),recap:recap.getBoundingClientRect().toJSON(),
          journalBeforeRecap:Boolean(journals.compareDocumentPosition(recap)&Node.DOCUMENT_POSITION_FOLLOWING),
          focusBeforeJournal:Boolean(focus.compareDocumentPosition(journals)&Node.DOCUMENT_POSITION_FOLLOWING)};
      });
      assert(layout.focusBeforeJournal && layout.journalBeforeRecap,'reading order must be action, writing, recap at '+width);
      assert(layout.focus.top<layout.recap.top,'recap must not precede next steps at '+width);
      assert((width<1180?layout.journals.bottom:layout.focus.bottom)<=layout.recap.top+1,'recap must follow the primary content at '+width);
      const targets=await p.evaluate(()=>[...document.querySelectorAll('.daily-suggestion-choice')].map(n=>{
        const r=n.getBoundingClientRect(),row=n.parentElement.getBoundingClientRect(),copy=n.querySelector('.daily-suggestion-copy').getBoundingClientRect();
        return {width:r.width,row:row.width,height:r.height,copyWidth:copy.width,scroll:n.scrollWidth,client:n.clientWidth};
      }));
      assert.equal(targets.length,3);assert(targets.every(t=>t.width>=t.row-1 && t.height>=44 && t.copyWidth>t.width/2 && t.scroll<=t.client+1),JSON.stringify({width,targets}));
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await p.screenshot({path:out+'/action-first-'+width+'.png',fullPage:true});
    }
    assert.equal(await p.evaluate(()=>JSON.stringify({cards:state.cards,archive:state.archivedCards})),original);
  });
  await run('clicking suggestion text and keyboard selection use the same original tasks and retain unfinished writing',async p=>{
    const text='A thought I have not finished yet.\nThe whole second line stays.';
    await p.getByLabel('Diary thoughts',{exact:true}).fill(text);
    await p.locator('.daily-suggestion-choice').getByText('A manageable step for today',{exact:true}).click();
    assert.deepEqual(await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).taskKeys),[JSON.stringify(['support-source','today'])]);
    assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
    await p.locator('.daily-suggestions > summary').click();await p.getByRole('button',{name:'Choose for today: Make time for a walk',exact:true}).press('Enter');
    assert.deepEqual(await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).taskKeys),[JSON.stringify(['support-source','today']),JSON.stringify(['support-source','important'])]);
    assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
    assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='support-source')).length),6);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);assert.equal(await p.locator('.daily-focus-step').count(),2);
  });
  await run('failed quick choices roll back, retain the task and can be retried once without duplicated records',async p=>{
    await p.evaluate(()=>{window.stageBefore=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Full');};});await p.getByRole('button',{name:'Choose for today: A manageable step for today',exact:true}).click();assert.match(await p.locator('.daily-suggestions [role=status]').innerText(),/Not saved/);assert.equal(await p.evaluate(()=>dailyRecords().length),0);
    await p.evaluate(()=>LifeDeviceStore.stage=stageBefore);await p.getByRole('button',{name:'Choose for today: A manageable step for today',exact:true}).click();assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);assert(await p.evaluate(()=>supportOriginal===JSON.stringify(state.cards)));
  });
  await run('retained next-step drafts take precedence and a stale suggested task cannot be selected',async p=>{
    const refusal=await p.evaluate(()=>{
      const staleButton=[...document.querySelectorAll('.daily-suggestion-choice')].find(node=>node.getAttribute('aria-label')==='Choose for today: A manageable step for today');
      LifePlanner.change(state.cards.find(c=>c.id==='support-source'),'today',{title:'A newer task name'});saveState();
      // Deliver the old suggestion before the staged rename redraws the view.
      staleButton.click();return {message:document.querySelector('.daily-suggestions [role=status]').textContent,records:dailyRecords().length};
    });
    assert.match(refusal.message,/task changed/);assert.equal(refusal.records,0);await p.evaluate(()=>flushDeviceWrites());
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'A newer task name',exact:true}).check();
    const choice=p.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'A newer task name',exact:true})});await choice.locator('summary').click();await p.getByLabel('Next action: A newer task name',{exact:true}).fill('My complete, unhurried next-action draft');await p.keyboard.press('Escape');
    await p.getByRole('button',{name:'Resume next-step draft',exact:true}).click();assert.equal(await p.getByLabel('Next action: A newer task name',{exact:true}).inputValue(),'My complete, unhurried next-action draft');
    await p.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);
  });
  await run('a second-tab plan cannot be overwritten by the first tab’s older open chooser',async(p,context)=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Check the trip details',exact:true}).check();
    const other=await context.newPage();await other.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));await other.goto(url+'?preview=1&liveReload=0');await workspace(other,'today');await other.getByRole('button',{name:'Choose for today: A manageable step for today',exact:true}).click();await other.evaluate(()=>flushDeviceWrites());
    await p.waitForFunction(()=>latestDailyRecord('focus',getTodayKey())?.taskKeys?.includes(JSON.stringify(['support-source','today'])));
    await p.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.match(await p.locator('#dailyDialog [role=status]').innerText(),/changed in another tab/);assert.deepEqual(await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).taskKeys),[JSON.stringify(['support-source','today'])]);
    await p.keyboard.press('Escape');await p.getByRole('button',{name:'Resume next-step draft',exact:true}).click();assert.match(await p.locator('.daily-focus-comparison').innerText(),/A manageable step for today/);assert(await p.getByRole('checkbox',{name:'Check the trip details',exact:true}).isChecked());await other.close();
  });
  await run('weekly review follows the selected progress week, puts writing first and updates saved history immediately',async p=>{
    await workspace(p,'priorities');await p.getByRole('button',{name:'Previous progress week',exact:true}).click();await p.locator('.momentum-reflection').getByRole('button',{name:'Weekly review',exact:true}).click();assert.match(await p.locator('.daily-review-dialog > .daily-actions').innerText(),/2026-10-05 - 2026-10-11/);
    assert.equal(await p.locator('.daily-review-evidence').getAttribute('open'),null);const text='I did one thing that mattered.\nEvery thought is kept.';await p.getByLabel('What mattered?',{exact:true}).fill(text);await p.getByLabel('What would make next week easier?',{exact:true}).fill('A smaller plan and proper rest.');
    await p.getByRole('button',{name:'Keep reflection',exact:true}).click();assert.match(await p.locator('.daily-review-history summary').innerText(),/\(1\)/);await p.getByRole('button',{name:'Keep reflection',exact:true}).click();assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='review').length),1);
    await p.locator('.daily-review-history summary').click();assert.match(await p.locator('.daily-review-history').innerText(),/Every thought is kept/);
    const downloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:'Download weekly summary',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'life-os-week-2026-10-05.html');
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await p.locator('#weeklyReviewButton').click();assert.equal(await p.getByLabel('What mattered?',{exact:true}).inputValue(),text);
  });
  await run('board changes cannot put a reflection on another board, and its original full draft remains recoverable',async p=>{
    await p.locator('#weeklyReviewButton').click();await p.getByLabel('What mattered?',{exact:true}).fill('This whole reflection belongs to the original board.');
    await p.evaluate(()=>switchBoard('support-other'));await p.getByRole('button',{name:'Keep reflection',exact:true}).click();assert.match(await p.locator('#dailyDialog [role=status]').innerText(),/board changed/);assert.equal(await p.evaluate(()=>dailyRecords().length),0);
    await p.keyboard.press('Escape');await p.evaluate(()=>switchBoard(supportBoard));await p.locator('#weeklyReviewButton').click();assert.equal(await p.getByLabel('What mattered?',{exact:true}).inputValue(),'This whole reflection belongs to the original board.');
  });
  await run('source-card choices keep source identity, lighter mode and the next-day guard without creating planner duplicates',async p=>{
    await p.evaluate(async()=>{
      const source=state.cards.find(card=>card.id==='support-source');for(const task of LifePlanner.ensure(source))LifePlanner.change(source,task.id,{status:'parked'});
      const card=makeCard({type:'checklist',title:'A project',category:'Culturely'});card.id='support-project';card.items=[{id:'today',text:'Write the project outline',done:false,extra:'Keep original metadata'}];state.cards.push(card);saveState();await flushDeviceWrites();renderCardsOnly({force:true});
    });
    const expected=await p.evaluate(()=>{const row=getWorkspaceTaskItems().find(item=>item.sourceKind==='card' && item.ref.cardId==='support-project' && item.ref.itemId==='today');return {key:dailyFocusKey(row),ref:row.ref};});assert.equal(expected.ref.cardId,'support-project');assert.equal(expected.ref.itemId,'today');
    await p.evaluate(()=>{state.syncConflicts=[{kind:'task-completion',segments:['boards',state.activeBoardId,'cards','support-project','items','today','taskCompletion']}];renderCardsOnly({force:true});});assert.equal(await p.locator('.daily-suggestion-list li').count(),0);
    await p.evaluate(()=>{state.syncConflicts=[];renderCardsOnly({force:true});});
    await p.getByRole('button',{name:'Lighter day',exact:true}).click();assert.equal(await p.locator('.daily-suggestion-list li').count(),1);
    await p.getByRole('button',{name:'Choose for today: Write the project outline',exact:true}).click();assert.deepEqual(await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).taskKeys),[expected.key]);assert.equal(await p.locator('.daily-suggestions').count(),0);
    await p.getByRole('checkbox',{name:'Mark done: Write the project outline',exact:true}).click();assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='support-project').items[0].extra),'Keep original metadata');assert.equal(await p.evaluate(()=>getPlannerSourceItems().filter(t=>t.title==='Write the project outline').length),0);
    await p.evaluate(()=>{window.dayGuardButton=document.createElement('button');const task=dailySuggestionProjection(getWorkspaceTaskItems().find(t=>t.taskId==='today' && t.card.id==='support-source'));window.dayGuardMessage=document.createElement('p');window.dayGuardAction=()=>chooseDailySuggestion(state.activeBoardId,'2026-10-16',task,dayGuardMessage);});
    await p.clock.setFixedTime(new Date('2026-10-17T04:00:00Z'));assert.equal(await p.evaluate(()=>dayGuardAction()),false);assert.match(await p.evaluate(()=>dayGuardMessage.textContent),/day changed/);
  });
  await run('shortlists and first-field weekly reviews remain usable on phone, portrait and desktop',async p=>{
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:width<=390?844:1100});await workspace(p,'today');await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.equal(await p.locator('.daily-journals.has-single-journal').count(),1);assert.equal(await p.locator('.daily-journal-actions > button').count(),1);
      const boxes=await p.locator('.daily-suggestion-list button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height};}));assert(boxes.every(box=>box.width>=44&&box.height>=44),JSON.stringify({width,boxes}));await p.screenshot({path:out+'/today-'+width+'.png',fullPage:true});
      await p.evaluate(()=>openDailyReview());assert(await p.locator('#dailyDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await p.getByLabel('What mattered?',{exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;}));await p.screenshot({path:out+'/review-'+width+'.png',fullPage:true});await p.keyboard.press('Escape');
    }
  });
  await run('tap-first planning records chosen estimates and available time without typing or changing source tasks',async p=>{
    const before=await p.evaluate(()=>JSON.stringify({cards:state.cards,others:state.boards.filter(b=>b.id!==state.activeBoardId)}));await p.getByRole('button',{name:'Choose',exact:true}).click();const dialog=p.locator('#dailyDialog');await dialog.getByRole('button',{name:'Available time: 60 minutes',exact:true}).click();for(const [title,minutes] of [['A manageable step for today',30],['Make time for a walk',15]]){await dialog.getByRole('checkbox',{name:title,exact:true}).check();const choice=dialog.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:title,exact:true})});await choice.locator('summary').click();await choice.getByRole('button',{name:'Estimate for '+title+': '+minutes+' minutes',exact:true}).click();}assert.match(await dialog.locator('.daily-plan-capacity').innerText(),/2 next steps.*45 minutes estimated \/ 60 available.*15 minutes unallocated/);assert.equal(await p.evaluate(()=>dailyRecords().length),0);await dialog.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.match(await p.locator('.daily-capacity').innerText(),/45 minutes estimated \/ 60 available/);assert.equal(await p.evaluate(()=>JSON.stringify({cards:state.cards,others:state.boards.filter(b=>b.id!==state.activeBoardId)})),before);assert.equal(await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).budgetMinutes),60);await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.match(await p.locator('.daily-capacity').innerText(),/45 minutes estimated.*15 minutes unallocated/);assert.equal(await p.evaluate(()=>latestDailyRecord('focus',getTodayKey()).plans[JSON.stringify(['support-source','today'])].minutes),'30');
  });
  await run('clearing a daily estimate remains blank after save and reload instead of reviving its original task estimate',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();const dialog=p.locator('#dailyDialog'),title='A manageable step for today';await dialog.getByRole('checkbox',{name:title,exact:true}).check();await dialog.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:title,exact:true})}).locator('summary').click();await dialog.getByRole('button',{name:'Clear estimate for a manageable step for today',exact:true}).click();await dialog.getByRole('button',{name:'Available time: 60 minutes',exact:true}).click();assert.equal(await dialog.getByLabel('Estimated minutes: '+title,{exact:true}).inputValue(),'');assert.match(await dialog.locator('.daily-plan-capacity').innerText(),/1 step without an estimate/);assert.doesNotMatch(await dialog.locator('.daily-plan-capacity').innerText(),/unallocated/);await dialog.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.doesNotMatch(await p.locator('.daily-capacity').innerText(),/15 minutes estimated/);await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.match(await p.locator('.daily-capacity').innerText(),/1 step without an estimate/);assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='support-source')).find(t=>t.id==='today').estimatedMinutes),15);await p.getByRole('button',{name:'Choose',exact:true}).click();await dialog.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:title,exact:true})}).locator('summary').click();assert.equal(await dialog.getByLabel('Estimated minutes: '+title,{exact:true}).inputValue(),'');
  });
  await run('custom durations remain editable without focus loss and preset selection follows typed values',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();const dialog=p.locator('#dailyDialog'),budget=dialog.getByLabel('Available minutes (optional)',{exact:true});await budget.fill('');await budget.pressSequentially('137');assert.equal(await budget.inputValue(),'137');assert(await budget.evaluate(n=>n===document.activeElement));assert.equal(await dialog.locator('.daily-minute-choices').first().locator('[aria-pressed=true]').count(),0);await dialog.getByRole('button',{name:'Available time: 120 minutes',exact:true}).click();assert.equal(await budget.inputValue(),'120');assert.equal(await dialog.getByRole('button',{name:'Available time: 120 minutes',exact:true}).getAttribute('aria-pressed'),'true');await budget.fill('0.5');await dialog.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.match(await dialog.locator('.daily-message').innerText(),/whole minutes/);assert.equal(await p.evaluate(()=>dailyRecords().length),0);await dialog.getByRole('button',{name:'Clear available time',exact:true}).press('Enter');assert.equal(await budget.inputValue(),'');assert(await dialog.getByRole('button',{name:'Clear available time',exact:true}).isDisabled());
  });
  await run('oversubscribed and incomplete plans show honest estimates without blocking intentional choices or claiming completion',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();const dialog=p.locator('#dailyDialog');for(const title of ['A manageable step for today','Make time for a walk','Check the trip details'])await dialog.getByRole('checkbox',{name:title,exact:true}).check();await dialog.getByRole('checkbox',{name:'Prepare next month',exact:true}).click();assert.equal(await dialog.getByRole('checkbox',{name:'Prepare next month',exact:true}).isChecked(),false);await dialog.getByRole('button',{name:'Available time: 30 minutes',exact:true}).click();const first=dialog.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'A manageable step for today',exact:true})});await first.locator('summary').click();await first.getByRole('button',{name:'Estimate for A manageable step for today: 60 minutes',exact:true}).click();assert.match(await dialog.locator('.daily-plan-capacity').innerText(),/2 steps without an estimate.*30 minutes over/);assert.doesNotMatch(await dialog.locator('.daily-plan-capacity').innerText(),/unallocated/);await dialog.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.match(await p.locator('.daily-focus-progress').innerText(),/0 of 3 next steps complete/);assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='support-source')).filter(t=>t.done).length),0);
  });
  await run('preset drafts survive closing and reload without prematurely creating a saved plan',async p=>{
    const before=await p.evaluate(()=>supportOriginal);await p.getByRole('button',{name:'Choose',exact:true}).click();let dialog=p.locator('#dailyDialog');await dialog.getByRole('button',{name:'Available time: 120 minutes',exact:true}).click();await dialog.getByRole('checkbox',{name:'Make time for a walk',exact:true}).check();await dialog.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'Make time for a walk',exact:true})}).locator('summary').click();await dialog.getByRole('button',{name:'Estimate for Make time for a walk: 15 minutes',exact:true}).click();await p.keyboard.press('Escape');await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');await p.getByRole('button',{name:'Resume next-step draft',exact:true}).click();dialog=p.locator('#dailyDialog');assert.equal(await dialog.getByLabel('Available minutes (optional)',{exact:true}).inputValue(),'120');assert.equal(await dialog.getByLabel('Estimated minutes: Make time for a walk',{exact:true}).inputValue(),'15');assert.equal(await p.evaluate(()=>dailyRecords().length),0);assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)),before);
  });
  await run('failed preset-plan saves retain the complete draft and retry without duplicating a saved record',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();const dialog=p.locator('#dailyDialog');await dialog.getByRole('button',{name:'Available time: 60 minutes',exact:true}).click();await dialog.getByRole('checkbox',{name:'A manageable step for today',exact:true}).check();await p.evaluate(()=>{window.priorPlanStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Full');};});await dialog.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.match(await dialog.locator('.daily-message').innerText(),/Not saved/);assert.equal(await dialog.getByLabel('Available minutes (optional)',{exact:true}).inputValue(),'60');assert.equal(await p.evaluate(()=>dailyRecords().length),0);await p.evaluate(()=>LifeDeviceStore.stage=priorPlanStage);await dialog.getByRole('button',{name:'Keep next steps',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);
  });
  await run('detached wrong-board and next-day preset controls cannot redirect or alter the retained original draft',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();const dialog=p.locator('#dailyDialog');await dialog.getByRole('button',{name:'Available time: 60 minutes',exact:true}).click();await p.evaluate(()=>window.oldTimePreset=[...document.querySelectorAll('.daily-minute-choices button')].find(n=>n.getAttribute('aria-label')==='Available time: 120 minutes'));await p.keyboard.press('Escape');await p.evaluate(()=>oldTimePreset.click());assert.equal(await p.evaluate(()=>dailySession().focusDrafts[getTodayKey()].budgetMinutes),'60');await p.getByRole('button',{name:'Resume next-step draft',exact:true}).click();await p.evaluate(()=>switchBoard('support-other'));await dialog.getByRole('button',{name:'Available time: 120 minutes',exact:true}).click();assert.match(await dialog.locator('.daily-message').innerText(),/board or day changed/);assert.equal(await dialog.getByLabel('Available minutes (optional)',{exact:true}).inputValue(),'60');await p.keyboard.press('Escape');await p.evaluate(()=>switchBoard(supportBoard));await workspace(p,'today');await p.getByRole('button',{name:'Resume next-step draft',exact:true}).click();await p.clock.setFixedTime(new Date('2026-10-17T04:00:00Z'));await dialog.getByRole('button',{name:'Available time: 120 minutes',exact:true}).click();assert.match(await dialog.locator('.daily-message').innerText(),/board or day changed/);assert.equal(await dialog.getByLabel('Available minutes (optional)',{exact:true}).inputValue(),'60');
  });
  await run('tap-first time planning fits phone portrait and desktop with visible keyboard-focus targets',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();const dialog=p.locator('#dailyDialog');await dialog.getByRole('button',{name:'Available time: 60 minutes',exact:true}).click();await dialog.getByRole('checkbox',{name:'A manageable step for today',exact:true}).check();await dialog.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'A manageable step for today',exact:true})}).locator('summary').click();await dialog.getByRole('button',{name:'Estimate for A manageable step for today: 30 minutes',exact:true}).click();await dialog.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'A manageable step for today',exact:true})}).locator('summary').click();for(const width of [320,390,768,1080,1440]){await p.setViewportSize({width,height:width<500?844:1000});await p.waitForFunction(()=>{const n=document.querySelector('.daily-focus-dialog');return n && n.scrollWidth<=n.clientWidth+1 && [...n.querySelectorAll('.daily-minute-choices button')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().width>=44 && b.getBoundingClientRect().height>=44);});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await dialog.getByRole('button',{name:'Keep next steps',exact:true}).scrollIntoViewIfNeeded();assert(await dialog.getByRole('button',{name:'Keep next steps',exact:true}).isVisible());await dialog.evaluate(n=>n.scrollTop=0);await p.screenshot({path:out+'/tap-planning-'+width+'.png',animations:'disabled'});}
  });
  await run('only selected tasks show time shortcuts and hiding a choice never erases its custom draft',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();const dialog=p.locator('#dailyDialog'),title='Make time for a walk',tick=dialog.getByRole('checkbox',{name:title,exact:true});assert.equal(await dialog.getByRole('button',{name:'Estimate for '+title+': 15 minutes',exact:true}).count(),0);await tick.check();const row=dialog.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:title,exact:true})});assert(await row.getByRole('button',{name:'Estimate for '+title+': 15 minutes',exact:true}).isVisible());await row.locator('summary').click();await dialog.getByLabel('Next action: '+title,{exact:true}).fill('Walk by the park, then rest.');await row.getByRole('button',{name:'Estimate for '+title+': 15 minutes',exact:true}).click();await tick.uncheck();assert.equal(await dialog.getByRole('button',{name:'Estimate for '+title+': 15 minutes',exact:true}).count(),0);await tick.check();assert.equal(await dialog.getByLabel('Next action: '+title,{exact:true}).inputValue(),'Walk by the park, then rest.');assert.equal(await dialog.getByLabel('Estimated minutes: '+title,{exact:true}).inputValue(),'15');assert.equal(await p.evaluate(()=>dailyRecords().length),0);
  });
  for(const reason of ['closed','hidden','detached','superseded','board','day','view','session'])await run('next-step chooser stale '+reason+' callbacks preserve every record and retained draft',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Make time for a walk',exact:true}).check();const row=p.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'Make time for a walk',exact:true})});await row.locator('summary').click();await p.getByLabel('Next action: Make time for a walk',{exact:true}).fill('Keep all these words.');
    await p.evaluate(reason=>{
      const dialog=document.getElementById('dailyDialog');window.oldChooser={dialog,save:[...dialog.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Keep next steps'),inputs:[...dialog.querySelectorAll('input')].filter(n=>n.type!=='search')};
      if(reason==='closed')dialog.close();if(reason==='hidden')dialog.hidden=true;if(reason==='detached')dialog.remove();if(reason==='superseded')openSaveDetails();if(reason==='board')switchBoard('support-other');if(reason==='view')state.ui.workspaceMode='board';if(reason==='session')dailySessions.set(state.activeBoardId,LifeStateMerge.copy(dailySession()));
    },reason);if(reason==='day')await p.clock.setFixedTime(new Date('2026-10-17T04:00:00Z'));
    const result=await p.evaluate(()=>{
      const snapshot=()=>JSON.stringify({records:LifeCloudCopies.records(getStateForStorage()),sessions:[...dailySessions],drafts:Object.fromEntries(Object.keys(sessionStorage).filter(k=>k.includes('life-os-daily:')).map(k=>[k,sessionStorage.getItem(k)]))}),before=snapshot();
      for(const input of oldChooser.inputs){if(input.type==='checkbox'){input.checked=!input.checked;input.dispatchEvent(new Event('change',{bubbles:true}));}else{input.value=input.type==='number'?'120':input.type==='time'?'12:34':'Do not replace my draft';input.dispatchEvent(new Event('input',{bubbles:true}));}}
      oldChooser.save.onclick();return {before,after:snapshot()};
    });assert.equal(result.after,result.before);
  });
  await run('next-step draft failure keeps full typing visible and offers exact retry without changing source records',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Make time for a walk',exact:true}).check();await p.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'Make time for a walk',exact:true})}).locator('summary').click();
    const before=await preserved(p);await p.evaluate(()=>{dailySession().focusDrafts[getTodayKey()].custom={text:'Keep every line\nAnd extra metadata'};saveDailyDraft();window.chooserSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===sessionStorage && key.includes('life-os-daily:'))throw Error('Synthetic draft quota');return chooserSet.call(this,key,value);};});
    const input=p.getByLabel('Next action: Make time for a walk',{exact:true}),text='Walk around the park and call my sister.';await input.pressSequentially(text);assert.equal(await input.inputValue(),text);assert(await input.evaluate(n=>n===document.activeElement));assert.match(await p.locator('.daily-draft-status').innerText(),/not saved.*keep.*open/i);assert(await p.getByRole('button',{name:'Retry draft save',exact:true}).isVisible());
    await p.evaluate(()=>Storage.prototype.setItem=chooserSet);await p.getByRole('button',{name:'Retry draft save',exact:true}).click();assert.match(await p.locator('.daily-draft-status').innerText(),/saved.*this tab/i);assert.equal(await preserved(p),before);await p.keyboard.press('Escape');await p.reload();await workspace(p,'today');await p.getByRole('button',{name:'Resume next-step draft',exact:true}).click();assert.equal(await input.inputValue(),text);assert.equal(await p.evaluate(()=>dailySession().focusDrafts[getTodayKey()].custom.text),'Keep every line\nAnd extra metadata');
  });
  await run('an older arriving focus revision blocks the chooser even if the newest plan ID stays the same',async p=>{
    await p.getByRole('button',{name:'Choose for today: A manageable step for today',exact:true}).click();await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Make time for a walk',exact:true}).check();await p.evaluate(()=>{const latest=latestDailyRecord('focus',getTodayKey());getArchivedCards().find(c=>c.dailyWorkspaceStore).workspaceRecords.push({...LifeStateMerge.copy(latest),id:'arriving-older-plan',recordedAt:latest.recordedAt-1,taskKeys:[]});});const before=await preserved(p);await p.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/changed in another tab/);assert.equal(await preserved(p),before);
  });
  await run('failed next-step draft cleanup retries without duplicating the recorded plan or losing draft fields',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Make time for a walk',exact:true}).check();await p.evaluate(()=>{dailySession().focusDrafts[getTodayKey()].custom={original:'Keep this metadata'};saveDailyDraft();window.cleanupSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===sessionStorage && key.includes('life-os-daily:') && !JSON.parse(value).focusDrafts?.[getTodayKey()])throw Error('Synthetic cleanup quota');return cleanupSet.call(this,key,value);};});
    await p.getByRole('button',{name:'Keep next steps',exact:true}).click();assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);assert(await p.locator('#dailyDialog').isVisible());assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/recorded.*draft.*retry/i);assert.equal(await p.evaluate(()=>dailySession().focusDrafts[getTodayKey()].custom.original),'Keep this metadata');
    await p.evaluate(()=>Storage.prototype.setItem=cleanupSet);await p.getByRole('button',{name:'Retry draft cleanup',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.evaluate(()=>dailySession().focusDrafts?.[getTodayKey()]),undefined);assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);
  });
  await run('next-step cleanup survives closing and reload without recording an identical plan twice',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Make time for a walk',exact:true}).check();await p.evaluate(()=>{window.originalDraftWriter=saveDailyDraft;saveDailyDraft=()=>false;});await p.getByRole('button',{name:'Keep next steps',exact:true}).click();await p.evaluate(()=>saveDailyDraft=originalDraftWriter);await p.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);
    await p.getByRole('button',{name:'Resume next-step draft',exact:true}).click();await p.getByRole('button',{name:'Keep next steps',exact:true}).click();await p.locator('#dailyDialog').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>dailyRecords().filter(r=>r.kind==='focus').length),1);
  });
  await run('next-step cleanup refuses a newer second-tab plan and keeps its complete retained draft',async(p,context)=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('checkbox',{name:'Make time for a walk',exact:true}).check();await p.evaluate(()=>{window.originalDraftWriter=saveDailyDraft;saveDailyDraft=()=>false;});await p.getByRole('button',{name:'Keep next steps',exact:true}).click();await p.evaluate(()=>{saveDailyDraft=originalDraftWriter;return flushDeviceWrites();});
    const other=await context.newPage();await other.clock.setFixedTime(new Date('2026-10-16T04:01:00Z'));await other.goto(url+'?preview=1&liveReload=0');await workspace(other,'today');await other.getByRole('button',{name:'Choose',exact:true}).click();await other.getByRole('checkbox',{name:'Make time for a walk',exact:true}).uncheck();await other.getByRole('checkbox',{name:'Check the trip details',exact:true}).check();await other.getByRole('button',{name:'Keep next steps',exact:true}).click();await other.evaluate(()=>flushDeviceWrites());await p.waitForFunction(()=>latestDailyRecord('focus',getTodayKey()).taskKeys.includes(JSON.stringify(['support-source','past'])));
    const before=await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),session:LifeStateMerge.copy(dailySession())}));await p.getByRole('button',{name:'Retry draft cleanup',exact:true}).click();assert.match(await p.locator('#dailyDialog .daily-message').innerText(),/changed in another tab/);assert.deepEqual(await p.evaluate(()=>({records:LifeCloudCopies.records(getStateForStorage()),session:LifeStateMerge.copy(dailySession())})),before);await other.close();
  });
  await run('next-step draft feedback and retry fit phone portrait and desktop without moving the input or cursor',async p=>{
    await p.getByRole('button',{name:'Choose',exact:true}).click();await p.getByRole('button',{name:'Available time: 60 minutes',exact:true}).click();await p.getByRole('checkbox',{name:'Make time for a walk',exact:true}).check();const row=p.locator('.daily-choice').filter({has:p.getByRole('checkbox',{name:'Make time for a walk',exact:true})});await row.locator('summary').click();await p.getByLabel('Next action: Make time for a walk',{exact:true}).fill('A gentle walk, then rest.');await row.locator('summary').click();await p.evaluate(()=>{window.originalDraftWriter=saveDailyDraft;saveDailyDraft=()=>false;});await p.getByRole('button',{name:'Available time: 120 minutes',exact:true}).click();const before=await preserved(p);
    for(const width of [320,390,768,1080,1440]){await p.setViewportSize({width,height:width<500?844:1100});assert(await p.locator('#dailyDialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1 && n.getBoundingClientRect().right<=innerWidth+1));const retry=p.getByRole('button',{name:'Retry draft save',exact:true});assert(await retry.evaluate(n=>n.getBoundingClientRect().height>=44 && n.getBoundingClientRect().width>=44));await retry.scrollIntoViewIfNeeded();assert.match(await p.locator('.daily-draft-status').innerText(),/not saved/);await p.screenshot({path:out+'/chooser-draft-error-'+width+'.png'});}
    await p.evaluate(()=>saveDailyDraft=originalDraftWriter);await p.getByRole('button',{name:'Retry draft save',exact:true}).press('Enter');assert.match(await p.locator('.daily-draft-status').innerText(),/saved.*this tab/);assert(await p.getByRole('button',{name:'Retry draft save',exact:true}).isHidden());assert.equal(await preserved(p),before);await p.setViewportSize({width:390,height:844});await p.locator('#dailyDialog').evaluate(n=>n.scrollTop=0);await p.screenshot({path:out+'/chooser-draft-saved-390.png'});
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
