const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const merge = require('../state-merge.js');

function storageStore() {
  const storage = {};
  Object.defineProperties(storage, {
    getItem: {value: key => storage[key] ?? null},
    setItem: {value: (key, value) => {storage[key] = String(value);}},
    removeItem: {value: key => {delete storage[key];}}
  });
  return storage;
}
function device({storage=storageStore(),search='',locks=[],writerId='test-tab',now}={}) {
  const context = {localStorage: storage, LifeStateMerge: merge, LifeStorageScope:require('../storage-scope.js').create(search),
    LZString:require('../lz-string.js'),crypto: {randomUUID: () => writerId},setTimeout,
    navigator: {locks: {request: (name, action) => {locks.push(name);return Promise.resolve().then(action);}}}};
  if(now)context.Date={now};
  vm.runInNewContext(fs.readFileSync(require.resolve('../device-store.js'), 'utf8'), context);
  return context.LifeDeviceStore;
}

test('successive edits retain their own baselines until committed', () => {
  const d = device();
  d.stage({revision: 1}, {revision: 2});
  d.stage({revision: 3}, {revision: 4});
  assert.equal(d.pending().length, 2);
  assert.equal(d.pending()[0].entry.base.revision, 1);
  assert.equal(d.pending()[1].entry.base.revision, 3);
  assert.equal(d.pending()[1].entry.state.revision, 4);
});

test('a writer recognizes a strictly verified receipt when another tab commits and removes its packet before readback',()=>{
  const backing=storageStore();let snapshot={deviceWriteHeads:{}},consume=false;
  const storage=new Proxy({},{ownKeys:()=>Object.keys(backing),getOwnPropertyDescriptor:(_,key)=>({configurable:true,enumerable:true,value:backing[key]}),get(_,key){
    const target=backing;
    if(key!=='getItem')return Reflect.get(target,key);
    return name=>{
      const raw=target.getItem(name);
      if(consume && raw && name.startsWith('life-os-pending-v3:')){
        consume=false;
        const entry=d.pending().find(item=>item.key===name).entry;
        snapshot={...entry.state,deviceWriteHeads:{[entry.writerId]:entry.sequence}};
        target.removeItem(name);return null;
      }
      return raw;
    };
  }});
  const d=device({storage});d.configure(()=>true,{readSnapshot:()=>snapshot});consume=true;
  assert.doesNotThrow(()=>d.stage({text:'Before'},{text:'Complete first edit\nSecond line'}));
  assert.equal(snapshot.text,'Complete first edit\nSecond line');assert.equal(d.pending().length,0);
  d.stage(snapshot,{...snapshot,text:'Continued writing'});
  assert.equal(d.pending()[0].entry.previousSequence,1);assert.equal(d.pending()[0].entry.state.text,'Continued writing');
});
test('a missing or changed packet cannot be acknowledged by another writer, an older receipt or an invalid counter',()=>{
  for(const receipt of [undefined,0,'1',Infinity,Number.MAX_SAFE_INTEGER+1]){
    const backing=storageStore(),storage=new Proxy({},{ownKeys:()=>Object.keys(backing),getOwnPropertyDescriptor:(_,key)=>({configurable:true,enumerable:true,value:backing[key]}),get:(_,key)=>key==='getItem'?name=>{
      if(name.startsWith('life-os-pending-v3:')){backing.removeItem(name);return null;}
      return backing.getItem(name);
    }:backing[key]});
    const d=device({storage});d.configure(()=>true,{readSnapshot:()=>({deviceWriteHeads:{'test-tab':receipt,another:99}})});
    assert.throws(()=>d.stage({},{text:'Keep this complete draft'}),/did not retain/);
  }
  const backing=storageStore(),storage=new Proxy({},{get:(_,key)=>key==='getItem'?name=>name.startsWith('life-os-pending-v3:')?'Unexpected replacement bytes':backing.getItem(name):backing[key]});
  const d=device({storage});d.configure(()=>true,{readSnapshot:()=>({deviceWriteHeads:{'test-tab':1}})});
  assert.throws(()=>d.stage({},{text:'A changed packet is not a confirmed consumed packet'}),/did not retain/);
});
test('checkpoint refusal happens before any shared commit and retains every pending byte',async()=>{
  const storage=storageStore(),d=device({storage});d.stage({},{text:'Full writing'});
  const before=JSON.stringify(storage);let writes=0;
  d.configure(()=>{writes++;return true;},{readSnapshot:()=>({}),checkpoint:{check:async()=>{throw new Error('Checkpoint denied');}}});
  await assert.rejects(d.flush(),/Checkpoint denied/);assert.equal(writes,0);assert.equal(JSON.stringify(storage),before);
});
test('pending cleanup waits for checkpoint completion, and a failed confirmation can be retried',async()=>{
  const storage=storageStore(),d=device({storage});d.stage({},{text:'Full writing'});
  let deny=true,commits=0,confirmed=false;
  d.configure(()=>{commits++;return true;},{readSnapshot:()=>({}),checkpoint:{check:async()=>null,confirm:async()=>{if(deny)throw new Error('Checkpoint write failed');confirmed=true;}}});
  const before=JSON.stringify(storage);await assert.rejects(d.flush(),/Checkpoint write failed/);
  assert.equal(JSON.stringify(storage),before);assert.equal(commits,1);assert.equal(confirmed,false);
  deny=false;assert.equal(await d.flush(),true);assert.equal(confirmed,true);assert.equal(d.pending().length,0);
});
test('an explicit retry during a refused save finishes a fresh attempt instead of returning the old refusal',async()=>{
  const d=device();d.stage({},{text:'The complete retained writing\nSecond line'});
  let allowed=false,attempts=0,written=null,entered,release;
  const confirming=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
  d.configure(entries=>{
    attempts++;if(!allowed)return false;
    written=entries[0].entry.state;return true;
  },{readSnapshot:()=>({}),checkpoint:{check:async()=>null,confirm:async()=>{if(attempts===1){entered();await held;}}}});
  const first=d.flush();await confirming;
  assert.equal(d.pending().length,1);allowed=true;
  const retry=d.flush();release();
  assert.equal(await retry,true);assert.equal(await first,true);
  assert.equal(attempts,2);assert.equal(written.text,'The complete retained writing\nSecond line');assert.equal(d.pending().length,0);
});
test('a refused commit without a new retry stops and retains every pending byte',async()=>{
  const storage=storageStore(),d=device({storage});d.stage({},{text:'Never discarded or automatically retried'});
  const before=JSON.stringify(storage);let attempts=0;
  d.configure(()=>{attempts++;return false;});
  assert.equal(await d.flush(),false);assert.equal(attempts,1);assert.equal(JSON.stringify(storage),before);
});

