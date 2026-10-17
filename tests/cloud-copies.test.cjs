const test=require('node:test');
const assert=require('node:assert/strict');
const copies=require('../cloud-copies.js');
const merge=require('../state-merge.js');
const codec=require('../lz-string.js');
const current={activeBoardId:'home',boards:[{id:'home',cards:[{id:'diary',type:'diary',diaryEntries:{'2026-10-13':{thoughts:'Every line.\n第二行',updatedAt:100}}},{id:'planner',type:'planner',plannerSchemaVersion:2,plannerTasks:[{id:'new-id',title:'Changed task',done:true,completedOn:'2026-10-13',archivedAt:100,deletedAt:0}]}],archivedCards:[]}],deletedBoardIds:{removed:90},syncConflicts:[]};
const remote={boards:[{id:'home',cards:[{id:'diary',type:'diary',diaryEntries:{'2026-05-19':{thoughts:'Earlier writing',updatedAt:10}}},{id:'planner',type:'planner',plannerEntries:{'2026-05-19':{items:[{id:'old-id',text:'Old task',done:false}]}}}],archivedCards:[]},{id:'removed',cards:[{id:'private-old-note',type:'quote',description:'Retain history, do not restore the board'}],archivedCards:[]}]};
const options={ownerId:'owner',cloudUpdatedAt:'2026-05-19T00:00:00Z',digest:'digest',now:1000};
test('preservation retains every device record and full old cloud without reopening tasks or deleted boards',()=>{
 const before=structuredClone(current),old=structuredClone(remote),next=copies.preserve(current,remote,options);
 assert.deepEqual(current,before);assert.deepEqual(remote,old);assert.deepEqual(next.boards[0].cards,current.boards[0].cards);
 assert.deepEqual(next.deletedBoardIds,current.deletedBoardIds);assert.equal(next.boards.length,1);
 assert.deepEqual(copies.retained(next)[0].state,remote);assert.equal(next.boards[0].archivedCards.length,1);
 assert.deepEqual(copies.counts(next),copies.counts(current));assert.deepEqual(copies.preserve(next,remote,options),next);
});
test('preserved cards survive stale-client three-way merge and record copying',()=>{
 const next=copies.preserve(current,remote,options),stale=structuredClone(current);
 stale.boards[0].cards[0].diaryEntries['2026-10-14']={thoughts:'Another day'};
 const result=merge.merge(current,stale,next);assert.equal(result.conflicts.length,0);
 assert.deepEqual(copies.retained(result)[0].state,remote);assert.equal(result.boards[0].cards[0].diaryEntries['2026-10-14'].thoughts,'Another day');
});
test('wrong owner or conflicting preserved copy fails without mutating originals',()=>{
 assert.throws(()=>copies.preserve({...current,cloudOwnerId:'other'},remote,options),/different accounts/);
 assert.throws(()=>copies.preserve(current,{...remote,cloudOwnerId:'other'},options),/different accounts/);
 const next=copies.preserve(current,remote,options);next.boards[0].archivedCards[0].preservedCloudSnapshot.state={boards:[]};
 assert.throws(()=>copies.preserve(next,remote,options),/preserved copy changed/);
});
test('JSONB object key order does not cause a false readback mismatch, but missing or changed text does',()=>{
 assert.equal(copies.equal({a:1,b:{c:2,d:3}},{b:{d:3,c:2},a:1}),true);
 assert.equal(copies.equal({thoughts:'Full text'},{thoughts:'F'}),false);
 assert.equal(copies.equal({done:true},{done:false}),false);
 assert.equal(copies.equal({a:1},{a:1,b:2}),false);
});
test('valid archived daily clock changes are not record edits, while diary, ticks, history and manual clocks remain guarded',()=>{
 const a=structuredClone(current);a.boards[0].archivedCards.push({id:'routine',type:'routine',timerMode:'daily',targetAt:'2026-10-15T00:00:00Z',duration:100,remaining:100,runningSince:null,items:[{id:'tick',done:false}],history:[]});
 const b=structuredClone(a);Object.assign(b.boards[0].archivedCards[0],{duration:98,remaining:98});
 assert.equal(copies.equal(copies.records(a),copies.records(b)),true);assert.equal(a.boards[0].archivedCards[0].duration,100);
 for(const mutation of [c=>c.items[0].done=true,c=>c.history.push({date:'2026-10-13'}),c=>c.timerMode='hours',c=>c.duration='invalid']){
  const changed=structuredClone(b);mutation(changed.boards[0].archivedCards[0]);assert.equal(copies.equal(copies.records(a),copies.records(changed)),false);
 }
 const changed=structuredClone(b);changed.boards[0].cards[0].diaryEntries['2026-10-13'].thoughts='Different writing';assert.equal(copies.equal(copies.records(a),copies.records(changed)),false);
});
test('sync baseline compression is lossless, keeps original owner/fingerprint order and cannot be misread by older clients as a usable baseline',()=>{
 const base={ownerId:'original-owner',state:structuredClone(current)};base.state.boards[0].cards[0].diaryEntries['2026-10-13'].thoughts=('完整日记\nEvery character, every line.\n').repeat(8000);
 const encoded=copies.encodeBase(base,codec);
 assert.equal(encoded.ownerId,undefined);assert.equal(encoded.state,undefined);assert.equal(JSON.stringify(copies.decodeBase(encoded,codec)),JSON.stringify(base));
 assert(JSON.stringify(encoded).length<JSON.stringify(base).length/3);
 assert.deepEqual(copies.decodeBase(base,codec),base);
});
test('damaged compressed sync history is refused without touching its original bytes',()=>{
 const encoded=copies.encodeBase({ownerId:'owner',state:current},codec);
 for(const field of ['length','checksum','payload']){
  const broken=structuredClone(encoded);broken[field]=field==='length'?encoded.length+1:field==='payload'?'invalid compressed history':encoded[field]+'broken';const before=JSON.stringify(broken);
  assert.throws(()=>copies.decodeBase(broken,codec),/integrity|recovery/);assert.equal(JSON.stringify(broken),before);
 }
});
test('board diagnostics ignore only valid daily clock movement and preserve both snapshots exactly',()=>{
 const before=structuredClone(current);
 before.boards[0].archivedCards.push({id:'clock',type:'routine',timerMode:'daily',targetAt:'2026-10-17T12:00:00Z',duration:100,remaining:90,runningSince:null,items:[{id:'tick',done:false}],history:[]});
 const after=structuredClone(before);Object.assign(after.boards[0].archivedCards[0],{targetAt:'2026-10-18T12:00:00Z',duration:200,remaining:190,runningSince:200});
 const a=JSON.stringify(before),b=JSON.stringify(after);
 assert.deepEqual(copies.changedBoardIds(after,before),[]);
 assert.equal(JSON.stringify(before),a);assert.equal(JSON.stringify(after),b);
 for(const change of [c=>c.items[0].done=true,c=>c.history.push({date:'2026-10-17'}),c=>c.timerMode='hours',c=>c.remaining=-1,c=>c.duration='100',c=>c.targetAt='invalid']){
  const edited=structuredClone(after);change(edited.boards[0].archivedCards[0]);assert.deepEqual(copies.changedBoardIds(edited,before),['home']);
 }
});
test('board diagnostics count real diary drafts, notes, task edits and unknown fields without double counting a board',()=>{
 const a=structuredClone(current),b=structuredClone(current);
 b.boards[0].cards[0].diaryEntries['2026-10-13'].thoughts='All the new writing\nAnother line';
 b.boards[0].cards[1].plannerDraftText='An unfinished task';
 b.boards[0].cards[1].plannerTasks[0].archivedAt=200;
 b.boards.push({id:'notes',cards:[{id:'note',type:'sidenote',sideNoteEntries:{today:{notes:[{text:'An original thought'}]}}}],archivedCards:[],futureField:{important:true}});
 assert.deepEqual(copies.changedBoardIds(b,a),['home','notes']);
 const same=structuredClone(b);same.boards[1].futureField.important=false;assert.deepEqual(copies.changedBoardIds(same,b),['notes']);
});
test('board additions, removals and deletion receipts remain visible and special IDs are inert',()=>{
 const a={boards:[{id:'constructor',cards:[],archivedCards:[]},{id:'__proto__',cards:[],archivedCards:[]}],deletedBoardIds:{}},b=structuredClone(a);
 b.boards.shift();b.deletedBoardIds=JSON.parse('{"constructor":100,"already-removed":200}');
 assert.deepEqual(copies.changedBoardIds(b,a),['constructor','already-removed']);
 assert.deepEqual(copies.changedBoardIds(a,b),['constructor','already-removed']);
 const c=structuredClone(b);delete c.deletedBoardIds.constructor;assert.deepEqual(copies.changedBoardIds(c,b),['constructor']);
});
test('diagnostics tolerate JSONB object ordering but do not ignore card order, settings or malformed identities',()=>{
 const a={boards:[{id:'a',cards:[],archivedCards:[],layout:'manual'},{id:'b',cards:[],archivedCards:[]}],deletedBoardIds:{gone:1}};
 const reordered=JSON.parse(JSON.stringify(a),(key,value)=>value && typeof value==='object' && !Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value);
 assert.deepEqual(copies.changedBoardIds(reordered,a),[]);
 const changed=structuredClone(a);changed.boards[0].layout='auto';assert.deepEqual(copies.changedBoardIds(changed,a),['a']);
 const ordered=structuredClone(a);ordered.boards[0].cards=[{id:'one'},{id:'two'}];const reversed=structuredClone(ordered);reversed.boards[0].cards.reverse();assert.deepEqual(copies.changedBoardIds(reversed,ordered),['a']);
 for(const invalid of [null,{}, {boards:[{cards:[]}]},{boards:[{id:'same'},{id:'same'}]},{boards:[],deletedBoardIds:[]},{boards:[],deletedBoardIds:'not receipts'}])assert.throws(()=>copies.changedBoardIds(invalid,a),/cannot be compared/);
});
