const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../state-merge.js');
const copy=M.copy;
function fixture(){
 const base={boards:[{id:'board.with.dots',name:'Personal',cards:[{id:'diary',type:'diary',diaryEntries:{'2026-09-08':{thoughts:'Original',sentence:'Keep this',updatedAt:1}}}]},{id:'other',name:'Work',cards:[]}]};
 const local=copy(base),remote=copy(base);
 local.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts='My version';
 remote.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts='Other version';
 const conflicts=M.registerConflicts(M.merge(base,local,remote).conflicts,{},()=> 'conflict-1');
 local.syncConflicts=conflicts;
 return {base,local,remote,conflict:conflicts[0]};
}
test('structured paths preserve IDs containing periods',()=>{
 const f=fixture();assert.equal(f.conflict.segments[1],'board.with.dots');assert.equal(M.inspectTextConflict(f.local,f.conflict).editable,true);
});
test('choosing text changes only that field and retains the other boards and date entries',()=>{
 const f=fixture(),next=M.resolveTextConflict(f.local,f.conflict,'My version','Combined\nSecond line',10);
 assert.equal(next.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts,'Combined\nSecond line');
 assert.equal(next.boards[0].cards[0].diaryEntries['2026-09-08'].sentence,'Keep this');
 assert.deepEqual(next.boards[1],f.local.boards[1]);assert.equal(next.syncConflicts.length,0);assert.ok(next.conflictResolutions['conflict-1']);
 assert.equal(f.local.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts,'My version');
});
test('stale comparisons cannot overwrite a newer entry',()=>{
 const f=fixture();f.local.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts='Newer writing';
 assert.throws(()=>M.resolveTextConflict(f.local,f.conflict,'My version','Other version'),/entry changed/);
});
test('reviewing a task title preserves completion history and separate same-name tasks',()=>{
 const planner=require('../planner-store.js');
 const card={id:'source',plannerEntries:{}};
 planner.add(card,'2026-09-01','Book appointment','first',1);
 planner.add(card,'2026-09-01','Book appointment','second',2);
 const recordedAt=new Date('2026-09-08T12:30:00').getTime();
 planner.complete(card,'first','2026-09-07',recordedAt);
 const base={boards:[{id:'board',cards:[card]}]},local=copy(base),remote=copy(base);
 local.boards[0].cards[0].plannerTasks[0].title='Book dentist';
 remote.boards[0].cards[0].plannerTasks[0].title='Book checkup';
 local.syncConflicts=M.registerConflicts(M.merge(base,local,remote).conflicts,{},()=> 'task-conflict');
 assert.equal(local.syncConflicts.length,1);
 const next=M.resolveTextConflict(local,local.syncConflicts[0],'Book dentist','Book dental checkup',recordedAt+1);
 const result=next.boards[0].cards[0];planner.project(result);
 assert.deepEqual(result.plannerTasks[0],{...card.plannerTasks[0],title:'Book dental checkup',updatedAt:recordedAt+1});
 assert.deepEqual(result.plannerTasks[1],card.plannerTasks[1]);
 assert.equal(planner.forDay(result,'2026-09-07').find(task=>task.id==='first').done,true);
 assert.equal(planner.forDay(result,'2026-09-08').some(task=>task.id==='first'),false);
 assert.equal(result.plannerTasks[0].completionRecordedAt,recordedAt);
});
test('numeric, deleted, legacy and unsafe paths cannot be edited as text',()=>{
 const f=fixture();
 for(const conflict of [{...f.conflict,segments:undefined},{...f.conflict,local:12},{...f.conflict,segments:['boards','board.with.dots','__proto__','text']},{...f.conflict,segments:['boards','missing','name']}])assert.equal(M.inspectTextConflict(f.local,conflict).editable,false);
});
test('resolved conflict IDs cannot be resurrected by a stale tab',()=>{
 const f=fixture();const next=M.resolveTextConflict(f.local,f.conflict,'My version','Other version');
 assert.deepEqual(M.registerConflicts([f.conflict],next.conflictResolutions),[]);
});
test('repeated observations retain one stable comparison ID',()=>{
 const f=fixture(),again={...f.conflict,id:undefined,recordedAt:999};
 assert.equal(M.registerConflicts([f.conflict,again]).length,1);
});
test('different changes with a duplicated ID receive separate review identities',()=>{
 const f=fixture();const records=M.registerConflicts([f.conflict,{...f.conflict,remote:'Different captured text'}],{},()=> 'another-id');
 assert.equal(records.length,2);assert.notEqual(records[0].id,records[1].id);
});
test('cloud review acknowledges only the reviewed field on the exact common baseline',()=>{
 const f=fixture();Object.assign(f.conflict,{source:'cloud',ownerId:'owner',baseDigest:'digest-1'});
 const next=M.resolveTextConflict(f.local,f.conflict,'My version','Combined');
 const reviewed=M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','digest-1');
 assert.equal(reviewed.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts,'Other version');
 assert.deepEqual(M.reviewedCloudBaseline(f.base,next.conflictResolutions,'another','digest-1'),f.base);
 assert.deepEqual(M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','newer-digest'),f.base);
 const merged=M.merge(reviewed,next,f.remote);assert.equal(merged.conflicts.length,0);assert.equal(merged.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts,'Combined');
});
test('a newer cloud edit remains a real conflict after a previous review',()=>{
 const f=fixture();Object.assign(f.conflict,{source:'cloud',ownerId:'owner',baseDigest:'v1'});
 const next=M.resolveTextConflict(f.local,f.conflict,'My version','Combined');
 const baseline=M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','v1');
 f.remote.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts='Later cloud writing';
 assert.equal(M.merge(baseline,next,f.remote).conflicts.length,1);
});
