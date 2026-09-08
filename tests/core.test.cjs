const {test} = require('node:test');
const assert = require('node:assert/strict');
const P = require('../planner-store.js');
const M = require('../state-merge.js');
const clone = value => JSON.parse(JSON.stringify(value));
const make = () => ({id:'source', plannerEntries:{}});
const now = new Date('2026-09-08T18:45:00').getTime();
test('late completion preserves the other overdue task and completion-day history', () => {
  const c=make(); P.add(c,'2026-09-07','Send proposal','a',now);P.add(c,'2026-09-07','Buy groceries','b',now);
  P.complete(c,'a','2026-09-08',now);
  assert.deepEqual(P.forDay(c,'2026-09-08').map(x=>[x.id,x.done]),[['a',true],['b',false]]);
  assert.deepEqual(P.forDay(c,'2026-09-09').map(x=>x.id),['b']);
});
test('retroactive completion uses the selected date and retains recorded timestamp', () => {
  const c=make();P.add(c,'2026-09-07','Tidy room','a',now);P.complete(c,'a','2026-09-07',now);
  assert.equal(c.plannerTasks[0].completedOn,'2026-09-07');assert.equal(c.plannerTasks[0].completionRecordedAt,now);
  assert.equal(P.forDay(c,'2026-09-08').length,0);
});
test('uncompleted past task carries forward indefinitely without stored copies', () => {
  const c=make();P.add(c,'2026-01-01','Appointment','a',now);
  assert.equal(P.forDay(c,'2027-01-01').length,1);assert.equal(c.plannerTasks.length,1);
});
test('duplicate titles have independent identity and completion', () => {
  const c=make();P.add(c,'2026-09-08','Medication','a',now);P.add(c,'2026-09-08','Medication','b',now);P.complete(c,'a','2026-09-08',now);
  assert.deepEqual(c.plannerTasks.map(x=>x.done),[true,false]);
});
test('rename updates one canonical task across all dates', () => {
  const c=make();P.add(c,'2026-09-01','Old name','a',now);P.change(c,'a',{title:'New name'},now);
  for (const day of ['2026-09-01','2026-09-08','2027-09-08']) assert.equal(P.forDay(c,day)[0].title,'New name');
});
test('rescheduling keeps identity and audit origin', () => {
  const c=make();P.add(c,'2026-09-01','Plan','a',now);P.change(c,'a',{dateKey:'2026-09-10'},now);
  assert.equal(P.forDay(c,'2026-09-08').length,0);assert.equal(c.plannerTasks[0].originalDateKey,'2026-09-01');assert.equal(P.forDay(c,'2026-09-10')[0].id,'a');
});
test('archive and removal are recoverable without changing completion', () => {
  const c=make();P.add(c,'2026-09-08','Task','a',now);P.change(c,'a',{archivedAt:now},now);assert.equal(P.forDay(c,'2026-09-08').length,0);
  P.change(c,'a',{archivedAt:0,deletedAt:now},now);assert.equal(P.forDay(c,'2026-09-08').length,0);
  P.change(c,'a',{deletedAt:0},now);assert.equal(P.forDay(c,'2026-09-08')[0].done,false);
});
test('legacy migration is deterministic, idempotent and preserves raw records', () => {
  const c={id:'old',plannerEntries:{'2026-09-01':{note:'- A\n- B',checkedItems:{a:{completedAt:now}},custom:'must survive'}}};
  const raw=clone(c.plannerEntries);const other=clone(c);P.ensure(c);P.ensure(other);P.project(c);P.project(c);
  assert.deepEqual(c.plannerLegacyEntries,raw);assert.deepEqual(c.plannerTasks,other.plannerTasks);assert.equal(c.plannerTasks.length,2);
});
test('legacy carryover joins only an explicit matching source; unrelated task survives', () => {
  const c={id:'old',plannerEntries:{'2026-09-01':{note:'- A\n- B'},'2026-09-08':{note:'- A',checkedItems:{a:{completedAt:now}},carryoverItems:{a:{fromDate:'2026-09-01'}}}}};
  P.ensure(c);assert.equal(c.plannerTasks.length,2);assert.deepEqual(c.plannerTasks.map(x=>[x.title,x.done]),[['A',true],['B',false]]);
});
test('editing day text keeps existing done states and archives removed rows', () => {
  const c=make();P.add(c,'2026-09-08','A','a',now);P.add(c,'2026-09-08','B','b',now);P.complete(c,'a','2026-09-08',now);
  P.replaceDay(c,'2026-09-08','- Renamed A\n- B',()=> 'new',now);assert.equal(c.plannerTasks[0].done,true);
  P.replaceDay(c,'2026-09-08','- B',()=> 'new',now);assert.equal(c.plannerTasks.find(x=>x.id==='a').archivedAt,now);
});
const base=()=>({boards:[{id:'a',name:'A',cards:[{id:'d',diaryEntries:{'2026-09-08':{thoughts:'Original',sentence:'A'}}}]},{id:'b',name:'B',cards:[]}]});
test('different-board edits merge without conflicts',()=>{
 const b=base(),l=clone(b),r=clone(b);l.boards[0].name='Local';r.boards[1].name='Remote';const m=M.merge(b,l,r);
 assert.equal(m.conflicts.length,0);assert.deepEqual(m.boards.map(x=>x.name),['Local','Remote']);
});
test('different fields in a diary entry merge',()=>{
 const b=base(),l=clone(b),r=clone(b);l.boards[0].cards[0].diaryEntries['2026-09-08'].thoughts='All my writing';r.boards[0].cards[0].diaryEntries['2026-09-08'].sentence='Remote sentence';
 const m=M.merge(b,l,r);assert.equal(m.conflicts.length,0);assert.deepEqual(m.boards[0].cards[0].diaryEntries['2026-09-08'],{thoughts:'All my writing',sentence:'Remote sentence'});
});
test('same-field conflict keeps both values for recovery',()=>{
 const b=base(),l=clone(b),r=clone(b);l.boards[0].name='Local';r.boards[0].name='Remote';const m=M.merge(b,l,r);
 assert.equal(m.conflicts.length,1);assert.equal(m.conflicts[0].local,'Local');assert.equal(m.conflicts[0].remote,'Remote');
});
test('explicit board deletion cannot be resurrected by stale remote',()=>{
 const b=base(),l=clone(b),r=clone(b);l.boards.splice(1,1);l.deletedBoardIds={b:now};r.boards[1].name='Stale edit';const m=M.merge(b,l,r);assert.deepEqual(m.boards.map(x=>x.id),['a']);
});
test('separate newly added task IDs survive simultaneous additions',()=>{
 const b=base(),l=clone(b),r=clone(b);l.boards[1].cards.push({id:'x',title:'One'});r.boards[1].cards.push({id:'y',title:'Two'});const m=M.merge(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(m.boards[1].cards.length,2);
});
