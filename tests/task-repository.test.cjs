const {test}=require('node:test');
const assert=require('node:assert/strict');
const repo=require('../task-repository.js');
const fixture=()=>({id:'board-a',cards:[
  {id:'project',type:'checklist',title:'Launch',category:'Culturely',layoutColumn:2,unknown:{kept:true},items:[{id:'one',text:'Contact partner',done:false,custom:'keep'},{id:'two',text:'Contact partner',done:true}]},
  {id:'daily',type:'daily',title:'Daily list',plannedDate:'2026-09-21',items:[{id:'daily-one',text:'Read',done:false}]},
  {id:'single',type:'single',title:'Book appointment',done:true},
  {id:'routine',type:'routine',items:[{id:'repeat',text:'Walk',done:false}]},
  {id:'store',type:'single',dailyWorkspaceStore:true,title:'Private records'},
  {id:'coaching',type:'single',coachingStore:true,title:'Private programme'},
  {id:'compat',type:'single',plannerSourceOnly:true,title:'Planner source'},
  {id:'archived',type:'checklist',archivedAt:123,items:[{id:'a',text:'Old',done:false}]}
]});
test('selectors do not migrate or mutate; only active one-off source tasks are included',()=>{
  const board=fixture(),before=structuredClone(board),rows=repo.collect(board);
  assert.equal(rows.length,4);assert.deepEqual(board,before);assert.deepEqual(rows.map(t=>t.sourceLabel),['Project','Project','To-Do','Task']);
  assert.ok(rows.every(t=>t.editable));assert.ok(rows.every(t=>!t.completedOn && !t.completedAt && !t.dateKey));
});
test('same-title items and cross-card IDs are independent identities, not text matches',()=>{
  const board=fixture();board.cards[1].items[0].id='one';const rows=repo.collect(board);
  repo.change(board,rows[1].ref,rows[1].base,{title:'Renamed'});
  assert.equal(board.cards[0].items[0].text,'Contact partner');assert.equal(board.cards[0].items[1].text,'Renamed');assert.equal(board.cards[1].items[0].text,'Read');
  assert.notDeepEqual(rows[0].ref,rows[2].ref);
});
test('rename and completion write only original fields and preserve order and unknown data',()=>{
  const board=fixture(),before=structuredClone(board),row=repo.collect(board)[0];
  repo.change(board,row.ref,row.base,{title:'  Call partner  ',done:true});before.cards[0].items[0].text='Call partner';before.cards[0].items[0].done=true;
  const completion=board.cards[0].items[0];assert.equal(completion.taskCompletion.done,true);assert.ok(repo.validDate(completion.taskCompletion.on));assert.equal(completion.taskCompletionEvents.length,1);
  delete completion.taskCompletion;delete completion.taskCompletionEvents;assert.deepEqual(board,before);assert.equal(board.cards[0].items.length,2);
});
test('new ticks retain explicit retroactive dates, actual recorded time and old unknown completions',()=>{
  const board=fixture(),old=repo.collect(board)[1],row=repo.collect(board)[0],now=Date.parse('2026-10-11T04:00:00Z');
  repo.change(board,row.ref,row.base,{done:true},{day:'2026-10-10',now});
  const current=repo.collect(board)[0];assert.equal(current.completedOn,'2026-10-10');assert.equal(board.cards[0].items[0].taskCompletion.recordedAt,now);assert.equal(repo.collect(board)[1].completedOn,'');assert.equal(old.done,true);
  const tx=repo.change(board,current.ref,current.base,{done:false},{day:'2026-10-11',now:now+1});assert.equal(board.cards[0].items[0].taskCompletionEvents.length,2);repo.restore(board,tx);assert.equal(repo.collect(board)[0].completedOn,'2026-10-10');assert.equal(board.cards[0].items[0].taskCompletionEvents.length,1);
});
test('completion conflicts retain complete versions and independent task actions still merge',()=>{
  const M=require('../state-merge.js'),base={boards:[fixture()]},left=structuredClone(base),right=structuredClone(base),now=Date.parse('2026-10-11T04:00:00Z');
  repo.complete(left.boards[0].cards[0].items[0],true,'2026-10-09',now);repo.complete(right.boards[0].cards[0].items[0],true,'2026-10-10',now+1);
  const result=M.merge(base,left,right);assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].kind,'task-completion');assert.equal(result.boards[0].cards[0].items[0].taskCompletion.on,'2026-10-09');assert.equal(result.boards[0].cards[0].items[0].taskCompletionEvents.length,2);
  const conflict={...result.conflicts[0],id:'completion-conflict'},snapshot={...result,syncConflicts:[conflict]},inspection=M.inspectCompletionConflict(snapshot,conflict);assert.ok(inspection.editable);const chosen=M.resolveCompletionConflict(snapshot,conflict,inspection.current,conflict.remote);assert.equal(chosen.boards[0].cards[0].items[0].taskCompletion.on,'2026-10-10');assert.equal(chosen.syncConflicts.length,0);
});
test('single task completion preserves card metadata and can be safely undone',()=>{
  const board=fixture(),row=repo.collect(board).at(-1),before=structuredClone(board);
  const transaction=repo.change(board,row.ref,row.base,{done:false});assert.equal(board.cards[2].done,false);
  repo.restore(board,transaction);assert.deepEqual(board,before);
});
test('missing and duplicate item IDs remain visible but cannot be mutated',()=>{
  const board=fixture();board.cards[0].items=[{text:'No ID',done:false},{id:'duplicate',text:'First'},{id:'duplicate',text:'Second'}];
  const rows=repo.collect(board).filter(t=>t.ref.cardId==='project');assert.equal(rows.length,3);assert.ok(rows.every(t=>!t.editable));
  for(const row of rows)assert.throws(()=>repo.change(board,row.ref,row.base,{done:true}),/identified safely/);
});
test('duplicate card IDs disable ambiguous writes rather than choosing the first card',()=>{
  const board=fixture();board.cards.push(structuredClone(board.cards[0]));const rows=repo.collect(board).filter(t=>t.ref.cardId==='project');
  assert.ok(rows.every(t=>!t.editable));assert.throws(()=>repo.change(board,rows[0].ref,rows[0].base,{done:true}),/source card changed/);
});
test('board switch, moved card, archive and type changes reject captured commands',()=>{
  for(const mutate of [b=>b.id='other',b=>b.cards.shift(),b=>b.cards[0].archivedAt=123,b=>b.cards[0].type='routine']){
    const board=fixture(),row=repo.collect(board)[0];mutate(board);const before=structuredClone(board);
    assert.throws(()=>repo.change(board,row.ref,row.base,{done:true}));assert.deepEqual(board,before);
  }
});
test('same-record stale writes are refused; separate items can be edited independently',()=>{
  const board=fixture(),[a,b]=repo.collect(board);
  repo.change(board,a.ref,a.base,{done:true});repo.change(board,b.ref,b.base,{title:'Other task'});
  assert.throws(()=>repo.change(board,a.ref,a.base,{title:'Stale edit'}),/changed elsewhere/);
  assert.equal(board.cards[0].items[0].done,true);assert.equal(board.cards[0].items[1].text,'Other task');
});
test('undo does not overwrite edits made since the original command',()=>{
  const board=fixture(),a=repo.collect(board)[0],transaction=repo.change(board,a.ref,a.base,{done:true});
  const b=repo.collect(board)[0];repo.change(board,b.ref,b.base,{title:'Newer name'});
  assert.throws(()=>repo.restore(board,transaction),/changed again/);assert.equal(board.cards[0].items[0].text,'Newer name');
});
test('invalid changes are rejected before mutating the source',()=>{
  for(const update of [{title:' '},{done:'yes'},{dateKey:'2026-09-22'},{done:true,title:42}]){
    const board=fixture(),before=structuredClone(board),row=repo.collect(board)[0];assert.throws(()=>repo.change(board,row.ref,row.base,update));assert.deepEqual(board,before);
  }
});
