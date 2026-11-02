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
test('weight summary reads exact today and preceding valid measurements without changing the Fitness Log',()=>{
  const card={id:'gym',type:'fitness',fitnessEntries:{'2026-10-29':{metrics:{weightKg:73}},'2026-10-31':{metrics:{weightKg:'72.35',chestCm:94},notes:'Keep every word'},'2026-11-01':{metrics:{weightKg:71}}}},before=JSON.stringify(card);
  assert.deepEqual(health.weightSummary(card,'2026-10-31'),{needsReview:false,today:{date:'2026-10-31',kg:72.35},previous:{date:'2026-10-29',kg:73}});assert.equal(JSON.stringify(card),before);
});
test('an older weight never becomes today and future or invalid dates never become a preceding measurement',()=>{
  const card={type:'fitness',fitnessEntries:{'2026-10-29':{metrics:{weightKg:72.3}},'2026-02-30':{metrics:{weightKg:80}},'2026-11-01':{metrics:{weightKg:71}}}},before=JSON.stringify(card);
  assert.deepEqual(health.weightSummary(card,'2026-10-31'),{needsReview:false,today:null,previous:{date:'2026-10-29',kg:72.3}});assert.equal(JSON.stringify(card),before);assert.equal(health.weightSummary(card,'2026-02-30').needsReview,true);
});
test('missing weights stay missing without creating a day or inventing a target or a judgement',()=>{
  for(const value of [undefined,null,'']){const card={type:'fitness',fitnessEntries:{'2026-10-31':{metrics:{weightKg:value}}}},before=JSON.stringify(card);assert.deepEqual(health.weightSummary(card,'2026-10-31'),{needsReview:false,today:null,previous:null});assert.equal(JSON.stringify(card),before);}
  assert.deepEqual(health.weightSummary({type:'fitness'},'2026-10-31'),{needsReview:false,today:null,previous:null});
});
test('unusable weight values and malformed current-day containers require review while their original bytes remain',()=>{
  for(const value of [0,-1,true,[],{},'bad','72.345','1e2',' 72.3 ',Number.MAX_SAFE_INTEGER]){const card={type:'fitness',fitnessEntries:{'2026-10-31':{metrics:{weightKg:value}}}},before=JSON.stringify(card);assert.equal(health.weightSummary(card,'2026-10-31').needsReview,true,JSON.stringify(value));assert.equal(JSON.stringify(card),before);}
  for(const entry of [null,[],5,{metrics:null},{metrics:[]}])assert.equal(health.weightSummary({type:'fitness',fitnessEntries:{'2026-10-31':entry}},'2026-10-31').needsReview,true);
  for(const fitnessEntries of [null,[],5])assert.equal(health.weightSummary({type:'fitness',fitnessEntries},'2026-10-31').needsReview,true);
});
test('weight summary refuses archived and unrelated sources and retains malformed historical records',()=>{
  const card={type:'fitness',fitnessEntries:{'2026-10-28':{metrics:{weightKg:73}},'2026-10-29':{metrics:{weightKg:'unreviewed'}},'2026-10-31':{metrics:{weightKg:72}}}},before=JSON.stringify(card);
  assert.equal(health.weightSummary({...card,type:'food'},'2026-10-31').needsReview,true);assert.equal(health.weightSummary({...card,archivedAt:1},'2026-10-31').needsReview,true);assert.equal(health.weightSummary(card,'2026-10-31').previous.kg,73);assert.equal(JSON.stringify(card),before);
});
const timing={plannedTime:'',eatenTime:'12:15',windowMinutes:60,recordedAt:1};
const meal=(id,kind='meal')=>({id,kind,items:[{id:id+'-food',amount:1}],timing});
const checkedExercise=()=>({id:'checked-lift',setLog:{version:1,id:'sets',createdAt:1,updatedAt:2,rows:[{id:'set',reps:8,weightKg:15,rpe:'',done:true,removedAt:0,history:[{id:'event',at:2,action:'completed',reps:8,weightKg:15,rpe:''}]}]}});
test('Today health counts actual meals separately from snacks and drinks without creating records or goals',()=>{
  const cards=[{id:'food',type:'food',foodEntries:{'2026-10-31':{meals:[meal('breakfast'),meal('coffee','drink'),meal('fruit','snack'),{id:'empty',items:[]}]},'2026-10-30':{meals:[meal('older')]},'2026-11-01':{meals:[meal('future')]}}}],before=JSON.stringify(cards);
  const data=health.daily(cards,'2026-10-31');assert.equal(data.food.status,'ready');assert.equal(data.food.meals,1);assert.equal(data.food.drinks,1);assert.equal(data.food.snacks,1);assert.equal(data.food.recordedDays,2);assert.equal(data.food.lastTime,'12:15');assert.equal(Object.hasOwn(data.food,'target'),false);assert.equal(JSON.stringify(cards),before);
});
test('weight alone, active blank parts and unfinished individual sets are not recorded training',()=>{
  const exercise=checkedExercise();exercise.setLog.rows=[];const entry={metrics:{weightKg:72.3},parts:{chest:{active:true,exercises:[{id:'plan',name:'Planned lift',sets:3,reps:''},exercise]},running:{active:true,distanceKm:'',durationMinutes:''}}};
  assert.deepEqual(health.trainingDay(entry),{checkedSets:0,exerciseEntries:0,activityEntries:0,review:false,hasEntry:false});assert.equal(health.trainingDay({notes:'Rest day'}).hasEntry,false);
});
test('checked sets, legacy entries and activity measurements retain distinct read-only meanings',()=>{
  const entry={parts:{chest:{active:true,exercises:[checkedExercise(),{id:'legacy',name:'Push-ups',sets:3,reps:'8-12'},{id:'amrap',name:'Pull-ups',sets:1,reps:'AMRAP'}]},running:{active:true,distanceKm:5,durationMinutes:30},mobility:{active:true,durationMinutes:10}}},before=JSON.stringify(entry);
  assert.deepEqual(health.trainingDay(entry),{checkedSets:1,exerciseEntries:2,activityEntries:2,review:false,hasEntry:true});assert.equal(JSON.stringify(entry),before);
});
test('Today uses a chosen original health source and never sums multiple logs or silently replaces a removed selection',()=>{
  const cards=[{id:'one',type:'food',foodEntries:{'2026-10-31':{meals:[meal('one-meal')]}}},{id:'two',type:'food',foodEntries:{'2026-10-31':{meals:[meal('two-meal'),meal('another')]}}}];
  assert.equal(health.daily(cards,'2026-10-31').food.status,'choose');assert.equal(health.daily(cards,'2026-10-31',{food:'two'}).food.meals,2);cards.pop();assert.equal(health.daily(cards,'2026-10-31',{food:'two'}).food.status,'unavailable');assert.equal(health.daily(cards,'2026-10-31').food.meals,1);
});
test('archived duplicate and conflicting sources pause Today totals without combining unrelated boards',()=>{
  const card={id:'food',type:'food',foodEntries:{}},cards=[card,{...card,id:'archived',archivedAt:1}],conflict={segments:['boards','board','cards','food','foodEntries']};
  assert.equal(health.daily(cards,'2026-10-31').food.sources.length,1);assert.equal(health.daily(cards,'2026-10-31',{}, {boardId:'board',conflicts:[conflict]}).food.status,'review');assert.equal(health.daily(cards,'2026-10-31',{}, {boardId:'other',conflicts:[conflict]}).food.status,'ready');assert.equal(health.daily([...cards,card],'2026-10-31',{food:'food'}).food.status,'review');
});
test('invalid food identities and unrecognised strength logs are review states rather than invented progress',()=>{
  const cards=[{id:'food',type:'food',foodEntries:{'2026-10-31':{meals:[meal('same'),meal('same')]}}},{id:'gym',type:'fitness',fitnessEntries:{'2026-10-31':{parts:{chest:{active:true,exercises:[{id:'bad',setLog:{version:99}}]}}}}}];
  const before=JSON.stringify(cards),data=health.daily(cards,'2026-10-31');assert.equal(data.food.status,'review');assert.equal(data.fitness.status,'review');assert.equal(health.daily(cards,'bad').food.status,'review');assert.equal(JSON.stringify(cards),before);
});
test('weekly training counts use dated exercise evidence, not future plans body measurements or notes',()=>{
  const card={id:'gym',type:'fitness',fitnessEntries:{'2026-10-31':{metrics:{weightKg:72}},'2026-10-30':{parts:{chest:{active:true,exercises:[checkedExercise()]}}},'2026-10-29':{notes:'A rest day'},'2026-11-01':{parts:{chest:{active:true,exercises:[checkedExercise()]}}}}};
  const result=health.daily([card],'2026-10-31').fitness;assert.equal(result.recordedDays,1);assert.equal(result.checkedSets,0);assert.equal(result.hasEntry,false);
});
test('missing actual meal times never become an inferred schedule or late judgement',()=>{
  const card={id:'food',type:'food',foodEntries:{'2026-10-31':{meals:[{...meal('actual'),timing:{...timing,eatenTime:''}}]}}};
  const result=health.daily([card],'2026-10-31').food;assert.equal(result.lastTime,'');assert.equal(result.meals,1);assert.equal(Object.hasOwn(result,'late'),false);assert.equal(Object.hasOwn(result,'completed'),false);
});
test('malformed day containers and null records pause progress instead of being presented as an empty successful review',()=>{
  for(const value of [null,[],42,'bad']){
    assert.equal(health.daily([{id:'food',type:'food',foodEntries:value}],'2026-10-31').food.status,'review');
    assert.equal(health.daily([{id:'gym',type:'fitness',fitnessEntries:value}],'2026-10-31').fitness.status,'review');
    assert.equal(health.daily([{id:'food',type:'food',foodEntries:{'2026-10-31':value}}],'2026-10-31').food.status,'review');
    assert.equal(health.trainingDay(value).review,true);
  }
});
