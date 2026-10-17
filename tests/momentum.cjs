const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs'),fixture=require('./coaching-fixture.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-momentum';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'Asia/Kuala_Lumpur'});await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic data only; cloud blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await fn(p);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  const seed=async (p,program=fixture())=>p.evaluate(async program=>{
    const source=makeCard({type:'planner',title:'My actions',category:'Personal'});source.id='momentum-planner';
    const rows=[['walk','Take a walk outside','2026-10-12','Personal'],['friend','Catch up with a friend','2026-10-13','Personal'],
      ['launch','Send Culturely invitations','2026-10-14','Culturely'],['food','Prepare a nourishing lunch','2026-10-15','Fitness'],['outline','Write the first product outline','2026-10-16','Culturely'],
      ['rest','Leave room for a proper break','2026-10-16','Personal'],['next','Choose a venue for our trip','2026-10-19','Personal']];
    for(const [id,title,day,area] of rows){LifePlanner.add(source,day,title,id);LifePlanner.change(source,id,{area});if(!['rest','next'].includes(id))LifePlanner.complete(source,id,day);}
    LifePlanner.change(source,'walk',{archivedAt:Date.now()});
    const diary=makeCard({type:'diary',title:'A moment for myself',category:'Personal'});diary.id='momentum-diary';
    diary.diaryEntries={'2026-10-12':{thoughts:'Fresh air helped.\nA small step is still a step.',sentence:'A walk without my phone.',feeling:'calm',updatedAt:Date.now()},'2026-10-14':{thoughts:'I reached out instead of overthinking.',updatedAt:Date.now()}};
    state.cards=[source,diary,makeCard({type:'sidenote',title:'Things on my mind',category:'Personal'})];state.archivedCards=[];
    coachingStore().coachingPrograms.push(program);saveState();
    saveDailyRecord({kind:'focus',date:getTodayKey(),taskKeys:['outline','rest'].map(id=>JSON.stringify([source.id,id]))});
    await flushDeviceWrites();renderCardsOnly({force:true});
    window.momentumOriginal=JSON.stringify({cards:state.cards,archived:state.archivedCards});
  },program);
  await run('fresh preview navigation works before any test records are created',async p=>{
    await workspace(p,'priorities');await p.locator('.momentum-progress-head').waitFor({state:'visible'});
    await workspace(p,'today');await p.locator('.momentum-today').waitFor({state:'visible'});
  });
  await run('Today and Progress show recorded completions, original choices, writing days and archived history',async p=>{
    await seed(p);await workspace(p,'today');assert.match(await p.locator('.momentum-today').innerText(),/Completed today\s+1/);assert.match(await p.locator('.momentum-today').innerText(),/Completed this week\s+5/);
    await p.getByRole('button',{name:'Completed today: 1',exact:true}).click();assert.match(await p.locator('#dailyDialog').innerText(),/Write the first product outline/);await p.keyboard.press('Escape');
    await p.getByRole('button',{name:'Completed this week: 5',exact:true}).click();assert.match(await p.locator('.progress-measures').innerText(),/50%/);assert.match(await p.locator('.progress-measures').innerText(),/1 \/ 2 completed/);
    assert.equal(await p.locator('.momentum-bars > li').count(),7);assert.match(await p.locator('.momentum-areas').innerText(),/Culturely\s+2/);
    await p.getByRole('button',{name:'Previous progress week',exact:true}).click();assert.match(await p.locator('.progress-measures').innerText(),/Not recorded/);await p.getByRole('button',{name:'This week',exact:true}).click();assert(await p.getByRole('button',{name:'Next progress week',exact:true}).isDisabled());
    assert(await p.evaluate(()=>momentumOriginal===JSON.stringify({cards:state.cards,archived:state.archivedCards})));
  });
  await run('completion controls refresh summaries, late completion stays visible and writing survives a long pause',async p=>{
    await seed(p);await workspace(p,'today');await p.getByRole('checkbox',{name:'Mark done: Leave room for a proper break',exact:true}).click();assert.match(await p.locator('.momentum-today').innerText(),/Completed today\s+2/);
    assert(await p.getByRole('checkbox',{name:'Mark open: Leave room for a proper break',exact:true}).isChecked());
    const text='Today I gave myself time to think.\nEvery character and line matters.';
    const writer=p.locator('.daily-journals .diary-thoughts');await writer.fill(text);await p.waitForTimeout(1800);await p.getByRole('button',{name:'Completed today: 2',exact:true}).click();assert.equal(await writer.inputValue(),text);await p.keyboard.press('Escape');await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.equal(await p.locator('.daily-journals .diary-thoughts').inputValue(),text);
    await p.getByRole('button',{name:'Lighter day',exact:true}).click();assert.equal(await p.locator('.momentum-today .momentum-stat-button').count(),1);assert.equal(await p.locator('.momentum-today .momentum-chart').count(),0);
    assert(await p.locator('.momentum-stat-button').evaluate(button=>button.getBoundingClientRect().height>=44));
  });
  await run('responsive desktop, portrait and mobile have readable charts, no overflow, and all destinations work',async p=>{
    await seed(p);
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:width<=390?844:1100});
      for(const mode of ['today','tasks','board','money','priorities','records']){
        await workspace(p,mode);await p.waitForTimeout(80);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),mode+' overflow '+width);
        if(['today','priorities'].includes(mode)){
          const sizes=await p.locator('.momentum-bars li').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));assert(sizes.every(w=>w>=10),'bars too narrow');
          if(mode==='today'){const tops=await p.locator('.momentum-today-metrics strong').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert(Math.max(...tops)-Math.min(...tops)<=1,'summary values must align');}
          await p.evaluate(()=>clearUndoToast());await p.screenshot({path:out+'/'+mode+'-'+width+'.png',fullPage:true});
        }
      }
    }
  });
  await run('empty, conflicting and independent-board records never become invented performance',async p=>{
    await seed(p);await p.evaluate(()=>{state.syncConflicts=[{kind:'planner-task',segments:['boards',state.activeBoardId,'cards','momentum-planner','plannerTasks','outline']}];});await workspace(p,'today');assert.match(await p.locator('.momentum-today').innerText(),/Completed today\s+0/);
    await p.evaluate(()=>{state.boards.push(createBoardRecord({id:'momentum-empty',name:'Separate board',cards:[]}));saveState();switchBoard('momentum-empty');});await workspace(p,'priorities');assert.match(await p.locator('.progress-measures').innerText(),/Tasks completed\s+0/);assert.match(await p.locator('.progress-measures').innerText(),/Not recorded/);assert.equal(await p.locator('.momentum-areas .momentum-area').count(),0);
    assert.equal(await p.locator('.momentum-outcomes').count(),0);
  });
  await run('outcomes show real cumulative results and historical checkpoints, not task-derived scores',async p=>{
    const program=fixture();program.priorities[2].krs[0].metrics[0].pacePlan=[{date:'2026-10-10',value:30}];
    program.entries=[{id:'early',kind:'measurement',metricId:'customers',value:0,date:'2026-10-01',recordedAt:1,note:''},{id:'latest',kind:'measurement',metricId:'customers',value:20,date:'2026-10-15',recordedAt:2,note:'Real customers'}];
    await seed(p,program);await workspace(p,'priorities');const work=p.locator('.momentum-outcome[data-priority-id="work"]');
    assert.equal(await work.locator('.momentum-outcome-value').innerText(),'10%');assert.match(await work.innerText(),/1 \/ 2 targets updated/);assert.match(await work.innerText(),/1 below planned checkpoint/);
    assert.equal(await p.locator('.momentum-outcome[data-priority-id="life"] .momentum-outcome-value').innerText(),'Not recorded');
    await p.locator('.momentum-outcomes').screenshot({path:out+'/outcomes-overview.png'});
    await work.locator('summary').click();assert.match(await work.locator('[data-metric-id="customers"]').innerText(),/20 \/ 100 customers/);
    await p.getByRole('button',{name:'Previous progress week',exact:true}).click();await p.locator('.momentum-outcome[data-priority-id="work"] summary').click();
    assert.match(await work.locator('[data-metric-id="customers"]').innerText(),/0 \/ 100 customers/);assert.match(await work.innerText(),/1 checkpoint updates missing|1 below planned checkpoint/);
    assert.match(await p.locator('.momentum-outcomes').innerText(),/including later corrections/);
    assert(await p.evaluate(()=>momentumOriginal===JSON.stringify({cards:state.cards,archived:state.archivedCards})));
  });
  await run('outcome shortcuts preserve drafts and use the original goal and task writers on mobile',async p=>{
    await seed(p);await workspace(p,'priorities');await p.setViewportSize({width:390,height:844});
    await p.evaluate(()=>{coachingSession().draft={kind:'measurement',programId:coachingProgram().id,metricId:'customers',date:'2026-10-16',value:7,note:'Keep every word'};coachingSession().draftClosed=true;saveCoachingDraft();});
    await p.getByRole('button',{name:'Update progress: Real outcomes',exact:true}).click();
    assert.equal(await p.locator('.coaching-focus h4').first().innerText(),'Launch an idea');await p.waitForFunction(()=>document.querySelector('.coaching-focus .coaching-number-form input')===document.activeElement);
    assert.equal(await p.evaluate(()=>coachingSession().draft.note),'Keep every word');
    const form=p.locator('.coaching-number-form').filter({has:p.getByText('Paying customers',{exact:true})});await form.locator('input').fill('12');await form.getByRole('button',{name:'Save Paying customers',exact:true}).click();
    await p.getByRole('navigation',{name:'Progress sections',exact:true}).getByRole('button',{name:'Overview',exact:true}).click();
    assert.equal(await p.locator('.momentum-outcome[data-priority-id="work"] .momentum-outcome-value').innerText(),'6%');assert.equal(await p.evaluate(()=>coachingSession().draft.note),'Keep every word');
    await p.getByRole('button',{name:'Plan a step: A fuller life',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.coaching-next-actions > button:last-child')===document.activeElement);
    assert.equal(await p.evaluate(()=>coachingSession().priorityId),'life');assert.equal(await p.evaluate(()=>coachingSession().draft.note),'Keep every word');
    await p.getByRole('navigation',{name:'Progress sections',exact:true}).getByRole('button',{name:'Overview',exact:true}).click();
    await p.evaluate(()=>{coachingProgram().priorities[1].title='Build meaningful connections and become more open to relationships without postponing living';renderCardsOnly({force:true});});
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:1000});await p.locator('.momentum-outcome-targets').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'outcomes overflow '+width);
      assert(await p.locator('.momentum-outcome-actions button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
      if(width>=768){const tops=await p.locator('.momentum-outcome-value').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert(Math.max(...tops)-Math.min(...tops)<=1,'long titles must not misalign outcome values');}
      await p.locator('.momentum-outcomes').screenshot({path:out+'/outcomes-'+width+'.png'});
    }
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'priorities');assert.equal(await p.locator('.momentum-outcome[data-priority-id="work"] .momentum-outcome-value').innerText(),'6%');assert.equal(await p.evaluate(()=>coachingSession().draft.note),'Keep every word');
  });
  await run('pending comparisons are clearly provisional and malformed saved programmes remain untouched',async p=>{
    await seed(p);await workspace(p,'priorities');
    // Finish the view-preference checkpoint before injecting provisional state.
    // A pending commit can otherwise correctly replace this unsaved fixture.
    assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);
    await p.evaluate(()=>{state.syncConflicts=[{segments:['boards','another-board','coachingPrograms','synthetic-coaching']}];renderCardsOnly({force:true});});assert.equal(await p.locator('.momentum-outcome-warning').count(),0);
    await p.evaluate(()=>{state.syncConflicts=[{segments:['boards',state.activeBoardId,'coachingPrograms','synthetic-coaching']}];renderCardsOnly({force:true});});assert.match(await p.locator('.momentum-outcome-warning').innerText(),/not verified cloud totals/);
    await p.evaluate(()=>{coachingProgram().priorities[0].krs[0].metrics[0].target=-1;window.invalidOriginal=JSON.stringify(coachingProgram());renderCardsOnly({force:true});});
    assert.match(await p.locator('.progress-home').innerText(),/priority records need review/);assert.equal(await p.locator('.momentum-outcome').count(),0);assert(await p.evaluate(()=>invalidOriginal===JSON.stringify(coachingProgram())));
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
