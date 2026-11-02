const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.TEST_APP_SOURCE || 'app.js','utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a);return source.slice(a,b);};
function fixture(){
 const context={createId:()=> 'generated-id',normalizeTimestamp:value=>Number(value)||0,normalizeBoardColumnCount:value=>[2,3].includes(Number(value))?Number(value):3,
  normalizeCard:card=>({...card}),normalizeArchivedCard:card=>({...card}),VISIBILITY_META:{private:{}},LifeStateMerge:{copy:structuredClone},LifeAppearance:{normalize:value=>structuredClone(value)},DEFAULT_FOOD_TARGETS:{calories:2000,protein:100,carbs:250,fat:60,fiber:30}};
 vm.createContext(context);vm.runInContext(section('const FITNESS_PARTS =','\nconst FOOD_MEAL_NAME_PRESETS =')+'\n'+section('function normalizeLabel(','\nfunction normalizeVideoUrl(')+'\n'+section('function normalizeFitnessEntry(','\nfunction getActiveFitnessDate(')+'\n'+section('function normalizeFoodDefinition(','\nfunction createFoodItemSnapshot(')+'\n'+section('function normalizeSideNoteEntry(','\nfunction getActiveSideNoteDate(')+'\n'+section('function createBoardRecord(','\nfunction ensureBoards('),context);return context;
}
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value)),extra={legacy:{text:'Retain this original field',values:[1,false,null]}};
test('board normalization retains unfamiliar saved fields while known fields still normalize',()=>{
 const c=fixture(),original={id:'a',name:'  My board  ',columnCount:9,cards:[],archivedCards:[],customData:extra,createdAt:1,updatedAt:2},before=JSON.stringify(original),next=c.createBoardRecord(original);
 assert.deepEqual(plain(next.customData),extra);assert.equal(next.name,'My board');assert.equal(next.columnCount,3);assert.equal(JSON.stringify(original),before);
});
test('side-note normalization retains saved metadata, indentation and every line without mutating its input',()=>{
 const c=fixture(),original={notes:[{id:'note',text:'  First line\n\tSecond line\n',createdAt:1,updatedAt:2,customData:extra}],updatedAt:2,customData:extra},before=JSON.stringify(original),next=c.normalizeSideNoteEntry(original);
 assert.equal(next.notes[0].text,original.notes[0].text);assert.deepEqual(plain(next.customData),extra);assert.deepEqual(plain(next.notes[0].customData),extra);assert.equal(JSON.stringify(original),before);assert.deepEqual(plain(c.normalizeSideNoteEntry(next)),plain(next));
});
test('fitness normalization retains extensions at every record level and exact multiline notes',()=>{
 const c=fixture(),notes='  Felt stronger.\n\tKeep the next set steady.\n';
 const original={customData:extra,notes,updatedAt:2,metrics:{weightKg:70.25,heightCm:175,customData:extra},parts:{customActivity:{customData:extra},running:{active:true,distanceKm:5,durationMinutes:30,notes,customData:extra},chest:{active:true,notes,customData:extra,exercises:[{id:'press',name:'Press',sets:3,reps:'12',weightKg:12.5,notes,customData:extra}]},mobility:{active:true,notes,customData:extra}}},before=JSON.stringify(original),next=c.normalizeFitnessEntry(original);
 for(const row of [next,next.metrics,next.parts.customActivity,next.parts.running,next.parts.chest,next.parts.chest.exercises[0],next.parts.mobility])assert.deepEqual(plain(row.customData),extra);
 for(const row of [next,next.parts.running,next.parts.chest,next.parts.chest.exercises[0],next.parts.mobility])assert.equal(row.notes,notes);
 assert.equal(next.metrics.weightKg,70.25);assert.equal(next.metrics.bmi,22.9);assert.equal(JSON.stringify(original),before);assert.deepEqual(plain(c.normalizeFitnessEntry(next)),plain(next));
});
test('fitness free-text notes preserve exact whitespace independently of extension metadata',()=>{
 const c=fixture(),notes='  First line\n\tSecond line\n',entry=c.normalizeFitnessEntry({notes,parts:{running:{notes},chest:{notes,exercises:[{id:'exercise',name:'Press',notes}]},mobility:{notes}}});
 for(const row of [entry,entry.parts.running,entry.parts.chest,entry.parts.chest.exercises[0],entry.parts.mobility])assert.equal(row.notes,notes);
});
test('food definitions, monthly targets, entries, meals and historical snapshots retain unknown saved fields',()=>{
 const c=fixture(),food={id:'rice',name:'Rice',servingGrams:100,calories:130,protein:2.7,carbs:28.2,fat:0.3,fiber:0.4,customData:extra};
 const target={calories:2100,customData:extra},entry={updatedAt:2,customData:extra,meals:[{id:'lunch',name:'Lunch',customData:extra,items:[{...food,id:'logged-rice',foodId:'rice',amount:125,unit:'g',customData:extra}]}]},before=JSON.stringify({food,target,entry});
 const definition=c.normalizeFoodDefinition(food),targets=c.normalizeFoodTarget(target),next=c.normalizeFoodEntry(entry);
 for(const row of [definition,targets,next,next.meals[0],next.meals[0].items[0]])assert.deepEqual(plain(row.customData),extra);
 assert.equal(next.meals[0].items[0].calories,130);assert.equal(next.meals[0].items[0].amount,125);assert.equal(targets.calories,2100);assert.equal(JSON.stringify({food,target,entry}),before);assert.deepEqual(plain(c.normalizeFoodEntry(next)),plain(next));
});
test('known health validation remains in effect alongside extension preservation',()=>{
 const c=fixture();assert.equal(c.normalizeFoodDefinition({id:'food',calories:-1}).calories,0);assert.equal(c.normalizeFoodItem({unit:'unknown',amount:-3}).amount,0);assert.equal(c.normalizeFoodItem({unit:'unknown',amount:-3}).unit,'serving');
 assert.equal(c.normalizeFitnessMetrics({weightKg:'70.25',heightCm:'175'}).bmi,22.9);assert.equal(c.normalizeFitnessPart({type:'cardio'},{intensity:'unknown'}).intensity,'Moderate');
 assert.equal(c.normalizeSideNoteEntry({notes:[{text:'  \n\t ',createdAt:1}]}).notes.length,0);
});

