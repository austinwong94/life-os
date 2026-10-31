const {test}=require('node:test'),assert=require('node:assert/strict'),health=require('../health-workspace.js');
const workout=()=>({id:'original',type:'fitness',fitnessEntries:{'2026-10-29':{parts:{chest:{active:true,exercises:[{id:'lift',name:'Bench press',sets:3,reps:'8-12',weightKg:12.75,futureField:{original:true}}]}}},'2026-10-31':{parts:{running:{active:true,distanceKm:5,durationMinutes:30}}}}});
test('health history is a read-only projection over original valid, active workout sources',()=>{
  const a=workout(),cards=[a,{...workout(),id:'archived',archivedAt:1},{type:'diary',fitnessEntries:a.fitnessEntries}],before=JSON.stringify(cards);
  a.fitnessEntries['2026-02-30']={parts:{running:{active:true}}};a.fitnessEntries['2026-10-28']={parts:{chest:{active:false}}};const seeded=JSON.stringify(cards);
  assert.deepEqual(health.sessions(cards).map(x=>[x.cardId,x.date]),[['original','2026-10-31'],['original','2026-10-29']]);assert.equal(JSON.stringify(cards),seeded);assert(before.length>0);
});
test('previous exercise uses an earlier date, same part and exact case-normalized name without changing records',()=>{
  const card=workout(),before=JSON.stringify(card),previous=health.previous(card,'2026-10-31','chest',' BENCH PRESS ');
  assert.equal(previous.date,'2026-10-29');assert.equal(previous.exercise.weightKg,12.75);assert.deepEqual(previous.exercise.futureField,{original:true});assert.equal(health.previous(card,'2026-10-29','chest','Bench press'),null);assert.equal(health.previous(card,'2026-10-31','back','Bench press'),null);assert.equal(JSON.stringify(card),before);
});
test('ambiguous or removed exercise records are not presented as verified previous performance',()=>{
  const card=workout(),part=card.fitnessEntries['2026-10-29'].parts.chest;part.exercises.push({...part.exercises[0],id:'another'});assert.equal(health.previous(card,'2026-10-31','chest','Bench press'),null);part.active=false;assert.equal(health.previous(card,'2026-10-31','chest','Bench press'),null);
});
test('malformed history and invalid dates do not crash the health projection or invent a score',()=>{
  const card=workout();card.fitnessEntries['2026-10-29'].parts.chest.exercises=[null,{name:123}];assert.equal(health.previous(card,'2026-10-31','chest','Bench press'),null);assert.equal(health.validDay('2026-02-29'),false);assert.equal(health.validDay('2028-02-29'),true);assert.equal(health.previous(card,'bad','chest','Bench press'),null);assert.equal(Object.hasOwn(health.sessions([card])[0],'score'),false);
});
