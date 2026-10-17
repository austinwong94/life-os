const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-exercise-reuse';
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname));fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const card=p=>p.locator('[data-id="routine-fitness"]'),modal=p=>p.getByRole('dialog',{name:'Reuse Chest exercises',exact:true});
  const open=async p=>card(p).getByRole('button',{name:'Reuse Chest exercises',exact:true}).click();
  const data=p=>p.evaluate(()=>LifeStateMerge.copy({entries:state.cards.find(c=>c.id==='routine-fitness').fitnessEntries,food:state.cards.find(c=>c.id==='routine-food'),archive:state.archivedCards,other:state.boards.find(b=>b.id==='routine-other')}));
  const totals=p=>p.evaluate(()=>getFitnessReportTotals(collectFitnessSessions({startKey:'2026-10-16',endKey:'2026-10-16'})));
  async function run(name,fn,options={}){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur',...options});await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic exercise reuse; cloud blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.stack));await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{
      await p.goto(url+'?preview=1&liveReload=0');await p.evaluate(async()=>{
        const fitness=makeCard({type:'fitness',title:'My workouts'});fitness.id='routine-fitness';fitness.activeFitnessDate='2026-10-16';fitness.activeFitnessPart='chest';fitness.fitnessMetricsOpen=false;
        const exercise=(id,name)=>({id,name,sets:5,reps:'10-12',weightKg:25.75,rpe:8,notes:'Old exercise notes stay on the old day'});
        fitness.fitnessEntries={
          '2026-10-14':normalizeFitnessEntry({parts:{chest:{active:true,notes:'Original chest notes',exercises:[exercise('old-bench','Bench press'),exercise('old-fly','Cable fly')]}},metrics:{weightKg:72.35,heightCm:175},notes:'Original workout thoughts\nAll of them',updatedAt:1}),
          '2026-10-10':normalizeFitnessEntry({parts:{chest:{active:true,exercises:[exercise('older-fly','Incline fly')]}},updatedAt:2}),
          '2026-10-16':normalizeFitnessEntry({parts:{chest:{active:true,notes:'Today\'s own notes',exercises:[{...exercise('current-bench','Bench press'),sets:2,weightKg:12.75}]},running:{active:true,distanceKm:3,durationMinutes:20}},metrics:{weightKg:71.25,heightCm:175},notes:'Today is independent',updatedAt:3})};
        const diary=makeCard({type:'diary',title:'My diary'});diary.id='routine-diary';diary.diaryEntries={'2026-10-10':{thoughts:'Every original line\nIs kept in full',updatedAt:1}};
        const food=makeCard({type:'food',title:'Food unchanged'});food.id='routine-food';
        const other={...LifeStateMerge.copy(fitness),title:'A separate board\'s same-ID workout'};
        state.boards=[createBoardRecord({id:'routine-board',name:'My records',cards:[fitness,food,diary],archivedCards:[]}),createBoardRecord({id:'routine-other',name:'Other board',cards:[other]})];
        applyBoardToState(state,'routine-board');sessionStorage.setItem(LifeStorageScope.key('life-os-active-board'),state.activeBoardId);state.ui.workspaceMode='board';saveState();await flushDeviceWrites();render();
      });await workspace(p,'board');await p.evaluate(()=>flushDeviceWrites());await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('preview and cancel preserve every record and default to new names rather than duplicating listed names',async p=>{
    const before=await data(p);await open(p);assert.equal(await modal(p).getByLabel('Previous workout',{exact:true}).inputValue(),'2026-10-14');
    assert.equal(await modal(p).getByRole('checkbox',{name:'Bench press',exact:true}).isChecked(),false);assert(await modal(p).getByRole('checkbox',{name:'Cable fly',exact:true}).isChecked());assert.match(await modal(p).innerText(),/25.75 kg/);
    await modal(p).getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await data(p),before);
  });
  await run('selected names get fresh IDs and blank performance; old workouts, metrics and reports remain unchanged',async p=>{
    const before=await data(p),reported=await totals(p);await open(p);await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();
    const after=await data(p),entry=after.entries['2026-10-16'],rows=entry.parts.chest.exercises;assert.equal(rows.length,2);assert.equal(rows[1].name,'Cable fly');assert.notEqual(rows[1].id,'old-fly');
    for(const key of ['sets','reps','weightKg','rpe','notes'])assert.equal(rows[1][key],'');assert.deepEqual(rows[0],before.entries['2026-10-16'].parts.chest.exercises[0]);
    for(const key of ['metrics','notes'])assert.deepEqual(entry[key],before.entries['2026-10-16'][key]);assert.deepEqual(entry.parts.running,before.entries['2026-10-16'].parts.running);
    assert.deepEqual(after.entries['2026-10-14'],before.entries['2026-10-14']);assert.deepEqual(after.food,before.food);assert.deepEqual(after.other,before.other);assert.deepEqual(after.archive,before.archive);assert.deepEqual(await totals(p),reported);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'board');assert.equal(await card(p).locator('.fitness-exercise-row').count(),2);assert.deepEqual(await totals(p),reported);
    const last=card(p).locator('.fitness-exercise-row').last();await last.getByLabel('Sets',{exact:true}).fill('4');await last.getByLabel('Kg',{exact:true}).fill('16.75');await p.evaluate(()=>flushDeviceWrites());assert.equal((await totals(p)).strengthSets,6);
  });
  await run('a failed save restores the entire destination day and retries the same preview once',async p=>{
    await open(p);const before=await data(p);await p.evaluate(()=>{window.exerciseStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new DOMException('Full','QuotaExceededError');};});
    await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();assert.match(await modal(p).locator('[role=status]').innerText(),/Not saved/);assert.deepEqual(await data(p),before);
    await p.evaluate(()=>LifeDeviceStore.stage=exerciseStage);await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await card(p).locator('.fitness-exercise-row').count(),2);
  });
  await run('Undo restores the exact original day through reload and refuses later measured values',async p=>{
    const before=await data(p);await open(p);await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();await p.locator('#undoToastButton').click();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.deepEqual(await data(p),before);
    await open(p);await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();await card(p).locator('.fitness-exercise-row').last().getByLabel('Reps',{exact:true}).fill('12');await p.evaluate(()=>flushDeviceWrites());const changed=await data(p);await p.locator('#undoToastButton').click();assert.deepEqual(await data(p),changed);assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);
  });
  await run('failed Undo keeps the added names and all original measurements',async p=>{
    await open(p);await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());const before=await data(p);
    await p.evaluate(()=>{window.exerciseStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new DOMException('Full','QuotaExceededError');};});await p.locator('#undoToastButton').click();assert.deepEqual(await data(p),before);assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);await p.evaluate(()=>LifeDeviceStore.stage=exerciseStage);
  });
  await run('checkbox choices do not rebase a stale source, and destination changes cannot be overwritten',async p=>{
    for(const source of [true,false]){
      await open(p);await p.evaluate(async source=>{const c=state.cards.find(c=>c.id==='routine-fitness');if(source)c.fitnessEntries['2026-10-14'].parts.chest.exercises[1].name='A newer exercise name';else c.fitnessEntries['2026-10-16'].metrics.weightKg=70;saveState();await flushDeviceWrites();},source);
      await modal(p).getByRole('checkbox',{name:'Bench press',exact:true}).check();const before=await data(p);await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();assert.match(await modal(p).locator('[role=status]').innerText(),/changed/);assert.deepEqual(await data(p),before);await modal(p).getByRole('button',{name:'Cancel',exact:true}).click();
    }
  });
  await run('same-ID cards on different boards and unresolved comparisons cannot receive stale exercise commands',async p=>{
    await open(p);await p.evaluate(()=>switchBoard('routine-other'));await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();assert.match(await modal(p).locator('[role=status]').innerText(),/board changed/);
    await modal(p).getByRole('button',{name:'Cancel',exact:true}).click();await p.evaluate(()=>switchBoard('routine-board'));await workspace(p,'board');await open(p);await p.evaluate(()=>{state.syncConflicts=[{segments:['boards','routine-board','cards','routine-fitness','fitnessEntries']}];});const before=await data(p);await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();assert.match(await modal(p).locator('[role=status]').innerText(),/conflicting/);assert.deepEqual(await data(p),before);
  });
  await run('keyboard selection, date selection and phone/desktop geometry remain usable',async p=>{
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:width<500?844:1100});await open(p);const dialog=modal(p),check=dialog.getByRole('checkbox',{name:'Cable fly',exact:true});await check.focus();await check.press('Space');assert(await dialog.getByRole('button',{name:'Add exercises',exact:true}).isDisabled());await check.press('Space');assert(await check.isChecked());
      await dialog.getByLabel('Previous workout',{exact:true}).selectOption('2026-10-10');assert(await dialog.getByRole('checkbox',{name:'Incline fly',exact:true}).isChecked());
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const reach=await dialog.evaluate(el=>{const r=el.getBoundingClientRect(),button=[...el.querySelectorAll('button')].find(b=>b.type==='submit'),b=button.getBoundingClientRect(),title=el.querySelector('h2').getBoundingClientRect(),close=el.querySelector('header button').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,hit:button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),headingAligned:close.left>=title.right && Math.abs(close.top-title.top)<1};});
      assert(reach.top>=0 && reach.bottom<=reach.height+1 && reach.hit && reach.headingAligned,JSON.stringify({width,reach}));
      assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const minimum=width<=980?43.9:35.9,sizes=await dialog.locator('button,select,.daily-check').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height};}));assert(sizes.every(r=>r.w>=minimum && r.h>=minimum),JSON.stringify({width,sizes}));
      await p.screenshot({path:out+'/preview-'+width+'.png',fullPage:false});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    }
  });
  await run('paused diary writing survives adding exercise names and reloading',async p=>{
    const text='I am still thinking about this.\nEvery single character belongs here.';await p.getByLabel('Diary thoughts',{exact:true}).fill(text);await open(p);await modal(p).getByRole('button',{name:'Add exercises',exact:true}).click();assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
  });
  await run('no earlier exercises has a non-destructive empty state',async p=>{
    await p.evaluate(async()=>{const c=state.cards.find(c=>c.id==='routine-fitness');c.fitnessEntries['2026-10-14'].parts.chest.active=false;c.fitnessEntries['2026-10-10'].parts.chest.active=false;saveState();await flushDeviceWrites();renderCardsOnly({force:true});});const before=await data(p);await open(p);assert.match(await modal(p).innerText(),/No earlier chest exercises/);assert.equal(await modal(p).getByRole('button',{name:'Add exercises',exact:true}).count(),0);await modal(p).getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(await data(p),before);
  });
  await run('touch-tablet names remain inert, wrapped and reachable with 44px controls',async p=>{
    const name='<img src=x onerror=alert(1)> A long exercise name for a full readable preview that stays inside its dialog';await p.evaluate(async name=>{state.cards.find(c=>c.id==='routine-fitness').fitnessEntries['2026-10-14'].parts.chest.exercises[1].name=name;saveState();await flushDeviceWrites();},name);await open(p);const dialog=modal(p);
    assert.equal(await dialog.locator('img').count(),0);assert.match(await dialog.innerText(),/A long exercise name/);assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    const sizes=await dialog.locator('button,select,.daily-check').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height};}));assert(sizes.every(r=>r.w>=43.9 && r.h>=43.9));await p.screenshot({path:out+'/touch-tablet.png',fullPage:false});
  },{viewport:{width:1080,height:844},isMobile:true,hasTouch:true});
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
