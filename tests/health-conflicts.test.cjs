const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../state-merge.js');
const nutrients={calories:130,protein:2.7,carbs:28.2,fat:0.3,fiber:0.4};
const food={id:'rice',name:'Rice',servingUnit:'100g',servingGrams:100,source:'Test food',...nutrients};
const item={...food,id:'item.with.dots',foodId:'rice',unit:'g',amount:100};
const exercise={id:'exercise',name:'Bench press',sets:3,reps:'12',weightKg:20,rpe:7,notes:''};
const running={active:true,distanceKm:5,durationMinutes:30,intensity:'Moderate',notes:''};
const metrics={weightKg:70,heightCm:175,bmi:22.9,bodyFatPercent:20,chestCm:'',waistCm:'',leftArmCm:'',rightArmCm:'',restingHr:'',sleepHours:7,energy:3};
function fixture() {
  const base={boards:[{id:'personal.with.dots',name:'Personal',cards:[
    {id:'food',type:'food',foodLibrary:[food],foodTargets:{'2026-09':nutrients},foodEntries:{'2026-09-08':{updatedAt:1,meals:[{id:'meal',name:'Lunch',items:[item,{...item,id:'second'}]}]}}},
    {id:'fitness',type:'fitness',fitnessEntries:{'2026-09-08':{updatedAt:1,parts:{running,chest:{active:true,notes:'',exercises:[exercise,{...exercise,id:'independent'}]}},metrics,notes:''}}}
  ],archivedCards:[]},{id:'work',name:'Work',cards:[],archivedCards:[]}]};
  return {base:M.copy(base),local:M.copy(base),remote:M.copy(base)};
}
const foodCard=s=>s.boards[0].cards[0],fitnessCard=s=>s.boards[0].cards[1];
const mealItem=s=>foodCard(s).foodEntries['2026-09-08'].meals[0].items[0];
const day=s=>fitnessCard(s).fitnessEntries['2026-09-08'];
function conflicting(f) {
  mealItem(f.local).amount=200;
  Object.assign(mealItem(f.remote),{unit:'serving',amount:1});
  const result=M.merge(f.base,f.local,f.remote);
  f.local.boards=result.boards;f.local.syncConflicts=M.registerConflicts(result.conflicts,{},()=> 'health-conflict');
  return f.local.syncConflicts[0];
}
test('concurrent grams and serving edits never create a quantity neither device recorded',()=>{
  const f=fixture(),conflict=conflicting(f);
  assert.deepEqual(mealItem(f.local),{...item,amount:200});
  assert.equal(conflict.kind,'health-record');assert.equal(conflict.recordType,'food-item');
  assert.equal(conflict.remote.amount,1);assert.equal(conflict.remote.unit,'serving');
});
test('concurrent exercise identity and load edits keep the complete workout versions',()=>{
  const f=fixture();day(f.local).parts.chest.exercises[0].name='Chest fly';day(f.remote).parts.chest.exercises[0].weightKg=25;
  const result=M.merge(f.base,f.local,f.remote);
  assert.equal(result.conflicts[0]?.recordType,'fitness-exercise');assert.equal(day(result).parts.chest.exercises[0].weightKg,20);
});
test('cardio distance and time, body measurements, food serving basis and monthly targets are atomic',()=>{
  for(const [type,record,local,remote] of [
    ['fitness-part',s=>day(s).parts.running,{distanceKm:10},{durationMinutes:60}],
    ['body-metrics',s=>day(s).metrics,{weightKg:80,bmi:26.1},{heightCm:180,bmi:21.6}],
    ['food-definition',s=>foodCard(s).foodLibrary[0],{servingGrams:50,calories:65},{protein:5}],
    ['food-target',s=>foodCard(s).foodTargets['2026-09'],{calories:2000},{protein:150}]
  ]) {
    const f=fixture();Object.assign(record(f.local),local);Object.assign(record(f.remote),remote);
    const result=M.merge(f.base,f.local,f.remote);assert.equal(result.conflicts[0]?.recordType,type);assert.deepEqual(record(result),record(f.local));
  }
});
test('different foods, exercises, dates, months and boards merge without a false conflict',()=>{
  const f=fixture();mealItem(f.local).amount=200;foodCard(f.remote).foodEntries['2026-09-08'].meals[0].items[1].amount=300;
  day(f.local).parts.chest.exercises[0].weightKg=25;day(f.remote).parts.chest.exercises[1].reps='10';
  day(f.remote).notes='Whole session note';fitnessCard(f.remote).fitnessEntries['2026-09-09']=M.copy(day(f.remote));
  foodCard(f.local).foodTargets['2026-09'].calories=2000;foodCard(f.remote).foodTargets['2026-10']={...nutrients,calories:2200};f.remote.boards[1].name='Work edited';
  const result=M.merge(f.base,f.local,f.remote);assert.equal(result.conflicts.length,0);
  assert.equal(mealItem(result).amount,200);assert.equal(foodCard(result).foodEntries['2026-09-08'].meals[0].items[1].amount,300);
  assert.equal(day(result).parts.chest.exercises[0].weightKg,25);assert.equal(day(result).parts.chest.exercises[1].reps,'10');assert.equal(result.boards[1].name,'Work edited');
});
test('identical changes and a one-sided edit with a different day timestamp do not conflict',()=>{
  const f=fixture();mealItem(f.local).amount=200;
  assert.equal(M.merge(f.base,f.local,f.remote).conflicts.length,0);
  mealItem(f.remote).amount=200;foodCard(f.remote).foodEntries['2026-09-08'].updatedAt=999;
  const result=M.merge(f.base,f.local,f.remote);assert.equal(result.conflicts.length,0);assert.equal(mealItem(result).amount,200);
});
test('whole-entry review preserves the food snapshot, unrelated records and original input',()=>{
  const f=fixture(),conflict=conflicting(f),expected=M.inspectHealthConflict(f.local,conflict).current;
  assert.equal(M.inspectHealthConflict(f.local,conflict).editable,true);
  const next=M.resolveHealthConflict(f.local,conflict,expected,conflict.remote,12345);
  assert.deepEqual(mealItem(next),conflict.remote);assert.equal(next.syncConflicts.length,0);
  assert.equal(next.conflictResolutions[conflict.id].kind,'health-record');
  assert.deepEqual(foodCard(next).foodLibrary,foodCard(f.base).foodLibrary);assert.deepEqual(next.boards[1],f.base.boards[1]);
  assert.deepEqual(fitnessCard(next),fitnessCard(f.base));assert.equal(mealItem(f.local).amount,200);
  assert.equal(foodCard(next).foodEntries['2026-09-08'].updatedAt,12345);
});
test('every supported health record can be chosen without reinterpreting its units or history',()=>{
  for(const [record,local,remote] of [
    [s=>day(s).parts.chest.exercises[0],{name:'Chest fly'},{weightKg:25}],
    [s=>day(s).parts.running,{distanceKm:10},{durationMinutes:60}],
    [s=>day(s).metrics,{weightKg:80,bmi:26.1},{heightCm:180,bmi:21.6}],
    [s=>foodCard(s).foodLibrary[0],{servingGrams:50,calories:65},{protein:5}],
    [s=>foodCard(s).foodTargets['2026-09'],{calories:2000},{protein:150}]
  ]) {
    const f=fixture();Object.assign(record(f.local),local);Object.assign(record(f.remote),remote);
    const result=M.merge(f.base,f.local,f.remote);f.local.boards=result.boards;f.local.syncConflicts=M.registerConflicts(result.conflicts,{},()=> 'record');
    const conflict=f.local.syncConflicts[0];assert.equal(M.inspectHealthConflict(f.local,conflict).editable,true);
    const next=M.resolveHealthConflict(f.local,conflict,record(f.local),conflict.remote,98765);
    assert.deepEqual(record(next),record(f.remote));assert.equal(next.syncConflicts.length,0);
  }
});
test('stale comparisons, changed measurements and arbitrary replacements cannot overwrite a health entry',()=>{
  const f=fixture(),conflict=conflicting(f),expected=M.inspectHealthConflict(f.local,conflict).current;
  assert.throws(()=>M.resolveHealthConflict(f.local,conflict,expected,{...conflict.remote,amount:123}),/displayed/);
  mealItem(f.local).amount=250;assert.equal(expected.amount,200);
  assert.throws(()=>M.resolveHealthConflict(f.local,conflict,expected,conflict.remote),/record changed/);
  assert.throws(()=>M.resolveHealthConflict(f.local,{...conflict,remote:expected},expected,expected),/comparison has changed/);
});
test('invalid measurements, wrong identity, malformed paths and wrong card types are not applied',()=>{
  const f=fixture(),conflict=conflicting(f);
  for(const change of [{amount:-1},{amount:'100'},{amount:NaN},{servingGrams:0},{calories:-1},{unit:'kg'},{id:'second'},{foodId:''}]) {
    assert.equal(M.inspectHealthConflict(f.local,{...conflict,remote:{...conflict.remote,...change}}).editable,false);
  }
  for(const segments of [undefined,conflict.segments.slice(0,-1),conflict.segments.map(x=>x==='2026-09-08'?'2026-02-31':x),['boards','personal.with.dots','__proto__']]) {
    assert.equal(M.inspectHealthConflict(f.local,{...conflict,segments}).editable,false);
  }
  foodCard(f.local).type='diary';assert.equal(M.inspectHealthConflict(f.local,conflict).editable,false);
});
test('archived sources remain reviewable but moved or hard-deleted records are not guessed',()=>{
  const f=fixture();for(const s of [f.base,f.local,f.remote])s.boards[0].archivedCards.push(s.boards[0].cards.shift());
  const row=s=>s.boards[0].archivedCards[0].foodEntries['2026-09-08'].meals[0].items[0];
  row(f.local).amount=200;Object.assign(row(f.remote),{amount:1,unit:'serving'});
  const result=M.merge(f.base,f.local,f.remote);f.local.boards=result.boards;f.local.syncConflicts=M.registerConflicts(result.conflicts,{},()=> 'archived');
  const conflict=f.local.syncConflicts[0];assert.equal(M.inspectHealthConflict(f.local,conflict).editable,true);
  assert.deepEqual(row(M.resolveHealthConflict(f.local,conflict,row(f.local),conflict.remote)),conflict.remote);
  f.local.boards[1].cards.push(f.local.boards[0].archivedCards.pop());assert.equal(M.inspectHealthConflict(f.local,conflict).editable,false);
  const missing=fixture();mealItem(missing.local).amount=200;foodCard(missing.remote).foodEntries['2026-09-08'].meals[0].items.shift();
  const merged=M.merge(missing.base,missing.local,missing.remote);assert.equal(merged.conflicts.length,1);assert.equal(mealItem(merged).amount,200);
  assert.equal(M.inspectHealthConflict(merged,merged.conflicts[0]).editable,false);
});
test('cloud review receipts are bound to the account, exact baseline and record type',()=>{
  const f=fixture(),conflict=conflicting(f);Object.assign(conflict,{source:'cloud',ownerId:'owner',baseDigest:'digest'});
  const next=M.resolveHealthConflict(f.local,conflict,mealItem(f.local),conflict.local);
  const baseline=M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','digest');
  assert.deepEqual(mealItem(baseline),conflict.remote);assert.equal(M.merge(baseline,next,f.remote).conflicts.length,0);
  for(const [owner,digest] of [['other','digest'],['owner','other']])assert.deepEqual(M.reviewedCloudBaseline(f.base,next.conflictResolutions,owner,digest),f.base);
  next.conflictResolutions[conflict.id].recordType='body-metrics';assert.deepEqual(M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','digest'),f.base);
});
test('a newer cloud food edit still conflicts after an earlier version was reviewed',()=>{
  const f=fixture(),conflict=conflicting(f);Object.assign(conflict,{source:'cloud',ownerId:'owner',baseDigest:'digest'});
  const next=M.resolveHealthConflict(f.local,conflict,mealItem(f.local),conflict.local);
  const baseline=M.reviewedCloudBaseline(f.base,next.conflictResolutions,'owner','digest');mealItem(f.remote).amount=3;
  assert.equal(M.merge(baseline,next,f.remote).conflicts[0]?.kind,'health-record');
});