test('flush drains an edit staged while a previous snapshot is committing', async () => {
  const d = device();
  const committed = [];
  d.stage({revision: 0}, {revision: 1});
  d.configure(entries => {
    committed.push(entries[0].entry.state.revision);
    if (committed.length === 1) d.stage({revision: 1}, {revision: 2});
    return true;
  });
  assert.equal(await d.flush(), true);
  assert.deepEqual(committed, [1, 2]);
  assert.equal(d.pending().length, 0);
});

test('a failed shared commit keeps the complete pending copy', async () => {
  const d = device();
  d.stage({}, {text: 'Every character remains here.'});
  d.configure(() => false);
  assert.equal(await d.flush(), false);
  assert.equal(d.pending()[0].entry.state.text, 'Every character remains here.');
});

test('recovery skips acknowledged writes left behind after an interrupted cleanup', () => {
  const d = device();
  const original = {boards: [{id: 'board', name: 'Original'}]};
  const first = {boards: [{id: 'board', name: 'First edit'}]};
  const second = {boards: [{id: 'board', name: 'Second edit'}]};
  d.stage(original, first);
  d.stage(first, second);
  const committed = d.replay(original);
  assert.equal(committed.state.boards[0].name, 'Second edit');
  const recovered = d.replay(committed.state);
  assert.equal(recovered.conflicts.length, 0);
  assert.equal(recovered.state.boards[0].name, 'Second edit');
});

