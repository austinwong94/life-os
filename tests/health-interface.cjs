const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-health-interface';
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Use disposable profiles on a local server only');
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const untouched=p=>p.evaluate(()=>JSON.stringify({other:state.boards[1],archive:state.archivedCards,oldFitness:state.cards[0].fitnessEntries['2026-09-15'],oldFood:state.cards[1].foodEntries['2026-09-15'],oldTargets:state.cards[1].foodTargets['2026-09']}));
  const seed=p=>p.evaluate(async()=>{
    const fitness=makeCard({type:'fitness',title:'Movement',category:'Health'});fitness.id='health-workout';fitness.activeFitnessDate='2026-10-16';fitness.activeFitnessPart='chest';
    fitness.fitnessEntries={'2026-10-16':normalizeFitnessEntry({updatedAt:1792123200000,parts:{running:{active:true,distanceKm:5,durationMinutes:30},chest:{active:true,exercises:[{id:'bench',name:'Incline dumbbell press',sets:3,reps:'10-12',weightKg:12.75,rpe:7}]}},metrics:{weightKg:72.35,heightCm:175}}),
      '2026-09-15':normalizeFitnessEntry({parts:{running:{active:true,distanceKm:3,durationMinutes:20}},notes:'An older workout.\nEvery original line.'})};
    const food=makeCard({type:'food',title:'Food & nutrition',category:'Health'});food.id='health-food';food.activeFoodDate='2026-10-16';
    const egg=food.foodLibrary.find(f=>f.name==='Egg'),rice=food.foodLibrary.find(f=>f.id==='rice-white-cooked');
    food.foodEntries={'2026-10-16':normalizeFoodEntry({updatedAt:1792123200000,meals:[{id:'breakfast',name:'Breakfast',items:[{id:'egg',foodId:egg.id,amount:2,unit:'serving',...createFoodItemSnapshot(egg)}]},
      {id:'lunch',name:'Lunch',items:[{id:'rice',foodId:rice.id,amount:150,unit:'g',...createFoodItemSnapshot(rice)}]},{id:'dinner',name:'Dinner',items:[]}]}),
      '2026-09-15':normalizeFoodEntry({meals:[{id:'older-meal',name:'An earlier meal',items:[{id:'old-egg',foodId:egg.id,amount:1,unit:'serving',...createFoodItemSnapshot(egg)}]}]})};
    food.activeFoodMealId='breakfast';food.foodTargets['2026-09']={...DEFAULT_FOOD_TARGETS,calories:1800};food.foodTargets['2026-10']={...DEFAULT_FOOD_TARGETS,calories:2200};
    const diary=makeCard({type:'diary',title:'Private writing',diaryEntries:{'2026-09-15':{thoughts:'Do not change this.\nOr its second line.',sentence:'Kept in full',updatedAt:1}}});
    state.boards=[createBoardRecord({id:'health',name:'Health',cards:[fitness,food],archivedCards:[diary]}),createBoardRecord({id:'other',name:'Another board',cards:[makeCard({type:'sidenote',title:'Separate notes'})]})];
    applyBoardToState(state,'health');sessionStorage.setItem(LifeStorageScope.key('life-os-active-board'),'health');state.ui.workspaceMode='board';state.board.columnCount=3;
    saveState({skipCloud:true});await flushDeviceWrites();render();
  });
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'External services blocked in synthetic tests'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.stack));
    await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await seed(p);const original=await untouched(p);await fn(p);assert.deepEqual(errors,[]);assert.equal(await untouched(p),original);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('health cards fit two and three columns on phone, tablet, portrait and desktop without truncating fields or nutrients',async p=>{
    const records=await p.evaluate(()=>JSON.stringify(state.cards.map(c=>[c.fitnessEntries,c.foodEntries,c.foodLibrary,c.foodTargets])));
    for(const columns of [2,3]){
      await p.evaluate(columns=>{state.board.columnCount=columns;renderCardsOnly({force:true});},columns);
      for(const width of [320,390,768,1080,1440]){
        await p.setViewportSize({width,height:width<=390?844:1100});await p.waitForTimeout(220);
        const report=await p.evaluate(()=>{
          const issues=[];
          for(const el of document.querySelectorAll('.fitness-log input,.fitness-log button,.fitness-log summary,.food-tracker input,.food-tracker button,.food-tracker summary,.food-macro,.food-meal-summary span,.food-chip-row button span')){
            const r=el.getBoundingClientRect();if(!r.width || !r.height)continue;
            if(el.closest('.food-meal-tabs') || el.closest('.food-meal-name-presets'))continue;
            const card=el.closest('.task-card').getBoundingClientRect();
            if(r.left<card.left || r.right>card.right+1)issues.push({type:'outside card',text:el.textContent});
            if(el.scrollWidth>el.clientWidth+1 && !['INPUT','SUMMARY'].includes(el.tagName))issues.push({type:'truncated',text:el.textContent});
            if(innerWidth<=980 && ['INPUT','BUTTON','SUMMARY'].includes(el.tagName) && r.height<43.9)issues.push({type:'small touch target',height:r.height,text:el.textContent});
          }
          return {issues,overflow:document.documentElement.scrollWidth>innerWidth+1,parts:document.querySelectorAll('.fitness-parts button').length};
        });
        assert.deepEqual(report.issues,[],JSON.stringify({width,columns,report}));assert(!report.overflow);assert.equal(report.parts,9);
        await p.screenshot({path:out+'/board-'+columns+'-'+width+'.png',fullPage:false});
      }
    }
    assert.equal(await p.evaluate(()=>JSON.stringify(state.cards.map(c=>[c.fitnessEntries,c.foodEntries,c.foodLibrary,c.foodTargets]))),records);
    await p.setViewportSize({width:1440,height:1100});await p.evaluate(()=>{state.board.columnCount=2;renderCardsOnly({force:true});});
    await p.locator('.food-add-food-panel > summary').click();await p.locator('.food-meal-details > summary').click();
    await p.screenshot({path:out+'/compact-desktop.png',fullPage:false});
    await p.setViewportSize({width:390,height:844});await p.waitForTimeout(220);await p.screenshot({path:out+'/compact-phone.png',fullPage:true});
  });
  await run('multiline workout and session notes retain indentation through typing, part switches, reload and readable exports',async p=>{
    await p.setViewportSize({width:390,height:844});
    const notes='  First sample thought.\n\tSecond sample line.\n',session='  A complete session note.\nAnother line, kept exactly.\n';
    await p.locator('.fitness-active .fitness-notes-panel > summary').click();await p.getByLabel('Chest notes',{exact:true}).fill(notes);
    await p.getByRole('button',{name:'Running',exact:true}).click();await p.locator('.fitness-active .fitness-notes-panel > summary').click();await p.getByLabel('Running notes',{exact:true}).fill(notes);
    await p.locator('.fitness-metrics > summary').click();await p.locator('.fitness-metrics .fitness-notes-panel > summary').click();await p.getByLabel('Session notes',{exact:true}).fill(session);await p.locator('.fitness-metrics > summary').click();
    await p.getByRole('button',{name:'Chest',exact:true}).click();assert.equal(await p.getByLabel('Chest notes',{exact:true}).inputValue(),notes);assert.equal(await p.locator('.fitness-metrics').getAttribute('open'),null);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.getByLabel('Chest notes',{exact:true}).inputValue(),notes);
    await p.getByRole('button',{name:'Running',exact:true}).click();assert.equal(await p.getByLabel('Running notes',{exact:true}).inputValue(),notes);
    await p.locator('.fitness-metrics > summary').click();assert.equal(await p.getByLabel('Session notes',{exact:true}).inputValue(),session);
    const html=await p.evaluate(()=>buildReadableDataArchive(getStateForStorage()));assert.ok(html.includes(notes));assert.ok(html.includes(session));
    for(const width of [320,390,1080]){await p.setViewportSize({width,height:844});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.getByLabel('Session notes',{exact:true}).scrollIntoViewIfNeeded();assert.ok(await p.getByLabel('Session notes',{exact:true}).evaluate(e=>e.value.includes('\n') && e.getBoundingClientRect().right<=innerWidth));await p.screenshot({path:out+'/multiline-notes-'+width+'.png'});}
  });
  await run('multi-digit workout edits retain focus, metric disclosure and historical records through navigation and reload',async p=>{
    await p.setViewportSize({width:390,height:844});const metrics=p.locator('.fitness-metrics');await metrics.locator(':scope > summary').click();
    const weight=p.getByLabel('Weight (kg)',{exact:true});await weight.fill('');await weight.pressSequentially('71.25',{delay:60});assert.equal(await weight.inputValue(),'71.25');
    await metrics.locator(':scope > summary').click();await p.getByRole('button',{name:'Running',exact:true}).click();
    const km=p.locator('.fitness-active').getByLabel('Km',{exact:true});await km.fill('');await km.pressSequentially('10.25',{delay:60});assert(await km.evaluate(e=>e===document.activeElement));
    await p.waitForTimeout(1200);assert.equal(await km.inputValue(),'10.25');assert.equal(await p.locator('.fitness-pace').innerText(),'2.9 min/km');
    await p.getByRole('button',{name:'Chest',exact:true}).click();assert.equal(await metrics.getAttribute('open'),null);
    await p.getByRole('button',{name:'Add exercise',exact:true}).click();assert.equal(await p.locator('.fitness-exercise-row').count(),2);
    const last=p.locator('.fitness-exercise-row').last();await last.getByLabel('Exercise',{exact:true}).fill('Cable fly with a full descriptive name');await last.getByLabel('Kg',{exact:true}).fill('8.75');
    await last.getByTitle('Remove exercise',{exact:true}).click();assert.equal(await p.locator('.fitness-exercise-row').count(),1);
    await p.locator('.fitness-day-overview > summary').click();assert.match(await p.locator('.fitness-summary-strip').innerText(),/10.3 km/);
    await workspace(p,'today');await workspace(p,'board');await p.evaluate(()=>flushDeviceWrites());await p.reload();
    assert.equal(await metrics.getAttribute('open'),null);await p.getByRole('button',{name:'Running',exact:true}).click();assert.equal(await p.getByLabel('Km',{exact:true}).inputValue(),'10.25');
    const totals=await p.evaluate(()=>getFitnessReportTotals(collectFitnessSessions({startKey:'2026-10-16',endKey:'2026-10-16'})));
    assert.equal(totals.runningKm,10.25);assert.equal(totals.strengthSets,3);
    assert.equal(await p.evaluate(()=>state.cards[0].fitnessEntries['2026-10-16'].metrics.weightKg),71.25);
  });
  await run('eight meals work with keyboard selection, portion conversion, rename and removal while reports retain the same source',async p=>{
    await p.setViewportSize({width:390,height:844});
    const baseline=await p.evaluate(()=>getFoodEntryTotals(state.cards[1],getFoodEntry(state.cards[1])));
    await p.getByLabel('Egg unit',{exact:true}).selectOption('g');assert.equal(await p.getByLabel('Egg amount',{exact:true}).inputValue(),'100');
    await p.getByLabel('Egg unit',{exact:true}).selectOption('serving');assert.equal(await p.getByLabel('Egg amount',{exact:true}).inputValue(),'2');
    assert.deepEqual(await p.evaluate(()=>getFoodEntryTotals(state.cards[1],getFoodEntry(state.cards[1]))),baseline);
    for(let i=4;i<=8;i++){await p.getByRole('button',{name:'Add meal',exact:true}).click();await p.getByLabel('Custom meal name',{exact:true}).fill('Meal '+i);await p.getByTitle('Add custom meal',{exact:true}).click();}
    assert.equal(await p.getByRole('tab',{selected:true}).count(),1);let selected=p.locator('.food-meal-tabs [aria-selected=true]');await selected.press('Home');
    assert.match(await selected.innerText(),/Breakfast/);await selected.press('End');assert.match(await selected.innerText(),/Meal 8/);assert(await selected.evaluate(e=>e===document.activeElement));
    await selected.press('ArrowLeft');assert.match(await selected.innerText(),/Meal 7/);await selected.press('ArrowRight');
    await p.getByLabel('Meal name',{exact:true}).fill('Late snack');await p.getByLabel('Meal name',{exact:true}).press('Tab');assert.match(await selected.innerText(),/Late snack/);
    assert.deepEqual(await p.locator('.food-meal-header datalist option').evaluateAll(nodes=>nodes.map(node=>node.value)),['Breakfast','Brunch','Lunch','Dinner','Supper']);
    await p.locator('.food-chip-row').getByRole('button',{name:'Egg',exact:true}).click();await p.getByLabel('Egg amount',{exact:true}).fill('2');await p.evaluate(()=>flushDeviceWrites());await p.waitForTimeout(1200);await p.getByLabel('Egg amount',{exact:true}).pressSequentially('.5',{delay:60});
    assert.equal(await p.getByLabel('Egg amount',{exact:true}).inputValue(),'2.5');await p.getByLabel('Egg amount',{exact:true}).press('Tab');
    const summary=await p.locator('.food-meal-summary').innerText();for(const label of ['Calories','Protein','Carbs','Fat','Fiber'])assert(summary.includes(label));assert(summary.includes('195 kcal'));
    assert.equal(await p.evaluate(()=>getActiveFoodMeal(state.cards[1],getFoodEntry(state.cards[1])).items[0].amount),2.5);
    await p.getByLabel('Remove Egg',{exact:true}).click();assert.equal(await p.locator('.food-item-row').count(),0);
    await p.getByTitle('Remove meal',{exact:true}).click();assert.equal(await p.locator('.food-meal-tabs [role=tab]').count(),7);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();
    assert.equal(await p.locator('.food-meal-tabs [role=tab]').count(),7);
    assert.deepEqual(await p.evaluate(()=>collectFoodReportDays({startKey:'2026-10-16',endKey:'2026-10-16'})[0].consumed),baseline);
  });
  await run('library entries expand individually and edits never rewrite previously logged nutrition',async p=>{
    const before=await p.evaluate(()=>JSON.stringify(state.cards[1].foodEntries));await p.locator('.food-library-panel > summary').click();
    assert.equal(await p.locator('.food-library-row[open]').count(),0);
    const egg=p.locator('.food-library-row').filter({has:p.getByText('Egg',{exact:true})});
    await egg.locator(':scope > summary').click();await egg.getByLabel('kcal per serving',{exact:true}).fill('90');await egg.getByLabel('Protein g',{exact:true}).fill('8.2');
    await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.locator('.food-library-row[open]').count(),1);
    assert.equal(await egg.getByLabel('kcal per serving',{exact:true}).inputValue(),'90');assert.equal(await egg.getByLabel('Protein g',{exact:true}).inputValue(),'8.2');
    await p.getByRole('button',{name:'Add custom food',exact:true}).click();const custom=p.locator('.food-library-row[open]');assert.equal(await custom.count(),1);
    await custom.getByLabel('Food name',{exact:true}).fill('My protein shake');await custom.getByLabel('Food name',{exact:true}).press('Tab');assert(await custom.getByLabel('Serving label',{exact:true}).isVisible());
    await custom.getByLabel('Serving label',{exact:true}).fill('scoop');await custom.getByLabel('g per serving',{exact:true}).fill('30');await custom.getByLabel('kcal per serving',{exact:true}).fill('120');
    await custom.getByLabel('Protein g',{exact:true}).fill('25');await p.evaluate(()=>flushDeviceWrites());await p.reload();
    assert.equal(await p.locator('.food-library-row[open]').getByLabel('Food name',{exact:true}).inputValue(),'My protein shake');
    assert.equal(await p.evaluate(()=>JSON.stringify(state.cards[1].foodEntries)),before);
  });
  await run('quick disclosure changes survive immediate reload, with no detached-editor save loops',async p=>{
    for(const selector of ['.fitness-metrics','.food-target-panel','.food-library-panel']){
      await p.locator(selector+' > summary').click();await p.reload();assert.equal(await p.locator(selector+'[open]').count(),1);
      await p.locator(selector+' > summary').click();await p.reload();assert.equal(await p.locator(selector+'[open]').count(),0);
    }
    for(const selector of ['.food-add-food-panel','.food-meal-details']){await p.locator(selector+' > summary').click();await p.reload();assert.equal(await p.locator(selector+'[open]').count(),0);}
    const updated=await p.evaluate(async()=>{await flushDeviceWrites();return state.updatedAt;});await p.evaluate(()=>renderCardsOnly({force:true}));await p.waitForTimeout(500);assert.equal(await p.evaluate(()=>state.updatedAt),updated);
  });
  await run('monthly targets retain decimal entry, visible units and earlier month targets without changing any logged food',async p=>{
    await p.setViewportSize({width:320,height:844});const food=p.locator('.type-food'),before=await p.evaluate(()=>JSON.stringify(state.cards[1].foodEntries));
    await food.locator('.food-target-panel > summary').click();const calories=food.getByLabel('Calories (kcal)',{exact:true});
    await calories.fill('');await calories.pressSequentially('2300',{delay:60});assert(await calories.evaluate(e=>e===document.activeElement));
    await food.getByLabel('Protein (g)',{exact:true}).fill('165.5');await food.getByLabel('Protein (g)',{exact:true}).press('Tab');
    await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await food.getByLabel('Calories (kcal)',{exact:true}).inputValue(),'2300');
    assert.equal(await food.getByLabel('Protein (g)',{exact:true}).inputValue(),'165.5');assert.match(await food.locator('.food-calories').innerText(),/2300 kcal/);
    assert.equal(await p.evaluate(()=>JSON.stringify(state.cards[1].foodEntries)),before);
    assert.equal(await p.evaluate(()=>collectFoodReportDays({startKey:'2026-10-16',endKey:'2026-10-16'})[0].target.protein),165.5);
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
