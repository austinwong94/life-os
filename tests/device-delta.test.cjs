const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const delta=require('../experimental/device-delta-store.js'),{fixture}=require('./performance-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const workspace=()=>({boards:[{id:'one',cards:[{id:'same',diaryEntries:{'2026-10-16':{thoughts:'Every line\nEvery character',feeling:''}},unknown:{empty:'',zero:0,flag:false,nothing:null},items:[{id:'a',done:true},{id:'b',done:false}]}],archivedCards:[{id:'archive',text:'Original archived writing'}]},{id:'two',cards:[{id:'same',thoughts:'A different board'}]}],unknownOriginal:{keep:['all','of','this']}});
test('delta roundtrip changes only selected fields and preserves complete originals, archives and other boards',async()=>{
  const base=workspace(),before=copy(base),next=copy(base);next.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+='\nStill thinking.';
  const packet=await delta.encode(base,next);assert.equal(packet.changes.length,1);assert.deepEqual(await delta.apply(base,packet),next);assert.deepEqual(base,before);
  const applied=await delta.apply(base,packet);applied.boards[1].cards[0].thoughts='Independent returned copy';assert.deepEqual(base,before);assert.notDeepEqual(applied,next);
});
test('array appends, truncations, reorders and object deletions roundtrip without matching records by name or ID',async()=>{
  const original=workspace();
  for(const edit of [
    value=>value.boards.push({id:'three',cards:[]}),value=>value.boards.reverse(),value=>value.boards.splice(0,1),
    value=>value.boards[0].cards[0].items.push({id:'c',done:false}),value=>value.boards[0].cards[0].items.splice(0,1),
    value=>value.boards[0].cards[0].items.reverse(),value=>delete value.boards[0].cards[0].unknown,
    value=>{value.boards[0].cards[0].unknown=['An entirely different value'];}
  ]){const next=copy(original);edit(next);assert.deepEqual(await delta.apply(original,await delta.encode(original,next)),next);}
  assert.deepEqual(original,workspace());
});
test('fingerprints ignore object key order but preserve arrays, exact text, null and property presence',async()=>{
  assert.equal(await delta.hash({b:2,a:1}),await delta.hash({a:1,b:2}));
  for(const [one,two] of [[['a','b'],['b','a']],[{text:'line\nline'},{text:'line line'}],[{a:null},{}],[{a:''},{a:false}]])assert.notEqual(await delta.hash(one),await delta.hash(two));
  const base=workspace();assert.deepEqual((await delta.encode(base,base)).changes,[]);
});
test('encoding and applying capture inputs before asynchronous hashing yields to the caller',async()=>{
  const base=workspace(),next=copy(base);next.unknownOriginal.keep.push('new');const expected=copy(next),packetPromise=delta.encode(base,next);
  next.boards=[];base.boards=[];const packet=await packetPromise,applyPromise=delta.apply(workspace(),packet);packet.changes[0].value='tampered later';assert.deepEqual(await applyPromise,expected);
});
test('wrong bases, missing preconditions, forged content and invalid paths never mutate originals',async()=>{
  const base=workspace(),next=copy(base);next.unknownOriginal.keep.push('new');const packet=await delta.encode(base,next),original=copy(base),changed=copy(base);changed.boards[1].cards[0].thoughts='Newer text';
  await assert.rejects(delta.apply(changed,packet),{name:'DeltaBaseChangedError'});
  for(const edit of [p=>p.changes[0].value='wrong',p=>p.changes[0].path=['missing',0],p=>p.changes[0].path=['boards',-1],p=>p.changes[0].path=[],p=>p.changes[0].before=true,p=>p.digest='0'.repeat(64),p=>p.changes=[...p.changes,...p.changes]]){
    const forged=copy(packet);edit(forged);await assert.rejects(delta.apply(base,forged));assert.deepEqual(base,original);
  }
});
test('prototype-shaped user properties remain inert own data, including constructor and __proto__',async()=>{
  const base=workspace(),next=copy(base);next.unknownOriginal=JSON.parse('{"__proto__":{"polluted":"inert"},"constructor":{"prototype":{"polluted":"also inert"}},"prototype":"text"}');
  const restored=await delta.apply(base,await delta.encode(base,next));assert.deepEqual(restored,next);assert.equal({}.polluted,undefined);assert(Object.hasOwn(restored.unknownOriginal,'__proto__'));
});
test('a changed diary entry generates a small packet for a multi-year multi-board history',async()=>{
  const base=fixture('large'),next=copy(base);next.boards[0].diaryEntries[base.today].thoughts+='\nOne more complete thought.';next.boards[0].diaryEntries[base.today].updatedAt++;
  const packet=await delta.encode(base,next);assert.equal(packet.changes.length,2);assert(Buffer.byteLength(JSON.stringify(packet))<4096);assert(Buffer.byteLength(JSON.stringify(base))>3000000);
  assert.deepEqual(await delta.apply(base,packet),next);assert.deepEqual(base,fixture('large'));
});
test('unsupported roots, cycles and malformed packets are refused rather than converted into an empty workspace',async()=>{
  for(const value of [null,[],{}, {boards:null}])await assert.rejects(delta.encode(value,workspace()));
  const cyclic=workspace();cyclic.self=cyclic;await assert.rejects(delta.encode(cyclic,workspace()));
  for(const packet of [null,{}, {format:delta.format,baseDigest:'invalid',digest:'invalid',changes:[]}])await assert.rejects(delta.apply(workspace(),packet));
});
test('the experimental store cannot select existing production databases and is absent from the release manifest',()=>{
  for(const name of ['life-os-device-checkpoint-v1','life-os-preview-v1:','life-os-experimental-delta-v1:','life-os-experimental-delta-v1:../private'])assert.throws(()=>delta.create({name}));
  assert(!fs.readFileSync(require.resolve('../release-files.json'),'utf8').includes('device-delta-store'));
  for(const limit of [1,129,2.5,NaN])assert.throws(()=>delta.create({name:'life-os-experimental-delta-v1:test',maxReplayEntries:limit}));
});