test('normal and preview queues cannot replay or consume each other on the same origin',async()=>{
  const storage=storageStore(),normal=device({storage}),preview=device({storage,search:'?preview=1'});
  const base={boards:[{id:'board',name:'Initial'}]},state=name=>({boards:[{id:'board',name}]});
  normal.stage(base,state('Saved work'));preview.stage(base,state('Preview work'));
  assert.equal(normal.prefix,'life-os-pending-v3:');assert.equal(normal.legacyPrefix,'life-os-pending-v2:');assert.notEqual(normal.prefix,preview.prefix);
  assert.equal(normal.pending().length,1);assert.equal(preview.pending().length,1);
  assert.equal(normal.replay(base).state.boards[0].name,'Saved work');assert.equal(preview.replay(base).state.boards[0].name,'Preview work');
  const original=storage.getItem(normal.pending()[0].key);preview.configure(()=>true);await preview.flush();
  assert.equal(preview.pending().length,0);assert.equal(storage.getItem(normal.pending()[0].key),original);
});
test('malformed pending data only blocks its own scope and is never removed by the other scope',()=>{
  const storage=storageStore(),normal=device({storage}),preview=device({storage,search:'?preview=1'});
  storage.setItem(normal.prefix+'old-tab:1','{broken');assert.throws(()=>normal.pending());assert.equal(preview.pending().length,0);
  assert.equal(preview.replay({boards:[]}).state.boards.length,0);assert.equal(storage.getItem(normal.prefix+'old-tab:1'),'{broken');
  storage.setItem(preview.prefix+'preview-tab:1','{also-broken');assert.throws(()=>preview.pending());
});
test('read-only recovery inspection retains healthy packets beside damaged packets without weakening commit checks',()=>{
  const storage=storageStore(),d=device({storage});
  d.stage({boards:[]},{boards:[{id:'private',name:'Every complete line\nSecond line'}]});
  storage.setItem(d.prefix+'damaged:1','{broken');
  storage.setItem(d.legacyPrefix+'legacy:1',JSON.stringify({base:{boards:[]},state:{boards:[{id:'legacy'}]},savedAt:1}));
  const before=JSON.stringify(storage),inspection=d.inspectPending();
  assert.equal(inspection.entries.length,2);assert.equal(inspection.failures.length,1);assert.equal(inspection.unavailable,false);
  assert.equal(inspection.failures[0].raw,'{broken');assert.equal(inspection.entries[0].entry.state.boards[0].name,'Every complete line\nSecond line');
  assert.equal(JSON.stringify(storage),before);assert.throws(()=>d.pending());
});
test('recovery inspection isolates preview packets and reports unavailable storage truthfully',()=>{
  const storage=storageStore(),normal=device({storage}),preview=device({storage,search:'?preview=1'});
  normal.stage({boards:[]},{boards:[{id:'normal-private'}]});preview.stage({boards:[]},{boards:[{id:'preview'}]});
  storage.setItem(normal.legacyPrefix+'broken','null');
  assert.equal(normal.inspectPending().failures.length,1);assert.equal(preview.inspectPending().failures.length,0);
  assert.equal(preview.inspectPending().entries[0].entry.state.boards[0].id,'preview');
  const unavailable=device({storage:new Proxy({},{ownKeys(){throw new Error('Denied');}})}).inspectPending();
  assert.equal(unavailable.unavailable,true);assert.equal(unavailable.entries.length,0);
});
test('normal lock names stay compatible while preview device and cloud locks are separate',async()=>{
  const normalNames=[],previewNames=[],normal=device({locks:normalNames}),preview=device({search:'?preview',locks:previewNames});
  await normal.locked(()=>true);await normal.cloudLocked(()=>true);await preview.locked(()=>true);await preview.cloudLocked(()=>true);
  assert.deepEqual(normalNames,['life-os-device-snapshot-v2','life-os-cloud-and-restore-v1']);
  assert.ok(previewNames.every(name=>!normalNames.includes(name)));assert.equal(new Set(previewNames).size,2);
});

test('large diary histories retain every character while the journal fits a realistic shared storage budget',()=>{
  const storage=storageStore(),d=device({storage});
  const base={boards:[{id:'board',cards:[{id:'diary',diaryEntries:Object.fromEntries(Array.from({length:1000},(_,i)=>[String(i),{thoughts:('Entry '+i+'\nEvery word matters. ').repeat(60)}]))}]}]};
  const next=JSON.parse(JSON.stringify(base));next.boards[0].cards[0].diaryEntries['999'].thoughts+='\nAnother complete thought \ud83d\ude42 \u4e2d\u6587';
  storage.setItem('progress-board-v1',JSON.stringify(base));
  const original=JSON.stringify({base,state:next});
  assert.ok(original.length>3000000);
  d.stage(base,next);
  assert.ok(d.pending()[0].raw.length<original.length/10);
  assert.equal(JSON.stringify(d.pending()[0].entry.state),JSON.stringify(next));
  assert.deepEqual(d.replay(base).state.boards,next.boards);
  assert.ok(!JSON.stringify(d.diagnostics()).includes('Every word'));
});

