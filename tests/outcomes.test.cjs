const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../coaching.js'),fixture=require('./coaching-fixture.cjs');
const measurement=(id,date,value,metricId='customers')=>({id,kind:'measurement',date,value,metricId,recordedAt:Date.parse(date+'T12:00:00Z'),note:''});
test('outcomes distinguish unreported targets from an explicitly recorded zero',()=>{
  const p=fixture();assert.equal(C.outcomeSnapshot(p,'2026-10-16').priorities[2].percent,null);
  p.entries.push(measurement('zero','2026-10-15',0));const r=C.outcomeSnapshot(p,'2026-10-16').priorities[2];
  assert.equal(r.percent,0);assert.equal(r.recorded,1);assert.equal(r.total,2);assert.equal(r.goals[0].metrics[0].lastDate,'2026-10-15');
});
test('outcomes use the latest effective result, exclude future and voided updates, and retain corrections',()=>{
  const p=fixture();p.entries.push(measurement('old','2026-10-01',10),measurement('new','2026-10-15',20),measurement('future','2026-10-20',80),{...measurement('void','2026-10-16',99),voidedAt:100});
  assert.equal(C.outcomeSnapshot(p,'2026-10-11').priorities[2].goals[0].metrics[0].value,10);
  assert.equal(C.outcomeSnapshot(p,'2026-10-16').priorities[2].goals[0].metrics[0].value,20);
});
test('stretch outcomes do not inflate core completion or reported coverage',()=>{
  const p=fixture();p.priorities[2].krs[0].metrics.push({id:'stretch',label:'Optional outcome',kind:'number',unit:'customers',target:10,stretch:true});
  p.entries.push(measurement('core','2026-10-15',20),measurement('stretch-record','2026-10-15',10,'stretch'));
  const r=C.outcomeSnapshot(p,'2026-10-16').priorities[2];assert.equal(r.percent,10);assert.equal(r.total,2);assert.equal(r.recorded,1);assert.equal(r.goals[0].metrics.length,2);
});
test('only explicit due checkpoints produce pace concerns, not elapsed calendar time',()=>{
  const p=fixture();p.entries.push(measurement('core','2026-10-15',20));const metric=p.priorities[2].krs[0].metrics[0];
  assert.equal(C.outcomeSnapshot(p,'2026-10-16').priorities[2].belowCheckpoint,0);
  metric.pacePlan=[{date:'2026-10-10',value:30}];let r=C.outcomeSnapshot(p,'2026-10-16').priorities[2];assert.equal(r.belowCheckpoint,1);assert.equal(r.missingCheckpoint,0);
  p.entries=[];r=C.outcomeSnapshot(p,'2026-10-16').priorities[2];assert.equal(r.belowCheckpoint,0);assert.equal(r.missingCheckpoint,1);
  assert.equal(C.outcomeSnapshot(p,'2026-10-09').priorities[2].missingCheckpoint,0);
});
test('activity and routine results keep their source identities and effective dates',()=>{
  const p=fixture();p.entries.push({id:'week',kind:'week',date:'2026-10-10',recordedAt:1,note:'',exercise:true,rest:true,personal:true,reflection:true},
    {id:'conversation',kind:'activity',source:'meeting',date:'2026-10-14',recordedAt:2,note:'A conversation',entity:'Friend',initiated:true,reciprocal:true});
  const r=C.outcomeSnapshot(p,'2026-10-16');assert.equal(r.priorities[0].goals[0].metrics[0].value,1);assert.equal(r.priorities[0].goals[0].metrics[1].recorded,false);
  assert.equal(r.priorities[1].goals[0].metrics[0].value,1);assert.equal(r.priorities[1].goals[0].metrics[0].lastDate,'2026-10-14');assert.equal(r.priorities[2].recorded,0);
});
test('same titles never merge priorities and outcome snapshots never mutate saved records',()=>{
  const p=fixture();p.priorities[1].title=p.priorities[0].title;p.entries.push(measurement('core','2026-10-15',20));const before=JSON.stringify(p);
  const r=C.outcomeSnapshot(p,'2026-10-16');assert.equal(r.priorities.length,3);assert.notEqual(r.priorities[0].id,r.priorities[1].id);
  r.priorities[2].goals[0].metrics[0].value=500;assert.equal(JSON.stringify(p),before);
});
test('invalid legacy programmes are rejected safely, not normalized or overwritten',()=>{
  const p=fixture();p.priorities[0].krs[0].metrics[0].target=-1;const before=JSON.stringify(p);
  assert.throws(()=>C.outcomeSnapshot(p,'2026-10-16'));assert.equal(JSON.stringify(p),before);assert.throws(()=>C.outcomeSnapshot(fixture(),'bad'));
});
