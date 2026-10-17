const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs'),fixture=require('./coaching-fixture.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-workspace-structure';
assert(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Synthetic checks must stay local');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const seed=p=>p.evaluate(async program=>{
    const source=makeCard({type:'planner',title:'Example actions',category:'Personal'});source.id='structure-planner';
    for(const [id,title,day] of [['walk','Take a short walk','2026-10-16'],['friend','Invite a friend for lunch','2026-10-17']])LifePlanner.add(source,day,title,id);
    const diary=makeCard({type:'diary',title:'Example diary',category:'Personal'});diary.id='structure-diary';diary.diaryEntries={'2026-10-16':{thoughts:'A thought worth keeping.\nA full second line.',sentence:'A moment for myself.',feeling:'calm',updatedAt:1}};
    state.cards=[source,diary,makeCard({type:'sidenote',title:'Example quick notes',category:'Personal'})];state.archivedCards=[];state.board.columnCount=3;
    coachingStore().coachingPrograms.push(program);saveState();await flushDeviceWrites();window.structureOriginal=JSON.stringify({cards:state.cards,archive:state.archivedCards,program:coachingProgram()});
  },fixture());
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic UI test; external services blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await seed(p);await fn(p);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  const progressTab=(p,label)=>p.getByRole('navigation',{name:'Progress sections',exact:true}).getByRole('button',{name:label,exact:true}).click();
  await run('Progress separates reading and updating, preserves full drafts and remembers the board-specific view',async p=>{
    const original=await p.evaluate(()=>structureOriginal);
    await workspace(p,'priorities');assert(await p.locator('#progressOverview').isVisible());assert(!await p.locator('#progressGoals').isVisible());
    await p.evaluate(()=>{coachingSession().draft={kind:'measurement',programId:coachingProgram().id,metricId:'customers',date:getTodayKey(),value:12,note:'Every word in this unsaved reflection.\nIncluding this line.'};coachingSession().draftClosed=true;saveCoachingDraft();});
    await p.getByRole('button',{name:'Update progress: Real outcomes',exact:true}).click();assert(await p.locator('#progressGoals').isVisible());assert(!await p.locator('#progressOverview').isVisible());
    assert.equal(await p.evaluate(()=>coachingSession().priorityId),'work');
    await p.getByRole('button',{name:'Resume saved draft',exact:true}).click();assert.equal(await p.getByLabel('Evidence or notes',{exact:true}).inputValue(),'Every word in this unsaved reflection.\nIncluding this line.');
    await progressTab(p,'Overview');await progressTab(p,'Goals & check-ins');assert.equal(await p.getByLabel('Evidence or notes',{exact:true}).inputValue(),'Every word in this unsaved reflection.\nIncluding this line.');
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'priorities');assert(await p.locator('#progressGoals').isVisible());assert.equal(await p.getByLabel('Evidence or notes',{exact:true}).inputValue(),'Every word in this unsaved reflection.\nIncluding this line.');
    assert.equal(await p.evaluate(()=>JSON.stringify({cards:state.cards,archive:state.archivedCards,program:coachingProgram()})),original);
    await p.evaluate(()=>{state.boards.push(createBoardRecord({id:'structure-other',name:'Another board',cards:[]}));saveState();switchBoard('structure-other');});await workspace(p,'priorities');assert(await p.locator('#progressOverview').isVisible());
  });
  await run('Today retains original menu actions, feelings, full diary writing and independent note drafts',async p=>{
    await workspace(p,'today');const diary=p.locator('.daily-journals .type-diary'),notes=p.locator('.daily-journals .type-sidenote');
    assert.equal(await diary.locator('.daily-journal-head h3').innerText(),'Example diary');assert.equal(await diary.locator('.card-topline:visible').count(),0);
    await diary.getByRole('button',{name:'Card options',exact:true}).click();assert(await p.getByRole('menu',{name:'Card options',exact:true}).isVisible());assert(await p.getByRole('menu',{name:'Card options',exact:true}).getByRole('menuitem').count()>=4);await p.keyboard.press('Escape');
    const text='I can pause without losing a thought.\nThis is the whole second line.';await diary.getByLabel('Diary thoughts',{exact:true}).fill(text);
    await notes.getByLabel('Quick note',{exact:true}).fill('An unfinished idea, kept in full.');await workspace(p,'tasks');await workspace(p,'today');
    assert.equal(await diary.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);assert.equal(await notes.getByLabel('Quick note',{exact:true}).inputValue(),'An unfinished idea, kept in full.');
    await diary.getByRole('button',{name:'Happy',exact:true}).click();assert.equal(await diary.getByRole('button',{name:'Happy',exact:true}).getAttribute('aria-pressed'),'true');
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');assert.equal(await diary.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);assert.equal(await notes.getByLabel('Quick note',{exact:true}).inputValue(),'An unfinished idea, kept in full.');
  });
  await run('Records reading options stay accessible without exposing private previews by default',async p=>{
    await workspace(p,'records');assert.equal(await p.locator('.record-preview').count(),0);assert.equal(await p.locator('.records-preferences[open]').count(),0);
    await p.getByText('Reading options',{exact:true}).click();await p.getByRole('checkbox',{name:'Show content previews',exact:true}).check();assert.equal(await p.locator('.record-preview').count(),1);
    await p.getByRole('checkbox',{name:'Show content previews',exact:true}).uncheck();await p.locator('.record-entry > summary').click();assert.match(await p.locator('.record-body').innerText(),/A full second line/);
    assert(await p.getByRole('button',{name:'Download my information',exact:true}).isVisible());
    assert(await p.evaluate(()=>JSON.stringify({cards:state.cards,archive:state.archivedCards,program:coachingProgram()})===structureOriginal));
  });
  await run('quick task capture shows its defaults and retains area, date and complete text while collapsed or reloaded',async p=>{
    await workspace(p,'tasks');await p.setViewportSize({width:390,height:844});
    assert.equal(await p.locator('.task-capture-details[open]').count(),0);assert.match(await p.locator('.task-capture-details > summary').innerText(),/Unsorted/);
    await p.getByLabel('New task',{exact:true}).fill('A fully retained future plan');await p.locator('.task-capture-details > summary').click();
    await p.locator('.task-capture').getByLabel('Area',{exact:true}).selectOption('Culturely');await p.getByLabel('Planned day (optional)',{exact:true}).fill('2026-11-01');
    await p.locator('.task-capture-details > summary').click();assert.match(await p.locator('.task-capture-details > summary').innerText(),/Culturely/);
    await p.reload();await workspace(p,'tasks');assert.equal(await p.getByLabel('New task',{exact:true}).inputValue(),'A fully retained future plan');
    await p.locator('.task-capture-details > summary').click();assert.equal(await p.getByLabel('Planned day (optional)',{exact:true}).inputValue(),'2026-11-01');
    assert.equal(await p.locator('.task-capture').getByLabel('Area',{exact:true}).inputValue(),'Culturely');
    await p.getByRole('button',{name:'Clear planned day',exact:true}).click();assert.match(await p.locator('.task-capture-details > summary').innerText(),/No date/);
    await p.getByLabel('New task',{exact:true}).press('Enter');assert.equal(await p.locator('.task-capture-details[open]').count(),0);
    await p.evaluate(()=>flushDeviceWrites());const tasks=await p.evaluate(()=>getPlannerSourceItems().filter(t=>t.title==='A fully retained future plan').map(t=>({area:t.area,date:t.dateKey})));
    assert.deepEqual(tasks,[{area:'Culturely',date:''}]);
  });
  await run('all workspaces keep saving visible, fit narrow screens and retain the portrait three-column board',async p=>{
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:width<=390?844:1000});
      for(const mode of ['today','tasks','calendar','board','records','money','priorities']){
        await workspace(p,mode);await p.waitForFunction(mode=>document.body.dataset.workspace===mode,mode);await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);
        assert(await p.locator('.workspace-header #headerSaveStatus').isVisible());
        if(width<=980){
          const selected=await p.evaluate(()=>{
            const nodes=[...document.querySelectorAll('.rail-nav > button')].filter(n=>n.getClientRects().length && n.getAttribute('aria-pressed')==='true');
            const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
            const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
            return {count:nodes.length,color:nodes[0]?rgba(getComputedStyle(nodes[0]).color):[],expected:rgba(getComputedStyle(document.body).getPropertyValue('--action'))};
          });assert.equal(selected.count,1,'one selected destination for '+mode+' at '+width);assert.deepEqual(selected.color,selected.expected,'selected navigation must update immediately for '+mode);
        }
        if(mode==='today')assert.equal(await p.locator('.daily-head').getByRole('button',{name:'Capture',exact:true}).isVisible(),width<=980);
        if(mode!=='board')assert(!await p.locator('.workspace-navigation').isVisible());
        if(mode==='board' && width===1080)assert.equal(await p.locator('.board-column').count(),3);
        if(['today','tasks','records','money','priorities'].includes(mode))await p.screenshot({path:out+'/'+mode+'-'+width+'.png',fullPage:false});
      }
    }
    assert(await p.evaluate(()=>JSON.stringify({cards:state.cards,archive:state.archivedCards,program:coachingProgram()})===structureOriginal));
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