test('legacy and compact pending copies replay together and interrupted cleanup acknowledges both formats',async()=>{
  const storage=storageStore(),d=device({storage}),base={boards:[{id:'board',name:'Original'}]},first={boards:[{id:'board',name:'Legacy edit'}]},last={boards:[{id:'board',name:'New edit'}]};
  storage.setItem(d.legacyPrefix+'older-tab:1',JSON.stringify({base,state:first,savedAt:1,writerId:'older-tab',sequence:1}));
  d.stage(first,last);assert.equal(d.pending().length,2);
  const replay=d.replay(base);assert.equal(replay.state.boards[0].name,'New edit');assert.equal(d.replay(replay.state).conflicts.length,0);
  assert.equal(d.diagnostics().legacyCopies,1);d.configure(()=>true);await d.flush();assert.equal(d.pending().length,0);
});

test('damaged compact copies stop replay without deleting either original pending copy',()=>{
  const storage=storageStore(),d=device({storage});d.stage({boards:[]},{boards:[{id:'board',name:'Complete text'}]});
  const {key,raw}=d.pending()[0],bad=JSON.parse(raw);bad.checksum='wrong';storage.setItem(key,JSON.stringify(bad));
  assert.throws(()=>d.pending(),/integrity/);assert.equal(storage.getItem(key),JSON.stringify(bad));
  storage.setItem(key,raw);assert.equal(d.pending()[0].entry.state.boards[0].name,'Complete text');
});

test('a compact stage quota failure does not remove main, recovery, legacy or other-tab records',()=>{
  const storage=storageStore(),d=device({storage});storage.setItem('progress-board-v1','main');storage.setItem('life-os-cloud-recovery','recovery');
  storage.setItem(d.legacyPrefix+'older:1',JSON.stringify({base:{},state:{},savedAt:1}));
  const before=JSON.stringify(storage);
  const blocked=Object.assign({},storage);
  Object.defineProperties(blocked,{
    getItem:{value:key=>blocked[key]??null},
    removeItem:{value:key=>{delete blocked[key];}},
    setItem:{value:()=>{throw Object.assign(new Error('Full'),{name:'QuotaExceededError'});}}
  });
  const failed=device({storage:blocked});assert.throws(()=>failed.stage({}, {text:'Retain this'}),{name:'QuotaExceededError'});
  assert.equal(JSON.stringify(blocked),before);
});

test('replay keeps pending conflict receipts and older comparisons, without reviving a resolved comparison',()=>{
  const d=device(),record={id:'comparison',path:'boards.board.name',segments:['boards','board','name'],base:'Original',local:'Local',remote:'Other',source:'device'};
  const base={boards:[{id:'board',name:'Local'}],syncConflicts:[record]},resolved={boards:[{id:'board',name:'Chosen'}],syncConflicts:[],conflictResolutions:{comparison:{resolvedAt:10}}};
  d.stage(base,resolved);const replay=d.replay(base);
  assert.equal(replay.state.boards[0].name,'Chosen');assert.equal(replay.state.syncConflicts.length,0);assert.equal(replay.state.conflictResolutions.comparison.resolvedAt,10);
});

