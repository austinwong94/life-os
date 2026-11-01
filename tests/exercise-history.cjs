const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const target=new URL(process.env.TEST_URL || 'http://127.0.0.1:5180/');assert(['127.0.0.1','localhost'].includes(target.hostname));target.searchParams.set('preview','1');target.searchParams.set('liveReload','0');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-exercise-history';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const panel=p=>p.locator('.health-lift-history');
  const originalDay=(p,date)=>panel(p).locator('.health-lift-entry[data-date="'+date+'"]');
  async function trendDays(p){return p.evaluate(()=>{
    const card=state.cards.find(card=>card.id==='gym'),original=LifeStateMerge.copy(card.fitnessEntries),source=card.fitnessEntries['2026-10-31'];
    card.fitnessEntries=Object.fromEntries(Array.from({length:24},(_,i)=>{const entry=LifeStateMerge.copy(source),exercise=entry.parts.chest.exercises[0];exercise.setLog.rows.forEach((row,index)=>{row.weightKg=10+i*.5-index*.25;row.reps=8+i%4;row.history.forEach(event=>{event.weightKg=row.weightKg;event.reps=row.reps;});});return ['2026-10-'+String(i+1).padStart(2,'0'),entry];}));return original;
  });}
  const restoreDays=(p,original)=>p.evaluate(original=>{state.cards.find(card=>card.id==='gym').fitnessEntries=original;syncActiveBoard({touchBoard:false});},original);
  const data=p=>p.evaluate(()=>{const project=cards=>cards.map(card=>({id:card.id,fitnessEntries:card.fitnessEntries,diaryEntries:card.diaryEntries,foodEntries:card.foodEntries,description:card.description}));return JSON.stringify({boards:state.boards.map(board=>({id:board.id,cards:project(board.cards)})),active:project(state.cards)});});
  const open=async p=>{await p.getByRole('button',{name:'Training history',exact:true}).click();await panel(p).locator(':scope > summary').click();};
  async function run(name,fn){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'Synthetic exercise-history tests; private requests blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.stack));await p.clock.setFixedTime(new Date('2026-10-31T04:00:00Z'));
    try{
      await p.goto(target.href);await p.evaluate(async()=>{
        const old={id:'bench',name:'Bench press',sets:3,reps:'8-12',weightKg:12.75,rpe:7,extension:{keep:true}};
        function lift(items){return {...old,setLog:{version:1,id:'log',createdAt:1,updatedAt:2,rows:items.map((item,index)=>{const row={id:'set-'+index,reps:'',weightKg:'',rpe:'',done:false,removedAt:0,history:[],...item};if(row.done)row.history=[{id:'event-'+index,action:'completed',at:2,reps:row.reps,weightKg:row.weightKg,rpe:row.rpe}];if(row.removedAt)row.history=[{id:'event-'+index,action:'removed',at:row.removedAt,reps:row.reps,weightKg:row.weightKg,rpe:row.rpe}];return row;})}};}
        const entry=exercises=>normalizeFitnessEntry({parts:{chest:{active:true,exercises}},notes:'Original full workout\nEvery line'});
        const gym=makeCard({type:'fitness',title:'Original gym'});gym.id='gym';gym.activeFitnessDate='2026-10-31';gym.activeFitnessPart='chest';gym.fitnessEntries={
          '2026-10-29':entry([old]),'2026-10-30':entry([lift([{reps:10,weightKg:15,done:true},{reps:'12',weightKg:'18'},{reps:'9',weightKg:'20',removedAt:3}])]),
          '2026-10-31':entry([lift([{reps:8,weightKg:20,done:true},{reps:10,weightKg:17.5,rpe:8,done:true}])]),'2026-11-02':entry([lift([{reps:10,weightKg:99,done:true}])])};
        gym.fitnessEntries['2026-10-31'].parts.back={active:true,notes:'Original back note',exercises:[{...old,id:'back-bench',weightKg:50}]};
        const second=makeCard({type:'fitness',title:'Separate gym'});second.id='second';second.activeFitnessDate='2026-10-31';second.fitnessEntries={'2026-10-31':entry([lift([{reps:12,weightKg:0,done:true}])])};
        const diary=makeCard({type:'diary',title:'Original diary'});diary.diaryEntries={'2026-10-30':{thoughts:'Every original word\nSecond line',updatedAt:1}};
        const food=makeCard({type:'food',title:'Original nutrition'});
        state.boards=[createBoardRecord({id:'history-board',name:'Synthetic health',cards:[gym,second,diary,food]}),createBoardRecord({id:'other',name:'Another original board',cards:[LifeStateMerge.copy(gym)]})];switchBoard('history-board');await flushDeviceWrites();
      });await workspace(p,'health');await p.evaluate(()=>flushDeviceWrites());const before=await data(p);await fn(p,context);assert.equal(await data(p),before);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('exercise history is folded by default and separates checked sets from summaries drafts removed sets and future entries',async p=>{
    await p.getByRole('button',{name:'Training history',exact:true}).click();assert.equal(await panel(p).getAttribute('open'),null);assert.equal(await p.locator('.health-history-row').count(),5);
    await panel(p).locator(':scope > summary').click();assert.equal(await panel(p).locator('.health-lift-total').innerText(),'3 checked sets across 2 recorded days');assert.equal(await panel(p).locator('.health-lift-entry').count(),4);
    assert.match(await originalDay(p,'2026-10-29').innerText(),/Summary entry - not individually checked/);assert.match(await originalDay(p,'2026-10-29').innerText(),/12.75 kg/);
    const row=originalDay(p,'2026-10-30');assert.match(await row.innerText(),/Draft/);assert.match(await row.innerText(),/Removed/);assert.match(await originalDay(p,'2026-11-02').innerText(),/Future date - excluded/);
    const comparison=await panel(p).locator('.health-lift-comparison').innerText();assert.match(comparison,/17.5 kg \/ 10 reps/);assert.match(comparison,/15 kg \/ 10 reps/);assert(!comparison.includes('99 kg'));
  });
  await run('source and exercise selectors never merge different logs or muscle parts and preserve focus on redraw',async p=>{
    await open(p);await panel(p).getByLabel('Exercise',{exact:true}).selectOption('["back","bench press"]');assert.match(await panel(p).innerText(),/50 kg/);assert.equal(await panel(p).locator('.health-lift-entry').count(),1);assert.equal(await panel(p).locator('.health-lift-comparison').count(),0);
    await panel(p).getByLabel('Workout log',{exact:true}).selectOption('second');assert.equal(await panel(p).locator('.health-lift-total').innerText(),'1 checked set across 1 recorded day');assert.match(await panel(p).locator('.health-lift-comparison').innerText(),/0 kg \/ 12 reps/);
    await panel(p).getByLabel('Workout log',{exact:true}).focus();await p.evaluate(()=>renderCardsOnly({force:true}));assert(await panel(p).getByLabel('Workout log',{exact:true}).evaluate(node=>node===document.activeElement));
    await p.getByRole('button',{name:'Food',exact:true}).click();await p.getByRole('button',{name:'Training history',exact:true}).click();assert.equal(await panel(p).getAttribute('open'),'');assert.equal(await panel(p).getByLabel('Workout log',{exact:true}).inputValue(),'second');
  });
  await run('opening an original exercise entry uses its exact source and day without rewriting past measurements',async p=>{
    await open(p);await originalDay(p,'2026-10-29').getByRole('button').click();assert.equal(await p.getByLabel('Workout date',{exact:true}).inputValue(),'2026-10-29');assert.equal(await p.getByLabel('Log',{exact:true}).inputValue(),'gym');assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'12.75');
    await p.getByRole('button',{name:'Training history',exact:true}).click();await panel(p).getByLabel('Workout log',{exact:true}).selectOption('second');await panel(p).locator('.health-lift-open').click();assert.equal(await p.getByLabel('Log',{exact:true}).inputValue(),'second');assert.equal(await p.getByLabel('Workout date',{exact:true}).inputValue(),'2026-10-31');
  });
  await run('viewing selectors totals and details does not stage any data write or invent workout records',async p=>{
    await p.evaluate(()=>{window.historyStages=0;window.historyStage=LifeDeviceStore.stage;LifeDeviceStore.stage=(...args)=>{historyStages++;return historyStage(...args);};});await open(p);await panel(p).getByLabel('Workout log',{exact:true}).selectOption('second');await panel(p).getByLabel('Workout log',{exact:true}).selectOption('gym');await panel(p).locator(':scope > summary').click();await panel(p).locator(':scope > summary').click();await p.evaluate(()=>flushDeviceWrites());assert.equal(await p.evaluate(()=>historyStages),0);
  });
  await run('unresolved versions pause comparisons and unknown schemas remain uncounted and unchanged',async p=>{
    await p.evaluate(()=>{window.historyOriginalConflicts=state.syncConflicts;state.syncConflicts=[{id:'pending',segments:['boards','history-board','cards','gym']}];});await open(p);assert.match(await panel(p).getByRole('status').innerText(),/comparison paused/);assert.equal(await panel(p).locator('.health-lift-comparison').count(),0);assert.equal(await panel(p).locator('.health-lift-entry').count(),4);
    await p.evaluate(()=>{state.syncConflicts=historyOriginalConflicts;const log=state.cards.find(card=>card.id==='gym').fitnessEntries['2026-10-31'].parts.chest.exercises[0].setLog;window.historyLogOriginal=LifeStateMerge.copy(log);log.version=999;renderCardsOnly({force:true});});
    assert.match(await originalDay(p,'2026-10-31').innerText(),/Unrecognized exercise record/);assert.equal(await panel(p).locator('.health-lift-total').innerText(),'1 checked set across 1 recorded day');
    await p.evaluate(()=>{state.cards.find(card=>card.id==='gym').fitnessEntries['2026-10-31'].parts.chest.exercises[0].setLog=historyLogOriginal;});
  });
  await run('captured history buttons refuse a different board and duplicate source identities without changing either copy',async p=>{
    await open(p);const result=await panel(p).locator('[data-date="2026-10-29"] .health-lift-open').evaluate(button=>{
      const sessionLink=document.querySelector('.health-history-row');switchBoard('other');const before=JSON.stringify(state.cards);button.click();sessionLink.click();return {unchanged:JSON.stringify(state.cards)===before,date:state.cards.find(card=>card.id==='gym').activeFitnessDate};
    });assert.equal(result.unchanged,true);assert.equal(result.date,'2026-10-31');await p.evaluate(()=>switchBoard('history-board'));await workspace(p,'health');await p.getByRole('button',{name:'Training history',exact:true}).click();
    const refused=await panel(p).locator('[data-date="2026-10-29"] .health-lift-open').evaluate(button=>{
      const card=state.cards.find(card=>card.id==='gym'),original=LifeStateMerge.copy(card.fitnessEntries);state.cards.push(LifeStateMerge.copy(card));let before=JSON.stringify(state.cards);button.click();const duplicate=JSON.stringify(state.cards)===before;state.cards.pop();
      const entry=card.fitnessEntries['2026-10-29'];delete card.fitnessEntries['2026-10-29'];before=JSON.stringify(state.cards);button.click();const missing=JSON.stringify(state.cards)===before;card.fitnessEntries['2026-10-29']=entry;
      card.fitnessEntries['2026-10-29']=null;before=JSON.stringify(state.cards);button.click();const malformed=JSON.stringify(state.cards)===before;card.fitnessEntries=original;syncActiveBoard({touchBoard:false});return {duplicate,missing,malformed};
    });assert.deepEqual(refused,{duplicate:true,missing:true,malformed:true});
  });
  await run('long names are rendered as text and phone portrait and desktop tables retain complete values and 44px controls',async p=>{
    await open(p);const original=await p.evaluate(()=>{const card=state.cards.find(card=>card.id==='gym'),copy=LifeStateMerge.copy(card.fitnessEntries);for(const entry of Object.values(card.fitnessEntries))for(const exercise of entry.parts.chest.exercises)exercise.name='Bench press <img src=x onerror=alert(1)> - Full long exercise name retained';renderCardsOnly({force:true});return copy;});
    for(const width of [1440,1080,768,390,320]){
      await p.setViewportSize({width,height:width<700?844:1100});await p.evaluate(()=>document.querySelector('.health-lift-history').scrollIntoView());
      const bounds=await panel(p).locator('button,select,summary').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length && !node.closest('.health-lift-trend-scroll')).map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,width:r.width};}));assert(bounds.every(r=>r.left>=0 && r.right<=width+1 && r.width>=43.9 && r.height>=43.9),JSON.stringify({width,bounds}));const pageSize=await p.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert(pageSize.scroll<=pageSize.viewport+1,JSON.stringify(pageSize));assert.equal(await panel(p).locator('img').count(),0);assert.match(await panel(p).locator('.health-lift-name').innerText(),/Full long exercise name retained/);
      assert.match(await originalDay(p,'2026-10-31').locator('table').innerText(),/17.5 kg \/ 10 reps \/ RPE 8/);assert(await panel(p).locator('.health-lift-table td:last-child').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)));await p.screenshot({path:out+'/history-'+width+'.png',fullPage:width>700});
    }
    await p.evaluate(original=>{state.cards.find(card=>card.id==='gym').fitnessEntries=original;syncActiveBoard({touchBoard:false});},original);
  });
  await run('more than eight dated records stay reachable and same-name duplicates are not silently combined',async p=>{
    const original=await p.evaluate(()=>{const card=state.cards.find(card=>card.id==='gym'),copy=LifeStateMerge.copy(card.fitnessEntries),source=card.fitnessEntries['2026-10-29'];card.fitnessEntries=Object.fromEntries(Array.from({length:20},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),LifeStateMerge.copy(source)]));card.fitnessEntries['2026-10-20'].parts.chest.exercises.push({...card.fitnessEntries['2026-10-20'].parts.chest.exercises[0],id:'another'});return copy;});await open(p);assert.equal(await panel(p).locator('.health-lift-entry').count(),20);assert.match(await panel(p).locator('[data-date="2026-10-20"]').innerText(),/Multiple or unidentified entries/);await panel(p).locator('[data-date="2026-10-01"] .health-lift-open').click();assert.equal(await p.getByLabel('Workout date',{exact:true}).inputValue(),'2026-10-01');
    await p.evaluate(original=>{state.cards.find(card=>card.id==='gym').fitnessEntries=original;syncActiveBoard({touchBoard:false});},original);
  });
  await run('trend shows paired last checked measurements and never plots the heavier draft future or summary',async p=>{
    await open(p);const chart=panel(p).getByRole('figure',{name:'Last checked set · load (kg)'}),points=chart.locator('.health-lift-trend-day');
    assert.deepEqual(await points.evaluateAll(nodes=>nodes.map(node=>({date:node.dataset.date,text:node.innerText}))),[{date:'2026-10-30',text:'Oct 30\n15 kg\n10 reps'},{date:'2026-10-31',text:'Oct 31\n17.5 kg\n10 reps'}]);
    assert.equal(await chart.locator('figcaption').innerText(),'2 of 2 recorded days');assert.equal(await chart.locator('polyline').getAttribute('points'),'25,14.285714285714292 75,0');
    assert.equal(await chart.getByRole('button',{name:'Earlier recorded days',exact:true}).isDisabled(),true);assert.equal(await chart.getByRole('button',{name:'Later recorded days',exact:true}).isDisabled(),true);
  });
  await run('trend source part zero load empty and conflict states remain explicit without invented performance',async p=>{
    await open(p);await panel(p).getByLabel('Exercise',{exact:true}).selectOption('["back","bench press"]');assert.match(await panel(p).locator('.health-lift-trend').innerText(),/No checked sets to chart/);assert.equal(await panel(p).locator('.health-lift-trend-day').count(),0);
    await panel(p).getByLabel('Workout log',{exact:true}).selectOption('second');assert.match(await panel(p).locator('.health-lift-trend-day').innerText(),/0 kg\n12 reps/);assert.equal(await panel(p).locator('polyline').getAttribute('points'),'50,100');
    await p.evaluate(()=>{window.trendConflicts=state.syncConflicts;state.syncConflicts=[{id:'pending',segments:['boards','history-board','cards','second']}];renderCardsOnly({force:true});});assert.match(await panel(p).locator('.health-lift-trend').innerText(),/Chart paused/);assert.equal(await panel(p).locator('.health-lift-trend-day').count(),0);await p.evaluate(()=>{state.syncConflicts=trendConflicts;});
  });
  await run('six twelve and all recorded days are uncapped and every chart day is reachable at phone width',async p=>{
    const original=await trendDays(p);await p.setViewportSize({width:390,height:844});await open(p);const range=panel(p).getByLabel('Recorded days',{exact:true});assert.equal(await panel(p).locator('.health-lift-trend-day').count(),6);assert.equal(await panel(p).locator('.health-lift-entry').count(),24);
    await range.selectOption('12');assert.equal(await panel(p).locator('.health-lift-trend-day').count(),12);await range.selectOption('all');assert.equal(await panel(p).locator('.health-lift-trend-day').count(),24);assert.equal(await panel(p).locator('figcaption').innerText(),'24 of 24 recorded days');
    const later=panel(p).getByRole('button',{name:'Later recorded days',exact:true}),earlier=panel(p).getByRole('button',{name:'Earlier recorded days',exact:true});await p.waitForFunction(()=>!document.querySelector('[aria-label="Later recorded days"]').disabled);
    for(let i=0;i<40 && !await later.isDisabled();i++)await later.click();assert(await later.isDisabled());assert(!await earlier.isDisabled());
    const last=panel(p).locator('.health-lift-trend-day').last();await last.scrollIntoViewIfNeeded();assert(await last.evaluate(node=>{const r=node.getBoundingClientRect(),box=node.closest('.health-lift-trend-scroll').getBoundingClientRect();return r.left>=box.left-1 && r.right<=box.right+1 && r.width>=44 && r.height>=44 && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===node;}));
    for(let i=0;i<40 && !await earlier.isDisabled();i++)await earlier.click();assert(await earlier.isDisabled());assert.equal(await panel(p).locator('.health-lift-trend-scroll').evaluate(node=>node.scrollLeft),0);
    for(const width of [1440,1080,768,390,320]){await p.setViewportSize({width,height:844});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const sizes=await panel(p).locator('.health-lift-trend-day').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height,scroll:node.scrollWidth,client:node.clientWidth,text:node.innerText};}));assert(sizes.every(r=>r.width>=44 && r.height>=44 && r.scroll<=r.client),JSON.stringify({width,sizes}));}
    await restoreDays(p,original);
  });
  await run('range and chart scroll remain page local survive redraw and never stage record saves',async p=>{
    const original=await trendDays(p);await p.setViewportSize({width:390,height:844});await open(p);await p.evaluate(()=>{window.trendStages=0;window.trendStage=LifeDeviceStore.stage;LifeDeviceStore.stage=(...args)=>{trendStages++;return trendStage(...args);};});
    const range=panel(p).getByLabel('Recorded days',{exact:true});await range.selectOption('all');await p.waitForFunction(()=>!document.querySelector('[aria-label="Later recorded days"]').disabled);await panel(p).getByRole('button',{name:'Later recorded days',exact:true}).click();
    const left=await panel(p).locator('.health-lift-trend-scroll').evaluate(node=>node.scrollLeft);assert(left>0);await range.focus();await p.evaluate(()=>renderCardsOnly({force:true}));await p.waitForFunction(left=>Math.abs(document.querySelector('.health-lift-trend-scroll').scrollLeft-left)<2,left);assert(await range.evaluate(node=>node===document.activeElement));assert.equal(await range.inputValue(),'all');
    await p.evaluate(()=>{renderCardsOnly({force:true});const scroll=document.querySelector('.health-lift-trend-scroll');scroll.dispatchEvent(new Event('wheel'));scroll.scrollLeft=0;scroll.dispatchEvent(new Event('scroll'));});await p.waitForTimeout(50);assert.equal(await panel(p).locator('.health-lift-trend-scroll').evaluate(node=>node.scrollLeft),0);await p.evaluate(()=>flushDeviceWrites());assert.equal(await p.evaluate(()=>trendStages),0);await restoreDays(p,original);
  });
  await run('chart day opens only the original workout and captured links refuse a changed board',async p=>{
    await open(p);const points=panel(p).locator('.health-lift-trend-day');await points.first().click();assert.equal(await p.getByLabel('Workout date',{exact:true}).inputValue(),'2026-10-30');assert.equal(await p.getByLabel('Log',{exact:true}).inputValue(),'gym');
    await p.getByRole('button',{name:'Training history',exact:true}).click();const refused=await points.first().evaluate(button=>{switchBoard('other');const before=JSON.stringify(state.cards);button.click();return JSON.stringify(state.cards)===before;});assert(refused);await p.evaluate(()=>switchBoard('history-board'));await workspace(p,'health');
  });
  await run('trend screenshots retain compact headings chart labels and reachable controls on desktop and phone',async p=>{
    const original=await trendDays(p);await open(p);
    for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
      await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await panel(p).getByLabel('Recorded days',{exact:true}).selectOption('6');await p.evaluate(()=>{document.querySelector('.health-lift-history>summary').scrollIntoView();window.scrollBy(0,-12);});
      if(width<700){await p.waitForFunction(()=>!document.querySelector('[aria-label="Later recorded days"]').disabled);const later=panel(p).getByRole('button',{name:'Later recorded days',exact:true});for(let i=0;i<8 && !await later.isDisabled();i++)await later.click();await p.evaluate(()=>document.querySelector('.health-lift-trend').scrollIntoView({block:'center'}));}
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await panel(p).locator('.health-lift-trend-day').count(),6);assert.equal(await panel(p).locator('polyline').evaluate(node=>node.getBBox().width>0 && !/NaN|Infinity/.test(node.getAttribute('points'))),true);await p.screenshot({path:out+'/trend-'+name+'.png'});
    }
    await restoreDays(p,original);
  });
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(result=>!result.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
