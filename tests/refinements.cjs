const assert=require('node:assert/strict');
const fs=require('node:fs');
const browsers=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const {workspace}=require('./navigation.cjs');
const fixture=require('./coaching-fixture.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-refinements';
fs.mkdirSync(out,{recursive:true});
const results=[];
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,action){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'Synthetic test only'}));
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);
    page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));
    try{await page.goto(url+'?preview=1&liveReload=0');await action(page,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await page.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Settings, Archive and Reports contain focus, make the board inert and restore their triggers',async p=>{
    for(const [trigger,root,close] of [['railSettingsButton','settingsModal','settingsModalCloseButton'],['railArchiveButton','recordsModal','recordsModalCloseButton'],['railReportsButton','reportsModal','reportsModalCloseButton']]){
      await p.locator('#'+trigger).click();
      assert.equal(await p.evaluate(id=>document.getElementById(id).contains(document.activeElement),root),true);
      assert.equal(await p.locator('#appShell').evaluate(e=>e.inert),true);
      await p.keyboard.press('Shift+Tab');
      assert.equal(await p.evaluate(id=>document.getElementById(id).contains(document.activeElement),root),true);
      await p.keyboard.press('Tab');
      assert.equal(await p.evaluate(id=>document.getElementById(id).contains(document.activeElement),root),true);
      await p.locator('#'+close).click();
      assert.equal(await p.locator('#appShell').evaluate(e=>e.inert),false);
      assert.equal(await p.evaluate(()=>document.activeElement.id),trigger);
    }
  });
  await run('Recovery can replace Settings and native capture can follow it without leaving the app inert',async p=>{
    await p.locator('#railSettingsButton').click();await p.locator('#recoveryButton').click();
    await p.locator('#recoveryModal').waitFor({state:'visible'});assert.equal(await p.locator('#recoveryModal').isVisible(),true);
    await p.keyboard.press('Escape');assert.equal(await p.locator('#recoveryModal').count(),0);
    assert.equal(await p.locator('#appShell').evaluate(e=>e.inert),false);
    await p.locator('#railAddButton').click();await p.getByLabel('What is on your mind?').fill('Complete retained thought.');
    await p.keyboard.press('Escape');await p.locator('#railAddButton').click();assert.equal(await p.getByLabel('What is on your mind?').inputValue(),'Complete retained thought.');
  });
  const seedFood=async p=>p.evaluate(async()=>{
    state.cards=[2000,2500].map((calories,index)=>{
      const card=makeCard({type:'food',title:'Tracker '+(index+1)});card.id='tracker-'+index;
      normalizeFoodCard(card);const day=getTodayKey(),food=card.foodLibrary[0];
      card.foodTargets[day.slice(0,7)]={...DEFAULT_FOOD_TARGETS,calories};
      getFoodEntry(card,day).meals[0].items=[{id:'meal-item-'+index,foodId:food.id,amount:100,unit:'g',...createFoodItemSnapshot(food)}];return card;
    });saveState();await flushDeviceWrites();
    window.foodBefore=JSON.stringify(state.cards);
  });
  await run('Conflicting targets are order independent, not averaged or used to claim progress',async p=>{
    await seedFood(p);
    const result=await p.evaluate(()=>{
      const range=getReportRangeMeta(),a=collectFoodReportDays(range)[0];state.cards.reverse();const b=collectFoodReportDays(range)[0];state.cards.reverse();
      return {a:a.target,b:b.target,caloriesA:a.consumed.calories,caloriesB:b.consumed.calories,average:getFoodReportAverageTarget([a],getFoodReportTotals([a])),unchanged:JSON.stringify(state.cards)===window.foodBefore};
    });assert.equal(result.a,null);assert.equal(result.b,null);assert.equal(result.average,null);assert.equal(result.caloriesA,result.caloriesB);assert.equal(result.unchanged,true);
    await p.evaluate(()=>{activeReportType='food';openReportsModal();});
    assert.match(await p.locator('#reportPrintArea').innerText(),/Different tracker targets/);
    await p.getByLabel('Nutrition source').focus();await p.getByLabel('Nutrition source').selectOption('tracker-1');
    assert.equal(await p.evaluate(()=>document.activeElement.id),'foodReportSource');
    assert.doesNotMatch(await p.locator('#reportPrintArea').innerText(),/Different tracker targets/);
    assert.match(await p.locator('#reportPrintArea').innerText(),/2500/);
    assert.equal(await p.evaluate(()=>JSON.stringify(state.cards)===window.foodBefore),true);
  });
  await run('Matching targets combine once; empty report is unreported; source choice stays board scoped',async p=>{
    await seedFood(p);
    const result=await p.evaluate(()=>{
      state.cards[1].foodTargets[getTodayKey().slice(0,7)].calories=2000;
      const days=collectFoodReportDays(getReportRangeMeta());
      return {target:days[0].target.calories,totalTarget:getFoodReportTotals(days).targets.calories,average:getFoodReportAverageTarget([],getFoodReportTotals([]))};
    });assert.deepEqual(result,{target:2000,totalTarget:2000,average:null});
    await p.evaluate(async()=>{dailySession().foodReportSource='tracker-1';saveDailyDraft();state.boards.push(createBoardRecord({id:'other-food-board',name:'Other board',cards:[]}));saveState();await flushDeviceWrites();switchBoard('other-food-board');activeReportType='food';openReportsModal();});
    assert.match(await p.locator('#reportPrintArea').innerText(),/Not recorded/);
    assert.equal(await p.evaluate(()=>dailySession().foodReportSource || ''),'');
  });
  await run('Programme and calendar periods are explicit without changing saved weeks',async p=>{
    await p.evaluate(async program=>{coachingStore().coachingPrograms.push(program);saveState();await flushDeviceWrites();},fixture());
    await workspace(p,'today');assert.equal(await p.getByText('Programme week',{exact:true}).count(),1);
    await p.getByRole('checkbox',{name:'Programme week: Rest',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());
    const before=await p.evaluate(()=>JSON.stringify(coachingProgram().entries));
    await p.locator('#weeklyReviewButton').click();assert.match(await p.locator('#dailyDialog').innerText(),/Calendar week/);await p.keyboard.press('Escape');
    assert.equal(await p.evaluate(()=>JSON.stringify(coachingProgram().entries)),before);
  });
  await run('Resize, device commits and input-blur redraws cannot remove a pressed control before its click',async p=>{
    await p.setViewportSize({width:390,height:844});await workspace(p,'today');
    await p.evaluate(async()=>{await flushDeviceWrites();await new Promise(resolve=>requestAnimationFrame(resolve));});
    const button=p.getByRole('button',{name:'Customize Today',exact:true});
    const box=await button.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();
    assert.equal(await p.evaluate(()=>{window.pressedControl=document.querySelector('[aria-label="Customize Today"]');window.pressedControl.addEventListener('click',()=>{window.pointersDuringClick=activeBoardPointers.size;});renderCardsOnly({reason:'device-commit'});renderCardsOnly({force:true});queueBoardRender();return window.pressedControl.isConnected;}),true);
    await p.waitForTimeout(650);assert.equal(await p.evaluate(()=>window.pressedControl.isConnected),true);
    await p.mouse.up();await p.locator('#dailyDialog[open]').waitFor();assert.equal(await p.evaluate(()=>window.pointersDuringClick),0);await p.keyboard.press('Escape');
    await p.waitForFunction(()=>activeBoardPointers.size===0);
    await p.evaluate(()=>{renderCardsOnly({reason:'device-commit'});});assert.equal(await p.evaluate(()=>window.pressedControl.isConnected),false);
    await p.getByRole('button',{name:'Customize Today',exact:true}).click();await p.locator('#dailyDialog[open]').waitFor();
  });
  await run('Phone removes duplicate navigation and puts writing before secondary summaries without losing drafts',async p=>{
    await p.setViewportSize({width:390,height:844});await workspace(p,'today');
    assert.equal(await p.locator('.workspace-modes').isVisible(),false);
    const thoughts=p.getByLabel('Diary thoughts');
    await p.waitForFunction(()=>{
      const textarea=document.querySelector('textarea[aria-label="Diary thoughts"]'),rect=textarea?.getBoundingClientRect();
      return rect && rect.width>0 && rect.height>0 && rect.y<760;
    });
    await thoughts.fill('A complete thought\nStill thinking after a pause.');await p.evaluate(()=>flushDeviceWrites());
    await p.screenshot({path:out+'/today-phone.png',fullPage:true});
    await workspace(p,'tasks');await workspace(p,'calendar');await workspace(p,'board');await workspace(p,'priorities');await workspace(p,'today');
    assert.equal(await thoughts.inputValue(),'A complete thought\nStill thinking after a pause.');
    await p.setViewportSize({width:1080,height:1400});await p.screenshot({path:out+'/today-portrait.png',fullPage:true});
    await p.reload();await workspace(p,'today');assert.equal(await thoughts.inputValue(),'A complete thought\nStill thinking after a pause.');
  });
  await browser.close();fs.writeFileSync(out+'/refinements-results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