test('causal ordering beats wall-clock order and preserves independent board changes',()=>{
  const storage=storageStore(),a=device({storage,writerId:'a',now:()=>100}),b=device({storage,writerId:'b',now:()=>1});
  const base={boards:[{id:'a',name:'A'},{id:'b',name:'B'}]},first=merge.copy(base);first.boards[0].name='A new';
  a.stage(base,first);const known={...merge.copy(first),deviceWriteHeads:{a:1}},second=merge.copy(known);second.boards[1].name='B new';b.stage(known,second);
  assert.equal(a.pending()[0].entry.writerId,'b');const r=a.replay(base);
  assert.deepEqual(r.state.boards.map(row=>row.name),['A new','B new']);assert.equal(r.conflicts.length,0);assert.equal(r.blocked.length,0);
});
test('missing parent refuses the shared write and acknowledgement without losing either pending copy',()=>{
  const storage=storageStore(),d=device({storage}),base={boards:[{id:'a',name:'Original'}]},first={boards:[{id:'a',name:'First'}]},second={boards:[{id:'a',name:'Second'}]};
  d.stage(base,first);d.stage(first,second);const [one,two]=d.pending();storage.removeItem(one.key);
  const before=JSON.stringify(storage);assert.throws(()=>d.requireOrder(base,d.pending(),second),{name:'DeviceCommitPendingError'});assert.equal(JSON.stringify(storage),before);
  const delayed=d.replay(base);assert.equal(delayed.state.boards[0].name,'Original');assert.equal(delayed.blocked.length,1);assert.equal(delayed.conflicts.length,0);
  const committed={...first,deviceWriteHeads:{'test-tab':1}};assert.equal(d.requireOrder(committed,d.pending(),second)[0].key,two.key);assert.equal(d.replay(committed).state.boards[0].name,'Second');
  storage.setItem(one.key,one.raw);assert.equal(d.requireOrder(base,d.pending(),second).length,2);
});
test('observed receipts cannot be rolled back by an older snapshot even with an empty queue',()=>{
  const d=device(),old={boards:[],deviceWriteHeads:{other:1}},seen={boards:[],deviceWriteHeads:{other:2}};
  assert.throws(()=>d.requireOrder(old,[],seen),{name:'DeviceCommitPendingError'});assert.equal(d.requireOrder(seen,[],seen).length,0);
});
test('genuine concurrent edits still retain both versions instead of being labelled ordered continuations',()=>{
  const storage=storageStore(),a=device({storage,writerId:'a'}),b=device({storage,writerId:'b'}),base={boards:[{id:'board',name:'Original'}]};
  a.stage(base,{boards:[{id:'board',name:'First writer'}]});b.stage(base,{boards:[{id:'board',name:'Other writer'}]});
  const result=a.replay(base);assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].local,'Other writer');assert.equal(result.conflicts[0].remote,'First writer');assert.equal(result.blocked.length,0);
});
test('dependency retries keep every journal byte on exhaustion and resume when the parent is visible',async()=>{
  const d=device(),base={boards:[{id:'a',name:'Original'}]},next={boards:[{id:'a',name:'Next'}],deviceWriteHeads:{other:2}};
  d.stage({...base,deviceWriteHeads:{other:2}},next);const original=d.pending()[0].raw;let current=base,commits=0;
  d.configure(entries=>{d.requireOrder(current,entries);commits++;return true;});
  await assert.rejects(d.flush(),{name:'DeviceCommitPendingError'});assert.equal(commits,0);assert.equal(d.pending()[0].raw,original);
  current={...base,deviceWriteHeads:{other:2}};assert.equal(await d.flush(),true);assert.equal(commits,1);assert.equal(d.pending().length,0);
});
test('a failed staging attempt does not become a nonexistent parent for later successful writing',()=>{
  let blocked=true;const data={},storage={getItem:key=>data[key] ?? null,removeItem:key=>delete data[key],setItem(key,value){if(blocked)throw Object.assign(new Error('Full'),{name:'QuotaExceededError'});data[key]=value;}};
  // Storage methods are non-enumerable in browsers; expose only journal keys.
  const proxy=new Proxy(storage,{ownKeys:()=>Reflect.ownKeys(data),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true}),get:(target,key)=>key in target?target[key]:data[key]});
  const d=device({storage:proxy}),base={boards:[{id:'a',name:'Original'}]},next={boards:[{id:'a',name:'Complete writing'}]};
  assert.throws(()=>d.stage(base,next),{name:'QuotaExceededError'});blocked=false;d.stage(base,next);
  assert.equal(d.pending()[0].entry.sequence,2);assert.equal(d.pending()[0].entry.previousSequence,0);assert.equal(d.requireOrder(base,d.pending(),base).length,1);
});
test('invalid dependency counters cannot silently bypass the save guard',()=>{
  const d=device(),base={boards:[],deviceWriteHeads:{other:'not-a-counter'}};d.stage(base,{boards:[]});const before=d.pending()[0].raw;
  assert.throws(()=>d.requireOrder({boards:[]},d.pending()),{name:'DeviceCommitPendingError'});assert.equal(d.pending()[0].raw,before);
});
test('an explicit completed restore rebases only the writer parent and permits new writing after corrupt-storage recovery',()=>{
  const storage=storageStore(),d=device({storage}),base={boards:[{id:'a',name:'Before restore'}]};d.stage(base,base);
  for(const row of d.pending())storage.removeItem(row.key);
  const restored={boards:[{id:'a',name:'Restored'}],deviceWriteHeads:{}};
  assert.throws(()=>d.requireOrder(restored,[],restored),{name:'DeviceCommitPendingError'});
  d.acceptRestoredSnapshot(restored);const next=merge.copy(restored);next.boards[0].name='Writing after recovery';d.stage(restored,next);
  assert.equal(d.pending()[0].entry.previousSequence,0);assert.equal(d.requireOrder(restored,d.pending(),next).length,1);assert.equal(d.replay(restored).state.boards[0].name,'Writing after recovery');
});
