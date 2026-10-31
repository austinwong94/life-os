const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright'),{workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-health-workspace';
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Use isolated local test profiles');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const preserved=p=>p.evaluate(()=>JSON.stringify({old:state.cards.find(c=>c.id==='workout').fitnessEntries['2026-10-29'],diary:state.cards.find(c=>c.type==='diary'),other:state.boards.find(b=>b.id==='other')}));
  async function run(name,fn){
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
      const bounds=await p.locator('.health-workspace-editor input,.health-workspace-tabs button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,width:innerWidth};}));
      assert(bounds.every(r=>r.left>=0 && r.right<=r.width+1 && r.height>=36),JSON.stringify({width,bounds}));
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
    await p.locator('.health-part-picker>summary').click();await p.getByRole('button',{name:'Running',exact:true}).click();assert(await p.getByLabel('Km',{exact:true}).isVisible());
    await p.getByLabel('Km',{exact:true}).fill('5.25');await p.locator('.fitness-active').getByLabel('Minutes',{exact:true}).fill('32');await p.getByRole('button',{name:'Chest',exact:true}).click();assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'15');assert.equal(await p.locator('.fitness-metrics').getAttribute('open'),null);await p.getByRole('button',{name:'Running',exact:true}).click();assert.equal(await p.getByLabel('Km',{exact:true}).inputValue(),'5.25');
  });
  await run('training history opens the original dated log and never edits an earlier workout merely by viewing it',async p=>{
    await workspace(p,'health');await p.getByRole('button',{name:'Training history',exact:true}).click();await p.locator('.health-history-row').last().click();assert.equal(await p.getByLabel('Workout date',{exact:true}).inputValue(),'2026-10-29');assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'12.5');assert.equal(await p.evaluate(()=>state.cards.filter(c=>c.type==='fitness').length),1);
  });
  await run('installation help refuses preview installation and retains all records and credentials',async p=>{
    const before=await p.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage())));await p.evaluate(()=>LifeInstall.open());
    const dialog=p.getByRole('dialog',{name:'Life OS on your device'});await dialog.waitFor();assert.equal(await dialog.getByRole('link',{name:'Open the live Life OS website'}).getAttribute('href'),'https://austinwong94.github.io/life-os/');assert.match(await dialog.innerText(),/separate browser storage/);assert.equal(await dialog.getByRole('button',{name:'Install Life OS',exact:true}).count(),0);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage()))),before);
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(row=>!row.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
