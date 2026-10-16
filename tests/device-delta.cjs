const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),browsers=require('playwright');
const {buildRelease}=require('../build-release.cjs'),{fixture,seedWorkspace}=require('./performance-fixture.cjs');
const engine=process.env.TEST_BROWSER || 'chromium';assert(['chromium','webkit'].includes(engine));
const out=process.env.TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'life-os-delta-tests-'));fs.mkdirSync(out,{recursive:true});
const artifact=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-delta-artifact-')),release=buildRelease({output:artifact});
const files=new Map(Object.keys(release.files).map(file=>[file,fs.readFileSync(path.join(artifact,file))]));
const source=fs.readFileSync(path.join(__dirname,'../experimental/device-delta-store.js')),sourceHash=crypto.createHash('sha256').update(source).digest('hex');files.set('experimental-delta.js',source);
files.set('delta-lab.html',Buffer.from('<!doctype html><meta charset="utf-8"><title>Isolated synthetic storage test</title><script src="experimental-delta.js"></script>'));
const origin='http://127.0.0.1:5199',url=origin+'/delta-lab.html',name='life-os-experimental-delta-v1:test';
const small={boards:[{id:'one',cards:[{id:'same',diaryEntries:{'2026-10-16':{thoughts:'My whole diary\nEvery line stays.',feeling:''}},unknown:{keep:null}}],archivedCards:[{id:'old',notes:'Archived words stay'}]},{id:'two',cards:[{id:'same',notes:'Separate board'}]}],deviceWriteHeads:{original:4},unknownOriginal:[0,false,'']};
const results=[];
(async()=>{
  const browser=await browsers[engine].launch({headless:true});
  async function run(label,fn,app=false){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'}),errors=[];
    await context.route('**/*',route=>{
      const request=new URL(route.request().url()),file=request.pathname.slice(1) || 'index.html',body=request.origin===origin?files.get(file):null;
      return route.fulfill(body?{status:200,body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}:{status:503,body:'Synthetic storage test: external access blocked'});
    });
    const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{
      await p.goto(app?origin+'/?preview=1&liveReload=0':url);
      if(app){await p.waitForFunction(()=>typeof state!=='undefined' && !document.body.hasAttribute('data-release-starting'));await p.addScriptTag({url:origin+'/experimental-delta.js'});}
      await p.evaluate(async({name,base})=>{
        localStorage.setItem('original-sentinel','Unchanged original bytes');sessionStorage.setItem('original-session','Kept');
        window.prototypeStore=LifeExperimentalDeltaStore.create({name});window.prototypeBase=base;
      },{name,base:small});
      await fn(p,context);assert.deepEqual(errors,[]);
      assert.equal(await p.evaluate(()=>localStorage.getItem('original-sentinel')),'Unchanged original bytes');assert.equal(await p.evaluate(()=>sessionStorage.getItem('original-session')),'Kept');results.push({name:label,pass:true});
    }catch(error){results.push({name:label,pass:false,error:error.stack,pageErrors:errors});process.exitCode=1;}
    finally{console.log(JSON.stringify(results.at(-1)));await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({release:release.id,prototypeSourceSha256:sourceHash,engine,results},null,2)+'\n');}
  }
  await run('candidate staging is durable without moving the head; publish is idempotent and full records survive reload',async p=>{
    const result=await p.evaluate(async()=>{
      if(await prototypeStore.read()!==null)throw new Error('A new isolated database was not empty.');
      window.oldHead=await prototypeStore.initialize(prototypeBase);window.next=structuredClone(prototypeBase);next.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+='\nStill thinking.';
      window.token=await prototypeStore.prepare(prototypeBase,next,oldHead);return {head:(await prototypeStore.read()).head,candidate:await prototypeStore.readCandidate(token.id),original:prototypeBase};
    });assert.deepEqual(result.head,await p.evaluate(()=>oldHead));assert.deepEqual(result.original,small);assert.equal(result.candidate.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts,'My whole diary\nEvery line stays.\nStill thinking.');
    const token=await p.evaluate(()=>token);await p.reload();await p.evaluate(name=>window.prototypeStore=LifeExperimentalDeltaStore.create({name}),name);
    const published=await p.evaluate(async token=>{const before=await prototypeStore.read(),head=await prototypeStore.publish(token.id),again=await prototypeStore.publish(token.id);return {before,head,again,after:await prototypeStore.read(),candidates:await prototypeStore.candidates()};},token);
    assert.deepEqual(published.before.state,small);assert.deepEqual(published.head,published.again);assert.deepEqual(published.after.state,result.candidate);assert.equal(published.head.sequence,1);assert.equal(published.candidates.length,1);
  });
  await run('two writers retain both proposals and refuse a stale head rather than mixing different boards',async(p,context)=>{
    const a=await p.evaluate(async()=>{const head=await prototypeStore.initialize(prototypeBase),next=structuredClone(prototypeBase);next.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts='A full update to board one';return {head,token:await prototypeStore.prepare(prototypeBase,next,head),next};});
    const q=await context.newPage();await q.goto(url);
    const b=await q.evaluate(async({name,base,head})=>{window.other=LifeExperimentalDeltaStore.create({name});const next=structuredClone(base);next.boards[1].cards[0].notes='An independent board-two proposal';return {token:await other.prepare(base,next,head),next};},{name,base:small,head:a.head});
    await p.evaluate(id=>prototypeStore.publish(id),a.token.id);
    const result=await q.evaluate(async id=>{let error;try{await other.publish(id);}catch(e){error=e.name;}return {error,head:await other.read(),candidate:await other.readCandidate(id)};},b.token.id);
    assert.equal(result.error,'DeltaHeadChangedError');assert.deepEqual(result.head.state,a.next);assert.deepEqual(result.candidate,b.next);assert.deepEqual(await p.evaluate(()=>prototypeBase),small);
    await q.reload();assert.deepEqual(await q.evaluate(async({name,id})=>LifeExperimentalDeltaStore.create({name}).readCandidate(id),{name,id:b.token.id}),b.next);await q.close();
  });
  await run('quota failure while staging cannot publish or remove originals and a later explicit retry succeeds',async p=>{
    const result=await p.evaluate(async()=>{
      const head=await prototypeStore.initialize(prototypeBase),next=structuredClone(prototypeBase);next.unknownOriginal.push('new');const add=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(...args){if(this.name==='candidates')throw new DOMException('Synthetic full store','QuotaExceededError');return add.apply(this,args);};
      let error;try{await prototypeStore.prepare(prototypeBase,next,head);}catch(e){error=e.name;}finally{IDBObjectStore.prototype.add=add;}
      const before=await prototypeStore.read(),count=(await prototypeStore.candidates()).length,token=await prototypeStore.prepare(prototypeBase,next,head);await prototypeStore.publish(token.id);return {error,before,count,after:await prototypeStore.read(),next};
    });assert.equal(result.error,'QuotaExceededError');assert.deepEqual(result.before.state,small);assert.equal(result.count,0);assert.deepEqual(result.after.state,result.next);
  });
  await run('interrupted publish aborts entry and head together, retains the candidate, then retries once',async p=>{
    const result=await p.evaluate(async()=>{
      const head=await prototypeStore.initialize(prototypeBase),next=structuredClone(prototypeBase);next.unknownOriginal.push('new');const token=await prototypeStore.prepare(prototypeBase,next,head),put=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(...args){if(this.name==='meta')throw new DOMException('Synthetic interrupted publish','QuotaExceededError');return put.apply(this,args);};
      let error;try{await prototypeStore.publish(token.id);}catch(e){error=e.name;}finally{IDBObjectStore.prototype.put=put;}
      const before=await prototypeStore.read(),candidate=await prototypeStore.readCandidate(token.id);await prototypeStore.publish(token.id);return {error,before,candidate,after:await prototypeStore.read(),next};
    });assert.equal(result.error,'QuotaExceededError');assert.deepEqual(result.before.state,small);assert.deepEqual(result.candidate,result.next);assert.deepEqual(result.after.state,result.next);assert.equal(result.after.head.sequence,1);
  });
  await run('damaged candidates refuse publishing and preserve their exact damaged bytes for inspection',async p=>{
    const result=await p.evaluate(async name=>{
      const head=await prototypeStore.initialize(prototypeBase),next=structuredClone(prototypeBase);next.unknownOriginal.push('new');const token=await prototypeStore.prepare(prototypeBase,next,head);
      const db=await new Promise(resolve=>{const req=indexedDB.open(name,1);req.onsuccess=()=>resolve(req.result);});
      const original=(await prototypeStore.candidates())[0],damaged=structuredClone(original);damaged.packet.changes[0].value='Incorrect truncated text';
      await new Promise((resolve,reject)=>{const tx=db.transaction('candidates','readwrite');tx.objectStore('candidates').put(damaged,token.id);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
      let refused=false;try{await prototypeStore.publish(token.id);}catch{refused=true;}
      const retained=(await prototypeStore.candidates())[0],after=await prototypeStore.read();db.close();return {refused,retained,damaged,after};
    },name);assert(result.refused);assert.deepEqual(result.retained,result.damaged);assert.deepEqual(result.after.state,small);
  });
  await run('committed writes with a failed readback retry idempotently without creating another revision',async p=>{
    const result=await p.evaluate(async()=>{
      const head=await prototypeStore.initialize(prototypeBase),next=structuredClone(prototypeBase);next.unknownOriginal.push('Committed before readback failed');const token=await prototypeStore.prepare(prototypeBase,next,head),get=IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get=function(...args){if(this.name==='entries' && args[0]===token.id)throw new DOMException('Synthetic unavailable readback','UnknownError');return get.apply(this,args);};
      let error;try{await prototypeStore.publish(token.id);}catch(e){error=e.name;}finally{IDBObjectStore.prototype.get=get;}
      const saved=await prototypeStore.read(),retry=await prototypeStore.publish(token.id),after=await prototypeStore.read();return {error,saved,retry,after,next,candidateCount:(await prototypeStore.candidates()).length};
    });assert.equal(result.error,'UnknownError');assert.equal(result.saved.head.sequence,1);assert.deepEqual(result.saved.state,result.next);assert.deepEqual(result.retry,result.saved.head);assert.deepEqual(result.after,result.saved);assert.equal(result.candidateCount,1);
  });
  await run('verified checkpoint shortens replay without deleting old entries, candidates or recovery versions',async p=>{
    const result=await p.evaluate(async()=>{
      let head=await prototypeStore.initialize(prototypeBase),current=structuredClone(prototypeBase);
      const first=head;
      for(let i=0;i<4;i++){const next=structuredClone(current);next.unknownOriginal.push('Entry '+i);const token=await prototypeStore.prepare(current,next,head);head=await prototypeStore.publish(token.id);current=next;}
      const before=await prototypeStore.read(),token=await prototypeStore.checkpoint(head);await prototypeStore.publish(token.id);const after=await prototypeStore.read(),candidates=await prototypeStore.candidates();
      const older=await prototypeStore.prepare(prototypeBase,{...prototypeBase,unknownOriginal:['Kept older branch']},first);return {before,after,count:candidates.length,older:await prototypeStore.readCandidate(older.id)};
    });assert.equal(result.before.entriesRead,5);assert.equal(result.after.entriesRead,1);assert.deepEqual(result.before.state,result.after.state);assert.equal(result.count,5);assert.deepEqual(result.older.unknownOriginal,['Kept older branch']);
  });
  await run('denied database access fails explicitly and cannot claim a retained candidate',async p=>{
    const result=await p.evaluate(async()=>{const store=LifeExperimentalDeltaStore.create({name:'life-os-experimental-delta-v1:denied',database:{open(){throw new DOMException('Blocked','SecurityError');}}});try{await store.initialize(prototypeBase);return 'unexpected success';}catch(e){return e.name;}});assert.equal(result,'SecurityError');
  });
  await run('a missing head cannot hide retained records or allow initialization over them',async p=>{
    const result=await p.evaluate(async name=>{
      const head=await prototypeStore.initialize(prototypeBase),next=structuredClone(prototypeBase);next.unknownOriginal.push('Recoverable proposal');const token=await prototypeStore.prepare(prototypeBase,next,head);
      const db=await new Promise(resolve=>{const req=indexedDB.open(name,1);req.onsuccess=()=>resolve(req.result);});
      const rows=()=>new Promise(resolve=>{const req=db.transaction('entries').objectStore('entries').getAll();req.onsuccess=()=>resolve(req.result);}),before=await rows();
      await new Promise(resolve=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('head');tx.oncomplete=resolve;});
      const errors=[];try{await prototypeStore.read();}catch(e){errors.push(e.name);}try{await prototypeStore.initialize(next);}catch(e){errors.push(e.name);}
      const after=await rows(),candidate=await prototypeStore.readCandidate(token.id);db.close();return {errors,before,after,candidate,next};
    },name);assert.deepEqual(result.errors,['DeltaRecoveryNeededError','DeltaRecoveryNeededError']);assert.deepEqual(result.before,result.after);assert.deepEqual(result.candidate,result.next);
  });
  await run('replay limit refuses before head promotion; checkpoint and explicit rebase retain the original proposal',async p=>{
    const result=await p.evaluate(async name=>{
      prototypeStore.close();const store=LifeExperimentalDeltaStore.create({name,maxReplayEntries:3});let current=structuredClone(prototypeBase),head=await store.initialize(current);
      for(let i=0;i<2;i++){const next=structuredClone(current);next.unknownOriginal.push(i);const token=await store.prepare(current,next,head);head=await store.publish(token.id);current=next;}
      const next=structuredClone(current);next.unknownOriginal.push('Pending at limit');const token=await store.prepare(current,next,head);let reason;
      try{await store.publish(token.id);}catch(e){reason=e.name;}
      const before=await store.read(),preserved=await store.readCandidate(token.id),checkpoint=await store.checkpoint(head);head=await store.publish(checkpoint.id);
      let stale;try{await store.publish(token.id);}catch(e){stale=e.name;}
      const rebased=await store.prepare(current,next,head);await store.publish(rebased.id);return {reason,before,preserved,next,stale,after:await store.read()};
    },name);
    assert.equal(result.reason,'DeltaCheckpointRequiredError');assert.equal(result.before.entriesRead,3);assert.deepEqual(result.preserved,result.next);assert.equal(result.stale,'DeltaHeadChangedError');assert.deepEqual(result.after.state,result.next);assert.equal(result.after.entriesRead,2);
  });
  await run('a stale checkpoint cannot replace a newer update and remains available as its original version',async p=>{
    const result=await p.evaluate(async()=>{
      const head=await prototypeStore.initialize(prototypeBase),checkpoint=await prototypeStore.checkpoint(head),next=structuredClone(prototypeBase);next.unknownOriginal.push('A newer update');
      const token=await prototypeStore.prepare(prototypeBase,next,head);await prototypeStore.publish(token.id);let refused;try{await prototypeStore.publish(checkpoint.id);}catch(e){refused=e.name;}
      return {refused,current:(await prototypeStore.read()).state,checkpoint:await prototypeStore.readCandidate(checkpoint.id),next};
    });assert.equal(result.refused,'DeltaHeadChangedError');assert.deepEqual(result.current,result.next);assert.deepEqual(result.checkpoint,small);
  });
  await run('exhausted counters cannot stage an invalid receipt or change any existing head',async p=>{
    const result=await p.evaluate(async()=>{
      const head=await prototypeStore.initialize(prototypeBase),invalid={...head,sequence:Number.MAX_SAFE_INTEGER},next=structuredClone(prototypeBase);next.unknownOriginal.push('New');const errors=[];
      try{await prototypeStore.prepare(prototypeBase,next,invalid);}catch(e){errors.push(e.message);}try{await prototypeStore.checkpoint(invalid);}catch(e){errors.push(e.message);}
      return {errors,count:(await prototypeStore.candidates()).length,current:(await prototypeStore.read()).state};
    });assert.equal(result.errors.length,2);assert(result.errors.every(e=>e.includes('exhausted')));assert.equal(result.count,0);assert.deepEqual(result.current,small);
  });
  await run('transaction deadline releases the caller without acknowledging a stalled read and permits retry',async p=>{
    await p.evaluate(()=>prototypeStore.initialize(prototypeBase));await p.clock.install();
    await p.evaluate(name=>{
      window.originalTransaction=IDBDatabase.prototype.transaction;window.held=false;window.finished=null;
      IDBDatabase.prototype.transaction=function(stores,mode,...rest){if(mode==='readonly' && [...stores].includes('meta')){held=true;return {objectStore:()=>({get:()=>({})}),abort(){this.onabort?.();}};}return originalTransaction.call(this,stores,mode,...rest);};
      LifeExperimentalDeltaStore.create({name,timeoutMs:100}).read().then(()=>finished='unexpected success',e=>finished=e.name);
    },name);await p.waitForFunction(()=>held);await p.clock.runFor(200);await p.waitForFunction(()=>finished!==null);assert.equal(await p.evaluate(()=>finished),'DeltaStoreTimeoutError');await p.evaluate(()=>IDBDatabase.prototype.transaction=originalTransaction);await p.clock.resume();assert.deepEqual((await p.evaluate(()=>prototypeStore.read())).state,small);
  });
  await run('changed checkpoint data fails integrity validation instead of being replaced with defaults',async p=>{
    const result=await p.evaluate(async name=>{
      const head=await prototypeStore.initialize(prototypeBase),db=await new Promise(resolve=>{const req=indexedDB.open(name,1);req.onsuccess=()=>resolve(req.result);});
      const row=await new Promise(resolve=>{const req=db.transaction('entries').objectStore('entries').get(head.id);req.onsuccess=()=>resolve(req.result);});row.state.unknownOriginal=['Corrupted original bytes'];
      await new Promise(resolve=>{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put(row,head.id);tx.oncomplete=resolve;});
      let refused=false;try{await prototypeStore.read();}catch{refused=true;}
      const retained=await new Promise(resolve=>{const req=db.transaction('entries').objectStore('entries').get(head.id);req.onsuccess=()=>resolve(req.result);});db.close();return {refused,row,retained};
    },name);assert(result.refused);assert.deepEqual(result.row,result.retained);
  });
  await run('a completed transaction without its request receipt cannot be mistaken for an empty workspace',async p=>{
    const result=await p.evaluate(async()=>{
      await prototypeStore.initialize(prototypeBase);const get=IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get=function(...args){const req=get.apply(this,args);if(this.name==='meta')Object.defineProperty(req,'onsuccess',{set(){}});return req;};
      let message;try{await prototypeStore.read();message='unexpected empty success';}catch(e){message=e.message;}finally{IDBObjectStore.prototype.get=get;}
      return {message,after:await prototypeStore.read()};
    });assert.match(result.message,/not acknowledged/);assert.deepEqual(result.after.state,small);
  });
  await run('writes request strict durability and caller mutations cannot change an in-flight captured save',async p=>{
    const result=await p.evaluate(async()=>{
      const original=IDBDatabase.prototype.transaction,modes=[];IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')modes.push(args[2]?.durability);return original.apply(this,args);};
      const head=await prototypeStore.initialize(prototypeBase),next=structuredClone(prototypeBase);next.unknownOriginal.push('Captured');const expected=structuredClone(next),pending=prototypeStore.prepare(prototypeBase,next,head);next.boards=[];const token=await pending;await prototypeStore.publish(token.id);IDBDatabase.prototype.transaction=original;return {modes,expected,saved:(await prototypeStore.read()).state};
    });assert(result.modes.length>=3 && result.modes.every(m=>m==='strict'));assert.deepEqual(result.saved,result.expected);
  });
  await run('the actual large normalized history fits the isolated prototype, with a small subsequent journal and unchanged legacy copies',async p=>{
    const legacy=await p.evaluate(seedWorkspace,fixture('large'));assert(legacy.staged && !legacy.flushed && legacy.previousMainUnchanged);
    const measured=await p.evaluate(async()=>{
      const base=getStateForStorage(),originalLegacy=Object.fromEntries(Object.entries(localStorage)),before=performance.now(),head=await prototypeStore.initialize(base),initializedMs=performance.now()-before;
      const next=structuredClone(base),words='\nA complete new thought, not just one character.';
      for(const card of [next.cards.find(c=>c.type==='diary'),next.boards[0].cards.find(c=>c.type==='diary')])card.diaryEntries['2026-10-16'].thoughts+=words;
      const start=performance.now(),token=await prototypeStore.prepare(base,next,head),capturedMs=performance.now()-start,entry=(await prototypeStore.candidates())[0],publishStart=performance.now();await prototypeStore.publish(token.id);const publishedMs=performance.now()-publishStart,read=await prototypeStore.read();
      if(JSON.stringify(read.state)!==JSON.stringify(next))throw new Error('Full prototype readback mismatch');
      if(JSON.stringify(Object.fromEntries(Object.entries(localStorage)))!==JSON.stringify(originalLegacy))throw new Error('Legacy browser copies changed');
      window.expectedPrototype=next;
      const legacyPending=[];for(const row of LifeDeviceStore.pending())legacyPending.push({key:row.key,digest:await LifeExperimentalDeltaStore.hash(row.raw)});
      return {fullSnapshotBytes:new Blob([JSON.stringify(base)]).size,candidateBytes:new Blob([JSON.stringify(entry)]).size,changes:entry.packet.changes.length,initializedMs,capturedMs,publishedMs,expectedDigest:token.digest,legacyMain:localStorage.getItem(STORAGE_KEY),legacyPending};
    });assert(measured.fullSnapshotBytes>7000000);assert(measured.candidateBytes<8192);assert.equal(measured.changes,2);
    await p.reload();await p.waitForFunction(()=>typeof state!=='undefined' && !document.body.hasAttribute('data-release-starting'));await p.addScriptTag({url:origin+'/experimental-delta.js'});
    const after=await p.evaluate(async name=>{
      const store=LifeExperimentalDeltaStore.create({name}),read=await store.read(),legacyPending=[];
      for(const row of LifeDeviceStore.pending())legacyPending.push({key:row.key,digest:await LifeExperimentalDeltaStore.hash(row.raw)});
      return {digest:read.head.digest,words:read.state.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts,legacyMain:localStorage.getItem(STORAGE_KEY),legacyPending};
    },name);
    assert.equal(after.digest,measured.expectedDigest);assert(after.words.endsWith('not just one character.'));assert.equal(after.legacyMain,measured.legacyMain);
    // Normal application startup can append new packets. Every original packet
    // must remain byte-identical; the prototype itself changed no legacy bytes.
    for(const row of measured.legacyPending)assert.deepEqual(after.legacyPending.find(item=>item.key===row.key),row);
    const {legacyPending,legacyMain,...timings}=measured;fs.writeFileSync(path.join(out,'large-prototype.json'),JSON.stringify({release:release.id,engine,...timings,legacyMainStillRefused:true,legacyJournalOriginalsRetained:true,legacyStartupPacketsAdded:after.legacyPending.length-legacyPending.length},null,2)+'\n');
  },true);
  await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
