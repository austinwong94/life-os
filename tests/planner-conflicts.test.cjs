const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../state-merge.js');
const P=require('../planner-store.js');
const now=new Date('2026-09-08T12:30:00').getTime();
function fixture() {
  const card={id:'planner.with.dots',type:'planner',plannerEntries:{}};
  P.add(card,'2026-09-01','Call the clinic','task.with.dots',1);
  P.add(card,'2026-09-01','Call the clinic','independent',2);P.project(card);
  const base={boards:[{id:'personal.with.dots',name:'Personal',cards:[card],archivedCards:[]},{id:'work',name:'Work',cards:[],archivedCards:[]}]};
  return {base,local:M.copy(base),remote:M.copy(base)};
}
const source=s=>s.boards[0].cards[0];
function conflicting(f) {
  P.complete(source(f.local),'task.with.dots','2026-09-07',now);
  P.change(source(f.remote),'task.with.dots',{dateKey:'2026-09-15'},now+1);
  const merged=M.merge(f.base,f.local,f.remote);
  f.local.boards=merged.boards;
  f.local.syncConflicts=M.registerConflicts(merged.conflicts,{},()=> 'task-history-conflict');
  return f.local.syncConflicts[0];
}
test('concurrent completion and rescheduling retain a complete version instead of constructing a mixed task',()=>{
  const f=fixture(),conflict=conflicting(f);
  assert.equal(conflict?.kind,'planner-task');
  assert.deepEqual(conflict.segments,['boards','personal.with.dots','cards','planner.with.dots','plannerTasks','task.with.dots']);
  assert.equal(source(f.local).plannerTasks[0].done,true);
  assert.equal(source(f.local).plannerTasks[0].dateKey,'2026-09-01');
  assert.equal(conflict.remote.done,false);assert.equal(conflict.remote.dateKey,'2026-09-15');
});
test('concurrent removal and completion preserve both complete task versions for review',()=>{
  const f=fixture();P.change(source(f.local),'task.with.dots',{deletedAt:now},now);
  P.complete(source(f.remote),'task.with.dots','2026-09-08',now+1);
  const merged=M.merge(f.base,f.local,f.remote);
  assert.equal(merged.conflicts[0]?.kind,'planner-task');assert.equal(merged.conflicts.length,1);
  assert.equal(source(merged).plannerTasks[0].done,false);
  assert.equal(merged.conflicts[0].remote.deletedAt,0);assert.equal(merged.conflicts[0].remote.done,true);
});
test('one-sided task history edits and timestamp-only differences do not create conflicts',()=>{
  const f=fixture();P.complete(source(f.local),'task.with.dots','2026-09-07',now);
  source(f.remote).plannerTasks[0].updatedAt=now+100;
  const merged=M.merge(f.base,f.local,f.remote);
  assert.equal(merged.conflicts.length,0);assert.equal(source(merged).plannerTasks[0].completedOn,'2026-09-07');
  source(f.remote).plannerTasks[0]=M.copy(source(f.local).plannerTasks[0]);source(f.remote).plannerTasks[0].updatedAt=now+200;
  assert.equal(M.merge(f.base,f.local,f.remote).conflicts.length,0);
});
test('different tasks and boards still merge independently',()=>{
  const f=fixture();P.complete(source(f.local),'task.with.dots','2026-09-07',now);
  P.change(source(f.remote),'independent',{dateKey:'2026-10-01'},now+1);f.remote.boards[1].name='Work update';
  const merged=M.merge(f.base,f.local,f.remote);assert.equal(merged.conflicts.length,0);
  assert.equal(source(merged).plannerTasks[0].done,true);assert.equal(source(merged).plannerTasks[1].dateKey,'2026-10-01');assert.equal(merged.boards[1].name,'Work update');
});
test('choosing a whole version preserves its timestamps, identity and unrelated duplicate task',()=>{
  const f=fixture(),conflict=conflicting(f),expected=source(f.local).plannerTasks[0];
  const next=M.resolvePlannerTaskConflict(f.local,conflict,expected,conflict.remote,now+10);
  assert.deepEqual(source(next).plannerTasks[0],{...conflict.remote,updatedAt:now+10});
  assert.deepEqual(source(next).plannerTasks[1],source(f.base).plannerTasks[1]);assert.deepEqual(next.boards[1],f.base.boards[1]);
  assert.equal(next.syncConflicts.length,0);assert.equal(next.conflictResolutions[conflict.id].kind,'planner-task');
  assert.equal(source(f.local).plannerTasks[0].done,true);
  const kept=M.resolvePlannerTaskConflict(f.local,conflict,expected,expected,now+10);
  assert.equal(source(kept).plannerTasks[0].completionRecordedAt,now);assert.equal(source(kept).plannerTasks[0].completedOn,'2026-09-07');
});
test('stale task state or comparison cannot be overwritten and inspection is an immutable snapshot',()=>{
  const f=fixture(),conflict=conflicting(f),expected=M.inspectPlannerTaskConflict(f.local,conflict).current;
  P.change(source(f.local),'task.with.dots',{title:'Changed after review opened'},now+2);
  assert.notEqual(expected.title,source(f.local).plannerTasks[0].title);
  assert.throws(()=>M.resolvePlannerTaskConflict(f.local,conflict,expected,conflict.remote),/task changed/);
  assert.throws(()=>M.resolvePlannerTaskConflict(f.local,{...conflict,remote:{...conflict.remote,title:'Altered comparison'}},expected,conflict.remote),/comparison has changed/);
});
test('arbitrary replacements, invalid dates, mismatched IDs and ambiguous legacy history are refused',()=>{
  const f=fixture(),conflict=conflicting(f),expected=M.copy(source(f.local).plannerTasks[0]);
  assert.throws(()=>M.resolvePlannerTaskConflict(f.local,conflict,expected,{...conflict.remote,title:'Invented choice'}),/displayed/);
  for(const change of [{dateKey:'2026-02-31'},{id:'independent'},{done:true,completedOn:''},{legacyNeedsReview:true},{completedAt:-1},{createdAt:Number.MAX_SAFE_INTEGER},{updatedAt:1.5}]) {
    const bad={...conflict,remote:{...conflict.remote,...change}};
    assert.equal(M.inspectPlannerTaskConflict(f.local,bad).editable,false);
  }
  for(const segments of [undefined,['boards','personal.with.dots','__proto__'],conflict.segments.slice(0,-1),['boards','work',...conflict.segments.slice(2)]]) {
    assert.equal(M.inspectPlannerTaskConflict(f.local,{...conflict,segments}).editable,false);
  }
});
test('soft-removed and archived versions remain reviewable without deleting the task record',()=>{
  const f=fixture();P.change(source(f.local),'task.with.dots',{archivedAt:now},now);
  P.change(source(f.remote),'task.with.dots',{deletedAt:now+1},now+1);
  const conflict=M.registerConflicts(M.merge(f.base,f.local,f.remote).conflicts,{},()=> 'removed-choice')[0];f.local.syncConflicts=[conflict];
  assert.equal(M.inspectPlannerTaskConflict(f.local,conflict).editable,true);
  const next=M.resolvePlannerTaskConflict(f.local,conflict,source(f.local).plannerTasks[0],conflict.remote);
  assert.equal(source(next).plannerTasks.length,2);assert.equal(source(next).plannerTasks[0].deletedAt,now+1);
});
test('whole-task cloud acknowledgement is limited to its account and exact baseline',()=>{
  const f=fixture(),conflict=conflicting(f);Object.assign(conflict,{source:'cloud',ownerId:'owner',baseDigest:'baseline'});
  const next=M.resolvePlannerTaskConflict(f.local,conflict,source(f.local).plannerTasks[0],conflict.local,now+10);
  const baseline=M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','baseline');
  assert.deepEqual(source(baseline).plannerTasks[0],conflict.remote);
  assert.deepEqual(M.reviewedCloudBaseline(f.base,next.conflictResolutions,'someone-else','baseline'),M.copy(f.base));
  assert.deepEqual(M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','different-baseline'),M.copy(f.base));
  assert.equal(M.merge(baseline,next,f.remote).conflicts.length,0);
  assert.equal(source(M.merge(baseline,next,f.remote)).plannerTasks[0].completedOn,'2026-09-07');
});
test('new cloud history changes are not acknowledged by an older review receipt',()=>{
  const f=fixture(),conflict=conflicting(f);Object.assign(conflict,{source:'cloud',ownerId:'owner',baseDigest:'baseline'});
  const next=M.resolvePlannerTaskConflict(f.local,conflict,source(f.local).plannerTasks[0],conflict.local,now+10);
  const baseline=M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','baseline');
  P.change(source(f.remote),'task.with.dots',{dateKey:'2026-10-01'},now+20);
  assert.equal(M.merge(baseline,next,f.remote).conflicts[0].kind,'planner-task');
  assert.deepEqual(M.registerConflicts([conflict],next.conflictResolutions),[]);
});
test('missing hard-deleted task versions are retained as conflicts but cannot be applied by guessing',()=>{
  const f=fixture();P.complete(source(f.local),'task.with.dots','2026-09-07',now);source(f.remote).plannerTasks.shift();
  const merged=M.merge(f.base,f.local,f.remote);assert.equal(merged.conflicts.length,1);
  assert.equal(M.inspectPlannerTaskConflict(merged,merged.conflicts[0]).editable,false);
  assert.equal(source(merged).plannerTasks[0].done,true);
});
