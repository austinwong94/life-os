const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-meal-reuse';
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname));fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const food=p=>p.locator('.task-card[data-id="reuse-food"]'),dialog=p=>p.getByRole('dialog',{name:'Reuse a logged meal',exact:true});
  const data=p=>p.evaluate(()=>LifeStateMerge.copy({entries:state.cards.find(c=>c.id==='reuse-food').foodEntries,targets:state.cards.find(c=>c.id==='reuse-food').foodTargets,library:state.cards.find(c=>c.id==='reuse-food').foodLibrary,archive:state.archivedCards,other:state.boards.find(b=>b.id==='reuse-other')}));
  const open=async p=>{const reuse=food(p).getByRole('button',{name:'Reuse a logged meal',exact:true});if(!await reuse.isVisible())await food(p).getByRole('button',{name:'Add meal',exact:true}).click();await reuse.click();};
  async function run(name,fn,options={}){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur',...options});await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic meal reuse checks; cloud blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.stack));await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{
      await p.goto(url+'?preview=1&liveReload=0');await p.evaluate(async()=>{
        const food=makeCard({type:'food',title:'My food'});food.id='reuse-food';food.activeFoodDate='2026-10-16';
        const egg=food.foodLibrary.find(f=>f.name==='Egg'),rice=food.foodLibrary.find(f=>f.id==='rice-white-cooked');
        const oldEgg={id:'old-egg',foodId:egg.id,amount:2,unit:'serving',...createFoodItemSnapshot(egg)},oldRice={id:'old-rice',foodId:rice.id,amount:100,unit:'g',...createFoodItemSnapshot(rice)};
        food.foodEntries={'2026-10-15':normalizeFoodEntry({meals:[{id:'past-breakfast',name:'Breakfast',items:[oldEgg,oldRice]}],updatedAt:1}),
          '2026-10-14':normalizeFoodEntry({meals:[{id:'past-lunch',name:'Lunch',items:[{...oldEgg,id:'older-egg',amount:1}]}],updatedAt:2}),
          '2026-10-16':normalizeFoodEntry({meals:[{id:'today-breakfast',name:'Breakfast',items:[{...oldRice,id:'current-rice',amount:50}]},{id:'today-dinner',name:'Dinner',items:[]}],updatedAt:3})};
        egg.calories=999;food.activeFoodMealId='today-breakfast';food.foodTargets={'2026-09':{...DEFAULT_FOOD_TARGETS,calories:1800},'2026-10':{...DEFAULT_FOOD_TARGETS,calories:2200}};
        const diary=makeCard({type:'diary',title:'My diary'});diary.id='reuse-diary';diary.diaryEntries={'2026-10-10':{thoughts:'All of my older writing\nBoth lines remain.',updatedAt:1}};
        state.boards=[createBoardRecord({id:'reuse-board',name:'My records',cards:[food,diary],archivedCards:[]}),createBoardRecord({id:'reuse-other',name:'Another board',cards:[makeCard({type:'sidenote',title:'Independent notes'})]})];
        applyBoardToState(state,'reuse-board');sessionStorage.setItem(LifeStorageScope.key('life-os-active-board'),state.activeBoardId);state.ui.workspaceMode='board';saveState();await flushDeviceWrites();render();
      });await workspace(p,'board');await p.evaluate(()=>flushDeviceWrites());await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('preview and cancel are read-only and show the stored portions and all five nutrients',async p=>{
    const before=await data(p);await open(p);assert.equal(await dialog(p).getByLabel('Recorded date',{exact:true}).inputValue(),'2026-10-15');
    const text=await dialog(p).innerText();for(const value of ['Egg','Rice','Calories','Protein','Carbs','Fat','Fiber','286 kcal'])assert(text.includes(value),text);
    await dialog(p).getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await data(p),before);
  });
  await run('reuse creates a separate meal with frozen original nutrition, survives reload and reaches reports',async p=>{
    const before=await data(p);await open(p);await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());
    const after=await data(p),meals=after.entries['2026-10-16'].meals;assert.equal(meals.length,3);assert.equal(meals[2].name,'Breakfast 2');assert.equal(meals[2].items[0].calories,78);
    assert.notEqual(meals[2].id,'past-breakfast');assert.notEqual(meals[2].items[0].id,'old-egg');assert.deepEqual(after.entries['2026-10-15'],before.entries['2026-10-15']);
    assert.deepEqual(after.targets,before.targets);assert.deepEqual(after.library,before.library);assert.deepEqual(after.other,before.other);assert.deepEqual(after.archive,before.archive);
    assert.deepEqual(meals.slice(0,2),before.entries['2026-10-16'].meals);await p.reload();await workspace(p,'board');
    assert.equal(await food(p).getByLabel('Meal name',{exact:true}).inputValue(),'Breakfast 2');assert.equal(await p.evaluate(()=>collectFoodReportDays({startKey:'2026-10-16',endKey:'2026-10-16'})[0].consumed.calories),351);
  });
  await run('failed saves add nothing, retain the preview and retry without duplicate meals',async p=>{
    await open(p);const before=await data(p);await p.evaluate(()=>{window.reuseStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new DOMException('Full','QuotaExceededError');};});
    await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();assert.match(await dialog(p).locator('[role=status]').innerText(),/Not saved/);assert.deepEqual(await data(p),before);
    await p.evaluate(()=>LifeDeviceStore.stage=reuseStage);await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='reuse-food').foodEntries['2026-10-16'].meals.length),3);
  });
  await run('Undo removes only the new meal and retains all previous logs after reload',async p=>{
    const before=await data(p);await open(p);await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();await p.locator('#undoToastButton').click();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.deepEqual(await data(p),before);
  });
  await run('source and destination edits after preview refuse stale additions instead of replacing either edit',async p=>{
    for(const source of [true,false]){
      await open(p);await p.evaluate(async source=>{const card=state.cards.find(c=>c.id==='reuse-food');if(source)card.foodEntries['2026-10-15'].meals[0].items[0].amount=3;else card.foodEntries['2026-10-16'].meals[0].name='My newer name';saveState();await flushDeviceWrites();},source);
      const before=await data(p);await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();assert.match(await dialog(p).locator('[role=status]').innerText(),/changed/);assert.deepEqual(await data(p),before);await dialog(p).getByRole('button',{name:'Cancel',exact:true}).click();
    }
  });
  await run('board switches and unresolved comparisons cannot put a reused meal on the wrong record',async p=>{
    await open(p);await p.evaluate(()=>switchBoard('reuse-other'));await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();assert.match(await dialog(p).locator('[role=status]').innerText(),/board changed/);assert.equal(await p.evaluate(()=>state.cards.filter(c=>c.type==='food').length),0);
    await dialog(p).getByRole('button',{name:'Cancel',exact:true}).click();await p.evaluate(()=>switchBoard('reuse-board'));await workspace(p,'board');await open(p);
    await p.evaluate(()=>{state.syncConflicts=[{id:'review-meal',segments:['boards','reuse-board','cards','reuse-food','foodEntries','2026-10-15']}];});const before=await data(p);
    await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();assert.match(await dialog(p).locator('[role=status]').innerText(),/conflicting/);assert.deepEqual(await data(p),before);
  });
  await run('phone and desktop preview has readable nutrients, keyboard-selectable dates and no overflow',async p=>{
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:width<500?844:1100});await open(p);const modal=dialog(p);
      assert(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const dates=modal.getByLabel('Recorded date',{exact:true});await dates.selectOption('2026-10-14');assert.match(await modal.locator('.food-reuse-items').innerText(),/1 egg/);
      const sizes=await modal.locator('button,select').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height};})),minimum=width<=980?43.9:35.9;assert(sizes.every(r=>r.h>=minimum && r.w>=minimum),JSON.stringify({width,sizes}));
      await p.screenshot({path:out+'/preview-'+width+'.png',fullPage:false});await modal.getByRole('button',{name:'Cancel',exact:true}).click();
    }
  });
  await run('a complete paused diary draft survives opening, adding a reused meal and reloading',async p=>{
    const text='My whole thought is still here.\nNot only its first character.';await p.getByLabel('Diary thoughts',{exact:true}).fill(text);await open(p);await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'board');assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
  });
  await run('failed Undo preserves the added meal, and stale Undo cannot erase a later quantity edit',async p=>{
    await open(p);await dialog(p).getByRole('button',{name:'Add meal',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());const saved=await data(p);
    await p.evaluate(()=>{window.reuseUndo=pendingUndoAction;window.reuseStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new DOMException('Full','QuotaExceededError');};});
    await p.locator('#undoToastButton').click();assert.deepEqual(await data(p),saved);assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);
    await p.evaluate(async()=>{LifeDeviceStore.stage=reuseStage;const card=state.cards.find(c=>c.id==='reuse-food');card.foodEntries['2026-10-16'].meals.at(-1).items[0].amount=3;saveState();await flushDeviceWrites();});
    const changed=await data(p);await p.evaluate(()=>reuseUndo());assert.deepEqual(await data(p),changed);assert.match(await p.locator('#headerSaveStatus').innerText(),/Undo was not applied/);
  });
  await run('a card without logged food offers a non-destructive empty state',async p=>{
    await p.evaluate(async()=>{const card=state.cards.find(c=>c.id==='reuse-food');for(const entry of Object.values(card.foodEntries))for(const meal of entry.meals)meal.items=[];saveState();await flushDeviceWrites();renderCardsOnly({force:true});});
    const before=await data(p);await open(p);assert.match(await dialog(p).innerText(),/No logged meals/);assert.equal(await dialog(p).getByRole('button',{name:'Add meal',exact:true}).count(),0);await dialog(p).getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(await data(p),before);
  });
  await run('touch-tablet controls stay large and long meal names remain readable inert text',async p=>{
    const name='<img src=x onerror=alert(1)> A long recorded breakfast name that must wrap without widening the dialog';
    await p.evaluate(async name=>{state.cards.find(c=>c.id==='reuse-food').foodEntries['2026-10-15'].meals[0].name=name;saveState();await flushDeviceWrites();},name);
    await open(p);const modal=dialog(p);assert.match(await modal.locator('.food-reuse-preview h3').innerText(),/A long recorded breakfast/);assert.equal(await modal.locator('img').count(),0);
    const overflow=await modal.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,children:[...el.querySelectorAll('*')].filter(n=>n.getClientRects().length).map(n=>({tag:n.tagName,class:n.className,scroll:n.scrollWidth,client:n.clientWidth,width:n.getBoundingClientRect().width})).filter(n=>n.scroll>n.client+1),selects:[...el.querySelectorAll('select')].map(n=>({width:n.getBoundingClientRect().width,cssWidth:getComputedStyle(n).width,maxWidth:getComputedStyle(n).maxWidth,fieldDisplay:getComputedStyle(n.parentElement).display,fieldOverflow:getComputedStyle(n.parentElement).overflowX}))}));assert(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));
    const sizes=await modal.locator('button,select').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height};}));assert(sizes.every(r=>r.w>=43.9 && r.h>=43.9),JSON.stringify(sizes));
    await p.screenshot({path:out+'/touch-tablet.png',fullPage:false});
  },{viewport:{width:1080,height:844},hasTouch:true,isMobile:true});
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
