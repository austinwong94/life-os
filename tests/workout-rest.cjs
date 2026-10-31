const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const target=new URL(process.env.TEST_URL || 'http://127.0.0.1:5180/');
assert(['127.0.0.1','localhost'].includes(target.hostname));target.searchParams.set('preview','1');target.searchParams.set('liveReload','0');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-workout-rest';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const timer=p=>p.getByRole('region',{name:'Rest timer',exact:true});
  const time=p=>timer(p).getByRole('timer');
  const records=p=>p.evaluate(()=>{
    const value=LifeCloudCopies.records(getStateForStorage());
    // Explicit board navigation updates its timestamp, not the saved records.
    for(const board of value.boards)delete board.updatedAt;
    return JSON.stringify(value);
  });
  async function run(name,fn){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'Synthetic rest-timer tests; private requests blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.stack));
    await p.clock.install({time:new Date('2026-10-31T04:00:00Z')});
    try{
      await p.goto(target.href);await p.evaluate(async()=>{
        const gym=makeCard({type:'fitness',title:'Synthetic gym'});gym.id='rest-gym';gym.activeFitnessDate='2026-10-31';gym.activeFitnessPart='chest';
        gym.fitnessEntries={'2026-10-31':normalizeFitnessEntry({notes:'Original full workout\nSecond line',parts:{chest:{active:true,exercises:[{id:'bench',name:'Bench press',sets:3,reps:'10',weightKg:15,rpe:7,extension:{keep:true}}]}}})};
        const food=makeCard({type:'food',title:'Original food'}),diary=makeCard({type:'diary',title:'Original diary'});diary.diaryEntries={'2026-10-30':{thoughts:'Every original word\nSecond line',updatedAt:1}};
        state.boards=[createBoardRecord({id:'rest-board',name:'Synthetic health',cards:[gym,food,diary]}),createBoardRecord({id:'other-board',name:'Other original board',cards:[makeCard({type:'fitness',title:'Separate workout'})]})];switchBoard('rest-board');await flushDeviceWrites();
      });await workspace(p,'health');await p.evaluate(()=>flushDeviceWrites());await p.clock.pauseAt(new Date('2026-10-31T04:00:10Z'));
      await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('rest controls are optional, correctly labelled and never start merely by viewing a workout',async p=>{
    const before=await records(p);assert.equal(await time(p).innerText(),'1:30');assert.equal(await timer(p).getByRole('status').innerText(),'Ready');
    assert.equal(await timer(p).getByRole('button',{name:'Reset rest',exact:true}).isDisabled(),true);
    await timer(p).getByLabel('Rest duration',{exact:true}).selectOption('30');assert.equal(await time(p).innerText(),'0:30');assert.equal(await timer(p).getByRole('status').innerText(),'Ready');
    await p.getByRole('button',{name:'Food',exact:true}).click();assert.equal(await timer(p).count(),0);await p.getByRole('button',{name:'Training history',exact:true}).click();assert.equal(await timer(p).count(),0);
    await p.getByRole('button',{name:'Workout',exact:true}).click();assert.equal(await time(p).innerText(),'0:30');assert.equal(await records(p),before);
  });
  await run('start pause resume and reset keep precise time without any device or cloud record writes',async p=>{
    const before=await records(p);await p.evaluate(()=>{window.restStage=LifeDeviceStore.stage;window.restStageCalls=0;LifeDeviceStore.stage=(...args)=>{restStageCalls++;return restStage(...args);};});
    await timer(p).getByRole('button',{name:'Start rest',exact:true}).click();await p.clock.runFor(1500);assert.equal(await time(p).innerText(),'1:29');
    await timer(p).getByRole('button',{name:'Pause rest',exact:true}).click();assert(await timer(p).getByLabel('Rest duration',{exact:true}).isDisabled());await p.clock.runFor(5000);assert.equal(await time(p).innerText(),'1:29');
    await timer(p).getByRole('button',{name:'Resume rest',exact:true}).click();await p.clock.runFor(1500);assert.equal(await time(p).innerText(),'1:27');
    await timer(p).getByRole('button',{name:'Reset rest',exact:true}).focus();await p.keyboard.press('Enter');assert.equal(await time(p).innerText(),'1:30');assert.equal(await timer(p).getByRole('status').innerText(),'Ready');assert(await timer(p).getByRole('button',{name:'Start rest',exact:true}).evaluate(node=>node===document.activeElement));
    assert.equal(await p.evaluate(()=>restStageCalls),0);assert.equal(await records(p),before);
  });
  await run('a delayed display refresh catches elapsed time and finishing never completes or edits a workout',async p=>{
    const before=await records(p);await timer(p).getByRole('button',{name:'Start rest',exact:true}).click();
    await p.clock.setSystemTime(new Date('2026-10-31T04:02:00Z'));await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
    assert.equal(await time(p).innerText(),'0:00');assert.equal(await timer(p).getByRole('status').innerText(),'Rest complete');
    await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(await time(p).innerText(),'0:00');
    await timer(p).getByRole('button',{name:'Start rest',exact:true}).click();assert.equal(await time(p).innerText(),'1:30');assert.equal(await records(p),before);
  });
  await run('ordinary timer ticks never replace a focused workout field or its multi-digit draft',async p=>{
    await p.setViewportSize({width:390,height:844});await timer(p).getByRole('button',{name:'Start rest',exact:true}).click();
    const weight=p.getByLabel('Kg',{exact:true});await weight.fill('');await weight.pressSequentially('22.75');await weight.evaluate(node=>window.restWriter=node);
    await p.clock.runFor(3100);assert.equal(await weight.inputValue(),'22.75');assert(await p.evaluate(()=>restWriter===document.activeElement && restWriter.isConnected));
    assert.equal(await time(p).innerText(),'1:27');await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.getByLabel('Kg',{exact:true}).inputValue(),'22.75');
    assert.equal(await time(p).innerText(),'1:30');assert.equal(await timer(p).getByRole('status').innerText(),'Ready');
  });
  await run('navigation and background redraws retain one personal timer and keyboard focus without copying records',async p=>{
    const before=await records(p);await timer(p).getByRole('button',{name:'Start rest',exact:true}).click();await p.clock.runFor(2100);
    await timer(p).getByRole('button',{name:'Pause rest',exact:true}).focus();await p.evaluate(()=>renderCardsOnly({force:true}));
    assert(await timer(p).getByRole('button',{name:'Pause rest',exact:true}).evaluate(node=>node===document.activeElement));assert.equal(await time(p).innerText(),'1:28');
    await p.getByRole('button',{name:'Food',exact:true}).click();await p.clock.runFor(2000);await p.getByRole('button',{name:'Workout',exact:true}).click();assert.equal(await time(p).innerText(),'1:26');
    await p.evaluate(()=>switchBoard('other-board'));await workspace(p,'health');assert.equal(await time(p).innerText(),'1:26');
    await p.evaluate(()=>switchBoard('rest-board'));await workspace(p,'health');assert.equal(await time(p).innerText(),'1:26');assert.equal(await timer(p).count(),1);assert.equal(await records(p),before);
    await timer(p).getByRole('button',{name:'Reset rest',exact:true}).click();await timer(p).getByLabel('Rest duration',{exact:true}).focus();await p.evaluate(()=>renderCardsOnly({force:true}));assert(await timer(p).getByLabel('Rest duration',{exact:true}).evaluate(node=>node===document.activeElement));
  });
  await run('another tab has its own rest timer and a reload cannot resurrect or save a temporary timer',async(p,context)=>{
    const before=await records(p);await timer(p).getByRole('button',{name:'Start rest',exact:true}).click();const q=await context.newPage();await q.goto(target.href);await workspace(q,'health');
    assert.equal(await timer(q).getByRole('status').innerText(),'Ready');await timer(q).getByLabel('Rest duration',{exact:true}).selectOption('30');await timer(q).getByRole('button',{name:'Start rest',exact:true}).click();
    assert.equal(await time(q).innerText(),'0:30');assert.equal(await time(p).innerText(),'1:30');assert.equal(await records(p),before);
    await p.reload();assert.equal(await timer(p).getByRole('status').innerText(),'Ready');assert.equal(await time(p).innerText(),'1:30');assert.equal(await records(p),before);
  });
  await run('phone portrait tablet and desktop keep all timer controls visible with 44px targets',async p=>{
    for(const width of [1440,1080,768,390,320]){
      await p.setViewportSize({width,height:width<700?844:1100});await p.clock.runFor(300);
      const bounds=await timer(p).locator('button,select').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height};}));
      assert(bounds.every(r=>r.x>=0 && r.right<=width+1 && r.width>=43.9 && r.height>=43.9),JSON.stringify({width,bounds}));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await p.screenshot({path:out+'/rest-'+width+'.png',fullPage:width>700});
    }
  });
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(result=>!result.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
