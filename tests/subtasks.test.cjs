const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../subtask-store.js'),M=require('../state-merge.js'),P=require('../planner-store.js'),R=require('../task-repository.js');
const now=Date.parse('2026-10-12T04:00:00Z');
const add=(target,id,title=id)=>S.change(target,{type:'add',id,title},null,{now});
test('subtasks are optional, keep parent identity and preserve unrelated original content',()=>{
  const parent={id:'birthday',title:'Birthday',done:false,notes:'Keep my notes'},before=structuredClone(parent);
  assert.deepEqual(S.active(parent),[]);assert.deepEqual(parent,before);
  add(parent,'cake','Buy cake');add(parent,'food','Order food');assert.deepEqual(parent.subtasks.map(t=>t.title),['Buy cake','Order food']);
  delete parent.subtasks;assert.deepEqual(parent,before);
  const transaction=add(parent,'cake');S.restore(parent,transaction);assert.deepEqual(parent,before);
});
test('child completion uses selected historical day and actual recording timestamp, without completing its parent',()=>{
  const parent={done:false};add(parent,'cake');
  S.change(parent,{type:'complete',id:'cake'},parent.subtasks[0],{day:'2026-10-10',now});
  assert.equal(parent.subtasks[0].taskCompletion.on,'2026-10-10');assert.equal(parent.subtasks[0].taskCompletion.recordedAt,now);assert.equal(parent.done,false);
  S.change(parent,{type:'complete',id:'cake'},parent.subtasks[0],{day:'2026-10-12',now:now+1});assert.equal(parent.subtasks[0].taskCompletionEvents.length,2);
});
test('rename, tombstone deletion and guarded Undo preserve identity and completion history',()=>{
  const parent={};add(parent,'cake');const rename=S.change(parent,{type:'rename',id:'cake',title:'Choose chocolate cake'},parent.subtasks[0],{now});
  S.restore(parent,rename);assert.equal(parent.subtasks[0].title,'cake');
  const removed=S.change(parent,{type:'remove',id:'cake'},parent.subtasks[0],{now});assert.equal(S.active(parent).length,0);assert.equal(parent.subtasks.length,1);
  S.restore(parent,removed);assert.equal(S.active(parent).length,1);
  const stale=S.change(parent,{type:'rename',id:'cake',title:'New cake'},parent.subtasks[0],{now});S.change(parent,{type:'rename',id:'cake',title:'Newest cake'},parent.subtasks[0],{now:now+1});assert.throws(()=>S.restore(parent,stale),/changed again/);
});
test('malformed imported data, invalid commands and stale child edits are refused without mutation',()=>{
  for(const subtasks of ['Original data',[{id:'one',title:'One',done:false},{id:'one',title:'Two',done:false}],[{id:'one',title:'One',done:'yes'}]]){
    const target={subtasks},before=structuredClone(target);assert.throws(()=>add(target,'new'));assert.deepEqual(target,before);
  }
  const target={};add(target,'cake');const before=structuredClone(target);
  for(const command of [{type:'rename',id:'cake',title:' '},{type:'complete',id:'cake'},{type:'add',id:'cake',title:'Duplicate'},{type:'unsupported',id:'cake'}]){
    assert.throws(()=>S.change(target,command,target.subtasks[0],{day:'bad',now}));assert.deepEqual(target,before);
  }
  S.change(target,{type:'rename',id:'cake',title:'New cake'},target.subtasks[0],{now});assert.throws(()=>S.change(target,{type:'remove',id:'cake'},before.subtasks[0],{now}),/changed elsewhere/);
});
const fixture=kind=>{
  const card=kind==='planner'?{id:'source',type:'planner',plannerSchemaVersion:2,plannerTasks:[{id:'parent',title:'Birthday',done:false,dateKey:'2026-10-12'}]}:{id:'source',type:'daily',items:[{id:'parent',text:'Birthday',done:false}]};
  const target=kind==='planner'?card.plannerTasks[0]:card.items[0];add(target,'cake');add(target,'food');return {boards:[{id:'one',cards:[card]},{id:'two',cards:[]}]};
};
const parent=(snapshot,kind)=>snapshot.boards[0].cards[0][kind==='planner'?'plannerTasks':'items'][0];
for(const kind of ['planner','daily']){
  test(kind+': independent child edits and additions merge; same-child conflicts retain complete versions',()=>{
    const base=fixture(kind),left=structuredClone(base),right=structuredClone(base);
    S.change(parent(left,kind),{type:'complete',id:'cake'},parent(left,kind).subtasks[0],{day:'2026-10-12',now});
    S.change(parent(right,kind),{type:'rename',id:'food',title:'Order vegetarian food'},parent(right,kind).subtasks[1],{now});
    add(parent(left,kind),'gifts');add(parent(right,kind),'friends');
    const merged=M.merge(base,left,right);assert.deepEqual(merged.conflicts,[]);const children=parent(merged,kind).subtasks;
    assert.equal(children.length,4);assert.equal(children[0].done,true);assert.equal(children[1].title,'Order vegetarian food');
    const other=structuredClone(base);S.change(parent(other,kind),{type:'remove',id:'cake'},parent(other,kind).subtasks[0],{now});
    const conflict=M.merge(base,left,other);assert.equal(conflict.conflicts.length,1);assert.equal(conflict.conflicts[0].remote.deletedAt,now);assert.equal(conflict.conflicts[0].local.done,true);
    const record={...conflict.conflicts[0],id:'comparison',source:'cloud',ownerId:'owner',baseDigest:'base'};const snapshot={...conflict,syncConflicts:[record]};
    const inspection=M.inspectSubtaskConflict(snapshot,record);assert.equal(inspection.editable,true);
    const resolved=M.resolveSubtaskConflict(snapshot,record,inspection.current,record.remote,now+5);assert.equal(parent(resolved,kind).subtasks[0].deletedAt,now);assert.equal(resolved.syncConflicts.length,0);assert.deepEqual(parent(resolved,kind).subtasks[1],parent(left,kind).subtasks[1]);
    assert.throws(()=>M.resolveSubtaskConflict(snapshot,record,{...inspection.current,title:'Stale'},record.remote),/changed or moved/);
    const reviewed=M.reviewedCloudBaseline(base,resolved.conflictResolutions,'owner','base');assert.equal(parent(reviewed,kind).subtasks[0].deletedAt,now);assert.equal(parent(base,kind).subtasks[0].deletedAt,undefined);
  });
}
test('parent rename/reschedule keeps subtasks; completion and source-card Undo never reset their checklist',()=>{
  const card=fixture('planner').boards[0].cards[0];P.change(card,'parent',{title:'Sister birthday',dateKey:'2026-11-01'},now);P.complete(card,'parent','2026-10-12',now);assert.equal(card.plannerTasks[0].subtasks.length,2);assert.equal(card.plannerTasks[0].subtasks[0].done,false);
  const board={id:'one',cards:[{id:'single',type:'single',title:'Birthday',done:false}]};add(board.cards[0],'cake');const row=R.collect(board)[0],before=structuredClone(board);const tx=R.change(board,row.ref,row.base,{title:'Sister birthday'});R.restore(board,tx);assert.deepEqual(board,before);
});
