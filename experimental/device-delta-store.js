/* Inactive prototype. No application imports, existing keys or database migration. */
(function(root){
  'use strict';
  const format='life-os-experimental-delta-v1';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const own=(value,key)=>Object.hasOwn(value,key);
  const plain=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  const validHash=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(plain(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    return JSON.stringify(value);
  }
  function snapshot(value){
    const result=clone(value);
    if(!plain(result) || !Array.isArray(result.boards))throw new Error('Expected a complete JSON workspace. Original records were kept.');
    return result;
  }
  function error(name,message){const result=new Error(message);result.name=name;return result;}
  async function hash(value){
    const bytes=new TextEncoder().encode(canonical(value));
    return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  }
  function changes(before,after,path=[],out=[]){
    if(before===after)return out;
    if(Array.isArray(before) && Array.isArray(after)){
      for(let i=0;i<Math.min(before.length,after.length);i++)changes(before[i],after[i],[...path,i],out);
      for(let i=before.length-1;i>=after.length;i--)out.push({path:[...path,i],before:true,after:false,old:before[i]});
      for(let i=before.length;i<after.length;i++)out.push({path:[...path,i],before:false,after:true,value:after[i]});
    }else if(plain(before) && plain(after)){
      for(const key of Object.keys(before)){
        if(!own(after,key))out.push({path:[...path,key],before:true,after:false,old:before[key]});
        else changes(before[key],after[key],[...path,key],out);
      }
      for(const key of Object.keys(after))if(!own(before,key))out.push({path:[...path,key],before:false,after:true,value:after[key]});
    }else if(canonical(before)!==canonical(after))out.push({path,before:true,after:true,old:before,value:after});
    return out;
  }
  async function encode(base,next){
    // Capture both inputs before the first await; later caller edits are not this save.
    base=snapshot(base);next=snapshot(next);
    const delta={format,baseDigest:await hash(base),digest:await hash(next),changes:changes(base,next)};
    return delta;
  }
  async function apply(base,packet){
    const result=snapshot(base),delta=clone(packet);
    if(delta?.format!==format || !validHash(delta.baseDigest) || !validHash(delta.digest) || !Array.isArray(delta.changes))throw new Error('Invalid change packet. Original records were kept.');
    if(await hash(result)!==delta.baseDigest)throw error('DeltaBaseChangedError','This change belongs to a different workspace revision. Both versions were kept.');
    applyChanges(result,delta.changes);
    if(!Array.isArray(result.boards) || await hash(result)!==delta.digest)throw new Error('Changed-record readback did not match. Original records were kept.');
    return result;
  }
  function applyChanges(result,edits){
    for(const change of edits){
      if(!Array.isArray(change.path) || !change.path.length || change.path.length>128 || typeof change.before!=='boolean' || typeof change.after!=='boolean' || (!change.before && !change.after) || own(change,'old')!==change.before || own(change,'value')!==change.after)throw new Error('Invalid change path. Original records were kept.');
      let parent=result;
      for(const key of change.path.slice(0,-1)){
        if(!validKey(parent,key) || !own(parent,key))throw new Error('Missing change parent. Original records were kept.');
        parent=parent[key];
      }
      const key=change.path.at(-1);
      if(!validKey(parent,key) || own(parent,key)!==change.before || (change.before && canonical(parent[key])!==canonical(change.old)))throw new Error('The change precondition does not match. Original records were kept.');
      if(Array.isArray(parent)){
        if(change.before && !change.after){if(key!==parent.length-1)throw new Error('Invalid array removal.');parent.pop();}
        else if(!change.before){if(key!==parent.length)throw new Error('Invalid array append.');parent.push(change.value);}
        else parent[key]=change.value;
      }else if(change.after)Object.defineProperty(parent,key,{value:change.value,enumerable:true,writable:true,configurable:true});
      else delete parent[key];
    }
    return result;
  }
  function validKey(parent,key){
    return Array.isArray(parent)?Number.isSafeInteger(key) && key>=0:plain(parent) && typeof key==='string';
  }
  function receipt(value){
    if(!plain(value) || typeof value.id!=='string' || !value.id || !validHash(value.digest) || !Number.isSafeInteger(value.sequence) || value.sequence<0)throw new Error('Invalid prototype save receipt.');
    return {id:value.id,digest:value.digest,sequence:value.sequence};
  }
  function nextSequence(head){if(head.sequence===Number.MAX_SAFE_INTEGER)throw new Error('Prototype receipt sequence is exhausted.');return head.sequence+1;}
  function captureId(options){
    const id=options.id ?? root.crypto.randomUUID();
    if(typeof id!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw new Error('Invalid capture identity.');
    return id;
  }
  function same(a,b){return canonical(a)===canonical(b);}
  function create({database=root.indexedDB,name,timeoutMs=10000,maxReplayEntries=128}={}){
    // Deliberately cannot select a production database or change its schema.
    if(typeof name!=='string' || !/^life-os-experimental-delta-v1:[a-z0-9-]{1,80}$/.test(name))throw new Error('Use an isolated experimental database name.');
    if(!Number.isFinite(timeoutMs) || timeoutMs<1 || timeoutMs>60000)throw new Error('Invalid transaction deadline.');
    if(!Number.isSafeInteger(maxReplayEntries) || maxReplayEntries<2 || maxReplayEntries>128)throw new Error('Invalid prototype replay limit.');
    let connection=null,opening=null;
    async function open(){
      if(connection)return connection;
      if(!opening)opening=new Promise((resolve,reject)=>{
        if(!database){reject(new Error('Experimental IndexedDB is unavailable.'));return;}
        const request=database.open(name,1);let settled=false;
        const finish=(failure,db)=>{
          if(settled){if(db)db.close();return;}
          settled=true;clearTimeout(timer);failure?reject(failure):resolve(db);
        };
        const timer=setTimeout(()=>finish(error('DeltaStoreTimeoutError','Opening the prototype store timed out.')),timeoutMs);
        request.onupgradeneeded=()=>{for(const store of ['entries','candidates','meta'])if(!request.result.objectStoreNames.contains(store))request.result.createObjectStore(store);};
        request.onerror=()=>finish(request.error || new Error('Experimental storage could not open.'));
        request.onblocked=()=>finish(new Error('Experimental storage is blocked.'));
        request.onsuccess=()=>finish(null,request.result);
      }).then(db=>{connection=db;db.onversionchange=()=>{db.close();connection=null;};return db;}).finally(()=>{opening=null;});
      return opening;
    }
    async function transaction(stores,mode,work){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(stores,mode,mode==='readwrite'?{durability:'strict'}:undefined);let failure,result,acknowledged=false;
        const timer=setTimeout(()=>abort(error('DeltaStoreTimeoutError','Prototype transaction timed out. No successful save was acknowledged.')),timeoutMs);
        function abort(reason){failure=reason;try{tx.abort();}catch{}reject(reason);}
        tx.oncomplete=()=>{clearTimeout(timer);acknowledged?resolve(result):reject(new Error('Prototype request completion was not acknowledged.'));};
        tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(failure || tx.error || new Error('Prototype transaction failed.'));};
        try{work(tx,value=>{result=value;acknowledged=true;},abort);}catch(reason){abort(reason);}
      });
    }
    const get=(store,key)=>transaction([store],'readonly',(tx,done)=>{const req=tx.objectStore(store).get(key);req.onsuccess=()=>done(req.result);});
    const count=store=>transaction([store],'readonly',(tx,done)=>{const req=tx.objectStore(store).count();req.onsuccess=()=>done(req.result);});
    const candidates=()=>transaction(['candidates'],'readonly',(tx,done)=>{const req=tx.objectStore('candidates').getAll();req.onsuccess=()=>done(req.result);});
    async function readAt(head){
      head=receipt(head);let current=head;const chain=[],seen=new Set();let value;
      while(true){
        if(seen.has(current.id) || seen.size>=maxReplayEntries)throw new Error('Prototype history needs a checkpoint or repair. Nothing was removed.');
        seen.add(current.id);
        const entry=await get('entries',current.id);
        if(!entry || entry.format!==format || entry.id!==current.id || entry.digest!==current.digest || entry.sequence!==current.sequence)throw new Error('A prototype history entry is missing or changed.');
        if(entry.kind==='checkpoint'){
          value=snapshot(entry.state);if(await hash(value)!==entry.digest)throw new Error('Prototype checkpoint integrity check failed.');break;
        }
        if(entry.kind!=='delta' || !same(entry.expected,receipt(entry.expected)) || entry.sequence!==entry.expected.sequence+1 || entry.packet?.baseDigest!==entry.expected.digest || entry.packet?.digest!==entry.digest)throw new Error('Invalid prototype change history.');
        chain.push(entry);current=receipt(entry.expected);
      }
      for(const entry of chain.reverse())value=await apply(value,entry.packet);
      return {head,state:value,entriesRead:seen.size};
    }
    async function read(){
      const head=await get('meta','head');
      if(head!==undefined)return readAt(head);
      if(await count('entries') || await count('candidates'))throw error('DeltaRecoveryNeededError','The prototype index is missing but original records remain. Nothing was initialized or replaced.');
      return null;
    }
    async function initialize(value){
      const state=snapshot(value),digest=await hash(state),head={id:root.crypto.randomUUID(),digest,sequence:0};
      const entry={format,kind:'checkpoint',...head,state};
      await transaction(['entries','candidates','meta'],'readwrite',(tx,done,abort)=>{
        const req=tx.objectStore('meta').get('head');req.onsuccess=()=>{
          try{
            if(req.result!==undefined)throw error('DeltaHeadChangedError','A prototype head already exists.');
            const entries=tx.objectStore('entries').count();entries.onsuccess=()=>{
              try{
                if(entries.result)throw error('DeltaRecoveryNeededError','Original prototype entries remain without an index. Nothing was initialized.');
                const candidates=tx.objectStore('candidates').count();candidates.onsuccess=()=>{
                  try{if(candidates.result)throw error('DeltaRecoveryNeededError','Original prototype candidates remain without an index. Nothing was initialized.');tx.objectStore('entries').add(entry,head.id);tx.objectStore('meta').add(head,'head');done(head);}catch(reason){abort(reason);}
                };
              }catch(reason){abort(reason);}
            };
          }catch(reason){abort(reason);}
        };
      });
      const verified=await readAt(head);if(!same(verified.state,state))throw new Error('Prototype initialization readback failed.');return head;
    }
    async function keepCandidate(entry){
      await transaction(['candidates','entries'],'readwrite',(tx,done,abort)=>{
        const retained=tx.objectStore('candidates').get(entry.id);retained.onsuccess=()=>{
          try{
            if(retained.result!==undefined && !same(retained.result,entry))throw error('DeltaCandidateChangedError','This capture identity already belongs to another version. Original candidates were kept.');
            const committed=tx.objectStore('entries').get(entry.id);committed.onsuccess=()=>{
              try{
                if(committed.result!==undefined && !same(committed.result,entry))throw error('DeltaCandidateChangedError','This capture identity already belongs to another saved entry.');
                if(retained.result===undefined)tx.objectStore('candidates').add(entry,entry.id);
                done(entry.id);
              }catch(reason){abort(reason);}
            };
          }catch(reason){abort(reason);}
        };
      });
      const retained=await get('candidates',entry.id);if(!same(retained,entry))throw new Error('The prototype candidate was not retained exactly.');return {id:entry.id,digest:entry.digest,sequence:entry.sequence};
    }
    async function prepare(base,next,expected,options={}){
      const id=captureId(options);
      expected=receipt(expected);const sequence=nextSequence(expected),packet=await encode(base,next);
      if(packet.baseDigest!==expected.digest)throw error('DeltaBaseChangedError','The supplied base is not this save receipt.');
      const parent=await readAt(expected);if(await hash(parent.state)!==packet.baseDigest)throw new Error('Prototype parent verification failed.');
      return keepCandidate({format,kind:'delta',id,sequence,digest:packet.digest,expected,packet});
    }
    async function checkpoint(expected,options={}){
      const id=captureId(options);
      expected=receipt(expected);const sequence=nextSequence(expected),current=await readAt(expected);
      return keepCandidate({format,kind:'checkpoint',id,sequence,digest:expected.digest,expected,state:current.state});
    }
    async function candidate(id){
      const entry=await get('candidates',id);
      if(!entry || entry.format!==format || entry.id!==id || receipt(entry).sequence!==nextSequence(receipt(entry.expected)))throw new Error('Prototype candidate is missing or invalid.');
      const base=await readAt(entry.expected);
      if(entry.kind==='checkpoint' && entry.digest!==entry.expected.digest)throw new Error('Prototype checkpoint changed the recorded state.');
      const value=entry.kind==='delta'?await apply(base.state,entry.packet):entry.kind==='checkpoint'?snapshot(entry.state):null;
      if(value===null || await hash(value)!==entry.digest)throw new Error('Prototype candidate integrity check failed.');
      return {entry,state:value,parentEntriesRead:base.entriesRead};
    }
    async function publish(id){
      const checked=await candidate(id),entry=checked.entry,head={id:entry.id,digest:entry.digest,sequence:entry.sequence};
      await transaction(['candidates','entries','meta'],'readwrite',(tx,done,abort)=>{
        const req=tx.objectStore('meta').get('head');req.onsuccess=()=>{
          try{
            if(same(req.result,head)){done(head);return;}
            if(!same(req.result,entry.expected))throw error('DeltaHeadChangedError','Another prototype save won. This candidate remains available for comparison.');
            if(entry.kind==='delta' && checked.parentEntriesRead>=maxReplayEntries)throw error('DeltaCheckpointRequiredError','Publish a verified checkpoint first. The current head and this candidate were kept.');
            const retained=tx.objectStore('candidates').get(id);retained.onsuccess=()=>{
              try{if(!same(retained.result,entry))throw new Error('Prototype candidate changed before publish.');tx.objectStore('entries').add(entry,id);tx.objectStore('meta').put(head,'head');done(head);}catch(reason){abort(reason);}
            };
          }catch(reason){abort(reason);}
        };
      });
      const verified=await readAt(head);if(!same(verified.state,checked.state))throw new Error('Prototype publish readback failed.');return head;
    }
    return {initialize,prepare,publish,checkpoint,read,readCandidate:async id=>(await candidate(id)).state,candidates,replayLimit:maxReplayEntries,close:()=>{connection?.close();connection=null;}};
  }
  async function openQueue({store,onChange,checkpointEvery=0}={}){
    if(!store || ['read','prepare','publish'].some(key=>typeof store[key]!=='function') || (onChange!==undefined && typeof onChange!=='function'))throw new Error('Expected a prototype store and optional status observer.');
    if(!Number.isSafeInteger(checkpointEvery) || checkpointEvery<0 || (checkpointEvery && (typeof store.checkpoint!=='function' || !Number.isSafeInteger(store.replayLimit) || store.replayLimit<2 || store.replayLimit>128 || checkpointEvery>store.replayLimit)))throw new Error('Use a checkpoint interval within this store replay limit, or zero to disable scheduling.');
    const initial=await store.read();
    if(!initial)throw error('DeltaQueueInitializationError','Initialize and verify an isolated prototype checkpoint first.');
    if(checkpointEvery && (!Number.isSafeInteger(initial.entriesRead) || initial.entriesRead<1 || initial.entriesRead>store.replayLimit))throw new Error('Checkpoint scheduling requires a verified replay depth.');
    let confirmed={head:receipt(initial.head),state:snapshot(initial.state)},latest=confirmed.state,work=null,failure=null,closed=false,confirmedCount=0;
    let entriesRead=initial.entriesRead,maintenance=null,checkpointCount=0;
    let reconciling=false,revision=0,review=null,reconciliationCount=0,absorbedCount=0;
    let captureBasis=root.crypto.randomUUID(),basisRequired=false;
    const jobs=[];
    const errorNames=new Set(['Error','TypeError','RangeError','QuotaExceededError','UnknownError','SecurityError','AbortError','ConstraintError','InvalidStateError','NotFoundError','DataError','TransactionInactiveError','TimeoutError','DeltaBaseChangedError','DeltaHeadChangedError','DeltaRecoveryNeededError','DeltaCheckpointRequiredError','DeltaCandidateChangedError','DeltaStoreTimeoutError']);
    function status(){
      const durable=jobs.filter(job=>job.candidate).length;
      return {phase:closed?'closed':reconciling?'comparing':failure?'paused':jobs.length?'saving':'idle',ok:!reconciling && !jobs.length && !failure,queuedCount:jobs.length,memoryOnlyCount:jobs.length-durable,durableCandidateCount:durable,pendingChangeBytes:jobs.reduce((sum,job)=>sum+job.bytes,0),confirmedCount,checkpointCount,checkpoint:maintenance?{id:maintenance.id,candidateAcknowledged:!!maintenance.candidate}:null,reconciliationCount,absorbedCount,basisRequired,reviewConflictCount:review?.conflicts.length || 0,lastConfirmedHead:{...confirmed.head},activeId:jobs[0]?.id || null,error:failure?{...failure}:null};
    }
    function notify(){if(onChange)try{onChange(status());}catch{}}
    async function run(){
      while(jobs.length && !failure && !closed){
        const job=jobs[0];
        try{
          // Only compact an unchanged confirmed base, before preparing the next edit.
          if(checkpointEvery && !job.candidate && (maintenance || entriesRead>=checkpointEvery)){
            if(!maintenance){maintenance={id:root.crypto.randomUUID(),candidate:null};notify();}
            if(!maintenance.candidate){
              const captured=receipt(await store.checkpoint(confirmed.head,{id:maintenance.id}));
              if(captured.id!==maintenance.id || captured.sequence!==nextSequence(confirmed.head) || captured.digest!==confirmed.head.digest)throw new Error('The checkpoint receipt did not match the confirmed base.');
              maintenance.candidate=captured;notify();
            }
            const published=receipt(await store.publish(maintenance.candidate.id));
            if(!same(published,maintenance.candidate))throw new Error('The published checkpoint receipt did not match.');
            confirmed={head:published,state:confirmed.state};entriesRead=1;checkpointCount++;maintenance=null;notify();
          }
          const target=applyChanges(snapshot(confirmed.state),clone(job.changes));
          if(!job.candidate){
            const captured=receipt(await store.prepare(confirmed.state,target,confirmed.head,{id:job.id}));
            if(captured.id!==job.id || captured.sequence!==nextSequence(confirmed.head))throw new Error('The capture receipt did not match this queued edit.');
            job.candidate=captured;notify();
          }
          const published=receipt(await store.publish(job.candidate.id));
          if(!same(published,job.candidate))throw new Error('The published receipt did not match this queued edit.');
          confirmed={head:published,state:target};entriesRead++;confirmedCount++;jobs.shift();notify();
        }catch(reason){let name='SaveError';try{const reported=reason?.name;if(errorNames.has(reported))name=reported;}catch{}failure={name};notify();}
      }
    }
    function start(){
      if(!work && !failure && !closed && !reconciling && jobs.length)work=Promise.resolve().then(run).finally(()=>{work=null;if(!failure && !closed && jobs.length)start();});
      return work;
    }
    function enqueue(value,options={}){
      if(closed)throw error('DeltaQueueClosedError','This capture queue is closed.');
      if(basisRequired && options.basis!==captureBasis)throw error('DeltaQueueViewChangedError','Load the reconciled draft before capturing another edit. Original records were kept.');
      const next=snapshot(value),edits=changes(latest,next);
      if(!edits.length)return null;
      if(edits.some(edit=>!edit.path.length || edit.path.length>128))throw new Error('Queued change paths need review.');
      const job={id:root.crypto.randomUUID(),changes:edits,candidate:null,bytes:new TextEncoder().encode(JSON.stringify(edits)).length};
      jobs.push(job);latest=next;revision++;start();notify();return job.id;
    }
    async function flush(){
      while(true){const pending=start();if(!pending)return status();await pending;if(failure || closed || !jobs.length)return status();}
    }
    function retry(){if(closed)throw error('DeltaQueueClosedError','This capture queue is closed.');if(reconciling)throw error('DeltaQueueBusyError','A comparison is in progress.');failure=null;start();notify();return flush();}
    async function reconcile(planner){
      if(closed)throw error('DeltaQueueClosedError','This capture queue is closed.');
      if(reconciling)throw error('DeltaQueueBusyError','A comparison is already in progress.');
      if(typeof planner!=='function')throw error('DeltaReconcileReviewError','An explicit workspace comparison adapter is required.');
      reconciling=true;notify();let accepted=false;
      try{
        if(work)await work;
        if(failure?.name!=='DeltaHeadChangedError' || !jobs.length)throw error('DeltaReconcileReviewError','Only a stale-head pause can be compared.');
        const version=revision,base=snapshot(confirmed.state),capturedLatest=snapshot(latest),remote=await store.read();
        if(!remote)throw error('DeltaReconcileReviewError','The current saved workspace is unavailable.');
        const head=receipt(remote.head),remoteState=snapshot(remote.state);
        if(await hash(remoteState)!==head.digest || checkpointEvery && (!Number.isSafeInteger(remote.entriesRead) || remote.entriesRead<1 || remote.entriesRead>store.replayLimit))throw error('DeltaReconcileReviewError','The remote receipt needs verification.');
        const replacement=[];let local=base,previous=remoteState,absorbed=0,blocked=false;
        function unchanged(){if(revision!==version)throw error('DeltaQueueChangedError','More writing was captured during comparison. Compare again; nothing was replaced.');}
        for(const job of jobs.slice()){
          local=applyChanges(snapshot(local),clone(job.changes));
          const result=await planner(snapshot(base),snapshot(local),snapshot(remoteState));unchanged();
          if(!plain(result) || !Array.isArray(result.conflicts))throw error('DeltaReconcileReviewError','The comparison result is incomplete.');
          if(result.conflicts.length){
            review={head,base,local:snapshot(local),latest:capturedLatest,remote:remoteState,conflicts:clone(result.conflicts),jobId:job.id,revision:version};blocked=true;break;
          }
          const next=snapshot(result.state),edits=changes(previous,next);
          if(edits.some(edit=>!edit.path.length || edit.path.length>128))throw error('DeltaReconcileReviewError','The comparison paths need review.');
          if(edits.length)replacement.push({id:root.crypto.randomUUID(),changes:edits,candidate:null,bytes:new TextEncoder().encode(JSON.stringify(edits)).length});else absorbed++;
          previous=next;
        }
        if(!blocked){
          const current=await store.read();unchanged();
          if(!current || !same(receipt(current.head),head) || await hash(snapshot(current.state))!==head.digest)throw error('DeltaHeadChangedError','The saved workspace changed during comparison. Compare again.');
          unchanged();
          jobs.splice(0,jobs.length);for(const job of replacement)jobs.push(job);
          confirmed={head,state:remoteState};latest=previous;entriesRead=remote.entriesRead;maintenance=null;failure=null;review=null;revision++;reconciliationCount++;absorbedCount+=absorbed;captureBasis=root.crypto.randomUUID();basisRequired=true;accepted=true;
        }
      }finally{reconciling=false;notify();}
      if(accepted){start();return flush();}
      return status();
    }
    function close(){if(jobs.length || reconciling)throw error('DeltaQueuePendingError','Keep this queue open or export its latest snapshot. Unconfirmed writing remains.');closed=true;notify();}
    notify();
    return {enqueue,flush,retry,reconcile,status,comparison:()=>review?clone(review):null,draft:()=>({state:snapshot(latest),basis:captureBasis}),latest:()=>snapshot(latest),confirmed:()=>({head:{...confirmed.head},state:snapshot(confirmed.state)}),close};
  }
  const api={encode,apply,hash,create,openQueue,format};
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeExperimentalDeltaStore=api;
})(globalThis);
