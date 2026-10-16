const {test}=require('node:test'),assert=require('node:assert/strict');
const delta=require('../experimental/device-delta-store.js');
const reconcile=require('../experimental/board-reconcile.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const base=()=>({boards:[{id:'one',cards:[{id:'diary',thoughts:'Original\nAll lines',unknown:{keep:null}}],archivedCards:[{id:'old',text:'Kept'}]},{id:'two',cards:[{id:'diary',text:'Independent'}]}]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fakeStore(value=base()){
  let current={head:{id:crypto.randomUUID(),digest:await delta.hash(value),sequence:0},state:clone(value),entriesRead:1};
  const candidates=new Map(),published=[],calls=[];
  const store={candidates,published,calls,replayLimit:3,holdPrepare:null,holdPublish:null,prepareFailure:null,publishFailure:null,losePrepare:false,losePublish:false,checkpointFailure:null,holdCheckpoint:null,loseCheckpoint:false,
    read:async()=>clone(current),
    async checkpoint(head,{id}){
      calls.push({kind:'checkpoint',id});if(store.holdCheckpoint)await store.holdCheckpoint.promise;if(store.checkpointFailure)throw store.checkpointFailure;
      assert.deepEqual(head,current.head);const row={token:{id,digest:head.digest,sequence:head.sequence+1},state:clone(current.state),expected:clone(head),checkpoint:true};
      if(candidates.has(id))assert.deepEqual(candidates.get(id),row);else candidates.set(id,row);
      if(store.loseCheckpoint){store.loseCheckpoint=false;throw new DOMException('Synthetic checkpoint readback failure','UnknownError');}
      return clone(row.token);
    },
    async prepare(before,after,head,{id}){
      const captured=clone(after),expected=clone(head);calls.push({kind:'prepare',id});
      if(store.holdPrepare)await store.holdPrepare.promise;
      if(store.prepareFailure)throw store.prepareFailure;
      assert.equal(await delta.hash(before),head.digest);
      const token={id,digest:await delta.hash(captured),sequence:head.sequence+1},row={token,state:captured,expected};
      if(candidates.has(id))assert.deepEqual(candidates.get(id),row);else candidates.set(id,row);
      if(store.losePrepare){store.losePrepare=false;throw new DOMException('Synthetic readback failure','UnknownError');}
      return clone(token);
    },
    async publish(id){
      calls.push({kind:'publish',id});if(store.holdPublish)await store.holdPublish.promise;
      if(store.publishFailure)throw store.publishFailure;
      const row=candidates.get(id);assert(row);
      if(current.head.id!==id){
        if(JSON.stringify(current.head)!==JSON.stringify(row.expected)){const e=new Error('Changed');e.name='DeltaHeadChangedError';throw e;}
        current={head:clone(row.token),state:clone(row.state),entriesRead:row.checkpoint?1:current.entriesRead+1};published.push(clone(current.state));
      }
      if(store.losePublish){store.losePublish=false;throw new DOMException('Synthetic readback failure','UnknownError');}
      return clone(current.head);
    },
    async foreign(value){current={state:clone(value),head:{id:crypto.randomUUID(),digest:await delta.hash(value),sequence:current.head.sequence+1},entriesRead:current.entriesRead+1};}
  };
  return store;
}
const until=async condition=>{for(let i=0;i<1000;i++){if(condition())return;await new Promise(r=>setTimeout(r,1));}throw new Error('Synthetic queue did not reach its expected phase');};
test('rapid edits preserve FIFO order and frozen full text while an earlier capture is held',async()=>{
  const store=await fakeStore(),gate=deferred();store.holdPrepare=gate;const queue=await delta.openQueue({store}),value=base(),expected=[];
  for(let i=0;i<16;i++){value.boards[0].cards[0].thoughts+=' '+i;expected.push(clone(value));queue.enqueue(value);}
  value.boards=[];await until(()=>store.calls.length===1);assert.equal(queue.status().memoryOnlyCount,16);assert.equal(queue.status().durableCandidateCount,0);assert.equal(queue.status().ok,false);assert.deepEqual(queue.latest(),expected.at(-1));
  gate.resolve();assert.equal((await queue.flush()).ok,true);assert.deepEqual(store.published,expected);assert.equal(queue.status().confirmedCount,16);assert.deepEqual(queue.confirmed().state,expected.at(-1));
});
test('durable capture is separate from published confirmation and flush waits for all later edits',async()=>{
  const store=await fakeStore(),gate=deferred();store.holdPublish=gate;const queue=await delta.openQueue({store}),value=base();value.boards[0].cards[0].thoughts+=' first';queue.enqueue(value);
  await until(()=>queue.status().durableCandidateCount===1);value.boards[0].cards[0].thoughts+=' second';queue.enqueue(value);
  assert.equal(queue.status().memoryOnlyCount,1);assert.equal(queue.status().confirmedCount,0);assert.deepEqual(queue.confirmed().state,base());let resolved=false;const flushed=queue.flush().then(value=>{resolved=true;return value;});await new Promise(r=>setTimeout(r,5));assert.equal(resolved,false);
  gate.resolve();assert.equal((await flushed).ok,true);assert.deepEqual(queue.confirmed().state,value);
});
test('failed capture pauses without automatic retries, keeps later drafts and retries the same identity',async()=>{
  const store=await fakeStore();store.prepareFailure=new DOMException('Full','QuotaExceededError');const queue=await delta.openQueue({store}),value=base();value.boards[0].cards[0].thoughts+=' first';const id=queue.enqueue(value);assert.equal((await queue.flush()).phase,'paused');
  value.boards[0].cards[0].thoughts+=' second';queue.enqueue(value);await queue.flush();assert.equal(store.calls.length,1);assert.equal(queue.status().queuedCount,2);assert.equal(queue.status().activeId,id);assert.throws(()=>queue.close(),{name:'DeltaQueuePendingError'});assert.deepEqual(queue.latest(),value);
  const copy=queue.latest();copy.boards=[];assert.deepEqual(queue.latest(),value);store.prepareFailure=null;assert.equal((await queue.retry()).ok,true);assert.equal(store.calls.filter(c=>c.kind==='prepare' && c.id===id).length,2);assert.deepEqual(store.published.at(-1),value);
});
test('a retained capture with a lost acknowledgement retries without another candidate or revision',async()=>{
  const store=await fakeStore();store.losePrepare=true;const queue=await delta.openQueue({store}),value=base();value.boards[0].cards[0].thoughts+=' saved candidate';const id=queue.enqueue(value);
  assert.equal((await queue.flush()).phase,'paused');assert.equal(queue.status().memoryOnlyCount,1);assert.equal(store.candidates.size,1);assert.equal(store.published.length,0);
  assert.equal((await queue.retry()).ok,true);assert.equal(store.candidates.size,1);assert.equal(store.published.length,1);assert.equal((await store.read()).head.id,id);
});
test('a published edit with failed readback is verified once on retry before the next edit proceeds',async()=>{
  const store=await fakeStore();store.losePublish=true;const queue=await delta.openQueue({store}),value=base();value.boards[0].cards[0].thoughts+=' one';const first=clone(value);queue.enqueue(value);value.boards[0].cards[0].thoughts+=' two';queue.enqueue(value);
  assert.equal((await queue.flush()).phase,'paused');assert.equal(queue.status().durableCandidateCount,1);assert.equal(queue.status().memoryOnlyCount,1);assert.equal(queue.status().confirmedCount,0);assert.deepEqual((await store.read()).state,first);
  assert.equal((await queue.retry()).ok,true);assert.equal(queue.status().confirmedCount,2);assert.deepEqual(store.published,[first,value]);
});
test('a different writer never silently rebases this queue or replaces either board with an old snapshot',async()=>{
  const store=await fakeStore(),gate=deferred();store.holdPublish=gate;const queue=await delta.openQueue({store}),own=base(),foreign=base();own.boards[0].cards[0].thoughts+=' my whole writing';queue.enqueue(own);
  await until(()=>queue.status().durableCandidateCount===1);foreign.boards[1].cards[0].text='Other writer';await store.foreign(foreign);gate.resolve();assert.equal((await queue.flush()).error.name,'DeltaHeadChangedError');
  own.boards[0].cards[0].thoughts+=' and the rest';queue.enqueue(own);assert.equal((await queue.retry()).error.name,'DeltaHeadChangedError');assert.deepEqual((await store.read()).state,foreign);assert.deepEqual(queue.latest(),own);assert.equal(queue.status().queuedCount,2);
});
test('pending memory stores changed fields instead of a complete large unrelated history per keystroke',async()=>{
  const value=base();value.boards[1].history='x'.repeat(1000000);const store=await fakeStore(value),gate=deferred();store.holdPrepare=gate;const queue=await delta.openQueue({store});
  for(let i=0;i<20;i++){value.boards[0].cards[0].thoughts+='x';queue.enqueue(value);}
  assert(queue.status().pendingChangeBytes<12000);assert.equal(queue.status().queuedCount,20);gate.resolve();assert.equal((await queue.flush()).ok,true);assert.deepEqual(queue.confirmed().state,value);
});
test('checkpoint-required pause preserves its durable candidate and later memory-only edits',async()=>{
  const store=await fakeStore();store.publishFailure=Object.assign(new Error('Checkpoint required'),{name:'DeltaCheckpointRequiredError'});const queue=await delta.openQueue({store}),value=base();value.boards[0].cards[0].thoughts+=' one';queue.enqueue(value);value.boards[0].cards[0].thoughts+=' two';queue.enqueue(value);
  assert.equal((await queue.flush()).error.name,'DeltaCheckpointRequiredError');assert.equal(queue.status().durableCandidateCount,1);assert.equal(queue.status().memoryOnlyCount,1);assert.deepEqual(queue.latest(),value);assert.deepEqual((await store.read()).state,base());
});
test('status is defensive and text-free; observer errors and reentrant additions cannot interrupt saving',async()=>{
  const store=await fakeStore(),value=base();let queue,added=false;queue=await delta.openQueue({store,onChange:status=>{if(queue && status.confirmedCount===1 && !added){added=true;value.boards[0].cards[0].thoughts+=' callback';queue.enqueue(value);}throw new Error('Broken view');}});
  value.boards[0].cards[0].thoughts+=' first';queue.enqueue(value);assert.equal((await queue.flush()).ok,true);assert.equal(queue.status().confirmedCount,2);assert.deepEqual(queue.latest(),value);const status=queue.status();status.lastConfirmedHead.id='mutated';assert.notEqual(queue.status().lastConfirmedHead.id,'mutated');assert(!JSON.stringify(status).includes('Original'));queue.close();assert.equal(queue.status().phase,'closed');assert.throws(()=>queue.enqueue(value),{name:'DeltaQueueClosedError'});
});
test('no-op snapshots and malformed input cannot create edits or initialize empty storage',async()=>{
  const store=await fakeStore(),queue=await delta.openQueue({store});assert.equal(queue.enqueue(base()),null);assert.equal((await queue.flush()).ok,true);assert.equal(store.calls.length,0);
  const cyclic=base();cyclic.self=cyclic;assert.throws(()=>queue.enqueue(cyclic));assert.throws(()=>queue.enqueue({boards:null}));assert.deepEqual(queue.latest(),base());assert.equal(queue.status().queuedCount,0);
  await assert.rejects(delta.openQueue({store:{read:async()=>null,prepare(){},publish(){}}}),{name:'DeltaQueueInitializationError'});await assert.rejects(delta.openQueue({store:{}}));
});
test('failure status never exposes record text, error messages or caller-controlled error names',async()=>{
  const store=await fakeStore(),fault=Object.assign(new Error('Private diary content'),{name:'PrivateDiaryContentError'});store.prepareFailure=fault;const queue=await delta.openQueue({store}),value=base();value.boards[0].cards[0].thoughts+=' My private words';queue.enqueue(value);
  assert.equal((await queue.flush()).error.name,'SaveError');fault.name='SecurityError';assert.equal(queue.status().error.name,'SaveError');assert(!JSON.stringify(queue.status()).includes('Private'));assert(!JSON.stringify(queue.status()).includes('private'));
});
test('opt-in checkpoints keep a long FIFO queue within its replay budget without counting maintenance as edits',async()=>{
  const store=await fakeStore(),queue=await delta.openQueue({store,checkpointEvery:3}),value=base(),expected=[];
  for(let i=0;i<9;i++){value.boards[0].cards[0].thoughts+=' '+i;expected.push(clone(value));queue.enqueue(value);}
  const status=await queue.flush();assert(status.ok);assert.equal(status.confirmedCount,9);assert.equal(status.checkpointCount,4);assert.equal(status.checkpoint,null);assert.equal((await store.read()).entriesRead,2);assert.deepEqual(queue.confirmed().state,value);
  assert.deepEqual(store.calls.filter(c=>c.kind==='publish').map(c=>store.candidates.get(c.id)).filter(row=>!row.checkpoint).map(row=>row.state),expected);
  assert.equal(queue.enqueue(value),null);await queue.flush();assert.equal(store.calls.filter(c=>c.kind==='checkpoint').length,4);
});
test('a held checkpoint retains later drafts and dirty-close protection without falsely acknowledging them',async()=>{
  const store=await fakeStore(),gate=deferred();store.holdCheckpoint=gate;const queue=await delta.openQueue({store,checkpointEvery:1}),value=base();value.boards[0].cards[0].thoughts+=' first';queue.enqueue(value);await until(()=>store.calls.length===1);
  value.boards[0].cards[0].thoughts+=' later';queue.enqueue(value);const status=queue.status();assert.equal(status.checkpoint.candidateAcknowledged,false);assert.equal(status.confirmedCount,0);assert.equal(status.memoryOnlyCount,2);assert.equal(status.durableCandidateCount,0);assert.throws(()=>queue.close(),{name:'DeltaQueuePendingError'});assert.deepEqual(queue.confirmed().state,base());
  gate.resolve();assert((await queue.flush()).ok);assert.deepEqual(queue.confirmed().state,value);assert.equal(queue.status().checkpointCount,2);
});
test('checkpoint quota failure pauses and reuses one identity on explicit retry',async()=>{
  const store=await fakeStore();store.checkpointFailure=new DOMException('Full','QuotaExceededError');const queue=await delta.openQueue({store,checkpointEvery:1}),value=base();value.boards[0].cards[0].thoughts+=' captured';queue.enqueue(value);
  const paused=await queue.flush(),id=paused.checkpoint.id;assert.equal(paused.error.name,'QuotaExceededError');assert.equal(paused.memoryOnlyCount,1);assert.equal(paused.checkpointCount,0);assert.equal(store.calls.length,1);assert.deepEqual((await store.read()).state,base());
  store.checkpointFailure=null;assert((await queue.retry()).ok);assert.equal(store.calls.filter(c=>c.kind==='checkpoint' && c.id===id).length,2);assert.equal(store.candidates.size,2);assert.deepEqual(queue.confirmed().state,value);
});
test('lost checkpoint capture acknowledgement retries the same candidate before preparing the edit',async()=>{
  const store=await fakeStore();store.loseCheckpoint=true;const queue=await delta.openQueue({store,checkpointEvery:1}),value=base();value.boards[0].cards[0].thoughts+=' retained';queue.enqueue(value);
  const paused=await queue.flush();assert.equal(paused.checkpoint.candidateAcknowledged,false);assert.equal(store.candidates.size,1);assert.equal(store.calls.filter(c=>c.kind==='prepare').length,0);assert((await queue.retry()).ok);assert.equal(store.candidates.size,2);assert.equal(queue.status().checkpointCount,1);assert.equal(queue.status().confirmedCount,1);
});
test('lost checkpoint publication acknowledgement confirms once without recreating maintenance',async()=>{
  const store=await fakeStore();store.losePublish=true;const queue=await delta.openQueue({store,checkpointEvery:1}),value=base();value.boards[0].cards[0].thoughts+=' captured';queue.enqueue(value);
  const paused=await queue.flush(),committed=await store.read();assert.equal(paused.checkpoint.candidateAcknowledged,true);assert.equal(committed.head.id,paused.checkpoint.id);assert.equal(paused.checkpointCount,0);assert.deepEqual(queue.confirmed().state,base());
  assert((await queue.retry()).ok);assert.equal(store.calls.filter(c=>c.kind==='checkpoint').length,1);assert.equal(store.published.length,2);assert.equal(queue.status().checkpointCount,1);assert.equal((await store.read()).head.sequence,2);
});
test('a foreign writer during checkpoint publication cannot be silently adopted or overwritten',async()=>{
  const store=await fakeStore(),gate=deferred();store.holdPublish=gate;const queue=await delta.openQueue({store,checkpointEvery:1}),value=base(),foreign=base();value.boards[0].cards[0].thoughts+=' mine';queue.enqueue(value);await until(()=>queue.status().checkpoint?.candidateAcknowledged);
  foreign.boards[1].cards[0].text='Newer other board';await store.foreign(foreign);gate.resolve();assert.equal((await queue.flush()).error.name,'DeltaHeadChangedError');assert.equal((await queue.retry()).error.name,'DeltaHeadChangedError');assert.deepEqual((await store.read()).state,foreign);assert.deepEqual(queue.latest(),value);assert.equal(store.calls.filter(c=>c.kind==='prepare').length,0);
});
test('invalid checkpoint configuration and unverified replay depths fail before any write',async()=>{
  const store=await fakeStore();for(const checkpointEvery of [-1,0.5,4,NaN,'3',null])await assert.rejects(delta.openQueue({store,checkpointEvery}));
  for(const entriesRead of [undefined,0,4,1.5])await assert.rejects(delta.openQueue({store:{...store,read:async()=>({...await store.read(),entriesRead})},checkpointEvery:3}));
  for(const changed of [{checkpoint:null},{replayLimit:undefined},{replayLimit:129}])await assert.rejects(delta.openQueue({store:{...store,...changed},checkpointEvery:3}));assert.equal(store.calls.length,0);
});
test('forged checkpoint and publication receipts pause without preparing or acknowledging the queued edit',async()=>{
  for(const phase of ['capture','publish']){
    const store=await fakeStore(),method=phase==='capture'?'checkpoint':'publish',original=store[method];store[method]=async(...args)=>({...await original(...args),digest:'0'.repeat(64)});
    const queue=await delta.openQueue({store,checkpointEvery:1}),value=base();value.boards[0].cards[0].thoughts+=' private captured text';queue.enqueue(value);const status=await queue.flush();assert.equal(status.phase,'paused');assert.equal(status.confirmedCount,0);assert.equal(status.checkpointCount,0);assert.deepEqual(queue.confirmed().state,base());assert.deepEqual(queue.latest(),value);assert.equal(store.calls.filter(c=>c.kind==='prepare').length,0);
  }
});
async function staleQueue(options={}){
  const store=await fakeStore(),gate=deferred();store.holdPublish=gate;const queue=await delta.openQueue({store,...options}),value=base(),foreign=base();value.boards[0].cards[0].thoughts+=' first';const oldId=queue.enqueue(value);value.boards[0].cards[0].thoughts+=' second';queue.enqueue(value);await until(()=>queue.status().durableCandidateCount===1);
  foreign.boards[1].cards[0].text='Other writer';await store.foreign(foreign);gate.resolve();assert.equal((await queue.flush()).error.name,'DeltaHeadChangedError');return {store,queue,value,foreign,oldId};
}
test('explicit reconciliation preserves every queued edit and the other board using new immutable candidates',async()=>{
  const {store,queue,value,foreign,oldId}=await staleQueue({checkpointEvery:3}),old=clone(store.candidates.get(oldId));const finished=await queue.reconcile(reconcile.plan);assert(finished.ok);assert.equal(finished.reconciliationCount,1);assert.equal(finished.confirmedCount,2);assert.equal(finished.checkpointCount,1);assert.deepEqual(store.candidates.get(oldId),old);assert.deepEqual(queue.confirmed().state.boards,[value.boards[0],foreign.boards[1]]);assert.equal(queue.comparison(),null);
  const versions=store.calls.filter(c=>c.kind==='prepare' && c.id!==oldId).map(c=>store.candidates.get(c.id).state);assert.equal(versions.length,2);assert(versions[0].boards[0].cards[0].thoughts.endsWith(' first'));assert(versions[1].boards[0].cards[0].thoughts.endsWith(' second'));assert(versions.every(v=>v.boards[1].cards[0].text==='Other writer'));
});
test('same-field conflicts keep both snapshots and queued drafts without publishing or leaking text in status',async()=>{
  const {store,queue,value,oldId}=await staleQueue(),foreign=base();foreign.boards[0].cards[0].thoughts='Remote private words';await store.foreign(foreign);const calls=store.calls.length,status=await queue.reconcile(reconcile.plan),review=queue.comparison();assert.equal(status.phase,'paused');assert(status.reviewConflictCount>0);assert.equal(status.reconciliationCount,0);assert.equal(store.calls.length,calls);assert.deepEqual(queue.latest(),value);assert.deepEqual((await store.read()).state,foreign);assert.equal(review.jobId,oldId);assert.deepEqual(review.latest,value);assert.deepEqual(review.remote,foreign);assert.equal(review.local.boards[0].cards[0].thoughts,base().boards[0].cards[0].thoughts+' first');assert(!JSON.stringify(status).includes('private'));
  review.remote.boards=[];assert.deepEqual(queue.comparison().remote,foreign);
});
test('typing during an asynchronous comparison invalidates the plan and preserves all writing for another comparison',async()=>{
  const {queue,value}=await staleQueue(),gate=deferred();let entered=false;const comparing=queue.reconcile(async(...args)=>{entered=true;await gate.promise;return reconcile.plan(...args);});await until(()=>entered);assert.equal(queue.status().phase,'comparing');assert.throws(()=>queue.retry(),{name:'DeltaQueueBusyError'});await assert.rejects(queue.reconcile(reconcile.plan),{name:'DeltaQueueBusyError'});assert.throws(()=>queue.close(),{name:'DeltaQueuePendingError'});
  value.boards[0].cards[0].thoughts+=' still typing';queue.enqueue(value);gate.resolve();await assert.rejects(comparing,{name:'DeltaQueueChangedError'});assert.equal(queue.status().queuedCount,3);assert.deepEqual(queue.latest(),value);assert.equal(queue.status().reconciliationCount,0);assert((await queue.reconcile(reconcile.plan)).ok);assert.equal(queue.status().confirmedCount,3);
});
test('a second writer during comparison invalidates the expected head without replacing pending edits',async()=>{
  const {store,queue,value}=await staleQueue();let advanced=false;await assert.rejects(queue.reconcile(async(...args)=>{if(!advanced){advanced=true;const next=clone(args[2]);next.boards[1].cards[0].text+=' newer';await store.foreign(next);}return reconcile.plan(...args);}),{name:'DeltaHeadChangedError'});assert.deepEqual(queue.latest(),value);assert.equal(queue.status().reconciliationCount,0);assert.equal(queue.status().error.name,'DeltaHeadChangedError');assert((await queue.reconcile(reconcile.plan)).ok);assert.equal(queue.confirmed().state.boards[1].cards[0].text,'Other writer newer');
});
test('an edit already included in the verified foreign snapshot is absorbed without a duplicate write',async()=>{
  const {store,queue,value}=await staleQueue(),combined=clone(value);combined.boards[1].cards[0].text='Other writer';await store.foreign(combined);
  // Both intermediate versions remain relevant: the first would regress the remote text.
  const status=await queue.reconcile(reconcile.plan);assert.equal(status.phase,'paused');assert(status.reviewConflictCount>0);assert.deepEqual((await store.read()).state,combined);
  const singleStore=await fakeStore(),gate=deferred();singleStore.holdPublish=gate;const single=await delta.openQueue({store:singleStore}),draft=base();draft.boards[0].cards[0].thoughts+=' single';single.enqueue(draft);await until(()=>single.status().durableCandidateCount===1);await singleStore.foreign(draft);gate.resolve();await single.flush();const count=singleStore.calls.length,done=await single.reconcile(reconcile.plan);assert(done.ok);assert.equal(done.absorbedCount,1);assert.equal(done.confirmedCount,0);assert.equal(singleStore.calls.length,count);assert.deepEqual(single.confirmed().state,draft);
});
test('a failed reconciled save retains both the original candidate and new candidate for exact retry',async()=>{
  const {store,queue,value,oldId}=await staleQueue();store.publishFailure=new DOMException('Synthetic quota','QuotaExceededError');const paused=await queue.reconcile(reconcile.plan);assert.equal(paused.error.name,'QuotaExceededError');assert.equal(paused.reconciliationCount,1);assert.equal(paused.durableCandidateCount,1);assert.equal(paused.memoryOnlyCount,1);assert.notEqual(paused.activeId,oldId);assert(store.candidates.has(oldId));const retained=store.candidates.size;store.publishFailure=null;assert((await queue.retry()).ok);assert.equal(store.candidates.size,retained+1);assert.deepEqual(queue.confirmed().state.boards[0],value.boards[0]);
});
test('invalid planners, malformed results and corrupt receipts cannot replace the queue base or latest draft',async()=>{
  const {store,queue,value}=await staleQueue();await assert.rejects(queue.reconcile());for(const planner of [()=>({}),()=>({conflicts:[],state:{boards:null}}),()=>{throw new Error('Synthetic planner failure');}]){await assert.rejects(queue.reconcile(planner));assert.deepEqual(queue.latest(),value);assert.equal(queue.status().reconciliationCount,0);}
  const read=store.read;store.read=async()=>({...await read(),head:{...(await read()).head,digest:'0'.repeat(64)}});await assert.rejects(queue.reconcile(reconcile.plan),{name:'DeltaReconcileReviewError'});store.read=read;assert((await queue.reconcile(reconcile.plan)).ok);
});
test('reconciliation requires editors to refresh their snapshot and rejects obsolete capture tokens',async()=>{
  const {store,queue,value}=await staleQueue(),oldDraft=queue.draft();assert((await queue.reconcile(reconcile.plan)).ok);assert.equal(queue.status().basisRequired,true);
  assert.throws(()=>queue.enqueue(value),{name:'DeltaQueueViewChangedError'});assert.throws(()=>queue.enqueue(oldDraft.state,{basis:oldDraft.basis}),{name:'DeltaQueueViewChangedError'});
  const fresh=queue.draft();assert.notEqual(fresh.basis,oldDraft.basis);fresh.state.boards[0].cards[0].thoughts+=' after refresh';queue.enqueue(fresh.state,{basis:fresh.basis});assert((await queue.flush()).ok);assert.equal((await store.read()).state.boards[1].cards[0].text,'Other writer');assert(queue.latest().boards[0].cards[0].thoughts.endsWith('after refresh'));
});
test('a stale maintenance checkpoint can be replaced only by explicit reconciliation while its original candidate remains',async()=>{
  const store=await fakeStore(),gate=deferred();store.holdPublish=gate;const queue=await delta.openQueue({store,checkpointEvery:1}),value=base(),foreign=base();value.boards[0].cards[0].thoughts+=' pending own writing';queue.enqueue(value);await until(()=>queue.status().checkpoint?.candidateAcknowledged);const checkpointId=queue.status().checkpoint.id,original=clone(store.candidates.get(checkpointId));foreign.boards[1].cards[0].text='Other board';await store.foreign(foreign);gate.resolve();assert.equal((await queue.flush()).error.name,'DeltaHeadChangedError');
  assert((await queue.reconcile(reconcile.plan)).ok);assert.deepEqual(store.candidates.get(checkpointId),original);assert.equal(queue.status().checkpointCount,1);assert.deepEqual(queue.confirmed().state.boards,[value.boards[0],foreign.boards[1]]);
});
