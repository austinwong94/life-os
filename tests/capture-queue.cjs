const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),browsers=require('playwright');
const {buildRelease}=require('../build-release.cjs'),{fixture,seedWorkspace}=require('./performance-fixture.cjs');
const engine=process.env.TEST_BROWSER || 'chromium';assert(['chromium','webkit'].includes(engine));
const out=process.env.TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'life-os-capture-queue-'));fs.mkdirSync(out,{recursive:true});
const artifact=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-capture-release-')),release=buildRelease({output:artifact});
const files=new Map(Object.keys(release.files).map(file=>[file,fs.readFileSync(path.join(artifact,file))]));
const source=fs.readFileSync(path.join(__dirname,'../experimental/device-delta-store.js')),sourceHash=crypto.createHash('sha256').update(source).digest('hex');files.set('experimental-delta.js',source);
files.set('queue-lab.html',Buffer.from('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic capture test</title><textarea aria-label="Synthetic diary"></textarea><button id="elsewhere">Elsewhere</button><output id="status"></output><script src="experimental-delta.js"></script>'));
const origin='http://127.0.0.1:5199',url=origin+'/queue-lab.html',name='life-os-experimental-delta-v1:capture';
const small={boards:[{id:'one',cards:[{id:'same',diaryEntries:{'2026-10-16':{thoughts:'My original\nWhole diary',updatedAt:1}},unknown:{keep:null}}],archivedCards:[{id:'archive',thoughts:'Original archived words'}]},{id:'two',cards:[{id:'same',thoughts:'Independent board'}]}],unknownOriginal:[false,0,null,'']};
const results=[];
(async()=>{
  const browser=await browsers[engine].launch({headless:true});
  async function run(label,fn,{app=false,mobile=false}={}){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1080,height:1100},isMobile:mobile,hasTouch:mobile,timezoneId:'Asia/Kuala_Lumpur'}),errors=[];
    await context.route('**/*',route=>{const request=new URL(route.request().url()),file=request.pathname.slice(1) || 'index.html',body=request.origin===origin?files.get(file):null;return route.fulfill(body?{status:200,body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}:{status:503,body:'Isolated synthetic queue; external services blocked'});});
    const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{
      await p.goto(app?origin+'/?preview=1&liveReload=0':url);
      if(app){await p.waitForFunction(()=>typeof state!=='undefined' && !document.body.hasAttribute('data-release-starting'));await p.addScriptTag({url:origin+'/experimental-delta.js'});}
      await p.evaluate(({name,base})=>{window.store=LifeExperimentalDeltaStore.create({name});window.queueBase=base;localStorage.setItem('original-queue-sentinel','Kept original bytes');},{name,base:small});
      await fn(p,context);assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>localStorage.getItem('original-queue-sentinel')),'Kept original bytes');results.push({name:label,pass:true});
    }catch(error){results.push({name:label,pass:false,error:error.stack,pageErrors:errors});process.exitCode=1;}
    finally{await context.close();console.log(JSON.stringify(results.at(-1)));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({release:release.id,prototypeSourceSha256:sourceHash,engine,results},null,2)+'\n');}
  }
  await run('real rapid multiline input stays frozen and ordered through a held capture, thinking pause, click and reload',async p=>{
    await p.evaluate(async()=>{
      await store.initialize(queueBase);const prepare=store.prepare;window.prepareHeld=false;window.gate=new Promise(resolve=>window.releaseCapture=resolve);
      store.prepare=async(...args)=>{prepareHeld=true;await gate;return prepare(...args);};
      window.queue=await LifeExperimentalDeltaStore.openQueue({store,onChange:status=>{document.querySelector('#status').textContent=JSON.stringify(status);}});window.draft=structuredClone(queueBase);window.ids=[];
      const input=document.querySelector('textarea');input.value=draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts;input.addEventListener('input',()=>{draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts=input.value;const id=queue.enqueue(draft);if(id)ids.push(id);});
    });
    const writer=p.getByLabel('Synthetic diary'),text='I am still thinking.\nEvery character stays. \u6211\u7684\u8bb0\u5f55';await writer.fill(text);await writer.pressSequentially(' more thoughts',{delay:0});await p.getByRole('button',{name:'Elsewhere',exact:true}).click();await p.waitForTimeout(100);
    const expected=text+' more thoughts';assert.equal(await writer.inputValue(),expected);assert.equal(await p.evaluate(()=>queue.latest().boards[0].cards[0].diaryEntries['2026-10-16'].thoughts),expected);assert.equal(await p.evaluate(()=>queue.status().confirmedCount),0);assert.equal(await p.evaluate(()=>queue.status().durableCandidateCount),0);assert(await p.evaluate(()=>queue.status().memoryOnlyCount)>10);
    const result=await p.evaluate(async()=>{releaseCapture();const status=await queue.flush(),rows=await store.candidates(),versions=[];for(const id of ids)versions.push((await store.readCandidate(id)).boards[0].cards[0].diaryEntries['2026-10-16'].thoughts);return {status,count:rows.length,versions,state:(await store.read()).state};});
    assert(result.status.ok);assert.equal(result.count,result.versions.length);assert.deepEqual(result.versions,[text,...Array.from(' more thoughts',(_,i)=>text+' more thoughts'.slice(0,i+1))]);assert.deepEqual(result.state.boards[1],small.boards[1]);assert.deepEqual(result.state.boards[0].archivedCards,small.boards[0].archivedCards);
    await p.reload();const saved=await p.evaluate(async name=>{const s=LifeExperimentalDeltaStore.create({name}),q=await LifeExperimentalDeltaStore.openQueue({store:s});return q.confirmed();},name);assert.equal(saved.state.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts,expected);assert.equal(saved.head.sequence,result.count);
  },{mobile:true});
  await run('staging quota failure pauses the queue, retains all later edits and retries once per identity',async p=>{
    const result=await p.evaluate(async()=>{
      await store.initialize(queueBase);window.queue=await LifeExperimentalDeltaStore.openQueue({store});const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='candidates')throw new DOMException('Synthetic full','QuotaExceededError');return add.apply(this,args);};
      const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' first';const first=queue.enqueue(draft);await queue.flush();draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' second';queue.enqueue(draft);const paused=await queue.flush();let close;try{queue.close();}catch(e){close=e.name;}
      const before=(await store.read()).state;IDBObjectStore.prototype.add=add;const finished=await queue.retry();return {paused,close,before,finished,after:(await store.read()).state,draft,candidates:await store.candidates(),first};
    });assert.equal(result.paused.error.name,'QuotaExceededError');assert.equal(result.paused.memoryOnlyCount,2);assert.equal(result.close,'DeltaQueuePendingError');assert.deepEqual(result.before,small);assert(result.finished.ok);assert.deepEqual(result.after,result.draft);assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].id===result.first || result.candidates[1].id===result.first,true);
  });
  await run('lost capture readback reuses the same retained candidate rather than duplicating the edit',async p=>{
    const result=await p.evaluate(async()=>{
      await store.initialize(queueBase);const queue=await LifeExperimentalDeltaStore.openQueue({store}),get=IDBObjectStore.prototype.get;let fail=true;
      IDBObjectStore.prototype.get=function(...args){if(this.name==='candidates' && this.transaction.mode==='readonly' && fail){fail=false;throw new DOMException('Synthetic capture readback failed','UnknownError');}return get.apply(this,args);};
      const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' Complete extra text';const id=queue.enqueue(draft),paused=await queue.flush();IDBObjectStore.prototype.get=get;
      const retained=await store.candidates(),finished=await queue.retry();return {paused,retainedCount:retained.length,finished,id,rows:await store.candidates(),saved:await store.read(),draft};
    });assert.equal(result.paused.memoryOnlyCount,1);assert.equal(result.paused.confirmedCount,0);assert.equal(result.retainedCount,1);assert(result.finished.ok);assert.equal(result.rows.length,1);assert.equal(result.saved.head.id,result.id);assert.equal(result.saved.head.sequence,1);assert.deepEqual(result.saved.state,result.draft);
  });
  await run('lost publish readback confirms the existing revision before draining the next queued edit',async p=>{
    const result=await p.evaluate(async()=>{
      await store.initialize(queueBase);const queue=await LifeExperimentalDeltaStore.openQueue({store}),get=IDBObjectStore.prototype.get;let fail=true,id;
      IDBObjectStore.prototype.get=function(...args){if(this.name==='entries' && this.transaction.mode==='readonly' && args[0]===id && fail){fail=false;throw new DOMException('Synthetic publish readback failed','UnknownError');}return get.apply(this,args);};
      const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' first';const first=structuredClone(draft);id=queue.enqueue(draft);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' next';queue.enqueue(draft);const paused=await queue.flush();IDBObjectStore.prototype.get=get;
      const actual=await store.read(),finished=await queue.retry();return {paused,actual,first,finished,saved:await store.read(),draft,count:(await store.candidates()).length};
    });assert.equal(result.paused.durableCandidateCount,1);assert.equal(result.paused.memoryOnlyCount,1);assert.equal(result.paused.confirmedCount,0);assert.deepEqual(result.actual.state,result.first);assert(result.finished.ok);assert.equal(result.saved.head.sequence,2);assert.equal(result.count,2);assert.deepEqual(result.saved.state,result.draft);
  });
  await run('another tab cannot be overwritten by automatic rebasing of this queue’s older board snapshot',async(p,context)=>{
    await p.evaluate(async()=>{
      await store.initialize(queueBase);const publish=store.publish;window.held=new Promise(resolve=>window.release=resolve);store.publish=async id=>{await held;return publish(id);};window.queue=await LifeExperimentalDeltaStore.openQueue({store});const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' My pending words';queue.enqueue(draft);
    });await p.waitForFunction(()=>queue.status().durableCandidateCount===1);
    const q=await context.newPage();await q.goto(url);const foreign=await q.evaluate(async({name,base})=>{const s=LifeExperimentalDeltaStore.create({name}),queue=await LifeExperimentalDeltaStore.openQueue({store:s});base.boards[1].cards[0].thoughts='A newer independent board-two edit';queue.enqueue(base);await queue.flush();return (await s.read()).state;},{name,base:small});
    const result=await p.evaluate(async()=>{release();const paused=await queue.flush(),draft=queue.latest();draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' More still to keep';queue.enqueue(draft);const retried=await queue.retry();return {paused,retried,latest:queue.latest(),actual:(await store.read()).state,rows:await store.candidates()};});
    assert.equal(result.paused.error.name,'DeltaHeadChangedError');assert.equal(result.retried.error.name,'DeltaHeadChangedError');assert.deepEqual(result.actual,foreign);assert(result.latest.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts.endsWith('More still to keep'));assert.equal(result.retried.memoryOnlyCount,1);assert.equal(result.retried.durableCandidateCount,1);assert.equal(result.rows.length,2);await q.close();
  });
  await run('replay-limit pause keeps the blocked candidate and later draft without an unreadable head',async p=>{
    const result=await p.evaluate(async name=>{
      store.close();const s=LifeExperimentalDeltaStore.create({name,maxReplayEntries:3});await s.initialize(queueBase);const queue=await LifeExperimentalDeltaStore.openQueue({store:s}),draft=structuredClone(queueBase);
      for(let i=0;i<4;i++){draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' '+i;queue.enqueue(draft);}
      const paused=await queue.flush(),before=await s.read(),retry=await queue.retry();return {paused,before,retry,latest:queue.latest(),draft,count:(await s.candidates()).length};
    },name);assert.equal(result.paused.error.name,'DeltaCheckpointRequiredError');assert.equal(result.paused.confirmedCount,2);assert.equal(result.paused.durableCandidateCount,1);assert.equal(result.paused.memoryOnlyCount,1);assert.equal(result.before.entriesRead,3);assert.equal(result.retry.error.name,'DeltaCheckpointRequiredError');assert.equal(result.count,3);assert.deepEqual(result.latest,result.draft);
  });
  await run('capture identity collisions refuse changed content and cannot overwrite a checkpoint',async p=>{
    const result=await p.evaluate(async()=>{
      const head=await store.initialize(queueBase),next=structuredClone(queueBase);next.unknownOriginal.push('First proposal');const id=crypto.randomUUID(),token=await store.prepare(queueBase,next,head,{id}),again=await store.prepare(queueBase,next,head,{id});next.unknownOriginal.push('Changed proposal');const errors=[];
      try{await store.prepare(queueBase,next,head,{id});}catch(e){errors.push(e.name);}try{await store.prepare(queueBase,next,head,{id:head.id});}catch(e){errors.push(e.name);}
      return {token,again,errors,rows:await store.candidates(),head:await store.read()};
    });assert.deepEqual(result.token,result.again);assert.deepEqual(result.errors,['DeltaCandidateChangedError','DeltaCandidateChangedError']);assert.equal(result.rows.length,1);assert.deepEqual(result.head.state,small);
  });
  await run('scheduled checkpoints sustain a FIFO queue across multiple replay windows and reload every retained version',async p=>{
    const result=await p.evaluate(async name=>{
      store.close();window.store=LifeExperimentalDeltaStore.create({name,maxReplayEntries:3});await store.initialize(queueBase);const queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:3}),draft=structuredClone(queueBase),ids=[],versions=[];
      for(let i=0;i<11;i++){draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+='\nThought '+i;versions.push(structuredClone(draft));ids.push(queue.enqueue(draft));}
      const finished=await queue.flush(),read=await store.read(),rows=await store.candidates(),actual=[];for(const id of ids)actual.push(await store.readCandidate(id));
      return {finished,read,rows,actual,versions};
    },name);assert(result.finished.ok);assert.equal(result.finished.confirmedCount,11);assert.equal(result.finished.checkpointCount,5);assert.equal(result.read.head.sequence,16);assert.equal(result.read.entriesRead,2);assert.equal(result.rows.length,16);assert.deepEqual(result.actual,result.versions);assert.deepEqual(result.read.state,result.versions.at(-1));
    await p.reload();const resumed=await p.evaluate(async name=>{const s=LifeExperimentalDeltaStore.create({name,maxReplayEntries:3}),initial=await s.read(),q=await LifeExperimentalDeltaStore.openQueue({store:s,checkpointEvery:3}),draft=structuredClone(initial.state);for(let i=0;i<2;i++){draft.unknownOriginal.push('After reload '+i);q.enqueue(draft);}const finished=await q.flush();return {initial,finished,saved:await s.read(),draft};},name);
    assert.deepEqual(resumed.initial.state,result.versions.at(-1));assert(resumed.finished.ok);assert.equal(resumed.finished.confirmedCount,2);assert.equal(resumed.finished.checkpointCount,1);assert.equal(resumed.saved.head.sequence,19);assert.equal(resumed.saved.entriesRead,2);assert.deepEqual(resumed.saved.state,resumed.draft);
  });
  await run('checkpoint quota failure keeps all drafts and retries the same maintenance identity without replacement',async p=>{
    const result=await p.evaluate(async()=>{
      await store.initialize(queueBase);const queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:1}),add=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(...args){if(this.name==='candidates' && args[0].kind==='checkpoint')throw new DOMException('Synthetic full checkpoint','QuotaExceededError');return add.apply(this,args);};
      const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' first';queue.enqueue(draft);await queue.flush();draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' still thinking';queue.enqueue(draft);const paused=await queue.flush(),before=await store.read();let close;try{queue.close();}catch(e){close=e.name;}
      IDBObjectStore.prototype.add=add;const finished=await queue.retry();return {paused,before,close,finished,draft,saved:await store.read(),rows:await store.candidates()};
    });assert.equal(result.paused.error.name,'QuotaExceededError');assert.equal(result.paused.memoryOnlyCount,2);assert.equal(result.paused.durableCandidateCount,0);assert.equal(result.paused.checkpoint.candidateAcknowledged,false);assert.equal(result.close,'DeltaQueuePendingError');assert.deepEqual(result.before.state,small);assert(result.finished.ok);assert.equal(result.finished.checkpointCount,2);assert.equal(result.rows.length,4);assert(result.rows.some(row=>row.id===result.paused.checkpoint.id));assert.deepEqual(result.saved.state,result.draft);
  });
  await run('lost checkpoint staging readback retries the exact checkpoint before capturing the pending edit',async p=>{
    const result=await p.evaluate(async()=>{
      await store.initialize(queueBase);const queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:1}),get=IDBObjectStore.prototype.get;let fail=true;
      IDBObjectStore.prototype.get=function(...args){if(this.name==='candidates' && this.transaction.mode==='readonly' && fail){fail=false;throw new DOMException('Synthetic checkpoint capture readback','UnknownError');}return get.apply(this,args);};
      const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' every word';queue.enqueue(draft);const paused=await queue.flush();IDBObjectStore.prototype.get=get;
      const retained=await store.candidates(),finished=await queue.retry();return {paused,retained,finished,rows:await store.candidates(),saved:await store.read(),draft};
    });assert.equal(result.paused.error.name,'UnknownError');assert.equal(result.paused.checkpoint.candidateAcknowledged,false);assert.equal(result.retained.length,1);assert.equal(result.retained[0].kind,'checkpoint');assert.equal(result.retained[0].id,result.paused.checkpoint.id);assert(result.finished.ok);assert.equal(result.finished.checkpointCount,1);assert.equal(result.finished.confirmedCount,1);assert.equal(result.rows.length,2);assert.equal(result.saved.head.sequence,2);assert.deepEqual(result.saved.state,result.draft);
  });
  await run('lost checkpoint publication readback confirms maintenance once before the edit and survives reload',async p=>{
    const result=await p.evaluate(async()=>{
      await store.initialize(queueBase);let checkpointId;const queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:1,onChange:status=>{if(status.checkpoint)checkpointId=status.checkpoint.id;}}),get=IDBObjectStore.prototype.get;let fail=true;
      IDBObjectStore.prototype.get=function(...args){if(this.name==='entries' && this.transaction.mode==='readonly' && args[0]===checkpointId && fail){fail=false;throw new DOMException('Synthetic checkpoint publication readback','UnknownError');}return get.apply(this,args);};
      const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' maintained';queue.enqueue(draft);const paused=await queue.flush();IDBObjectStore.prototype.get=get;
      const actual=await store.read(),finished=await queue.retry();return {paused,actual,finished,saved:await store.read(),rows:await store.candidates(),draft};
    });assert.equal(result.paused.checkpoint.candidateAcknowledged,true);assert.equal(result.paused.checkpointCount,0);assert.equal(result.paused.confirmedCount,0);assert.equal(result.actual.head.id,result.paused.checkpoint.id);assert.deepEqual(result.actual.state,small);assert(result.finished.ok);assert.equal(result.rows.length,2);assert.equal(result.finished.checkpointCount,1);assert.equal(result.finished.confirmedCount,1);assert.equal(result.saved.head.sequence,2);
    await p.reload();assert.deepEqual(await p.evaluate(async name=>(await LifeExperimentalDeltaStore.create({name}).read()).state,name),result.draft);
  });
  await run('a newer separate-board writer defeats stale checkpoint publication without losing either draft',async(p,context)=>{
    await p.evaluate(async()=>{
      await store.initialize(queueBase);const publish=store.publish;window.gate=new Promise(resolve=>window.release=resolve);store.publish=async id=>{await gate;return publish(id);};window.queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:1});const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' pending own writing';queue.enqueue(draft);
    });await p.waitForFunction(()=>queue.status().checkpoint?.candidateAcknowledged);
    const q=await context.newPage();await q.goto(url);const foreign=await q.evaluate(async({name,base})=>{const s=LifeExperimentalDeltaStore.create({name}),queue=await LifeExperimentalDeltaStore.openQueue({store:s});base.boards[1].cards[0].thoughts='Other board won during maintenance';queue.enqueue(base);if(!(await queue.flush()).ok)throw new Error('Foreign setup did not save');return base;},{name,base:small});
    const result=await p.evaluate(async()=>{release();const paused=await queue.flush(),retried=await queue.retry();return {paused,retried,latest:queue.latest(),confirmed:queue.confirmed(),saved:await store.read(),rows:await store.candidates()};});assert.equal(result.paused.error.name,'DeltaHeadChangedError');assert.equal(result.retried.error.name,'DeltaHeadChangedError');assert.deepEqual(result.saved.state,foreign);assert.deepEqual(result.confirmed.state,small);assert(result.latest.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts.endsWith('pending own writing'));assert.equal(result.rows.length,2);assert.equal(result.retried.memoryOnlyCount,1);assert.equal(result.retried.confirmedCount,0);await q.close();
  });
  await run('a newer writer after a confirmed checkpoint still defeats the following stale edit',async(p,context)=>{
    await p.evaluate(async()=>{
      await store.initialize(queueBase);const prepare=store.prepare;window.gate=new Promise(resolve=>window.release=resolve);window.prepareStarted=false;store.prepare=async(...args)=>{prepareStarted=true;await gate;return prepare(...args);};window.queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:1});const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' own draft after checkpoint';queue.enqueue(draft);
    });await p.waitForFunction(()=>prepareStarted);
    const q=await context.newPage();await q.goto(url);const foreign=await q.evaluate(async({name,base})=>{const s=LifeExperimentalDeltaStore.create({name}),queue=await LifeExperimentalDeltaStore.openQueue({store:s});base.boards[1].cards[0].thoughts='Other board won after checkpoint';queue.enqueue(base);if(!(await queue.flush()).ok)throw new Error('Foreign setup did not save');return base;},{name,base:small});
    const result=await p.evaluate(async()=>{release();const paused=await queue.flush();return {paused,latest:queue.latest(),saved:await store.read(),rows:await store.candidates()};});assert.equal(result.paused.error.name,'DeltaHeadChangedError');assert.equal(result.paused.checkpointCount,1);assert.equal(result.paused.confirmedCount,0);assert.equal(result.paused.durableCandidateCount,1);assert.deepEqual(result.saved.state,foreign);assert(result.latest.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts.endsWith('own draft after checkpoint'));assert.equal(result.rows.length,3);await q.close();
  });
  await run('checkpoint identities are immutable across retries, committed entries and invalid identifiers',async p=>{
    const result=await p.evaluate(async()=>{
      const initial=await store.initialize(queueBase),id=crypto.randomUUID(),token=await store.checkpoint(initial,{id}),again=await store.checkpoint(initial,{id});await store.publish(id);const repeated=await store.checkpoint(initial,{id}),next=structuredClone(queueBase);next.unknownOriginal.push('Changed');const errors=[];
      for(const attempt of [()=>store.prepare(queueBase,next,initial,{id}),()=>store.checkpoint(token,{id}),()=>store.checkpoint(initial,{id:initial.id}),()=>store.checkpoint(initial,{id:'invalid'})])try{await attempt();}catch(e){errors.push(e.name);}
      return {token,again,repeated,errors,saved:await store.read(),rows:await store.candidates(),original:await store.readCandidate(id)};
    });assert.deepEqual(result.token,result.again);assert.deepEqual(result.token,result.repeated);assert.deepEqual(result.errors,['DeltaCandidateChangedError','DeltaCandidateChangedError','DeltaCandidateChangedError','Error']);assert.equal(result.rows.length,1);assert.deepEqual(result.original,small);assert.deepEqual(result.saved.state,small);assert.equal(result.saved.entriesRead,1);
  });
  await run('interrupted checkpoint promotion rolls back its entry and head together before an exact retry',async p=>{
    const result=await p.evaluate(async()=>{
      const initial=await store.initialize(queueBase),queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:1}),put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='meta'){this.transaction.abort();throw new DOMException('Synthetic checkpoint interruption','AbortError');}return put.apply(this,args);};
      const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' unconfirmed text';queue.enqueue(draft);const paused=await queue.flush();IDBObjectStore.prototype.put=put;const before=await store.read();
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('life-os-experimental-delta-v1:capture',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});const entries=await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readonly'),req=tx.objectStore('entries').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();
      const finished=await queue.retry();return {initial,paused,before,entries,finished,saved:await store.read(),rows:await store.candidates(),draft};
    });assert.equal(result.paused.error.name,'AbortError');assert.equal(result.paused.checkpoint.candidateAcknowledged,true);assert.deepEqual(result.before.head,result.initial);assert.deepEqual(result.before.state,small);assert.equal(result.entries.length,1);assert.equal(result.entries[0].id,result.initial.id);assert(result.finished.ok);assert.equal(result.rows.length,2);assert.equal(result.finished.checkpointCount,1);assert.equal(result.saved.head.sequence,2);assert.deepEqual(result.saved.state,result.draft);
  });
  await run('damaged scheduled checkpoints refuse publication while original records and later drafts stay available',async p=>{
    await p.evaluate(async()=>{
      await store.initialize(queueBase);const publish=store.publish;window.gate=new Promise(resolve=>window.release=resolve);store.publish=async id=>{await gate;return publish(id);};window.queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:1});const draft=structuredClone(queueBase);draft.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+=' own unconfirmed writing';queue.enqueue(draft);
    });await p.waitForFunction(()=>queue.status().checkpoint?.candidateAcknowledged);
    const result=await p.evaluate(async name=>{
      const id=queue.status().checkpoint.id,rows=await store.candidates(),damaged=rows.find(row=>row.id===id);damaged.state.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts='Synthetic corruption';
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(name,1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('candidates','readwrite');tx.objectStore('candidates').put(damaged,id);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
      release();const paused=await queue.flush(),draft=queue.latest();draft.unknownOriginal.push('A later captured note');queue.enqueue(draft);const retried=await queue.retry();return {paused,retried,latest:queue.latest(),draft,saved:await store.read(),rows:await store.candidates()};
    },name);assert.equal(result.paused.phase,'paused');assert.equal(result.retried.phase,'paused');assert.equal(result.retried.confirmedCount,0);assert.equal(result.retried.checkpointCount,0);assert.equal(result.retried.memoryOnlyCount,2);assert.deepEqual(result.saved.state,small);assert.deepEqual(result.latest,result.draft);assert.equal(result.rows.length,1);assert.equal(result.rows[0].state.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts,'Synthetic corruption');
  });
  await run('overlapping large-history edits survive scheduled checkpoints with a small backlog and unchanged legacy copies',async p=>{
    const seeded=await p.evaluate(seedWorkspace,fixture('large'));assert(seeded.staged && !seeded.flushed);
    const result=await p.evaluate(async()=>{
      const original=Object.fromEntries(Object.entries(localStorage)),base=getStateForStorage();await store.initialize(base);const prepare=store.prepare;let release;const gate=new Promise(resolve=>release=resolve);store.prepare=async(...args)=>{await gate;return prepare(...args);};const queue=await LifeExperimentalDeltaStore.openQueue({store,checkpointEvery:2}),draft=structuredClone(base);
      for(let i=0;i<3;i++){
        for(const card of [draft.cards.find(c=>c.type==='diary'),draft.boards[0].cards.find(c=>c.type==='diary')])card.diaryEntries['2026-10-16'].thoughts+='\nComplete thought '+i;
        queue.enqueue(draft);
      }
      const pending=queue.status(),fullBytes=new Blob([JSON.stringify(draft)]).size;release();const finished=await queue.flush(),saved=await store.read();
      if(JSON.stringify(saved.state)!==JSON.stringify(draft))throw new Error('Full large-history queue readback mismatch');
      if(JSON.stringify(original)!==JSON.stringify(Object.fromEntries(Object.entries(localStorage))))throw new Error('Legacy source bytes changed');
      return {pending,finished,fullBytes,savedDigest:saved.head.digest,entriesRead:saved.entriesRead,candidateCount:(await store.candidates()).length};
    });assert(result.pending.pendingChangeBytes<12000);assert.equal(result.pending.memoryOnlyCount,3);assert(result.finished.ok);assert.equal(result.candidateCount,5);assert.equal(result.finished.checkpointCount,2);assert.equal(result.finished.confirmedCount,3);assert.equal(result.entriesRead,2);
    await p.reload();await p.waitForFunction(()=>typeof state!=='undefined' && !document.body.hasAttribute('data-release-starting'));await p.addScriptTag({url:origin+'/experimental-delta.js'});
    const saved=await p.evaluate(async name=>{const s=LifeExperimentalDeltaStore.create({name}),read=await s.read();return {digest:read.head.digest,text:read.state.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts};},name);assert.equal(saved.digest,result.savedDigest);assert(saved.text.endsWith('Complete thought 2'));
    fs.writeFileSync(path.join(out,'large-queue.json'),JSON.stringify({release:release.id,prototypeSourceSha256:sourceHash,engine,...result,legacyCopiesUnchangedDuringQueue:true},null,2)+'\n');
  },{app:true});
  await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
