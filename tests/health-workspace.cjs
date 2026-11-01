const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright'),{workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-health-workspace';
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Use isolated local test profiles');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const preserved=p=>p.evaluate(()=>JSON.stringify({old:state.cards.find(c=>c.id==='workout').fitnessEntries['2026-10-29'],diary:state.cards.find(c=>c.type==='diary'),other:state.boards.find(b=>b.id==='other')}));
  async function run(name,fn,{prepare}={}){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'Asia/Kuala_Lumpur'}),p=await context.newPage(),errors=[];
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'Synthetic acceptance only; no private services'}));p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-31T04:00:00Z'));
    try{
      await p.goto(url+'?preview=1&liveReload=0');
      await p.evaluate(async()=>{
        const card=makeCard({type:'fitness',title:'Gym log'});card.id='workout';card.activeFitnessDate='2026-10-31';card.activeFitnessPart='chest';
        card.fitnessEntries=Object.fromEntries(['2026-10-29','2026-10-31'].map(day=>[day,normalizeFitnessEntry({updatedAt:1793419200000,parts:{chest:{active:true,exercises:[{id:'bench-'+day,name:'Bench press',sets:3,reps:'10',weightKg:day==='2026-10-29'?12.5:15,rpe:7,originalExtension:'keep'}]}},notes:'Every original line\nSecond line'})]));
        const food=makeCard({type:'food',title:'Nutrition log'});food.id='food';food.activeFoodDate='2026-10-31';
        const diary=makeCard({type:'diary',title:'Private diary',diaryEntries:{'2026-10-01':{thoughts:'Original diary\nDo not replace',updatedAt:1}}});
        state.boards=[createBoardRecord({id:'health-board',name:'Sample wellbeing',cards:[card,food,diary]}),createBoardRecord({id:'other',name:'Separate board',cards:[makeCard({type:'quote',quote:'Retain all original information'})]})];switchBoard('health-board');await flushDeviceWrites();
      });
      if(prepare)await prepare(p);const original=await preserved(p);await fn(p);assert.equal(await preserved(p),original);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Health opens on desktop and mobile and reuses original logs without creating cards or copying history',async p=>{
    const count=await p.evaluate(()=>state.cards.length);
    for(const width of [1440,1080,768,390,320]){
      await p.setViewportSize({width,height:1000});await workspace(p,'health');await p.getByRole('heading',{name:'Health',exact:true}).waitFor();
      assert.match(await p.locator('.fitness-previous').innerText(),/12.5 kg/);assert.equal(await p.evaluate(()=>state.cards.length),count);
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const bounds=await p.locator('.health-workspace-editor input,.health-workspace-editor button,.health-workspace-editor summary,.health-workspace-tabs button').evaluateAll(nodes=>nodes.filter(node=>{
        if(!node.getClientRects().length)return false;
        for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(node))return false;
        return true;
      }).map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,width:r.width,text:node.getAttribute('aria-label') || node.textContent};}));
      const minimum=width<=980?43.9:35.9;
      assert(bounds.every(r=>r.left>=0 && r.right<=width+1 && r.height>=minimum && r.width>=minimum),JSON.stringify({width,bounds}));
      await p.screenshot({path:out+'/health-'+width+'.png',fullPage:width>700});
      await p.getByRole('button',{name:'Training history',exact:true}).click();assert.equal(await p.locator('.health-history-row').count(),2);await p.getByRole('button',{name:'Workout',exact:true}).click();
    }
  });
  await run('multi-digit gym entry stays focused and survives Food, board navigation and reload on the same source ID',async p=>{
    await p.setViewportSize({width:390,height:844});await workspace(p,'health');
    const weight=p.getByLabel('Kg',{exact:true});await weight.fill('');await weight.pressSequentially('22.75',{delay:50});assert(await weight.evaluate(node=>node===document.activeElement));assert.equal(await weight.inputValue(),'22.75');
    await p.getByRole('button',{name:'Food',exact:true}).click();assert(await p.locator('.food-tracker').isVisible());await p.getByRole('button',{name:'Workout',exact:true}).click();assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'22.75');
    await workspace(p,'board');assert.equal(await p.locator('[data-id="workout"]').getByLabel('Kg',{exact:true}).inputValue(),'22.75');await workspace(p,'health');await p.evaluate(()=>flushDeviceWrites());await p.reload();
    assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'22.75');assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='workout').fitnessEntries['2026-10-31'].parts.chest.exercises[0].originalExtension),'keep');
  });
  await run('inactive workout parts stay reachable under Add without losing active work or reopening body metrics',async p=>{
    await p.setViewportSize({width:390,height:844});await workspace(p,'health');assert.equal(await p.getByRole('button',{name:'Running',exact:true}).isVisible(),false);
    await p.locator('.health-part-picker>summary').click();await p.evaluate(()=>renderCardsOnly({reason:'device-commit'}));
    assert(await p.locator('.health-part-picker>summary').evaluate(node=>node===document.activeElement));assert(await p.getByRole('button',{name:'Running',exact:true}).isVisible());
    await p.getByRole('button',{name:'Running',exact:true}).click();assert(await p.getByLabel('Km',{exact:true}).isVisible());
    await p.getByLabel('Km',{exact:true}).fill('5.25');await p.locator('.fitness-active').getByLabel('Minutes',{exact:true}).fill('32');await p.getByRole('button',{name:'Chest',exact:true}).click();assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'15');assert.equal(await p.locator('.fitness-metrics').getAttribute('open'),null);await p.getByRole('button',{name:'Running',exact:true}).click();assert.equal(await p.getByLabel('Km',{exact:true}).inputValue(),'5.25');
  });
  await run('training history opens the original dated log and never edits an earlier workout merely by viewing it',async p=>{
    await workspace(p,'health');await p.getByRole('button',{name:'Training history',exact:true}).click();await p.locator('.health-history-row').last().click();assert.equal(await p.getByLabel('Workout date',{exact:true}).inputValue(),'2026-10-29');assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'12.5');assert.equal(await p.evaluate(()=>state.cards.filter(c=>c.type==='fitness').length),1);
  });
  await run('multiple original workout and food logs keep independent selections and duplicate identities block editing',async p=>{
    await p.evaluate(async()=>{
      const fitness=LifeStateMerge.copy(state.cards.find(card=>card.id==='workout'));fitness.id='workout-two';fitness.title='Second gym log';fitness.fitnessEntries['2026-10-31'].parts.chest.exercises[0].weightKg=55;
      const food=LifeStateMerge.copy(state.cards.find(card=>card.id==='food'));food.id='food-two';food.title='Second nutrition log';state.cards.push(fitness,food);saveState({skipCloud:true});await flushDeviceWrites();
    });await workspace(p,'health');await p.getByLabel('Log',{exact:true}).selectOption('workout-two');assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'55');
    await p.getByRole('button',{name:'Food',exact:true}).click();await p.getByLabel('Log',{exact:true}).selectOption('food-two');await p.getByRole('button',{name:'Workout',exact:true}).click();assert.equal(await p.getByLabel('Log',{exact:true}).inputValue(),'workout-two');assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'55');
    await p.getByRole('button',{name:'Food',exact:true}).click();assert.equal(await p.getByLabel('Log',{exact:true}).inputValue(),'food-two');
    const before=await p.evaluate(()=>{state.cards.push(LifeStateMerge.copy(state.cards.find(card=>card.id==='food-two')));return JSON.stringify(state.cards);});await p.evaluate(()=>renderCardsOnly({force:true}));assert.equal(await p.locator('.food-tracker').count(),0);assert.match(await p.locator('#boardGrid').innerText(),/duplicate identity/);assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)),before);
  });
  await run('empty Health views open the requested log type and preserve an unfinished composer draft',async p=>{
    await p.evaluate(async()=>{for(const card of state.cards)if(['fitness','food'].includes(card.type))card.archivedAt=1793419200000;saveState({skipCloud:true});await flushDeviceWrites();});await workspace(p,'health');
    await p.getByRole('button',{name:'Add Fitness Log',exact:true}).click();assert.equal(await p.evaluate(()=>getSelectedFormType()),'fitness');await p.evaluate(()=>closeCardComposer({reset:true}));
    await p.getByRole('button',{name:'Food',exact:true}).click();await p.getByRole('button',{name:'Add Food Tracker',exact:true}).click();assert.equal(await p.evaluate(()=>getSelectedFormType()),'food');
    await p.evaluate(()=>{setFormType('sidenote');elements.cardTitle.value='Keep my unfinished idea';draftTouched=true;closeCardComposer();});await p.getByRole('button',{name:'Add Food Tracker',exact:true}).click();assert.equal(await p.evaluate(()=>getSelectedFormType()),'sidenote');assert.equal(await p.evaluate(()=>elements.cardTitle.value),'Keep my unfinished idea');
  });
  await run('an open workout row edits and removes its original exercise ID after the live list is reordered',async p=>{
    await workspace(p,'health');await p.evaluate(()=>flushDeviceWrites());await p.getByLabel('Kg',{exact:true}).focus();
    await p.evaluate(async()=>{const part=state.cards.find(c=>c.id==='workout').fitnessEntries['2026-10-31'].parts.chest;part.exercises.push(normalizeFitnessExercise({id:'other-lift',name:'Another lift',sets:4,reps:'8',weightKg:80}));part.exercises.reverse();saveState({skipCloud:true});await flushDeviceWrites();});
    assert.equal(await p.locator('.fitness-exercise-row').count(),1,'focused original row remains while the committed list has two exercises');
    await p.getByLabel('Kg',{exact:true}).fill('23.75');const values=await p.evaluate(()=>state.cards.find(c=>c.id==='workout').fitnessEntries['2026-10-31'].parts.chest.exercises.map(row=>({id:row.id,kg:row.weightKg})));
    assert.equal(Number(values.find(row=>row.id==='bench-2026-10-31').kg),23.75);assert.equal(Number(values.find(row=>row.id==='other-lift').kg),80);
    const remaining=await p.evaluate(async()=>{await flushDeviceWrites();const button=document.querySelector('.fitness-exercise-row .fitness-remove-exercise');const part=state.cards.find(c=>c.id==='workout').fitnessEntries['2026-10-31'].parts.chest;const target=button.closest('.fitness-exercise-row').querySelector('input').value;part.exercises.reverse();saveState({skipCloud:true});await flushDeviceWrites();button.click();return {target,rows:state.cards.find(c=>c.id==='workout').fitnessEntries['2026-10-31'].parts.chest.exercises.map(row=>row.name)};});
    assert.equal(remaining.rows.length,1);assert(!remaining.rows.includes(remaining.target));
  });
  await run('installation help refuses preview installation and retains all records and credentials',async p=>{
    const before=await p.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage())));await p.evaluate(()=>LifeInstall.open());
    const dialog=p.getByRole('dialog',{name:'Life OS on your device'});await dialog.waitFor();assert.equal(await dialog.getByRole('link',{name:'Open the live Life OS website'}).getAttribute('href'),'https://austinwong94.github.io/life-os/');assert.match(await dialog.innerText(),/separate browser storage/);assert.equal(await dialog.getByRole('button',{name:'Install Life OS',exact:true}).count(),0);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage()))),before);
  });
  await run('ambiguous, removed, archived and wrong-board workout targets refuse without changing any record',async p=>{
    await workspace(p,'health');const result=await p.evaluate(()=>{
      const card=state.cards.find(c=>c.id==='workout'),part=card.fitnessEntries['2026-10-31'].parts.chest,exercise=part.exercises[0],results=[];
      const refuse=boardId=>{const before=JSON.stringify(getStateForStorage()),ok=updateFitnessExercise(card,'2026-10-31','chest',exercise.id,{weightKg:999},boardId);results.push({ok,unchanged:JSON.stringify(getStateForStorage())===before});};
      part.exercises.push({...exercise});refuse(state.activeBoardId);part.exercises.pop();refuse('different-board');
      part.exercises=[];refuse(state.activeBoardId);part.exercises=[exercise];card.archivedAt=1;refuse(state.activeBoardId);delete card.archivedAt;
      return results;
    });assert(result.every(row=>row.ok===false && row.unchanged),JSON.stringify(result));
  });
  const nav=(p,type)=>p.locator(type==='food'?'.food-nav':'.fitness-nav');
  const label=type=>type==='food'?'Food log date':'Workout date';
  const todayLabel=type=>type==='food'?'Food log: go to today':'Workout log: go to today';
  const entryCopies=(p,type)=>p.evaluate(type=>LifeStateMerge.copy(state.cards.find(c=>c.type===type)[type==='food'?'foodEntries':'fitnessEntries']),type);
  const openType=async(p,type)=>{await workspace(p,'health');await p.getByRole('button',{name:type==='food'?'Food':'Workout',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());};
  await run('health date Today shortcuts return to the actual local day without editing existing dated records and survive reload',async p=>{
    for(const type of ['fitness','food']){
      await openType(p,type);const before=await entryCopies(p,type);await p.getByLabel(label(type),{exact:true}).fill('2026-10-30');await p.evaluate(()=>flushDeviceWrites());await nav(p,type).getByRole('button',{name:todayLabel(type),exact:true}).click();assert.equal(await p.getByLabel(label(type),{exact:true}).inputValue(),'2026-10-31');
      const after=await entryCopies(p,type);for(const [date,entry]of Object.entries(before))assert.deepEqual(after[date],entry);await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.getByLabel(label(type),{exact:true}).inputValue(),'2026-10-31');const reloaded=await entryCopies(p,type);for(const [date,entry]of Object.entries(before))assert.deepEqual(reloaded[date],entry);
      await p.getByLabel(label(type),{exact:true}).fill('2026-11-04');await nav(p,type).getByRole('button',{name:todayLabel(type),exact:true}).click();assert.equal(await p.getByLabel(label(type),{exact:true}).inputValue(),'2026-10-31');
    }
  });
  await run('health date selecting Today again is a no-op with no device write or replaced editor',async p=>{
    for(const type of ['fitness','food']){await openType(p,type);const result=await nav(p,type).getByRole('button',{name:todayLabel(type),exact:true}).evaluate(button=>{const before=JSON.stringify(getStateForStorage()),stage=LifeDeviceStore.stage;let writes=0;LifeDeviceStore.stage=(...args)=>{writes++;return stage(...args);};button.click();button.click();LifeDeviceStore.stage=stage;return {writes,unchanged:before===JSON.stringify(getStateForStorage()),connected:button.isConnected};});assert.deepEqual(result,{writes:0,unchanged:true,connected:true});}
  });
  await run('health date controls refuse changed days conflicts ambiguous archived missing and other-board sources without a write',async p=>{
    for(const type of ['fitness','food']){await openType(p,type);const results=await nav(p,type).evaluate((node,type)=>{
      const card=state.cards.find(c=>c.type===type),field=type==='food'?'activeFoodDate':'activeFitnessDate',today=node.querySelector('.health-date-today'),list=[];
      const refuse=()=>{const before=JSON.stringify(state.cards);today.click();list.push(before===JSON.stringify(state.cards));};
      card[field]='2026-10-30';refuse();card[field]='2026-10-31';state.syncConflicts=[{id:'review-health-day',segments:['boards','health-board','cards',card.id,field]}];refuse();state.syncConflicts=[];
      state.cards.push(LifeStateMerge.copy(card));refuse();state.cards.pop();card.archivedAt=1;refuse();delete card.archivedAt;
      const index=state.cards.indexOf(card);state.cards.splice(index,1);refuse();state.cards.splice(index,0,card);state.activeBoardId='other';refuse();state.activeBoardId='health-board';return list;
    },type);assert(results.every(Boolean),JSON.stringify({type,results}));}
  });
  await run('health date detached hidden and modal-covered controls cannot navigate and invalid empty dates keep the original day',async p=>{
    for(const type of ['fitness','food']){
      await openType(p,type);await nav(p,type).evaluate(n=>window.oldHealthDayNav=n);await p.evaluate(()=>renderCardsOnly({force:true}));const original=await entryCopies(p,type);
      await p.evaluate(()=>{oldHealthDayNav.querySelector('button').click();oldHealthDayNav.querySelector('.health-date-today').click();const field=oldHealthDayNav.querySelector('input');field.value='2026-10-30';field.dispatchEvent(new Event('change',{bubbles:true}));});assert.deepEqual(await entryCopies(p,type),original);assert.equal(await p.getByLabel(label(type),{exact:true}).inputValue(),'2026-10-31');
      const result=await nav(p,type).evaluate(n=>{const before=JSON.stringify(state.cards);n.style.display='none';n.querySelector('button').click();n.style.display='';const dialog=dailyDialog('SAMPLE open draft');const field=document.createElement('textarea');field.value='Every unfinished line\nSecond line';dialog.append(field);n.querySelector('button').click();const unchanged=before===JSON.stringify(state.cards),draft=field.value;dialog.close();const input=n.querySelector('input');input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));return {unchanged,draft,date:input.value};});assert.deepEqual(result,{unchanged:true,draft:'Every unfinished line\nSecond line',date:'2026-10-31'});
    }
  });
  async function timeFixture(p){
    await openType(p,'food');await p.evaluate(async()=>{await flushDeviceWrites();const food=state.cards.find(c=>c.id==='food'),egg=food.foodLibrary.find(f=>f.id==='egg-hard-boiled');food.activeFoodDate='2026-10-30';food.foodEntries['2026-10-30']=normalizeFoodEntry({meals:[{id:'timed-meal',name:'SAMPLE original meal',kind:'meal',items:[{id:'time-egg',foodId:egg.id,amount:2,unit:'serving',...createFoodItemSnapshot(egg)}],timing:{eatenTime:'11:05',plannedTime:'12:00',windowMinutes:60,recordedAt:1}}]});food.activeFoodMealId='timed-meal';if(!saveState({quiet:true}))throw Error('Synthetic time fixture was not staged');await flushDeviceWrites();renderCardsOnly({force:true});});await p.locator('.food-time-panel>summary').click();
  }
  await run('health date navigation keeps complete unfinished meal times until explicitly saved or cancelled',async p=>{
    await timeFixture(p);const form=p.locator('.food-time-form'),before=await entryCopies(p,'food');await form.getByLabel('Eaten at',{exact:true}).fill('14:35');await form.getByLabel('Planned time',{exact:true}).fill('13:30');await form.getByLabel('Timing window',{exact:true}).selectOption('15');await form.getByLabel('Entry type',{exact:true}).selectOption('snack');
    await nav(p,'food').getByRole('button',{name:todayLabel('food'),exact:true}).click();assert.equal(await p.getByLabel('Food log date',{exact:true}).inputValue(),'2026-10-30');assert.match(await nav(p,'food').locator('[role=status]').innerText(),/Save or cancel/);assert.equal(await form.getByLabel('Eaten at',{exact:true}).inputValue(),'14:35');assert.equal(await form.getByLabel('Planned time',{exact:true}).inputValue(),'13:30');assert.equal(await form.getByLabel('Timing window',{exact:true}).inputValue(),'15');assert.equal(await form.getByLabel('Entry type',{exact:true}).inputValue(),'snack');assert.deepEqual(await entryCopies(p,'food'),before);
    await nav(p,'food').getByRole('button',{name:'Previous day',exact:true}).click();await p.getByLabel('Food log date',{exact:true}).fill('2026-11-02');assert.equal(await p.getByLabel('Food log date',{exact:true}).inputValue(),'2026-10-30');assert.equal(await form.getByLabel('Eaten at',{exact:true}).inputValue(),'14:35');
    const kept=await form.evaluate(n=>{const details=n.closest('details'),button=n.querySelector('[aria-label="Cancel meal-time changes"]');details.open=false;button.click();details.open=true;state.activeBoardId='other';button.click();state.activeBoardId='health-board';return n.querySelector('input').value;});assert.equal(kept,'14:35');await p.locator('.food-detailed-entry>summary').click();assert.equal(await form.getByLabel('Eaten at',{exact:true}).isVisible(),false);await nav(p,'food').getByRole('button',{name:todayLabel('food'),exact:true}).click();assert(await form.getByLabel('Eaten at',{exact:true}).isVisible());assert.equal(await form.getByLabel('Eaten at',{exact:true}).inputValue(),'14:35');assert.deepEqual(await entryCopies(p,'food'),before);
    await form.getByRole('button',{name:'Cancel meal-time changes',exact:true}).click();assert.equal(await nav(p,'food').locator('[role=status]').innerText(),'');assert.equal(await form.getByLabel('Eaten at',{exact:true}).inputValue(),'11:05');assert.equal(await form.getByLabel('Planned time',{exact:true}).inputValue(),'12:00');assert.equal(await form.getByLabel('Timing window',{exact:true}).inputValue(),'60');assert.equal(await form.getByLabel('Entry type',{exact:true}).inputValue(),'meal');assert.deepEqual(await entryCopies(p,'food'),before);await nav(p,'food').getByRole('button',{name:todayLabel('food'),exact:true}).click();assert.equal(await p.getByLabel('Food log date',{exact:true}).inputValue(),'2026-10-31');assert.deepEqual((await entryCopies(p,'food'))['2026-10-30'],before['2026-10-30']);
  });
  await run('health date Save time then Today retains the explicit edit on its original day rather than moving or duplicating it',async p=>{
    await timeFixture(p);const before=await entryCopies(p,'food');await p.locator('.food-time-form').getByLabel('Eaten at',{exact:true}).fill('14:35');await p.getByRole('button',{name:'Save time',exact:true}).click();await nav(p,'food').getByRole('button',{name:todayLabel('food'),exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();const after=await entryCopies(p,'food'),meal=after['2026-10-30'].meals[0];assert.equal(meal.id,'timed-meal');assert.equal(meal.timing.eatenTime,'14:35');assert.deepEqual(meal.items,before['2026-10-30'].meals[0].items);assert.equal(after['2026-10-31'].meals.some(m=>m.id==='timed-meal'),false);assert.equal(await p.getByLabel('Food log date',{exact:true}).inputValue(),'2026-10-31');
  });
  await run('health date save failures keep the original day and support retry after existing device-saving recovery',async p=>{
    for(const type of ['fitness','food']){
      await openType(p,type);await p.getByLabel(label(type),{exact:true}).fill('2026-10-30');await p.evaluate(()=>flushDeviceWrites());const before=await entryCopies(p,type);await p.evaluate(()=>{window.healthDayStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new DOMException('Full','QuotaExceededError');};});await nav(p,type).getByRole('button',{name:todayLabel(type),exact:true}).click();assert.equal(await p.getByLabel(label(type),{exact:true}).inputValue(),'2026-10-30');assert.match(await nav(p,type).locator('[role=status]').innerText(),/original day is kept/);assert.deepEqual(await entryCopies(p,type),before);await p.evaluate(()=>LifeDeviceStore.stage=healthDayStage);
      await p.locator('#headerSaveStatus').click();await p.getByRole('button',{name:'Retry device save',exact:true}).click();await p.waitForFunction(()=>lastLocalSaveOk===true);await p.getByRole('dialog',{name:'Saving & version',exact:true}).getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>{window.healthDaySave=saveState;saveState=()=>{throw Error('Synthetic unexpected save exception');};});await nav(p,type).getByRole('button',{name:todayLabel(type),exact:true}).click();assert.match(await nav(p,type).locator('[role=status]').innerText(),/original day is kept/);assert.equal(await p.evaluate(type=>state.cards.find(c=>c.type===type)[type==='food'?'activeFoodDate':'activeFitnessDate'],type),'2026-10-30');assert.deepEqual(await entryCopies(p,type),before);await p.evaluate(()=>saveState=healthDaySave);await nav(p,type).getByRole('button',{name:todayLabel(type),exact:true}).click();assert.equal(await p.getByLabel(label(type),{exact:true}).inputValue(),'2026-10-31');const after=await entryCopies(p,type);for(const [date,entry]of Object.entries(before))assert.deepEqual(after[date],entry);
    }
  });
  await run('health date Today follows local midnight and stays tap sized in two and three columns without clipping',async p=>{
    const before=await entryCopies(p,'fitness');assert.equal(await p.getByLabel('Workout date',{exact:true}).inputValue(),'2026-10-31');await p.keyboard.press('Enter');assert.equal(await p.getByLabel('Workout date',{exact:true}).inputValue(),'2026-11-01');const focus=await p.evaluate(()=>{const button=document.querySelector('.fitness-nav .health-date-today');return {focused:button===document.activeElement,connected:button?.isConnected,actual:document.activeElement?.id,expected:button?.id};});assert(focus.focused && focus.connected,JSON.stringify(focus));const after=await entryCopies(p,'fitness');for(const [date,entry]of Object.entries(before))assert.deepEqual(after[date],entry);
    await workspace(p,'board');for(const columns of [2,3])for(const width of [320,390,768,1080,1440]){await p.evaluate(columns=>{state.board.columnCount=columns;renderCardsOnly({force:true});},columns);await p.setViewportSize({width,height:width<500?844:1100});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));for(const type of ['fitness','food']){const box=await nav(p,type).getByRole('button',{name:todayLabel(type),exact:true}).evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,fit:n.scrollWidth<=n.clientWidth+1};});assert(box.left>=0&&box.right<=width+1&&box.width>=44&&box.height>=44&&box.fit,JSON.stringify({width,columns,type,box}));}await p.screenshot({path:out+'/today-'+columns+'-'+width+'.png',animations:'disabled'});}
    await p.setViewportSize({width:390,height:844});await openType(p,'food');await p.screenshot({path:out+'/today-food-phone.png',animations:'disabled'});await p.setViewportSize({width:1080,height:1100});await openType(p,'fitness');await p.screenshot({path:out+'/today-workout-portrait.png',animations:'disabled'});
  },{prepare:async p=>{await openType(p,'fitness');await nav(p,'fitness').getByRole('button',{name:todayLabel('fitness'),exact:true}).focus();await p.clock.setFixedTime(new Date('2026-10-31T16:01:00Z'));await p.evaluate(()=>resetDiaryCardsToToday());}});
  await run('health date navigation resolves a replaced live card and keeps its newer information instead of saving a stale copy',async p=>{
    for(const type of ['fitness','food']){
      await openType(p,type);await p.getByLabel(label(type),{exact:true}).fill('2026-10-30');await p.evaluate(()=>flushDeviceWrites());const result=await nav(p,type).evaluate((node,type)=>{
        const old=state.cards.find(c=>c.type===type),current=LifeStateMerge.copy(old),key=type==='food'?'foodEntries':'fitnessEntries',field=type==='food'?'activeFoodDate':'activeFitnessDate';current.newWriterField={exact:'Every newer field\nSecond line',nested:{keep:true}};current[key]['2026-10-31'].newWriterEntry={exact:'Retain this full newer entry'};state.cards[state.cards.indexOf(old)]=current;const before=JSON.stringify(current[key]);node.querySelector('.health-date-today').click();const saved=state.cards.find(c=>c.id===current.id);return {date:saved[field],kept:before===JSON.stringify(saved[key]),custom:saved.newWriterField,entry:saved[key]['2026-10-31'].newWriterEntry};
      },type);assert.deepEqual(result,{date:'2026-10-31',kept:true,custom:{exact:'Every newer field\nSecond line',nested:{keep:true}},entry:{exact:'Retain this full newer entry'}});await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.deepEqual(await p.evaluate(type=>state.cards.find(c=>c.type===type).newWriterField,type),result.custom);
    }
  });
  await run('health date redraw retains the current connected focus rather than a replaced node and never steals a later editor',async p=>{
    for(const type of ['fitness','food']){
      await openType(p,type);await p.getByLabel(label(type),{exact:true}).fill('2026-10-30');await p.evaluate(()=>flushDeviceWrites());const before=await entryCopies(p,type);
      await nav(p,type).getByRole('button',{name:todayLabel(type),exact:true}).focus();await p.keyboard.press('Enter');assert.equal(await p.getByLabel(label(type),{exact:true}).inputValue(),'2026-10-31');const focus=await p.evaluate(type=>{const selector=(type==='food'?'.food-nav':'.fitness-nav')+' .health-date-today',old=document.querySelector(selector),wasFocused=old===document.activeElement;renderCardsOnly({force:true});const current=document.querySelector(selector);return {wasFocused,oldDetached:!old.isConnected,newConnected:current?.isConnected,newFocused:current===document.activeElement};},type);assert.deepEqual(focus,{wasFocused:true,oldDetached:true,newConnected:true,newFocused:true});const after=await entryCopies(p,type);for(const [date,entry]of Object.entries(before))assert.deepEqual(after[date],entry);
      await p.getByLabel(label(type),{exact:true}).focus();await p.getByLabel(label(type),{exact:true}).evaluate(n=>window.laterHealthEditor=n);await p.evaluate(async()=>{await flushDeviceWrites();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});assert(await p.evaluate(()=>laterHealthEditor.isConnected && laterHealthEditor===document.activeElement));
    }
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(row=>!row.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
