const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium,webkit}=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/';
assert(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Synthetic design checks must stay local');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-interface-polish';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await ({chromium,webkit}[process.env.TEST_BROWSER || 'chromium']).launch({headless:true}),results=[];
  async function run(name,action){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic design checks; external services blocked'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));
    await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await action(p);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('empty charts do not imply activity and the primary action opens the existing daily plan',async p=>{
    await p.evaluate(async()=>{state.cards=[];state.archivedCards=[];saveState();await flushDeviceWrites();});
    await workspace(p,'priorities');
    assert.equal(await p.locator('.momentum-chart.is-empty').count(),1);
    assert(await p.locator('.momentum-bars .momentum-bar').evaluateAll(ns=>ns.every(n=>n.style.height==='0%')));
    assert.equal(await p.locator('.momentum-chart-empty').innerText(),'No completions recorded in this week.');
    await p.getByRole('button',{name:'Plan today',exact:true}).click();await p.locator('.daily-head').waitFor();
    await workspace(p,'priorities');await p.getByRole('button',{name:'Choose a next step',exact:true}).click();await p.locator('.daily-head').waitFor();
  });
  await run('summary shortcuts use original records, keep all text and do not change history',async p=>{
    await p.evaluate(async()=>{
      const planner=makeCard({type:'planner',title:'Actions',category:'Personal'});planner.id='polish-planner';
      LifePlanner.add(planner,getTodayKey(),'A recorded small win','polish-task');LifePlanner.complete(planner,'polish-task',getTodayKey());
      const diary=makeCard({type:'diary',title:'My writing',category:'Personal'});diary.id='polish-diary';diary.diaryEntries={[getTodayKey()]:{thoughts:'Every line remains.\nIncluding a second line.',sentence:'A moment to pause.',updatedAt:100}};
      state.cards=[planner,diary];saveState();await flushDeviceWrites();window.polishBefore=JSON.stringify(state.cards);
    });
    await workspace(p,'priorities');await p.getByRole('button',{name:'View completed tasks: 1',exact:true}).click();
    assert.match(await p.locator('#dailyDialog').innerText(),/A recorded small win/);await p.keyboard.press('Escape');
    await p.getByRole('button',{name:'Open saved writing',exact:true}).click();await p.locator('.records-history').waitFor();
    await workspace(p,'priorities');await p.getByRole('button',{name:"Open today's next steps",exact:true}).click();await p.locator('.daily-head').waitFor();
    await workspace(p,'priorities');assert.equal(await p.locator('.momentum-method[open]').count(),0);
    await p.getByText('About these numbers',{exact:true}).click();assert.match(await p.locator('.momentum-method').innerText(),/including archived history/);
    assert(await p.evaluate(()=>JSON.stringify(state.cards)===polishBefore));
  });
  await run('metrics, readable contrast and touch controls hold at phone, tablet and portrait widths',async p=>{
    await workspace(p,'priorities');
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:width<=390?844:1000});
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow at '+width);
      const geometry=await p.evaluate(()=>({
        tops:[...document.querySelectorAll('.momentum-measures .momentum-metric > strong')].map(n=>n.getBoundingClientRect().top),
        targets:[...document.querySelectorAll('.momentum-measures button, .momentum-header-tools button')].map(n=>({label:n.getAttribute('aria-label') || n.textContent,height:n.getBoundingClientRect().height}))
      }));
      const {tops,targets}=geometry;assert.equal(tops.length,3);assert.equal(targets.length,6);
      assert(Math.max(...tops)-Math.min(...tops)<=1,'metric values must align at '+width);
      assert(targets.every(n=>n.height>=43.9),'44px touch targets at '+width+': '+JSON.stringify(targets));
      const contrast=await p.locator('.momentum-progress-head .daily-muted').evaluate(n=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
        const ctx=canvas.getContext('2d');ctx.fillStyle=getComputedStyle(n).color;ctx.fillRect(0,0,1,1);
        const rgb=Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);
        const linear=rgb.map(v=>v/255<=.04045?v/255/12.92:((v/255+.055)/1.055)**2.4);
        return 1.05/(.2126*linear[0]+.7152*linear[1]+.0722*linear[2]+.05);
      });assert(contrast>=4.5,'muted copy must meet normal-text contrast');
      await p.screenshot({path:out+'/progress-'+width+'.png',fullPage:false});
    }
  });
  await run('narrow three-column Planner cards keep full date labels and usable entry controls',async p=>{
    await p.evaluate(async()=>{state.cards=[makeCard({type:'planner',title:'My plans',category:'Personal'})];state.board.columnCount=3;saveState();await flushDeviceWrites();});
    for(const width of [320,390,1080,1440]){
      await p.setViewportSize({width,height:1000});await workspace(p,'board');
      await p.waitForFunction(()=>{const n=document.querySelector('.planner-date-select-row span');return n && getComputedStyle(n).whiteSpace==='normal';});
      const meta=await p.evaluate(()=>{const n=elements.boardGrid.querySelector('.planner-date-select-row span');return {wrap:getComputedStyle(n).whiteSpace,fits:n.scrollWidth<=n.clientWidth+1,controls:[...elements.boardGrid.querySelectorAll('.planner-date-input, .planner-task-input, .planner-submit-button')].map(n=>({className:n.className,height:n.getBoundingClientRect().height})),columns:elements.boardGrid.querySelectorAll('.board-column').length,overflow:document.documentElement.scrollWidth>innerWidth+1};});
      assert.equal(meta.wrap,'normal');assert(meta.fits,'date is clipped at '+width);
      assert.equal(meta.controls.length,3,'one visible-board date, task and submit control');assert(meta.controls.every(n=>n.height>=44),JSON.stringify({width,controls:meta.controls}));
      if(width===1080)assert.equal(meta.columns,3);
      assert(!meta.overflow);
      await p.screenshot({path:out+'/planner-'+width+'.png',fullPage:false});
    }
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
