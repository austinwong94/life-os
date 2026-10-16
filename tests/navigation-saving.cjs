const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-navigation-saving';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Isolated synthetic records only'}));
    const errors=[];context.on('page',p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));});
    const p=await context.newPage();await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function seed(p){
    await p.evaluate(async()=>{
      const cards=id=>['diary','sidenote','planner'].map(type=>({...makeCard({type,title:type,category:'Personal'}),id:id+'-'+type}));
      state.cards=cards('one');state.archivedCards=[];
      for(const id of ['two','three'])state.boards.push(createBoardRecord({id,name:id,cards:cards(id)}));
      saveState();await flushDeviceWrites();renderCardsOnly({force:true});
    });await workspace(p,'today');
  }
  await run('view changes preserve every diary character and unsubmitted note while commits are paused',async p=>{
    await seed(p);await p.evaluate(()=>LifeDeviceStore.configure(()=>false));
    const text='I can pause to think.\nEvery word stays when I switch views.',note='An unfinished idea\nKeep both lines.';
    await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).pressSequentially(text,{delay:3});
    await p.getByRole('textbox',{name:'Quick note',exact:true}).fill(note);
    for(const mode of ['priorities','records','board','tasks','today'])await workspace(p,mode);
    assert.equal(await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).inputValue(),text);
    assert.equal(await p.getByRole('textbox',{name:'Quick note',exact:true}).inputValue(),note);
    assert(await p.evaluate(()=>LifeDeviceStore.pending().length>0));
    assert(await p.evaluate(async()=>{LifeDeviceStore.configure(commitDeviceWrites);return flushDeviceWrites();}));
    await p.reload();await workspace(p,'today');
    assert.equal(await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).inputValue(),text);
    assert.equal(await p.getByRole('textbox',{name:'Quick note',exact:true}).inputValue(),note);
    assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);
  });
  await run('three independent boards keep live typing, navigation and completed text through reload',async(p,context)=>{
    await seed(p);const pages=[p,await context.newPage(),await context.newPage()],ids=['personal-board','two','three'];
    for(let i=1;i<pages.length;i++){
      await pages[i].clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));await pages[i].goto(url+'?preview=1&liveReload=0');await pages[i].evaluate(id=>switchBoard(id),ids[i]);await workspace(pages[i],'today');
    }
    const text=i=>'Board '+i+': my complete thoughts.\nI do not need to finish before switching views.';
    await Promise.all(pages.map(async(page,i)=>{
      await page.getByRole('textbox',{name:'Diary thoughts',exact:true}).pressSequentially(text(i),{delay:4});
      await workspace(page,'priorities');await workspace(page,'today');
      assert.equal(await page.getByRole('textbox',{name:'Diary thoughts',exact:true}).inputValue(),text(i));await page.evaluate(()=>flushDeviceWrites());
    }));
    for(let i=0;i<pages.length;i++){
      await pages[i].reload();await workspace(pages[i],'today');assert.equal(await pages[i].evaluate(()=>state.activeBoardId),ids[i]);
      assert.equal(await pages[i].getByRole('textbox',{name:'Diary thoughts',exact:true}).inputValue(),text(i));assert.equal(await pages[i].evaluate(()=>state.syncConflicts.length),0);
    }
  });
  await run('missing prerequisites show a pending warning, preserve full writing, and recover without a false conflict',async p=>{
    await seed(p);const text='This complete entry stays pending until the parent save is visible.\nNothing is discarded.';
    await p.evaluate(()=>{state.deviceWriteHeads.syntheticParent=1;localMergeBase=getStateForStorage();});
    await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).fill(text);
    assert.equal(await p.evaluate(()=>flushDeviceWrites()),false);
    assert.match(await p.locator('#headerSaveStatus').innerText(),/Pending copy kept - waiting for another tab/);
    assert.equal(await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).inputValue(),text);
    assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);
    assert(await p.evaluate(text=>LifeDeviceStore.pending().some(row=>row.entry.state.boards.some(board=>board.cards.some(card=>card.diaryEntries?.[getTodayKey()]?.thoughts===text))),text));
    await p.locator('#headerSaveStatus').click();const dialog=p.locator('#dailyDialog');assert.match(await dialog.innerText(),/Pending copies kept - shared save not confirmed/);
    await dialog.getByRole('button',{name:'Retry device save',exact:true}).click();await dialog.getByText('Device save is not confirmed. Pending copies are kept; keep this tab open.',{exact:true}).waitFor();
    for(const width of [1080,390,320]){
      await p.setViewportSize({width,height:844});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'saving dialog overflows '+width);
      assert(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'saving dialog content overflows '+width);
      assert(await dialog.getByRole('button',{name:'Retry device save',exact:true}).evaluate((n,min)=>n.getBoundingClientRect().height>=min,width<=700?44:36));
    }
    await dialog.getByRole('button',{name:'Retry device save',exact:true}).scrollIntoViewIfNeeded();
    await p.screenshot({path:out+'/waiting-preserves-writing.png',fullPage:false});
    await p.evaluate(()=>{const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));stored.deviceWriteHeads.syntheticParent=1;localStorage.setItem(STORAGE_KEY,JSON.stringify(stored));});
    await dialog.getByRole('button',{name:'Retry device save',exact:true}).click();await dialog.getByText('Device save confirmed.',{exact:true}).waitFor();await p.keyboard.press('Escape');
    assert.doesNotMatch(await p.locator('#headerSaveStatus').innerText(),/Pending copy kept/);
    await p.reload();await workspace(p,'today');assert.equal(await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).inputValue(),text);assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);
  });
  await run('Retry stages complete writing after a rejected storage write without another keystroke',async p=>{
    await seed(p);await p.evaluate(()=>{window.originalStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw Object.assign(new Error('Synthetic quota failure'),{name:'QuotaExceededError'});};});
    const text='My complete unstaged writing.\nRetry must save it without typing again.';
    await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).fill(text);assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);
    await p.locator('#headerSaveStatus').click();const dialog=p.locator('#dailyDialog');
    await dialog.getByRole('button',{name:'Retry device save',exact:true}).click();await dialog.getByText('Not saved on this device. Keep this tab open and download your information or open Recovery.',{exact:true}).waitFor();
    await p.evaluate(()=>{LifeDeviceStore.stage=originalStage;});
    await dialog.getByRole('button',{name:'Retry device save',exact:true}).click();await dialog.getByText('Device save confirmed.',{exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>lastLocalSaveOk),true);await p.keyboard.press('Escape');await p.reload();await workspace(p,'today');
    assert.equal(await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).inputValue(),text);assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(row=>!row.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
