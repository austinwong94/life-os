const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../state-merge.js');
const copy=M.copy;
function timerFixture(){
 const card={id:'routine',type:'routine',timerMode:'daily',targetAt:'2026-10-14T00:00:00.000Z',duration:12000,remaining:12000,runningSince:null,items:[{id:'step',text:'Keep this',done:true}],history:{'2026-10-12':{done:2}}};
 const conflicts=Array.from({length:112},(_,i)=>({id:'timer-'+i,source:'device',segments:['boards','board','cards','routine','remaining'],base:100+i,local:200+i,remote:300+i}));
 return {boards:[{id:'board',cards:[card,{id:'diary',type:'diary',diaryEntries:{'2026-10-12':{thoughts:'Every original word\n第二行'}}},{id:'planner',plannerTasks:[{id:'task',title:'Original task',done:true,completedOn:'2026-10-12'}]}]}],syncConflicts:conflicts,conflictResolutions:{earlier:{resolvedAt:1}}};
}
test('112 automatic timer acknowledgements preserve every board byte and original comparison',()=>{
 const before=timerFixture(),next=M.resolveAutomaticTimerConflicts(before,before.syncConflicts,500);
 assert.deepEqual(next.boards,before.boards);assert.equal(next.syncConflicts.length,0);
 assert.deepEqual(next.conflictResolutions.earlier,before.conflictResolutions.earlier);
 for(const c of before.syncConflicts)assert.deepEqual(next.conflictResolutions[c.id].comparison,c);
 assert.equal(before.syncConflicts.length,112);assert.deepEqual(M.registerConflicts(before.syncConflicts,next.conflictResolutions),[]);
});
test('automatic timer review refuses history, manual timers, tasks, deleted cards and unsafe paths',()=>{
 const f=timerFixture(),c=f.syncConflicts[0];
 for(const segments of [['boards','board','cards','routine','history'],['boards','board','cards','diary','remaining'],['boards','board','cards','planner','remaining'],['boards','board','cards','missing','remaining'],['boards','board','__proto__','routine','remaining']])assert.equal(M.inspectAutomaticTimerConflict(f,{...c,segments}).editable,false);
 f.boards[0].cards[0].type='minutes';f.boards[0].cards[0].timerMode='hours';assert.equal(M.inspectAutomaticTimerConflict(f,c).editable,false);
});
test('automatic timer review rejects stale comparisons and never resolves real writing conflicts',()=>{
 const f=timerFixture(),expected=copy(f.syncConflicts);f.syncConflicts[0].remote=999;
 assert.throws(()=>M.resolveAutomaticTimerConflicts(f,expected),/comparison changed/);
 f.syncConflicts=copy(expected);const text={id:'writing',segments:['boards','board','cards','diary','diaryEntries','2026-10-12','thoughts'],base:'Old',local:'Current',remote:'Other'};f.syncConflicts.push(text);
 const next=M.resolveAutomaticTimerConflicts(f,expected);assert.deepEqual(next.syncConflicts,[text]);assert.deepEqual(next.boards,f.boards);
});
test('automatic timer classification validates numeric values and target dates before acknowledgement',()=>{
 const f=timerFixture(),c=f.syncConflicts[0];
 for(const value of ['123',-1,null,{value:123}])assert.equal(M.inspectAutomaticTimerConflict(f,{...c,remote:value}).editable,false);
 const target={...c,segments:c.segments.slice(0,-1).concat('targetAt'),base:'2026-10-12T00:00:00Z',local:'2026-10-13T00:00:00Z',remote:'2026-10-14T00:00:00Z'};
 assert.equal(M.inspectAutomaticTimerConflict(f,target).editable,true);assert.equal(M.inspectAutomaticTimerConflict(f,{...target,remote:'not a date'}).editable,false);
});
function removedBoardFixture(){
 const f=timerFixture(),base=copy(f);base.syncConflicts=[];
 const local=copy(base),remote=copy(base);local.boards=[];local.deletedBoardIds={board:10};
 remote.boards[0].cards[0].remaining-=1;
 const c={id:'removed-board',source:'device',segments:['boards','board'],base:copy(base.boards[0]),local:undefined,remote:copy(remote.boards[0])};
 local.syncConflicts=[c];return {base,local,remote,c};
}
test('board deletion against a ticking daily routine does not create a new conflict',()=>{
 const f=removedBoardFixture();
 for(const pair of [[f.local,f.remote],[f.remote,f.local]]){const merged=M.merge(f.base,...pair);assert.deepEqual(merged.boards,[]);assert.deepEqual(merged.conflicts,[]);}
});
test('a retained removed-board clock comparison changes no current records and retains the full removed version',()=>{
 const f=removedBoardFixture();assert.equal(M.inspectAutomaticTimerConflict(f.local,f.c).editable,true);
 const next=M.resolveAutomaticTimerConflicts(f.local,[f.c],100);
 assert.deepEqual(next.boards,f.local.boards);assert.deepEqual(next.deletedBoardIds,f.local.deletedBoardIds);
 assert.deepEqual(next.conflictResolutions[f.c.id].comparison,M.copy(f.c));assert.equal(next.syncConflicts.length,0);
});
test('removed-board classification refuses real writing edits, manual timers, missing deletion evidence and wrong IDs',()=>{
 const f=removedBoardFixture();
 const changed=copy(f.c);changed.remote.cards[1].diaryEntries['2026-10-12'].thoughts='New private words';
 assert.equal(M.inspectAutomaticTimerConflict(f.local,changed).editable,false);
 const realRemote=copy(f.remote);realRemote.boards[0]=changed.remote;assert.equal(M.merge(f.base,f.local,realRemote).conflicts.length,1);
 const manual=copy(f.c);manual.base.cards[0].type='minutes';manual.remote.cards[0].type='minutes';manual.base.cards[0].timerMode='hours';manual.remote.cards[0].timerMode='hours';
 assert.equal(M.inspectAutomaticTimerConflict(f.local,manual).editable,false);
 assert.equal(M.inspectAutomaticTimerConflict({...f.local,deletedBoardIds:{}},f.c).editable,false);
 assert.equal(M.inspectAutomaticTimerConflict(f.local,{...f.c,segments:['boards','another-board']}).editable,false);
});
test('card deletion still refuses a conflicting routine checkmark but ignores a valid daily clock tick',()=>{
 const f=removedBoardFixture(),local=copy(f.base),remote=copy(f.remote);local.boards[0].cards=local.boards[0].cards.slice(1);
 assert.equal(M.merge(f.base,local,remote).conflicts.length,0);
 remote.boards[0].cards[0].items[0].done=false;assert.equal(M.merge(f.base,local,remote).conflicts.length,1);
});
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
