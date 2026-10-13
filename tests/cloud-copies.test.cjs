const test=require('node:test');
const assert=require('node:assert/strict');
const copies=require('../cloud-copies.js');
const merge=require('../state-merge.js');
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
