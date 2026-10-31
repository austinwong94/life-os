const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright'),{workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-health-workspace';
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Use isolated local test profiles');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const preserved=p=>p.evaluate(()=>JSON.stringify({old:state.cards.find(c=>c.id==='workout').fitnessEntries['2026-10-29'],diary:state.cards.find(c=>c.type==='diary'),other:state.boards.find(b=>b.id==='other')}));
  async function run(name,fn){
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
      const original=await preserved(p);await fn(p);assert.equal(await preserved(p),original);assert.deepEqual(errors,[]);results.push({name,pass:true});
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
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(row=>!row.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
