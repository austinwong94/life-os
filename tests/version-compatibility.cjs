const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),browsers=require('playwright');
const url=new URL(process.env.TEST_URL || 'http://127.0.0.1:5180/');url.searchParams.set('preview','1');url.searchParams.set('liveReload','0');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-version-compatibility';fs.mkdirSync(out,{recursive:true});
// Exercise the actual last committed release, not a hand-written imitation.
const baseline='2c1bf351901a2fed26c01283977e301ca3c2b468';
const gitFile=path=>execFileSync('git',['show',baseline+':'+path],{maxBuffer:8*1024*1024});
const oldFiles=new Map(JSON.parse(gitFile('release-files.json')).map(path=>[path,gitFile(path)]));
const results=[];
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,fn){
    if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'}),errors=[];
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Isolated compatibility records only'}));
    context.on('page',p=>{p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));});
    const p=await context.newPage();await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url.href);await seed(p);await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){
      results.push({name,pass:false,error:error.stack,errors});
      const views=[];
      for(const page of context.pages())views.push(await page.evaluate(()=>{
        const read=fn=>{try{return fn();}catch(error){return {captureError:error.message};}};
        return {client:typeof LifeDeviceStore.requireOrder==='function'?'current':'pinned',memory:read(()=>getStateForStorage()),stored:read(()=>JSON.parse(localStorage.getItem(STORAGE_KEY))),pending:read(()=>LifeDeviceStore.pending()),checkpoint:read(()=>LifeDeviceStore.checkpointSnapshot()),saveError:read(()=>lastDeviceSaveError)};
      }).catch(error=>({captureError:error.message})));
      fs.writeFileSync(out+'/failure-'+results.length+'.json',JSON.stringify({name,error:error.stack,views},null,2));
      await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});
    }
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function seed(p){
    await p.evaluate(async()=>{
      const cards=id=>{
        const diary={...makeCard({type:'diary',title:'Private diary',category:'Personal'}),id:id+'-diary'};
        diary.diaryEntries={'2026-10-16':{thoughts:'Original '+id+' complete diary\nSecond line',updatedAt:Date.now()}};
        const planner={...makeCard({type:'planner',title:'Shared source',category:'Personal'}),id:id+'-planner'};
        LifePlanner.add(planner,'2026-10-15','Archive target',id+'-archive',1000);
        LifePlanner.add(planner,'2026-10-15','Same title',id+'-same-one',1000);
        LifePlanner.add(planner,'2026-10-15','Same title',id+'-same-two',1000);LifePlanner.project(planner);
        return [diary,planner,{...makeCard({type:'sidenote',title:'My notes',category:'Personal'}),id:id+'-notes'}];
      };
      state.boards=['one','two','three'].map(id=>createBoardRecord({id,name:id,cards:cards(id),archivedCards:[]}));
      switchBoard('one');await flushDeviceWrites();
    });
  }
  async function oldPage(context,board='two'){
    const p=await context.newPage();await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    await p.route(url.origin+'/**',route=>{
      const path=new URL(route.request().url()).pathname.slice(url.pathname.replace(/[^/]*$/,'').length) || 'index.html';
      if(!oldFiles.has(path))return route.fulfill({status:404,body:'Not in pinned release'});
      const contentType=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html';
      return route.fulfill({status:200,body:oldFiles.get(path),contentType});
    });
    await p.goto(url.href);assert.equal(await p.evaluate(()=>typeof LifeDeviceStore.requireOrder),'undefined');
    await p.evaluate(board=>switchBoard(board),board);return p;
  }
  async function updateNotice(p){
    await p.route('**/release.json?check=*',r=>r.fulfill({json:{id:'bbbbbbbbbbbbbbbb',files:{'index.html':'b'.repeat(64)}}}));
    await p.evaluate(()=>{publishedReleaseCheckAt=0;return checkPublishedRelease('aaaaaaaaaaaaaaaa');});
    await p.getByRole('region',{name:'Website update'}).waitFor();
  }
  const snapshot=p=>p.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)));
  const task=(saved,id)=>saved.boards.find(b=>b.id==='one').cards.find(c=>c.id==='one-planner').plannerTasks.find(t=>t.id===id);
  await run('update refuses an unconfirmed save even with an empty journal and retains the complete current view',async p=>{
    await updateNotice(p);
    const before=await p.evaluate(()=>{
      state.deviceWriteHeads.missingPrerequisite=1;localMergeBase=getStateForStorage();
      return JSON.stringify(getStateForStorage());
    });
    assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);
    let navigations=0;p.on('framenavigated',frame=>{if(frame===p.mainFrame())navigations++;});
    assert.equal(await p.evaluate(()=>applyPublishedUpdate()),false);
    assert.equal(navigations,0);assert.equal(await p.evaluate(()=>JSON.stringify(getStateForStorage())),before);
    assert.match(await p.locator('#releaseUpdateMessage').innerText(),/not confirmed/i);
    assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);
  });
  await run('update handles an unexpected save failure without reloading or discarding writing and can retry',async p=>{
    await updateNotice(p);const before=await snapshot(p);
    await p.evaluate(()=>{window.originalFlush=flushDeviceWrites;flushDeviceWrites=async()=>{throw new Error('Synthetic save rejection');};});
    assert.equal(await p.evaluate(()=>applyPublishedUpdate()),false);assert.deepEqual(await snapshot(p),before);
    assert.match(await p.locator('#releaseUpdateMessage').innerText(),/not confirmed/i);
    await p.evaluate(()=>flushDeviceWrites=window.originalFlush);
    const reload=p.waitForEvent('framenavigated',f=>f===p.mainFrame());await p.getByRole('button',{name:'Update now',exact:true}).click();await reload;
    await p.waitForFunction(()=>typeof state!=='undefined' && typeof STORAGE_KEY!=='undefined' && state.cards?.length);
    assert.deepEqual(await snapshot(p),before);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.type==='diary').diaryEntries['2026-10-16'].thoughts),'Original one complete diary\nSecond line');
  });
  await run('a confirmed save does not permit an update to interrupt a paused unsubmitted task draft',async p=>{
    await updateNotice(p);const text='An unfinished task that I may return to later';
    await p.getByRole('textbox',{name:'Planner task',exact:true}).fill(text);
    await p.evaluate(()=>{document.activeElement.blur();textEditGuardUntil=0;});
    let navigations=0;p.on('framenavigated',frame=>{if(frame===p.mainFrame())navigations++;});
    await p.getByRole('button',{name:'Update now',exact:true}).click();
    await p.getByText('Finish or save your open draft before updating. Your writing has not been changed.',{exact:true}).waitFor();
    assert.equal(navigations,0);assert.equal(await p.getByRole('textbox',{name:'Planner task',exact:true}).inputValue(),text);
    assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.type==='planner').plannerDraftText),text);
  });
  await run('repeated update requests share one save check and restore the retry control on refusal',async p=>{
    await updateNotice(p);
    await p.evaluate(()=>{
      window.saveChecks=0;window.updateResults=[];
      flushDeviceWrites=()=>{saveChecks++;return new Promise(resolve=>window.finishSaveCheck=resolve);};
      applyPublishedUpdate().then(result=>updateResults.push(result));applyPublishedUpdate().then(result=>updateResults.push(result));
    });
    const button=p.getByRole('button',{name:'Update now',exact:true});assert(await button.isDisabled());assert.equal(await button.getAttribute('aria-busy'),'true');
    assert.equal(await p.evaluate(()=>saveChecks),1);assert.equal(await p.locator('#releaseUpdateMessage').innerText(),'Checking device save before updating...');
    await p.evaluate(()=>finishSaveCheck(false));await p.waitForFunction(()=>updateResults.length===2);
    assert.deepEqual(await p.evaluate(()=>updateResults),[false,false]);assert(await button.isEnabled());assert.equal(await button.getAttribute('aria-busy'),null);
    assert.match(await p.locator('#releaseUpdateMessage').innerText(),/not confirmed/i);
    for(const width of [320,390,1080]){
      await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await button.scrollIntoViewIfNeeded();assert((await button.boundingBox()).height>=(width<=390?44:36));
    }
    await p.setViewportSize({width:390,height:844});await p.getByRole('region',{name:'Website update'}).scrollIntoViewIfNeeded();await p.screenshot({path:out+'/blocked-update-phone.png'});
  });
  await run('the pinned release and new source preserve 180 interleaved diary edits across three independent boards',async(p,context)=>{
    const pages=[p,await oldPage(context,'two'),await oldPage(context,'three')];
    for(let i=0;i<pages.length;i++)assert.equal(await pages[i].evaluate(()=>sessionStorage.getItem(LifeStorageScope.key('life-os-active-board'))),['one','two','three'][i]);
    for(let round=0;round<6;round++){
      await Promise.all(pages.map((page,i)=>page.evaluate(async({round,i})=>{
        for(let n=0;n<10;n++){
          updateDiaryEntry(state.cards.find(c=>c.type==='diary'),getTodayKey(),{thoughts:'Round '+round+' board '+i+' edit '+n+'\nEvery character retained'});
          await new Promise(resolve=>setTimeout(resolve,3));
        }
        return flushDeviceWrites();
      },{round,i})));
      const expected=[0,1,2].map(i=>'Round '+round+' board '+i+' edit 9\nEvery character retained');
      await p.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem(STORAGE_KEY)).boards.map(b=>b.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts))===JSON.stringify(expected),expected);
      for(const page of pages)assert.equal(await page.evaluate(()=>state.syncConflicts.length),0,JSON.stringify(await page.evaluate(()=>state.syncConflicts)));
    }
    for(let i=0;i<pages.length;i++){
      await pages[i].reload();await pages[i].evaluate(()=>flushDeviceWrites());
      assert.equal(await pages[i].evaluate(()=>state.activeBoardId),['one','two','three'][i]);
      assert.equal(await pages[i].evaluate(()=>state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts),'Round 5 board '+i+' edit 9\nEvery character retained');
      assert.equal(await pages[i].evaluate(()=>LifeDeviceStore.pending().length),0);
    }
  });
  for(const committer of ['new','old'])await run('a stale pinned-release rename cannot resurrect a newly archived task when '+committer+' commits',async(p,context)=>{
    const old=await oldPage(context,'one');
    for(const page of [p,old])await page.evaluate(()=>LifeDeviceStore.configure(()=>false));
    assert.equal(await p.evaluate(()=>archivePlannerTask(getPlannerSourceItems().find(item=>item.taskId==='one-archive'))),true);
    await old.evaluate(()=>{
      const source=state.cards.find(c=>c.id==='one-planner');LifePlanner.change(source,'one-archive',{title:'Old tab retained rename'});LifePlanner.project(source);saveState({skipCloud:true});
    });
    const writer=committer==='new'?p:old;assert.equal(await writer.evaluate(async()=>{LifeDeviceStore.configure(commitDeviceWrites);return flushDeviceWrites();}),true);
    const saved=await snapshot(writer),archived=task(saved,'one-archive');assert(archived.archivedAt);assert.equal(archived.title,'Archive target');assert.equal(archived.done,false);
    assert(saved.syncConflicts.some(c=>c.kind==='planner-task' && [c.local,c.remote].some(t=>t.title==='Old tab retained rename')));
    for(const id of ['one-same-one','one-same-two'])assert.equal(task(saved,id).archivedAt || 0,0);
    await p.reload();assert.equal(await p.evaluate(()=>getPlannerSourceItems().filter(item=>item.taskId==='one-archive').length),0);
    assert.equal(await p.evaluate(()=>state.syncConflicts.length),1);
  });
  await run('an older client can commit new pending writing and immutable daily records without stripping fields',async(p,context)=>{
    const old=await oldPage(context,'two');
    for(const page of [p,old])await page.evaluate(()=>LifeDeviceStore.configure(()=>false));
    const records=await p.evaluate(()=>{
      saveDailyRecord({kind:'review',date:'2026-10-12',mattered:'My full reflection\nSecond line',easier:'One smaller step'});
      updateDiaryEntry(state.cards.find(c=>c.type==='diary'),getTodayKey(),{thoughts:'New pending complete diary\nEvery line kept'});
      state.cards.find(c=>c.type==='sidenote').sideNoteDrafts={'2026-10-16':'A pending note draft\nStill thinking'};saveState({skipCloud:true});
      return JSON.parse(JSON.stringify(dailyRecords()));
    });
    await old.evaluate(()=>updateDiaryEntry(state.cards.find(c=>c.type==='diary'),getTodayKey(),{thoughts:'Older client independent diary\nIts own full text'}));
    assert.equal(await old.evaluate(async()=>{LifeDeviceStore.configure(commitDeviceWrites);return flushDeviceWrites();}),true);
    await p.reload();assert.deepEqual(await p.evaluate(()=>dailyRecords()),records);
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts),'New pending complete diary\nEvery line kept');
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.type==='sidenote').sideNoteDrafts[getTodayKey()]),'A pending note draft\nStill thinking');
    const saved=await snapshot(p);assert.equal(saved.boards.find(b=>b.id==='two').cards.find(c=>c.type==='diary').diaryEntries['2026-10-16'].thoughts,'Older client independent diary\nIts own full text');
    assert.equal(saved.syncConflicts.length,0);
  });
  await run('retroactive task completion retains its selected day and timestamp beside an older-client save',async(p,context)=>{
    const old=await oldPage(context,'two');
    const completed=await p.evaluate(async()=>{
      const ref=getPlannerSourceItems().find(item=>item.taskId==='one-same-one');await togglePlannerTaskDone({...ref,dateKey:'2026-10-15'});await flushDeviceWrites();
      return state.cards.find(c=>c.id==='one-planner').plannerTasks.find(t=>t.id==='one-same-one');
    });
    assert.equal(completed.completedOn,'2026-10-15');
    await old.locator('.diary-thoughts').fill('Old client wrote on another board after completion.');await old.evaluate(()=>flushDeviceWrites());
    await p.reload();const saved=await snapshot(p);assert.deepEqual(task(saved,'one-same-one'),completed);assert.equal(task(saved,'one-same-two').done,false);
    assert.equal(await p.evaluate(()=>getPlannerViewData('today','Personal',{},'2026-10-16').items.some(item=>item.taskId==='one-same-one')),false);
  });
  await run('same-field writing from old and new clients retains both complete versions for review',async(p,context)=>{
    const old=await oldPage(context,'one');
    for(const page of [p,old])await page.evaluate(()=>LifeDeviceStore.configure(()=>false));
    await p.locator('.diary-thoughts').fill('New client complete thoughts\nSecond new line');await old.locator('.diary-thoughts').fill('Old client complete thoughts\nSecond old line');
    const committed=await p.evaluate(async()=>{LifeDeviceStore.configure(commitDeviceWrites);const ok=await flushDeviceWrites();return {ok,error:lastDeviceSaveError,saved:readStoredStateSnapshot()?.deviceWriteHeads,observed:localMergeBase?.deviceWriteHeads,checkpoint:LifeDeviceStore.checkpointSnapshot()?.deviceWriteHeads,pending:LifeDeviceStore.pending().map(row=>({writer:row.entry.writerId,sequence:row.entry.sequence,parent:row.entry.previousSequence}))};});
    assert.equal(committed.ok,true,JSON.stringify(committed));
    const saved=await snapshot(p),texts=JSON.stringify(saved.syncConflicts);
    assert(texts.includes('New client complete thoughts\\nSecond new line'));assert(texts.includes('Old client complete thoughts\\nSecond old line'));assert(saved.syncConflicts.length>0);
    await p.reload();assert(await p.evaluate(()=>cloudConflictPending));
    const waiting=p.waitForEvent('download');await p.evaluate(()=>exportBoardBackup());const json=JSON.parse(fs.readFileSync(await (await waiting).path(),'utf8'));
    assert(JSON.stringify(json).includes('New client complete thoughts\\nSecond new line'));assert(JSON.stringify(json).includes('Old client complete thoughts\\nSecond old line'));
  });
  fs.writeFileSync(out+'/results.json',JSON.stringify({baseline,results},null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
