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
test('weekly workout header counts recorded exercise evidence rather than active plans weight or notes',()=>{
  const card={id:'gym',type:'fitness',fitnessEntries:{'2026-10-24':{parts:{chest:{active:true,exercises:[checkedExercise()]}}},'2026-10-28':{parts:{running:{active:true,distanceKm:'',durationMinutes:''}}},'2026-10-29':{metrics:{weightKg:72},notes:'Rest day'},'2026-10-30':{parts:{chest:{active:true,exercises:[checkedExercise()]}}},'2026-10-31':{parts:{running:{active:true,distanceKm:5,durationMinutes:30}}},'2026-11-01':{parts:{chest:{active:true,exercises:[checkedExercise()]}}}}},before=JSON.stringify(card);
  assert.deepEqual(health.trainingWeek([card],'2026-10-31'),{status:'ready',recordedDays:2});assert.equal(JSON.stringify(card),before);
});
test('weekly workout header counts a date once across logs and ignores unchecked individual sets',()=>{
  const exercise=checkedExercise(),blank=structuredClone(exercise);blank.setLog.rows[0].done=false;blank.setLog.rows[0].history=[];const cards=[{id:'one',type:'fitness',fitnessEntries:{'2026-10-30':{parts:{chest:{active:true,exercises:[exercise]}}},'2026-10-31':{parts:{chest:{active:true,exercises:[blank]}}}}},{id:'two',type:'fitness',fitnessEntries:{'2026-10-30':{parts:{chest:{active:true,exercises:[exercise]}}}}}],before=JSON.stringify(cards);
  assert.deepEqual(health.trainingWeek(cards,'2026-10-31'),{status:'ready',recordedDays:1});assert.equal(JSON.stringify(cards),before);
});
test('weekly workout header refuses uncertain containers identities and relevant conflicts without rewriting them',()=>{
  const card={id:'gym',type:'fitness',fitnessEntries:{}},conflicts=[{segments:['boards','board','cards','gym','fitnessEntries']}];
  for(const fitnessEntries of [null,[],2,{'2026-10-31':null},{'2026-10-31':{parts:{chest:{active:true,exercises:[{id:'bad',setLog:{version:99}}]}}}}]){const source={...card,fitnessEntries},before=JSON.stringify(source);assert.deepEqual(health.trainingWeek([source],'2026-10-31'),{status:'review',recordedDays:null});assert.equal(JSON.stringify(source),before);}
  assert.equal(health.trainingWeek([card,card],'2026-10-31').status,'review');assert.equal(health.trainingWeek([card],'2026-10-31',{boardId:'board',conflicts}).status,'review');assert.equal(health.trainingWeek([card],'2026-10-31',{boardId:'other',conflicts}).status,'ready');assert.equal(health.trainingWeek([{...card,archivedAt:1}],'2026-10-31').status,'empty');
});
test('weekly workout header distinguishes no log invalid dates and a genuine zero-entry week',()=>{
  assert.deepEqual(health.trainingWeek([],'2026-10-31'),{status:'empty',recordedDays:null});assert.deepEqual(health.trainingWeek([],'2026-02-30'),{status:'review',recordedDays:null});assert.deepEqual(health.trainingWeek([{id:'gym',type:'fitness'}],'2026-10-31'),{status:'ready',recordedDays:0});
});
test('recent health headline counts known dated evidence once without inventing a target',()=>{
  const cards=[{id:'food',type:'food',foodEntries:{'2026-10-30':{meals:[meal('meal')]}}},{id:'gym',type:'fitness',fitnessEntries:{'2026-10-30':{metrics:{weightKg:72}},'2026-10-31':{parts:{chest:{active:true,exercises:[checkedExercise()]}}}}}],days=health.recent(cards,'2026-10-31'),before=JSON.stringify(days);
  assert.deepEqual(health.recentSummary(days),{status:'ready',recordedDays:2});assert.equal(JSON.stringify(days),before);assert.equal(health.recentSummary(health.recent([],'2026-10-31')).recordedDays,0);
});
test('recent health headline shows unknown progress as attention or source choice rather than zero',()=>{
  const food={id:'food',type:'food',foodEntries:{}},gym={id:'gym',type:'fitness',fitnessEntries:{'2026-10-31':{metrics:{weightKg:'Original import'}}}},cards=[food,gym],before=JSON.stringify(cards);
  assert.deepEqual(health.recentSummary(health.recent(cards,'2026-10-31')),{status:'review',recordedDays:null});assert.equal(JSON.stringify(cards),before);
  assert.deepEqual(health.recentSummary(health.recent([food,{...food,id:'other'}],'2026-10-31')),{status:'choose',recordedDays:null});assert.deepEqual(health.recentSummary(health.recent([food],'2026-10-31',{food:'removed'})),{status:'unavailable',recordedDays:null});assert.equal(health.recentSummary([]).status,'review');
});
test('recent health covers exactly seven dated days and preserves all original source records',()=>{
  const water={id:'water',amountMl:350,drankTime:'12:00',recordedAt:1,removedAt:0};
  const cards=[{id:'food',type:'food',foodEntries:{'2026-10-30':{meals:[meal('meal'),meal('coffee','drink')],water:{water}},'2026-11-02':{meals:[meal('future')]}}},{id:'gym',type:'fitness',fitnessEntries:{'2026-10-30':{metrics:{weightKg:72.35},parts:{chest:{active:true,exercises:[checkedExercise()]}}},'2026-11-01':{notes:'Rest day'}}}],before=JSON.stringify(cards);
  const week=health.recent(cards,'2026-11-01');assert.equal(week.length,7);assert.equal(week[0].date,'2026-10-26');assert.equal(week.at(-1).date,'2026-11-01');
  const day=week.find(d=>d.date==='2026-10-30');assert.deepEqual(day.food,{status:'ready',entries:2});assert.deepEqual(day.training,{status:'ready',hasEntry:true,checkedSets:1,exerciseEntries:0,activityEntries:0});assert.deepEqual(day.water,{status:'ready',totalMl:350});assert.deepEqual(day.weight,{status:'ready',kg:72.35});assert.equal(JSON.stringify(cards),before);
});
test('recent health does not carry weight forward or count blank plans and removed water as progress',()=>{
  const cards=[{id:'food',type:'food',foodEntries:{'2026-11-01':{meals:[],water:{removed:{id:'removed',amountMl:250,drankTime:'',recordedAt:1,removedAt:2}}}}},{id:'gym',type:'fitness',fitnessEntries:{'2026-10-31':{metrics:{weightKg:72}},'2026-11-01':{parts:{running:{active:true,distanceKm:'',durationMinutes:''}}}}}];
  const day=health.recent(cards,'2026-11-01').at(-1);assert.equal(day.food.entries,0);assert.equal(day.training.hasEntry,false);assert.equal(day.water.totalMl,0);assert.equal(day.weight.kg,null);assert.equal(Object.hasOwn(day,'score'),false);
});
test('recent health requires explicit sources and isolates boards conflicts archives and duplicate identities',()=>{
  const first={id:'first',type:'food',foodEntries:{}},second={id:'second',type:'food',foodEntries:{'2026-11-01':{meals:[meal('chosen')]}}},options={boardId:'board',conflicts:[{segments:['boards','board','cards','second','foodEntries']}]};
  assert.equal(health.recent([first,second],'2026-11-01').at(-1).food.status,'choose');assert.equal(health.recent([first,second],'2026-11-01',{food:'second'}).at(-1).food.entries,1);
  assert.equal(health.recent([first,second],'2026-11-01',{food:'second'},options).at(-1).food.status,'review');assert.equal(health.recent([first,second],'2026-11-01',{food:'second'},{...options,boardId:'other'}).at(-1).food.entries,1);
  assert.equal(health.recent([first,second,second],'2026-11-01',{food:'second'}).at(-1).food.status,'review');assert.equal(health.recent([{...second,archivedAt:1}],'2026-11-01').at(-1).food.status,'empty');assert.equal(health.recent([first],'2026-11-01',{food:'second'}).at(-1).food.status,'unavailable');
});
test('recent health flags malformed water and weights without rewriting them or inventing totals',()=>{
  const cards=[{id:'food',type:'food',foodEntries:{'2026-11-01':{meals:[],water:{bad:{id:'bad',amountMl:-1}}}}},{id:'gym',type:'fitness',fitnessEntries:{'2026-11-01':{metrics:{weightKg:'keep original'}}}}],before=JSON.stringify(cards),day=health.recent(cards,'2026-11-01').at(-1);
  assert.deepEqual(day.water,{status:'review'});assert.deepEqual(day.weight,{status:'review'});assert.equal(JSON.stringify(cards),before);assert.deepEqual(health.recent(cards,'2026-02-30'),[]);
});
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
