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
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
