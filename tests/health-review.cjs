const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(out,{recursive:true});const results=[];
async function seed(page,{conflict=true,type='food-item',archived=false}={}) {
  await page.goto(URL+'__test_reset__');await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.goto(URL+'?preview=1');
  await page.evaluate(async({conflict,type,archived})=>{
    const food=makeCard({type:'food',title:'Meals',category:'Health'});food.id='food';
    const rice=food.foodLibrary.find(f=>f.id==='rice-white-cooked');
    food.foodEntries={'2026-09-08':normalizeFoodEntry({meals:[{id:'meal',name:'Lunch',items:[{id:'rice-entry',foodId:rice.id,...createFoodItemSnapshot(rice),amount:100,unit:'g'},{id:'independent',foodId:rice.id,...createFoodItemSnapshot(rice),amount:50,unit:'g'}]}]})};
    food.activeFoodDate='2026-09-08';food.activeFoodMealId='meal';
    const fitness=makeCard({type:'fitness',title:'Workouts',category:'Health'});fitness.id='fitness';fitness.activeFitnessDate='2026-09-08';
    fitness.fitnessEntries={'2026-09-08':normalizeFitnessEntry({parts:{running:{active:true,distanceKm:5,durationMinutes:30},chest:{active:true,exercises:[{id:'bench',name:'Bench press',sets:3,reps:'12',weightKg:20,rpe:7}]}},metrics:{weightKg:70,heightCm:175}})};
    state.boards=[createBoardRecord({id:'health-board',name:'Health',cards:archived?[]:[food,fitness],archivedCards:archived?[{...food,archivedAt:100},{...fitness,archivedAt:100}]:[]}),
      createBoardRecord({id:'personal-board',name:'Personal',cards:[makeCard({type:'diary',title:'My diary',diaryEntries:{'2026-09-08':{thoughts:'Every original line\nStill here',sentence:'A quiet day',feeling:'calm',updatedAt:100}}})]})];
    applyBoardToState(state,'health-board');sessionStorage.setItem('life-os-active-board',state.activeBoardId);saveState({skipCloud:true});await flushDeviceWrites();
    window.healthRecord=(snapshot,recordType=type)=>{
      const cards=[...snapshot.boards[0].cards,...snapshot.boards[0].archivedCards];
      const food=cards.find(c=>c.id==='food'),fitness=cards.find(c=>c.id==='fitness');
      if(recordType==='food-item')return food.foodEntries['2026-09-08'].meals[0].items[0];
      if(recordType==='food-definition')return food.foodLibrary[0];
      if(recordType==='food-target')return food.foodTargets['2026-09'];
      if(recordType==='fitness-exercise')return fitness.fitnessEntries['2026-09-08'].parts.chest.exercises[0];
      if(recordType==='fitness-part')return fitness.fitnessEntries['2026-09-08'].parts.running;
      return fitness.fitnessEntries['2026-09-08'].metrics;
    };
    const changes={
      'food-item':[{amount:200},{amount:1,unit:'serving'}],
      'food-definition':[{servingGrams:50,calories:65},{protein:5}],
      'food-target':[{calories:2000},{protein:160}],
      'fitness-exercise':[{name:'Chest fly'},{weightKg:25}],
      'fitness-part':[{distanceKm:10},{durationMinutes:60}],
      'body-metrics':[{weightKg:80,bmi:26.1},{heightCm:180,bmi:21.6}]
    };
    const base=getStateForStorage();
    if(conflict) {
      Object.assign(window.healthRecord(state),changes[type][0]);reconcileActiveBoard();saveState({skipCloud:true});await flushDeviceWrites();
      const remote=LifeStateMerge.copy(base);Object.assign(window.healthRecord(remote),changes[type][1]);
      state.syncConflicts=LifeStateMerge.registerConflicts(LifeStateMerge.merge(base,getStateForStorage(),remote).conflicts.map(c=>({...c,source:'device'})),{},createId);
      saveState({skipCloud:true});await flushDeviceWrites();
    }
    render();if(conflict)openRecovery();
  },{conflict,type,archived});
}
const current=page=>page.evaluate(()=>LifeStateMerge.copy(window.healthRecord(getStateForStorage())));
async function choose(page,label='Other tab version') {
  await page.getByRole('radio',{name:label,exact:true}).check();
  await page.getByLabel('Apply this version to this entry only.',{exact:true}).check();
  await page.getByRole('button',{name:'Save health version',exact:true}).click();
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  async function run(name,fn) {
    const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'No external services in tests'}));
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.stack));
    try {await fn(page,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,pageErrors:errors});await page.screenshot({path:out+'/health-review-failure-'+results.length+'.png'}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Food comparisons show units and all nutrients; explicit choice, backup and reload preserve other records',async page=>{
    await seed(page);const before=await page.evaluate(()=>({other:JSON.stringify(state.boards[1]),fitness:JSON.stringify(state.cards.find(c=>c.id==='fitness')),independent:JSON.stringify(state.cards[0].foodEntries['2026-09-08'].meals[0].items[1])}));
    const save=page.getByRole('button',{name:'Save health version',exact:true});assert.equal(await save.isDisabled(),true);
    const copies=page.locator('.health-conflict-version');assert.match(await copies.first().innerText(),/200 g/);assert.match(await copies.first().innerText(),/260 kcal/);
    for(const text of ['Calories','Protein','Carbs','Fat','Fiber','100g = 100 g'])assert.ok((await copies.first().innerText()).includes(text));
    await page.getByRole('radio',{name:'Other tab version',exact:true}).check();assert.equal(await save.isDisabled(),true);
    await page.getByLabel('Apply this version to this entry only.',{exact:true}).check();await save.click();await page.getByText(/Health version saved/).waitFor();
    assert.equal((await current(page)).amount,1);assert.equal((await current(page)).unit,'serving');
    const totals=await page.evaluate(()=>{const card=state.cards.find(c=>c.id==='food');return getFoodEntryTotals(card,getFoodEntry(card,'2026-09-08'));});
    assert.equal(totals.calories,195);assert.ok(Math.abs(totals.protein-4.05)<1e-9);
    assert.equal(await page.evaluate(()=>JSON.stringify(state.boards[1])),before.other);assert.equal(await page.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='fitness'))),before.fitness);
    assert.equal(await page.evaluate(()=>JSON.stringify(state.cards[0].foodEntries['2026-09-08'].meals[0].items[1])),before.independent);
    assert.ok(await page.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]).some(copy=>copy.reason==='before-conflict-resolution')));
    await page.reload();assert.equal(await page.evaluate(()=>state.cards.find(c=>c.id==='food').foodEntries['2026-09-08'].meals[0].items[0].unit),'serving');assert.equal(await page.evaluate(()=>state.syncConflicts.length),0);
  });
  await run('Exercise, running, measurements, food library and month target versions save with their units intact',async page=>{
    for(const type of ['fitness-exercise','fitness-part','body-metrics','food-definition','food-target']) {
      await seed(page,{type});const expected=await page.evaluate(()=>state.syncConflicts[0].remote);
      await choose(page);await page.getByText(/Health version saved/).waitFor();assert.deepEqual(await current(page),expected);
      const records=await page.evaluate(()=>JSON.stringify(state.boards.map(b=>[b.cards,b.archivedCards])));await page.reload();
      assert.equal(await page.evaluate(()=>JSON.stringify(state.boards.map(b=>[b.cards,b.archivedCards]))),records);
    }
  });
  await run('A newer quantity blocks stale review; refresh clears old choice and consent',async page=>{
    await seed(page);await page.evaluate(async()=>{window.healthRecord(state).amount=250;reconcileActiveBoard();saveState({skipCloud:true});await flushDeviceWrites();});
    await choose(page);await page.getByText(/health record changed after you opened/).waitFor();assert.equal((await current(page)).amount,250);
    await page.getByRole('button',{name:'Refresh comparison',exact:true}).click();await page.getByText(/Current entry refreshed/).waitFor();
    assert.equal(await page.getByRole('radio',{checked:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Save health version',exact:true}).isDisabled(),true);
    await choose(page,'Current entry');await page.getByText(/Health version saved/).waitFor();assert.equal((await current(page)).amount,250);
  });
  await run('Failed backup and primary writes leave the original values and unresolved versions available',async page=>{
    for(const key of ['recovery','primary']){
      await seed(page);const before=await current(page);
      await page.evaluate(key=>{window.nativeSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===(key==='recovery'?CLOUD_RECOVERY_KEY:STORAGE_KEY))throw new DOMException('Injected full storage','QuotaExceededError');return window.nativeSetItem.call(this,name,value);};},key);
      await choose(page);await page.getByText(key==='recovery'?/recovery copy could not be saved/:/choice could not be saved/).waitFor();assert.deepEqual(await current(page),before);assert.equal(await page.evaluate(()=>state.syncConflicts.length),1);
      await page.evaluate(()=>Storage.prototype.setItem=window.nativeSetItem);
    }
  });
  await run('Actual queued two-tab meal edits retain a complete amount and unit, then can be reviewed',async(page,context)=>{
    await seed(page,{conflict:false});const second=await context.newPage();await second.goto(URL+'?preview=1');
    for(const p of [page,second])await p.evaluate(()=>LifeDeviceStore.configure(()=>false));
    await page.evaluate(()=>{const card=state.cards.find(c=>c.id==='food');getFoodEntry(card,'2026-09-08').meals[0].items[0].amount=200;saveFoodCard(card,'2026-09-08');});
    await second.evaluate(()=>{const card=state.cards.find(c=>c.id==='food');Object.assign(getFoodEntry(card,'2026-09-08').meals[0].items[0],{unit:'serving',amount:1});saveFoodCard(card,'2026-09-08');});
    await page.evaluate(async()=>{LifeDeviceStore.configure(commitDeviceWrites);await flushDeviceWrites();openRecovery();});
    const value=await current(page);assert.equal(value.amount===200&&value.unit==='serving',false);assert.equal(await page.locator('.health-conflict-form').count(),1);
    await choose(page);await page.getByText(/Health version saved/).waitFor();assert.equal(await page.evaluate(()=>state.syncConflicts.length),0);
  });
  await run('Review does not overwrite another tab on a different board and old warnings stay resolved',async(page,context)=>{
    await seed(page);const second=await context.newPage();await second.goto(URL+'?preview=1');const old=await second.evaluate(()=>LifeStateMerge.copy(state.syncConflicts));
    await second.evaluate(async()=>{switchBoard('personal-board');state.cards[0].diaryEntries['2026-09-08'].thoughts='Every word from a different tab\nKeep it all';saveState({skipCloud:true});await flushDeviceWrites();});
    await choose(page);await page.getByText(/Health version saved/).waitFor();
    await second.evaluate(async old=>{state.syncConflicts=old;saveState({skipCloud:true});await flushDeviceWrites();},old);
    assert.equal(await second.evaluate(()=>state.syncConflicts.length),0);assert.equal(await second.evaluate(()=>state.cards[0].diaryEntries['2026-09-08'].thoughts),'Every word from a different tab\nKeep it all');
  });
  await run('Archived health data is reviewable; invalid values and moved sources are read-only',async page=>{
    await seed(page,{archived:true});await choose(page);await page.getByText(/Health version saved/).waitFor();assert.equal((await current(page)).unit,'serving');
    await seed(page);await page.evaluate(()=>{state.syncConflicts[0].remote.servingGrams=0;openRecovery();});assert.equal(await page.getByRole('button',{name:'Save health version',exact:true}).count(),0);
    await seed(page);await page.evaluate(()=>{state.boards[1].cards.push(state.boards[0].cards.shift());openRecovery();});assert.equal(await page.getByRole('button',{name:'Save health version',exact:true}).count(),0);
  });
  await run('Health review is readable and clickable on phone, tablet and desktop without rendering input as HTML',async page=>{
    await seed(page);await page.evaluate(()=>{state.syncConflicts[0].remote.name='<img src=x onerror=alert(1)> '+ 'A long food name '.repeat(12);openRecovery();});assert.equal(await page.locator('.health-conflict-version img').count(),0);
    await seed(page);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});await page.locator('.health-conflict-item').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.recovery-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
      assert.equal(await page.locator('.health-conflict-version').evaluateAll(nodes=>nodes.every(e=>e.scrollWidth<=e.clientWidth+1)),true);
      await page.getByRole('radio',{name:'Other tab version',exact:true}).check();await page.getByLabel('Apply this version to this entry only.',{exact:true}).check();
      const save=page.getByRole('button',{name:'Save health version',exact:true});await save.scrollIntoViewIfNeeded();
      assert.equal(await save.evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
      await page.screenshot({path:out+'/health-review-'+width+'.png'});
    }
  });
  fs.writeFileSync(out+'/health-review-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(result=>!result.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
