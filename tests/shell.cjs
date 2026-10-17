const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-shell';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kuala_Lumpur'});await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic tests only'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));
    try{
      await p.goto(url+'?preview=1&liveReload=0');
      await p.evaluate(async()=>{
        const diary=makeCard({type:'diary',title:'Sample diary',category:'Personal'});diary.id='shell-diary';diary.diaryEntries={'2026-10-14':{thoughts:'Original private writing\nEvery line retained',sentence:'A small step',updatedAt:1}};
        const source=makeCard({type:'planner',title:'My tasks',category:'Personal'});source.id='shell-planner';LifePlanner.add(source,getTodayKey(),'Choose a small next step','shell-task');
        state.cards=[source,diary,makeCard({type:'sidenote',title:'Sample notes',category:'Personal'}),makeCard({type:'quote',title:'Keep going',description:'One step at a time.\nThere is room to begin again.'})];state.board.columnCount=3;state.columnCount=3;
        state.boards.find(b=>b.id===state.activeBoardId).money={...LifeMoney.empty(),accounts:[{id:'bank',name:'Sample bank',owner:'personal',openingDate:'2026-01-01',openingCents:600000,reservedCents:100000}],entries:[{id:'lunch',kind:'expense',status:'settled',title:'Lunch',amountCents:1800,accountId:'bank',date:getTodayKey(),dueDate:getTodayKey(),repeat:'none',category:'Food & drinks',note:''}]};
        saveState();await flushDeviceWrites();renderCardsOnly({force:true});window.shellOriginal={diary:JSON.stringify(diary.diaryEntries),money:JSON.stringify(moneyLedger()),task:JSON.stringify(source.plannerTasks)};
      });
      await fn(p);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('one desktop navigation, four mobile destinations and all features remain reachable without record changes',async p=>{
    for(const width of [320,390,768,980,1080,1440]){
      await p.setViewportSize({width,height:1000});
      for(const mode of ['today','tasks','calendar','board','money','priorities','records']){
        await workspace(p,mode);await p.waitForTimeout(80);
        assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+mode+' '+width);
        assert.equal(await p.locator('.workspace-navigation .workspace-modes:visible').count(),0);
        if(width<=980){assert.equal(await p.locator('.rail-nav > button:visible').count(),4);const active=await p.locator('.rail-nav > button[aria-pressed=true]:visible').evaluateAll(ns=>ns.map(n=>n.id));assert.deepEqual(active,[['money','records','priorities'].includes(mode)?'mobileMoreButton':mode==='calendar'?'mobileTasksButton':'mobile'+({today:'Today',tasks:'Tasks',board:'Board'}[mode])+'Button']);}
        else assert.equal(await p.getByRole('navigation',{name:'Every day',exact:true}).getByRole('button').count(),3);
      }
      await workspace(p,'board');await p.waitForTimeout(150);if(width===1080)assert.equal(await p.locator('.board-column').count(),3,'portrait desktop retains the selected three columns');
      await p.evaluate(()=>clearUndoToast());await p.screenshot({path:out+'/board-'+width+'.png',fullPage:true});
    }
    assert(await p.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='shell-diary').diaryEntries)===shellOriginal.diary));assert(await p.evaluate(()=>JSON.stringify(moneyLedger())===shellOriginal.money));assert(await p.evaluate(()=>JSON.stringify(state.cards.find(c=>c.id==='shell-planner').plannerTasks)===shellOriginal.task));
  });
  await run('Money uses four grouped sections, remembers each view, keeps every original calculation and draft',async p=>{
    const visit=async(section,page)=>{await p.getByRole('navigation',{name:'Money sections'}).getByRole('button',{name:section,exact:true}).click();if(page)await p.getByLabel('Money page',{exact:true}).selectOption(page);};
    for(const width of [320,390,1080,1440]){
      await p.setViewportSize({width,height:1000});await workspace(p,'money');assert.equal(await p.getByRole('navigation',{name:'Money sections'}).getByRole('button').count(),4);
      for(const [section,page] of [['Overview'],['Spending','transactions'],['Spending','spending'],['Spending','budgets'],['Payments','upcoming'],['Payments','credit'],['Payments','loans'],['Accounts']]){
        await visit(section,page);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await p.locator('.money-workspace > .money-stats').count(),section==='Overview'?1:0);
      }
      await visit('Payments','credit');await visit('Spending','budgets');await visit('Payments');assert.equal(await p.getByLabel('Money page',{exact:true}).inputValue(),'credit');
      await visit('Overview');await p.evaluate(()=>clearUndoToast());await p.screenshot({path:out+'/money-'+width+'.png',fullPage:true});
    }
    await p.getByRole('button',{name:'Add entry',exact:true}).click();await p.getByLabel('Entry name',{exact:true}).fill('A complete retained draft');await p.getByLabel('Amount (RM)',{exact:true}).pressSequentially('123.45');await p.getByRole('button',{name:'Cancel',exact:true}).click();
    await visit('Payments','credit');await visit('Overview');await p.getByRole('button',{name:'Add entry',exact:true}).click();assert.equal(await p.getByLabel('Entry name',{exact:true}).inputValue(),'A complete retained draft');assert.equal(await p.getByLabel('Amount (RM)',{exact:true}).inputValue(),'123.45');await p.getByRole('button',{name:'Cancel',exact:true}).click();
    assert(await p.evaluate(()=>JSON.stringify(moneyLedger())===shellOriginal.money));
  });
  await run('mobile More has grouped working tools; capture, archive, reports, settings and save details remain available',async p=>{
    await p.setViewportSize({width:390,height:844});
    for(const [label,target] of [['Archive','#recordsModal'],['Reports','#reportsModal'],['Settings','#settingsModal'],['Capture','#dailyDialog'],['Weekly review','#dailyDialog'],['Saving & version','#dailyDialog']]){
      await p.locator('#mobileMoreButton').click();await p.getByRole('heading',{name:'More sections',exact:true}).waitFor();await p.locator('#dailyDialog').getByRole('button',{name:label,exact:true}).click();await p.locator(target).waitFor({state:'visible'});
      await p.keyboard.press('Escape');if(await p.locator(target).isVisible())await p.evaluate(selector=>{const el=document.querySelector(selector);if(el?.close)el.close();},target);
    }
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
