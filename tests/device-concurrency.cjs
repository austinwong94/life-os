const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const url=new URL(process.env.TEST_URL || 'http://127.0.0.1:5180/');url.searchParams.set('liveReload','0');url.searchParams.delete('preview');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-device-concurrency';fs.mkdirSync(out,{recursive:true});
const results=[];
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,fn,init){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'}),errors=[];
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic device records only; external services blocked'}));
    if(init)await context.addInitScript(init);
    context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);});
    const p=await context.newPage();
    try{await p.goto(url.href);await setup(p);await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function setup(p){
    await p.evaluate(async()=>{
      const diary=id=>({...makeCard({type:'diary',title:'Diary '+id}),id:id+'-diary'});
      state.boards=['one','two'].map(id=>createBoardRecord({id,name:id,cards:[diary(id)],archivedCards:[]}));
      applyBoardToState(state,'one');saveState({skipCloud:true});await flushDeviceWrites();render();
    });
  }
  const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem(STORAGE_KEY)));
  const text=(snapshot,id)=>snapshot.boards.find(b=>b.id===id).cards[0].diaryEntries['2026-10-16']?.thoughts;
  async function write(p,words){return p.evaluate(async words=>{updateDiaryEntry(state.cards[0],'2026-10-16',{thoughts:words});return flushDeviceWrites();},words);}
  await run('a stale shared-storage view cannot replace a newer checkpoint; retry keeps both board diaries',async(p,context)=>{
    const q=await context.newPage();await q.goto(url.href);await q.evaluate(()=>switchBoard('two'));await q.evaluate(()=>flushDeviceWrites());
    await p.evaluate(()=>{
      window.originalRead=Storage.prototype.getItem;window.staleRaw=originalRead.call(localStorage,STORAGE_KEY);window.staleView=true;window.commitCalls=0;
      Storage.prototype.getItem=function(key){return window.staleView && this===localStorage && key===STORAGE_KEY?window.staleRaw:originalRead.call(this,key);};
      LifeDeviceStore.configure(entries=>{commitCalls++;return commitDeviceWrites(entries);});
    });
    const other='Newest complete second-board diary\nEvery line retained';assert.equal(await write(q,other),true);
    // Isolate the stale writer's attempted commit; the healthy tab must not
    // helpfully drain its journal before we inspect the refusal.
    await q.evaluate(()=>LifeDeviceStore.configure(()=>false));
    // A background empty flush may have run before q saved its checkpoint.
    // Count only attempts after that newer checkpoint has been confirmed.
    await p.evaluate(()=>{commitCalls=0;});
    const before=await saved(q),own='First-board writing made while its storage view lags\nStill here';
    assert.equal(await write(p,own),false);assert.deepEqual(await saved(q),before);
    assert.equal(await p.evaluate(()=>commitCalls),0);assert(await p.evaluate(()=>LifeDeviceStore.pending().length)>0);
    assert.equal(text(await p.evaluate(()=>LifeDeviceStore.readCheckpoint()),'two'),other);
    assert.equal(await p.evaluate(()=>{window.staleView=false;return flushDeviceWrites();}),true);
    const after=await saved(q);assert.equal(text(after,'one'),own);assert.equal(text(after,'two'),other);
    assert.equal(after.syncConflicts.length,0);assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);
    for(const page of [p,q])await page.reload();
    assert.equal(text(await saved(p),'one'),own);assert.equal(text(await saved(q),'two'),other);
  });
  await run('a rejected checkpoint transaction retains the journal and full writing, then retries without another edit',async p=>{
    await p.evaluate(()=>{
      window.originalPut=IDBObjectStore.prototype.put;window.rejectCheckpoint=true;
      IDBObjectStore.prototype.put=function(...args){if(this.name==='checkpoints' && rejectCheckpoint)throw new DOMException('Synthetic full checkpoint','QuotaExceededError');return originalPut.apply(this,args);};
    });
    const words='My full writing survives a checkpoint failure\nNot just its first character';assert.equal(await write(p,words),false);
    assert(await p.evaluate(()=>LifeDeviceStore.pending().length)>0);assert.equal(await p.evaluate(()=>state.cards[0].diaryEntries['2026-10-16'].thoughts),words);
    assert.equal(await p.evaluate(()=>{rejectCheckpoint=false;return flushDeviceWrites();}),true);
    assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);assert.equal(text(await p.evaluate(()=>LifeDeviceStore.readCheckpoint()),'one'),words);
  });
  await run('checkpoint writes request strict durability before pending copies are acknowledged',async p=>{
    await p.evaluate(()=>{
      window.originalTransaction=IDBDatabase.prototype.transaction;window.checkpointModes=[];
      IDBDatabase.prototype.transaction=function(...args){const tx=originalTransaction.apply(this,args);if(this.name===LifeStorageScope.key('life-os-device-checkpoint-v1') && args[1]==='readwrite')checkpointModes.push({requested:args[2]?.durability,reported:tx.durability});return tx;};
    });
    assert.equal(await write(p,'Strictly committed checkpoint writing'),true);
    const modes=await p.evaluate(()=>checkpointModes);assert(modes.length>0);assert(modes.every(row=>row.requested==='strict' && row.reported==='strict'));
    assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);
  });
  await run('a stalled checkpoint read releases the lock at its deadline, retaining writing for an explicit retry',async p=>{
    await p.clock.install();
    await p.evaluate(()=>{
      window.originalGet=IDBObjectStore.prototype.get;window.heldCheckpoint=false;window.flushResult=null;
      IDBObjectStore.prototype.get=function(...args){
        const req=originalGet.apply(this,args);
        if(this.name==='checkpoints')Object.defineProperty(req,'onsuccess',{configurable:true,set(handler){req.addEventListener('success',()=>{heldCheckpoint=true;});}});
        return req;
      };
      updateDiaryEntry(state.cards[0],'2026-10-16',{thoughts:'All writing remains while checkpoint reading stalls\nSecond line'});
      flushDeviceWrites().then(value=>window.flushResult=value);
    });
    await p.waitForFunction(()=>heldCheckpoint);await p.clock.runFor(11000);await p.waitForFunction(()=>flushResult===false);
    assert(await p.evaluate(()=>LifeDeviceStore.pending().length)>0);
    assert.equal(await p.evaluate(()=>lastDeviceSaveError.name),'DeviceCheckpointTimeoutError');
    assert.equal(await p.evaluate(()=>state.cards[0].diaryEntries['2026-10-16'].thoughts),'All writing remains while checkpoint reading stalls\nSecond line');
    await p.evaluate(()=>IDBObjectStore.prototype.get=originalGet);await p.clock.resume();
    assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);assert.equal(await p.evaluate(()=>LifeDeviceStore.pending().length),0);
  });
  await run('an unreadable checkpoint refuses replacement and keeps its original bytes alongside pending writing',async p=>{
    const result=await p.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(LifeStorageScope.key('life-os-device-checkpoint-v1'),1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      const old=await new Promise((resolve,reject)=>{const req=db.transaction('checkpoints').objectStore('checkpoints').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      const damaged={format:'unknown-original',raw:'Unmodified damaged checkpoint bytes'};
      await new Promise((resolve,reject)=>{const tx=db.transaction('checkpoints','readwrite');tx.objectStore('checkpoints').put(damaged,'current');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
      updateDiaryEntry(state.cards[0],'2026-10-16',{thoughts:'My pending complete diary survives damage'});const ok=await flushDeviceWrites();
      const retained=await new Promise(resolve=>{const req=db.transaction('checkpoints').objectStore('checkpoints').get('current');req.onsuccess=()=>resolve(req.result);});
      const pending=LifeDeviceStore.pending().length;
      await new Promise(resolve=>{const tx=db.transaction('checkpoints','readwrite');tx.objectStore('checkpoints').put(old,'current');tx.oncomplete=resolve;});db.close();
      const retried=await flushDeviceWrites();return {ok,retained,damaged,pending,retried};
    });
    assert.equal(result.ok,false);assert.deepEqual(result.retained,result.damaged);assert(result.pending>0);assert.equal(result.retried,true);
  });
  await run('checkpoint recovery downloads retain the latest verified diary when the current tab sees older records',async(p,context)=>{
    const q=await context.newPage();await q.goto(url.href);await q.evaluate(()=>switchBoard('two'));await q.evaluate(()=>flushDeviceWrites());
    await p.evaluate(()=>{
      window.originalRead=Storage.prototype.getItem;window.staleRaw=originalRead.call(localStorage,STORAGE_KEY);
      Storage.prototype.getItem=function(key){return this===localStorage && key===STORAGE_KEY?staleRaw:originalRead.call(this,key);};
      LifeDeviceStore.configure(()=>false);
    });
    const words='Verified checkpoint has the newest complete diary\nA second line for future me';assert.equal(await write(q,words),true);
    const wait=p.waitForEvent('download');await p.evaluate(()=>exportBoardBackup());const json=JSON.parse(fs.readFileSync(await(await wait).path(),'utf8'));
    assert.equal(text(json.localRecovery.verifiedDeviceCheckpoint,'two'),words);assert(!JSON.stringify(json).includes('synthetic-auth-secret'));
    const readable=p.waitForEvent('download');await p.evaluate(()=>exportReadableDataArchive());const html=fs.readFileSync(await(await readable).path(),'utf8');
    assert(html.includes(words));assert(html.includes('Verified device checkpoint'));
    await p.evaluate(()=>openRecovery());assert(await p.getByRole('button',{name:'Read verified device copy',exact:true}).isVisible());
    for(const width of [320,390,1080]){
      await p.setViewportSize({width,height:1000});const button=p.getByRole('button',{name:'Read verified device copy',exact:true});await button.scrollIntoViewIfNeeded();
      const bounds=await button.boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width+1);assert(bounds.height>=36);
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const icon=await p.getByRole('button',{name:'Close recovery',exact:true}).locator('svg').boundingBox();assert.equal(icon.width,18);assert.equal(icon.height,18);
    }
    await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/checkpoint-recovery-phone.png'});
  });
  await run('reviewed corrupt-data restore preserves the checkpoint before resetting current records and permits new writing',async p=>{
    const previous='My irreplaceable pre-restore diary';assert.equal(await write(p,previous),true);
    await p.evaluate(async()=>{
      const restored=getStateForStorage();restored.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts='Explicitly selected restored diary';
      localStorage.setItem(STORAGE_KEY,'{"original":"truncated');corruptLocalStateDetected=true;
      await applyReviewedRestore(restored,restoreComparable(localStorage.getItem(STORAGE_KEY)),'backup');
    });
    assert.equal(await p.evaluate(()=>isRestoreSyncPaused()),true);
    const points=await p.evaluate(()=>readLocalJsonValue(CLOUD_RECOVERY_KEY,[]));
    assert(points.some(point=>point.reason==='before-restore-verified-checkpoint' && text(point.state,'one')===previous));
    assert.equal(await write(p,'Continued after an explicit reviewed restore'),true);
    assert.equal(text(await p.evaluate(()=>LifeDeviceStore.readCheckpoint()),'one'),'Continued after an explicit reviewed restore');
  });
  await run('unavailable checkpoint storage never deletes pending writing or reports a successful flush',async p=>{
    const words='Writing while IndexedDB is unavailable\nAll characters remain';assert.equal(await write(p,words),false);
    assert(await p.evaluate(()=>LifeDeviceStore.pending().length)>0);assert.equal(await p.evaluate(()=>state.cards[0].diaryEntries['2026-10-16'].thoughts),words);
    assert.match(await p.locator('#headerSaveStatus').innerText(),/Pending|saving needs attention|kept/i);
    const wait=p.waitForEvent('download');await p.evaluate(()=>exportBoardBackup());const json=JSON.parse(fs.readFileSync(await(await wait).path(),'utf8'));
    assert.equal(text(json.state,'one'),words);assert(json.localRecovery.pendingDeviceWrites.length>0);assert(json.localRecovery.recoveryArchiveError);
  },()=>{indexedDB.open=()=>{throw new DOMException('Synthetic IndexedDB denial','SecurityError');};});
  await run('normal and preview checkpoints stay in different databases',async(p,context)=>{
    assert.equal(await write(p,'Normal private writing'),true);
    const q=await context.newPage();await q.goto(url.href+'&preview=1');
    const value=await q.evaluate(async()=>{
      saveState({skipCloud:true});await flushDeviceWrites();return {name:LifeStorageScope.key('life-os-device-checkpoint-v1'),snapshot:await LifeDeviceStore.readCheckpoint()};
    });
    assert.equal(value.name,'life-os-preview-v1:life-os-device-checkpoint-v1');assert(!JSON.stringify(value.snapshot).includes('Normal private writing'));
    assert.equal(text(await p.evaluate(()=>LifeDeviceStore.readCheckpoint()),'one'),'Normal private writing');
  });
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
