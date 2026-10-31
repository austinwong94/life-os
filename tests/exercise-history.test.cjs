const {test}=require('node:test'),assert=require('node:assert/strict');
const history=require('../exercise-history.js');
const summary=(extra={})=>({id:'bench',name:'Bench press',sets:3,reps:'8-12',weightKg:12.75,rpe:7,extension:{keep:true},...extra});
function logged(items,extra={}) {
  return summary({...extra,setLog:{version:1,id:'log',createdAt:1,updatedAt:2,rows:items.map((item,index)=>{
    const row={id:'row-'+index,reps:'',weightKg:'',rpe:'',done:false,removedAt:0,history:[],...item};
    if(row.done)row.history=[{id:'event-'+index,action:'completed',at:2,reps:row.reps,weightKg:row.weightKg,rpe:row.rpe}];
    if(row.removedAt)row.history=[{id:'event-'+index,action:'removed',at:row.removedAt,reps:row.reps,weightKg:row.weightKg,rpe:row.rpe}];
    return row;
  })}});
}
const entry=exercises=>({parts:{chest:{active:true,exercises}},notes:'Every original line\nSecond line'});
const card=()=>({id:'gym',type:'fitness',fitnessEntries:{'2026-10-29':entry([summary()]),'2026-10-30':entry([logged([{reps:10,weightKg:15,rpe:7,done:true},{reps:'12',weightKg:'18'},{reps:'9',weightKg:'20',removedAt:3}])]),'2026-10-31':entry([logged([{reps:8,weightKg:20,rpe:'',done:true},{reps:10,weightKg:17.5,rpe:8,done:true}])])}});
const selected={partKey:'chest',name:'bench press'},options={through:'2026-10-31'};
test('exercise choices and history are pure projections of original records and unknown fields',()=>{
  const source=card(),before=JSON.stringify(source);assert.deepEqual(history.choices(source),[{key:'["chest","bench press"]',partKey:'chest',name:'bench press',label:'Bench press'}]);history.history(source,selected,options);assert.equal(JSON.stringify(source),before);
});
test('checked counts exclude summaries, unfinished drafts and removed sets without hiding those rows',()=>{
  const result=history.history(card(),selected,options);assert.equal(result.completedSets,3);assert.equal(result.completedDays,2);assert.deepEqual(result.rows.map(row=>row.mode),['sets','sets','summary']);assert.equal(result.rows[1].sets.length,3);assert.equal(result.rows[1].sets[1].done,false);assert.equal(result.rows[1].sets[2].removedAt,3);assert.deepEqual(result.rows[2].summary,{sets:3,reps:'8-12',weightKg:12.75,rpe:7});
});
test('latest and previous show the last checked set of each dated entry without inventing strength percentages',()=>{
  const result=history.history(card(),selected,options);assert.deepEqual(result.latest.map(row=>[row.date,row.set.weightKg,row.set.reps]),[['2026-10-31',17.5,10],['2026-10-30',15,10]]);assert.equal(Object.hasOwn(result,'percentage'),false);assert.equal(Object.hasOwn(result,'oneRepMax'),false);
});
test('future entries remain visible but never become performed-day comparisons or completed totals',()=>{
  const source=card();source.fitnessEntries['2026-11-02']=entry([logged([{reps:10,weightKg:99,done:true}])]);const result=history.history(source,selected,options);assert.equal(result.rows[0].future,true);assert.equal(result.rows[0].sets[0].weightKg,99);assert.equal(result.completedSets,3);assert.equal(result.latest[0].date,'2026-10-31');
});
test('same-name duplicates and duplicate exercise IDs are explicit ambiguous days, not combined results',()=>{
  const source=card();source.fitnessEntries['2026-10-31'].parts.chest.exercises.push(summary({id:'other',name:' BENCH PRESS '}));source.fitnessEntries['2026-10-30'].parts.chest.exercises.push(summary({name:'Different lift'}));const result=history.history(source,selected,options);assert.equal(result.completedSets,0);assert.deepEqual(result.rows.map(row=>row.mode),['ambiguous','ambiguous','summary']);assert.equal(result.latest.length,0);
});
test('unrecognized logs stay unrecognized instead of being counted through their preserved summaries',()=>{
  const source=card();source.fitnessEntries['2026-10-31'].parts.chest.exercises[0].setLog.version=999;const result=history.history(source,selected,options);assert.equal(result.rows[0].mode,'unrecognized');assert.equal(result.completedSets,1);assert.equal(result.rows[0].sets.length,0);
});
test('unresolved versions pause derived comparisons without hiding the current recorded rows',()=>{
  const result=history.history(card(),selected,{...options,reviewPending:true});assert.equal(result.completedDays,null);assert.equal(result.completedSets,null);assert.equal(result.reviewPending,true);assert.equal(result.rows.length,3);assert.equal(result.latest.length,0);
});
test('names are case-normalized but never guessed across parts or different logs',()=>{
  const source=card();source.fitnessEntries['2026-10-31'].parts.back={active:true,exercises:[summary({name:' BENCH PRESS ',weightKg:80})]};assert.equal(history.choices(source).length,2);assert.equal(history.history(source,{partKey:'back',name:'Bench press'},options).rows.length,1);assert.equal(history.history(source,{partKey:'chest',name:'Bench presses'},options).rows.length,0);const other={...card(),fitnessEntries:{'2026-10-30':entry([summary({weightKg:123})])}};assert.equal(history.history(other,selected,options).rows[0].summary.weightKg,123);assert.equal(history.history(source,selected,options).rows[0].latest.weightKg,17.5);
});
test('all valid dates remain available beyond eight entries; malformed days and inactive parts are excluded',()=>{
  const source=card();source.fitnessEntries=Object.fromEntries(Array.from({length:20},(_,index)=>['2026-10-'+String(index+1).padStart(2,'0'),entry([summary()])]));source.fitnessEntries['2026-02-30']=entry([summary()]);source.fitnessEntries['2026-10-25']={parts:{chest:{active:false,exercises:[summary()]}}};const result=history.history(source,selected,options);assert.equal(result.rows.length,20);assert.equal(result.rows[0].date,'2026-10-20');assert.equal(result.rows.at(-1).date,'2026-10-01');
});
test('empty malformed archived and non-fitness sources cannot crash the history or invent zero-load sets',()=>{
  for(const source of [null,{},[],{type:'diary',fitnessEntries:card().fitnessEntries},{...card(),archivedAt:1},{type:'fitness',fitnessEntries:[]}]){assert.deepEqual(history.choices(source),[]);assert.equal(history.history(source,selected,options).rows.length,0);}
  const source=card();source.fitnessEntries['2026-10-31'].parts.chest.exercises=[null,{},summary({name:'',id:'a'}),summary({id:''})];assert.equal(history.history(source,selected,options).rows[0].mode,'ambiguous');assert.throws(()=>history.history(source,selected,{through:'2026-02-30'}));
});
test('projection values cannot be mutated back into source sets or older summary fields',()=>{
  const source=card(),before=JSON.stringify(source),result=history.history(source,selected,options);result.rows[0].sets[0].weightKg=999;result.latest[0].set.weightKg=999;result.rows[2].summary.sets=999;assert.equal(JSON.stringify(source),before);
});
test('zero external load remains an explicit valid checked measurement, not missing data',()=>{
  const source={id:'gym',type:'fitness',fitnessEntries:{'2026-10-31':entry([logged([{reps:12,weightKg:0,done:true}])])}},result=history.history(source,selected,options);assert.equal(result.completedSets,1);assert.equal(result.latest[0].set.weightKg,0);
});
test('malformed non-scalar summaries are not normalized or exposed as mutable derived values',()=>{
  const source=card();source.fitnessEntries['2026-10-29'].parts.chest.exercises[0].weightKg={future:{keep:true}};const before=JSON.stringify(source),result=history.history(source,selected,options);assert.equal(result.rows.at(-1).mode,'unrecognized');assert.equal(Object.hasOwn(result.rows.at(-1),'summary'),false);assert.equal(JSON.stringify(source),before);
});