test('unrecognized fitness metric values survive repeated normalization at their original keys',()=>{
 const c=fixture();
 for(const value of ['70 kg','  ',true,false,[],[70],{value:70,unit:'kg'},'<img src=x onerror=alert(1)>']){
  const original={weightKg:value,heightCm:175,bmi:'Legacy BMI',energy:value,customData:extra},before=JSON.stringify(original),next=c.normalizeFitnessMetrics(original);
  assert.deepEqual(plain(next.weightKg),value);assert.deepEqual(plain(next.energy),value);assert.equal(next.bmi,'Legacy BMI');
  assert(c.fitnessMetricNeedsReview(value));assert.equal(c.calculateBMI(value,175),'');assert.equal(JSON.stringify(original),before);
  assert.deepEqual(plain(c.normalizeFitnessMetrics(next)),plain(next));assert.deepEqual(plain(next.customData),extra);
 }
});

test('valid numeric metrics retain precision and BMI calculation without coercing objects or booleans',()=>{
 const c=fixture();
 for(const value of [70.25,'70.25',' 70.25 ','7.025e1']){const next=c.normalizeFitnessMetrics({weightKg:value,heightCm:'175'});assert.equal(next.weightKg,70.25);assert.equal(next.bmi,22.9);}
 for(const value of ['',null,undefined]){assert.equal(c.normalizeFitnessMetrics({weightKg:value}).weightKg,'');assert(!c.fitnessMetricNeedsReview(value));}
 assert.equal(c.calculateBMI(70,[175]),'');assert.equal(c.calculateBMI(true,175),'');
 const original={weightKg:70.25,heightCm:175,bmi:{imported:'22.9'}};assert.deepEqual(plain(c.normalizeFitnessMetrics(original).bmi),original.bmi);
});

test('unsupported fitness metrics containers remain at the original key through repeated normalization',()=>{
 const c=fixture();
 for(const metrics of [null,false,true,0,72,'','Imported 72 kg',[],[72,{unit:'kg',notes:'Keep every line\nSecond line'}]]){
  const original={metrics,notes:'  Original session\n\tKeep this line',customData:extra},before=JSON.stringify(original),entry=c.normalizeFitnessEntry(original);
  assert.deepEqual(plain(entry.metrics),metrics);assert.deepEqual(plain(c.normalizeFitnessEntry(entry).metrics),metrics);
  assert.equal(entry.notes,original.notes);assert.deepEqual(plain(entry.customData),extra);assert.equal(JSON.stringify(original),before);
 }
});

test('missing and ordinary named fitness metrics keep the established defaults and calculations',()=>{
 const c=fixture();assert.equal(c.normalizeFitnessEntry({}).metrics.weightKg,'');assert.equal(c.normalizeFitnessEntry({metrics:{}}).metrics.bmi,'');
 const next=c.normalizeFitnessEntry({metrics:{weightKg:'72.25',heightCm:'175',customData:extra}});assert.equal(next.metrics.weightKg,72.25);assert.equal(next.metrics.bmi,23.6);assert.deepEqual(plain(next.metrics.customData),extra);
});
