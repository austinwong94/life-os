const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-readable-export';
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1080,height:1000},timezoneId:'Asia/Kuala_Lumpur'}),errors=[];
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic export tests only'}));
    context.on('page',p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));});
    const p=await context.newPage();await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await seed(p);await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function seed(p){
    await p.evaluate(async()=>{
      state.cards=['diary','sidenote','planner','quote','checklist'].map(type=>makeCard({type,title:'Synthetic '+type,category:'Personal'}));state.archivedCards=[];
      state.cards.find(c=>c.type==='diary').diaryEntries={'2026-10-16':{thoughts:'Current complete diary\nSecond line',sentence:'Current sentence',updatedAt:Date.now()}};
      saveState({skipCloud:true});await flushDeviceWrites();renderCardsOnly({force:true});LifeDeviceStore.configure(()=>false);
      window.exportFixture=JSON.parse(JSON.stringify(getExportSnapshot()));
    });
  }
  async function readable(p){
    const waiting=p.waitForEvent('download');await p.evaluate(()=>exportReadableDataArchive());const download=await waiting;
    assert.match(download.suggestedFilename(),/life-os-readable-archive.*\.html$/);
    return fs.readFileSync(await download.path(),'utf8');
  }
  async function backup(p){
    const waiting=p.waitForEvent('download');await p.evaluate(()=>exportBoardBackup());return JSON.parse(fs.readFileSync(await (await waiting).path(),'utf8'));
  }
  await run('download includes complete current writing and other-writer pending records without committing or merging them',async p=>{
    const before=await p.evaluate(()=>{
      const base=exportFixture,next=JSON.parse(JSON.stringify(base)),board=next.boards.find(b=>b.id===next.activeBoardId);
      board.cards.find(c=>c.type==='diary').diaryEntries['2026-10-16'].thoughts='Other writer diary\nEvery word survives.';
      board.cards.find(c=>c.type==='sidenote').sideNoteEntries={'2026-10-16':{notes:[{id:'pending-note',text:'A complete pending note',createdAt:Date.now()}]}};
      board.cards.find(c=>c.type==='quote').description='My pending motivation\nKeep the next line.';
      board.cards.find(c=>c.type==='checklist').items=[{id:'project-step',text:'Pending project step',done:false}];
      const planner=board.cards.find(c=>c.type==='planner');LifePlanner.add(planner,'2026-10-17','Pending future task','future-task');
      next.deviceWriteHeads={absentParent:1};
      LifeDeviceStore.stage({...base,deviceWriteHeads:{absentParent:1}},next);
      const original=getExportSnapshot();return {state:JSON.stringify(original),storage:JSON.stringify({...localStorage})};
    });
    const html=await readable(p);
    for(const text of ['Current complete diary\nSecond line','Other writer diary\nEvery word survives.','A complete pending note','My pending motivation\nKeep the next line.','Pending project step','Pending future task','Pending device versions','Pending copies are not confirmed shared-device saves','None is a cloud save receipt'])assert(html.includes(text),text);
    assert.match(await p.locator('#dataSafetyStatus').textContent(),/device versions included separately/);
    const after=await p.evaluate(()=>({state:JSON.stringify(getExportSnapshot()),storage:JSON.stringify({...localStorage})}));assert.deepEqual(after,before);
    assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),1);
  });
  await run('retains every distinct version with clock skew, identical board names and independent writers; identical versions are not duplicated',async p=>{
    const counts=await p.evaluate(()=>{
      const base=exportFixture,board=base.boards.find(b=>b.id===base.activeBoardId);
      for(let i=0;i<12;i++){
        const next=JSON.parse(JSON.stringify(base)),copy=next.boards.find(b=>b.id===base.activeBoardId);
        copy.name='Same board name';copy.cards.find(c=>c.type==='diary').diaryEntries['2026-10-16'].thoughts='Version '+i+' full text';
        localStorage.setItem(LifeDeviceStore.legacyPrefix+'writer:'+i,JSON.stringify({base,state:next,writerId:'writer',sequence:i+1,savedAt:100-i}));
      }
      const last=JSON.parse(localStorage.getItem(LifeDeviceStore.legacyPrefix+'writer:11'));
      localStorage.setItem(LifeDeviceStore.legacyPrefix+'independent:1',JSON.stringify({...last,writerId:'independent',sequence:1}));
      const different=JSON.parse(JSON.stringify(last));different.state.boards.find(b=>b.id===base.activeBoardId).id='independent-board';
      localStorage.setItem(LifeDeviceStore.legacyPrefix+'another:1',JSON.stringify({...different,writerId:'another',sequence:1}));
      const projection=collectReadableDeviceCopies(base,LifeDeviceStore.inspectPending());
      return {packets:projection.packetCount,versions:projection.copies.length};
    });
    assert.deepEqual(counts,{packets:14,versions:13});const html=await readable(p);
    for(let i=0;i<12;i++)assert(html.includes('Version '+i+' full text'));
    assert(html.includes('Board ID: independent-board'));assert(html.includes('device writer 2'));
    assert.equal((html.match(/Version 11 full text/g)||[]).length,2); // Different board IDs must remain separate.
    assert.equal(await p.evaluate(()=>state.syncConflicts.length),0);
  });
  await run('damaged packets do not conceal healthy writing; readable download warns and restore backup retains original damaged bytes',async p=>{
    await p.evaluate(()=>{
      const next=JSON.parse(JSON.stringify(exportFixture));next.boards[0].cards.find(c=>c.type==='diary').diaryEntries['2026-10-16'].thoughts='Healthy pending text beside damaged packet';
      LifeDeviceStore.stage(exportFixture,next);localStorage.setItem(LifeDeviceStore.prefix+'broken:1','{damaged-private-copy');
    });
    const html=await readable(p);assert(html.includes('Healthy pending text beside damaged packet'));assert(html.includes('Incomplete recovery coverage'));
    assert.match(await p.locator('#dataSafetyStatus').textContent(),/some device copies need recovery/);
    const json=await backup(p);assert.equal(json.localRecovery.pendingDeviceWrites.length,1);
    assert.equal(json.localRecovery.unreadablePendingDeviceWrites[0].raw,'{damaged-private-copy');
    assert.equal(await p.evaluate(()=>localStorage.getItem(LifeDeviceStore.prefix+'broken:1')),'{damaged-private-copy');
    assert(await p.evaluate(()=>{try{LifeDeviceStore.pending();return false;}catch{return true;}}));
  });
  await run('downloads preserve unfinished drafts, exact whitespace, and exclude sign-in URL parameters and stored sessions',async p=>{
    await p.evaluate(()=>{
      history.replaceState(null,'','?preview=1&liveReload=0&code=OAUTH-CODE-PRIVATE#access_token=PRIVATE-TOKEN');
      localStorage.setItem('unrelated-auth-session',JSON.stringify({access_token:'NEVER-EXPORT-SESSION'}));
      state.cards.find(c=>c.type==='sidenote').sideNoteDrafts={'2026-10-16':'  Unsubmitted note\nSecond unfinished line  '};
      state.cards.find(c=>c.type==='planner').plannerDraftText='Unsubmitted future task';
      state.cards.find(c=>c.type==='checklist').checklistDraftText='Unsubmitted project step';
      state.cards.find(c=>c.type==='quote').description='  Motivation first line\n  Indented next line  ';
      const diary=state.cards.find(c=>c.type==='diary');diary.diaryEntries['2026-10-16'].thoughts='Unstaged diary with every character\nNot lost because saving failed.';
      lastLocalSaveOk=false;
    });
    const html=await readable(p);
    for(const text of ['  Unsubmitted note\nSecond unfinished line  ','Unsubmitted future task','Unsubmitted project step','  Motivation first line\n  Indented next line  ','Unstaged diary with every character\nNot lost because saving failed.'])assert(html.includes(text),text);
    for(const secret of ['OAUTH-CODE-PRIVATE','PRIVATE-TOKEN','NEVER-EXPORT-SESSION'])assert(!html.includes(secret));
    assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);assert.match(html,/not proof of cloud sync/);
    const json=await backup(p);assert(!JSON.stringify(json).includes('OAUTH-CODE-PRIVATE'));assert(!JSON.stringify(json).includes('PRIVATE-TOKEN'));assert(!JSON.stringify(json).includes('NEVER-EXPORT-SESSION'));
  });
  await run('real typing after a device quota failure can be downloaded without another keystroke or a false saved indicator',async p=>{
    await workspace(p,'today');
    await p.evaluate(()=>{LifeDeviceStore.stage=()=>{throw new DOMException('Synthetic device quota','QuotaExceededError');};});
    const thoughts='My new diary thoughts\nEvery character must be readable.',note='An unfinished note\nStill thinking about this.';
    await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).fill(thoughts);
    await p.getByRole('textbox',{name:'Quick note',exact:true}).fill(note);
    const status=await p.locator('#headerSaveStatus').innerText();assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);
    const html=await readable(p);assert(html.includes(thoughts));assert(html.includes(note));
    assert.equal(await p.locator('#headerSaveStatus').innerText(),status);assert.equal(await p.getByRole('textbox',{name:'Diary thoughts',exact:true}).inputValue(),thoughts);
    assert.equal(await p.getByRole('textbox',{name:'Quick note',exact:true}).inputValue(),note);assert.equal(await p.evaluate(()=>lastLocalSaveOk),false);
  });
  await run('unsafe links and markup remain literal; offline archive fits phone and portrait widths with usable disclosures',async(p,context)=>{
    await p.evaluate(()=>{
      const base=exportFixture,next=JSON.parse(JSON.stringify(base)),board=next.boards[0];
      board.name='A'.repeat(120);board.cards.push({id:'video',type:'video',title:'<img src=x onerror="window.unsafe=1">',videoUrl:'javascript:window.unsafe=2'});
      board.cards.find(c=>c.type==='diary').diaryEntries['2026-10-16'].thoughts='<script>window.unsafe=3</script>';
      LifeDeviceStore.stage(base,next);
    });
    const html=await readable(p);assert(!html.includes('href="javascript:'));assert(html.includes('&lt;script&gt;window.unsafe=3&lt;/script&gt;'));
    const archive=await context.newPage();await archive.setContent(html);await archive.locator('.pending-version > summary').first().click();
    assert.equal(await archive.locator('.pending-version[open]').count(),1);assert.equal(await archive.evaluate(()=>window.unsafe),undefined);
    assert.equal(await archive.locator('script,img').count(),0);assert.equal(await archive.locator('meta[http-equiv="Content-Security-Policy"]').count(),1);
    for(const width of [320,390,1080]){
      await archive.setViewportSize({width,height:1000});
      const overflow=await archive.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,12));
      assert(await archive.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Archive overflow at '+width+': '+JSON.stringify(overflow));
      assert((await archive.locator('.pending-version > summary').first().boundingBox()).height>=44);
    }
    await archive.setViewportSize({width:390,height:844});await archive.locator('.pending-copies').scrollIntoViewIfNeeded();await archive.screenshot({path:out+'/pending-versions-phone.png'});
    await archive.setViewportSize({width:1080,height:1000});await archive.screenshot({path:out+'/pending-versions-portrait.png'});
  });
  await run('malformed board versions warn without aborting healthy versions or changing original packets',async p=>{
    await p.evaluate(()=>{
      const next=JSON.parse(JSON.stringify(exportFixture));next.boards.push({id:'damaged-board',name:'Needs recovery',cards:[null]});
      LifeDeviceStore.stage(exportFixture,next);
    });
    const before=await p.evaluate(()=>JSON.stringify({...localStorage})),html=await readable(p);
    assert(html.includes('This board version could not be rendered'));assert(html.includes('Current complete diary\nSecond line'));
    assert.match(await p.locator('#dataSafetyStatus').textContent(),/some device copies need recovery/);
    assert.equal(await p.evaluate(()=>JSON.stringify({...localStorage})),before);
  });
  await run('wide money records become readable labelled fields with every value retained and no sideways scrolling',async(p,context)=>{
    await p.evaluate(()=>{
      const ledger=LifeMoney.empty();ledger.accounts=[{id:'bank',name:'My bank',owner:'personal',openingCents:100000,openingDate:'2026-10-01',reservedCents:0}];
      ledger.entries=[{id:'entry',kind:'expense',title:'My complete financial record',amountCents:12345,accountId:'bank',status:'settled',date:'2026-10-15',dueDate:'2026-10-15',repeat:'none',category:'Personal',note:'Full private notes remain available in the download',reference:'Reference kept'}];
      LifeMoney.validate(ledger);state.boards.find(b=>b.id===state.activeBoardId).money=ledger;
    });
    const html=await readable(p);assert(html.includes('Full private notes remain available in the download'));assert(html.includes('Unpaid bill remainder'));
    const archive=await context.newPage();await archive.setContent(html);
    const region=archive.getByRole('region',{name:'Money records',exact:true});assert.equal(await region.getAttribute('tabindex'),'0');
    for(const width of [320,390,1080]){
      await archive.setViewportSize({width,height:844});assert(await archive.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert(await region.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      for(const label of ['Entry','Amount','Status','Account','Recorded date','Due date','Category','Reference','Notes']){
        const fields=region.locator('td[data-label="'+label+'"]');assert(await fields.count()>0,label);
        for(const field of await fields.all()){assert(await field.isVisible(),label+' at '+width);assert((await field.innerText()).trim(),label);}
      }
    }
    await region.focus();assert(await region.evaluate(e=>e===document.activeElement));await archive.setViewportSize({width:320,height:844});
    await region.scrollIntoViewIfNeeded();await archive.screenshot({path:out+'/money-archive-phone.png'});
  });
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
