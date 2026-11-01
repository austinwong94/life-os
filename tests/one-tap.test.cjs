const test=require('node:test'),assert=require('node:assert/strict'),T=require('../one-tap.js'),M=require('../state-merge.js');
const today='2026-11-01',at=Date.parse('2026-11-01T04:00:00Z');
const event=(id,kind='mood',data={value:'Calm'},date=today,recordedDay=today)=>({version:1,id,kind,date,recordedDay,recordedAt:at,data});
const add=(store,e)=>T.record(store,e,{today});
test('opening and summarizing an absent experiment never initializes or mutates stored data',()=>{
  const original={cards:[{id:'diary',thoughts:'Every word\nSecond line'}]};assert.equal(T.summary(original.oneTapExperiment,today).facts.length,0);assert.deepEqual(T.inspect(),{version:1,events:{}});assert(!Object.hasOwn(original,'oneTapExperiment'));
});
test('a tap is immutable retains extensions and the same identity is idempotent',()=>{
  const original={version:1,events:{},extension:{keep:'exactly'}},e={...event('mood'),extension:{keep:true}},next=add(original,e);assert.deepEqual(original.events,{});assert.deepEqual(next.extension,original.extension);assert.deepEqual(next.events.mood,e);assert.deepEqual(add(next,JSON.parse(JSON.stringify(e))),next);assert.throws(()=>add(next,{...e,data:{value:'Sad'}}),/identity/);assert.equal(next.events.mood.data.value,'Calm');
});
test('unknown malformed unsafe or future records refuse without replacing their original bytes',()=>{
  for(const value of [{version:99,events:{}},{version:1,events:[]},{version:1,events:{x:event('other')}},{version:1,events:{x:event('x','unknown',{})}},JSON.parse('{"version":1,"events":{},"__proto__":{}}')]){const before=JSON.stringify(value);assert.throws(()=>add(value,event('new')));assert.equal(JSON.stringify(value),before);}
  for(const e of [event('__proto__'),event('x','water',{ml:0}),event('x','food',{name:'Egg',amount:1,unit:'unknown'}),event('x','mood',{value:'Perfect'}),event('x','movement',{value:'Invented'}),event('x','step',{value:'Completed all my tasks'}),event('x','water',{ml:Infinity}),event('x','mood',{value:'Calm'},'2026-11-02'),event('x','mood',{value:'Calm'},today,'2026-11-02')])assert.throws(()=>add(undefined,e));
});
test('an earlier captured pending tap can retry unchanged after midnight without changing its actual timestamp',()=>{
  const e=event('pending');const next=T.record(undefined,e,{today:'2026-11-02'});assert.deepEqual(next.events.pending,e);assert.equal(T.summary(next,today).mood,'Calm');
});
test('undo appends a correction preserves complete original entries and removes linked notes from the active view',()=>{
  let store=add(undefined,event('first'));store=add(store,event('note','note',{targetId:'first',text:'All original text\nAnother line',time:'09:25'}));const original=T.copy(store.events);store=add(store,event('undo','undo',{targetId:'first'}));assert.deepEqual(store.events.first,original.first);assert.deepEqual(store.events.note,original.note);assert.equal(T.summary(store,today).facts.length,0);assert.equal(T.active(store).length,0);assert.equal(T.sorted(store).length,3);assert.throws(()=>add(store,event('again','undo',{targetId:'first'})),/changed or was undone/);
});
test('cross-day missing and undo-of-undo references cannot remove another record',()=>{
  const base=add(undefined,event('first'));for(const e of [event('x','undo',{targetId:'missing'}),event('x','undo',{targetId:'first'},'2026-10-31'),event('x','note',{targetId:'first',text:'Thought',time:''},'2026-10-31')])assert.throws(()=>add(base,e));
  const next=add(base,event('undo','undo',{targetId:'first'}));assert.throws(()=>add(next,event('again','undo',{targetId:'undo'})));assert.deepEqual(base.events.first,event('first'));
});
test('independent concurrent undo corrections remain valid without reviving an entry',()=>{
  const base=add(undefined,event('first')),local=add(base,event('undo-a','undo',{targetId:'first'})),remote=add(base,event('undo-b','undo',{targetId:'first'}));const wrap=s=>({boards:[{id:'one',cards:[],oneTapExperiment:s}]});const merged=M.merge(wrap(base),wrap(local),wrap(remote));assert.equal(merged.conflicts.length,0);const experiment=merged.boards[0].oneTapExperiment;assert.equal(Object.keys(experiment.events).length,3);assert.equal(T.summary(experiment,today).facts.length,0);
});
test('one-off food quantities are explicit snapshots and never calculated as calories or nutrition targets',()=>{
  const choices=T.foods(),egg=choices.find(f=>f.id==='egg-2'),protein=choices.find(f=>f.id==='protein-1');let store=add(undefined,event('egg','food',{name:egg.name,amount:egg.amount,unit:egg.unit}));store=add(store,event('shake','food',{name:protein.name,amount:protein.amount,unit:protein.unit}));choices[0].amount=999;assert.equal(T.foods()[0].amount,1);const summary=T.summary(store,today);assert.equal(summary.foodEntries,2);assert.equal(summary.rows[1].data.unit,'scoop');assert(!Object.hasOwn(summary,'calories'));assert(!Object.hasOwn(summary,'protein'));
});
test('custom shortcuts and preferences do not count as consumption or completed actions',()=>{
  let store=add(undefined,event('custom','shortcut',{name:'My labelled powder',amount:37,unit:'g'}));store=add(store,event('pref','preference',{key:'guided',value:false}));const summary=T.summary(store,today);assert.equal(summary.foodEntries,0);assert.equal(summary.guided,false);assert.equal(summary.shortcuts[0].amount,37);assert.equal(T.progress(store,today).milestone,0);
});
test('water adds only recorded volume and repeated taps cannot farm category progress',()=>{
  let store;for(let i=0;i<8;i++)store=add(store,{...event('water-'+i,'water',{ml:250}),recordedAt:at+i});const summary=T.summary(store,today);assert.equal(summary.waterMl,2000);assert.deepEqual(summary.areas,['water']);assert.equal(T.progress(store,today).recordedDays,1);assert.equal(T.progress(store,today).milestone,1);
});
test('backfilling many days today counts as one day of using the experiment rather than fabricated adherence',()=>{
  let store;for(let i=1;i<=14;i++)store=add(store,event('past-'+i,'mood',{value:'Meh'},'2026-10-'+String(i).padStart(2,'0')));assert.equal(T.progress(store,today).recordedDays,1);assert.equal(T.progress(store,today).milestone,1);assert.equal(T.summary(store,'2026-10-01').mood,'Meh');
});
test('recording milestones do not reset after a gap and do not award better feelings more points',()=>{
  let store;for(const [i,date]of ['2026-10-01','2026-10-15',today].entries())store=T.record(store,event('d'+i,'mood',{value:i?'Sad':'Happy'},date,date),{today});assert.equal(T.progress(store,today).milestone,3);assert.equal(T.progress(store,today).weekDays,1);assert.equal(T.summary(store,today).mood,'Sad');
});
test('multiline thoughts and optional actual times are retained exactly without inventing a time',()=>{
  const body='A full thought <script>not code</script>\nEvery character remains.';let store=add(undefined,event('reflection','note',{targetId:'',text:body,time:''}));assert.equal(T.summary(store,today).rows[0].data.text,body);assert.equal(T.summary(store,today).facts.length,0);assert.throws(()=>add(store,event('bad','note',{targetId:'',text:'',time:'09:00'})));store=add(store,event('water','water',{ml:250}));store=add(store,event('time','note',{targetId:'water',text:'',time:'09:15'}));assert.equal(T.summary(store,today).rows.find(e=>e.id==='time').data.time,'09:15');
});
test('different moods retain their complete chronology while the current feeling uses the latest timestamp',()=>{
  let store=add(undefined,event('first','mood',{value:'Calm'}));store=add(store,{...event('second','mood',{value:'Meh'}),recordedAt:at+1});assert.equal(T.summary(store,today).mood,'Meh');store=add(store,event('undo','undo',{targetId:'second'}));assert.equal(T.summary(store,today).mood,'Calm');assert.equal(T.sorted(store).length,3);
});
test('same-board independent events merge without changing diary tasks money or another board',()=>{
  const base={boards:[{id:'one',cards:[{id:'diary',diaryEntries:{day:{thoughts:'Original full text'}}}],money:{original:true}},{id:'two',cards:[{id:'task',done:false}]}]},local=T.copy(base),remote=T.copy(base);local.boards[0].oneTapExperiment=add(undefined,event('water','water',{ml:350}));remote.boards[0].oneTapExperiment=add(undefined,event('mood'));remote.boards[1].cards[0].name='A newer real task name';const merged=M.merge(base,local,remote);assert.equal(merged.conflicts.length,0);assert.equal(T.summary(merged.boards[0].oneTapExperiment,today).waterMl,350);assert.equal(T.summary(merged.boards[0].oneTapExperiment,today).mood,'Calm');assert.deepEqual(merged.boards[0].cards,base.boards[0].cards);assert.deepEqual(merged.boards[0].money,base.boards[0].money);assert.equal(merged.boards[1].cards[0].name,'A newer real task name');
});
test('contradictory copies of one event are atomic and retained instead of combining different quantities and labels',()=>{
  const base={boards:[{id:'one',cards:[]}]},local=T.copy(base),remote=T.copy(base);local.boards[0].oneTapExperiment=add(undefined,event('same','food',{name:'Egg',amount:2,unit:'egg'}));remote.boards[0].oneTapExperiment=add(undefined,event('same','food',{name:'Rice',amount:100,unit:'g'}));const merged=M.merge(base,local,remote);assert.equal(merged.conflicts.length,1);assert.equal(merged.conflicts[0].kind,'one-tap-event');assert.deepEqual(merged.conflicts[0].local,local.boards[0].oneTapExperiment.events.same);assert.deepEqual(merged.conflicts[0].remote,remote.boards[0].oneTapExperiment.events.same);assert.deepEqual(merged.boards[0].oneTapExperiment.events.same,local.boards[0].oneTapExperiment.events.same);
});
test('observed capture sequence orders same-millisecond taps without inventing a later timestamp',()=>{
  let store=add(undefined,{...event('z','mood',{value:'Happy'}),sequence:1});store=add(store,{...event('a','mood',{value:'Calm'}),sequence:2});assert.equal(T.summary(store,today).mood,'Calm');assert.equal(store.events.a.recordedAt,store.events.z.recordedAt);for(const sequence of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>add(store,{...event('bad'),sequence}));
});
test('portion presets are editable quantities not nutrition conversions and never share mutable arrays',()=>{
  assert.deepEqual(T.portions('egg'),[1,2,3]);assert.deepEqual(T.portions('scoop'),[1,2,3]);assert.deepEqual(T.portions('g'),[50,100,150,200]);assert.deepEqual(T.portions('unknown'),[]);const p=T.portions('egg');p[0]=99;assert.deepEqual(T.portions('egg'),[1,2,3]);
});
test('recent water amounts preserve exact decimals, deduplicate choices only, and never mutate the journal',()=>{
  assert.deepEqual(T.recentWater(undefined,today),[]);let store;
  for(const [i,ml]of [750,125.5,750,250].entries())store=add(store,{...event('w'+i,'water',{ml}),sequence:i+1});
  const before=JSON.stringify(store),recent=T.recentWater(store,today);assert.deepEqual(recent,[250,750,125.5]);recent.push(999);assert.equal(JSON.stringify(store),before);assert.equal(T.summary(store,today).waterMl,1875.5);assert.equal(Object.keys(store.events).length,4);
});
test('recent water excludes later selected dates and undone records while retaining earlier matching amounts',()=>{
  let store=add(undefined,{...event('past','water',{ml:750},'2026-10-31'),sequence:1});store=add(store,{...event('repeat','water',{ml:750}),sequence:2});store=add(store,{...event('other','water',{ml:200}),sequence:3});store=add(store,{...event('undo','undo',{targetId:'repeat'}),sequence:4});
  assert.deepEqual(T.recentWater(store,today),[200,750]);assert.deepEqual(T.recentWater(store,'2026-10-31'),[750]);store=add(store,{...event('undo-past','undo',{targetId:'past'},'2026-10-31'),sequence:5});assert.deepEqual(T.recentWater(store,'2026-10-31'),[]);assert.equal(Object.keys(store.events).length,5);
});
test('invalid water history or comparison dates fail closed without replacing originals',()=>{
  const bad={version:99,events:{original:'Keep me'}};assert.throws(()=>T.recentWater(bad,today));assert.deepEqual(bad,{version:99,events:{original:'Keep me'}});assert.throws(()=>T.recentWater(undefined,'invalid'));
});
test('recent food portions preserve exact names units and decimals without nutrition or invented defaults',()=>{
  assert.deepEqual(T.recentFoods(undefined,today),[]);let store;for(const [i,p]of [{name:'Labelled powder',amount:1.5,unit:'scoop'},{name:'Labelled powder',amount:37.25,unit:'g'},{name:'Another brand',amount:1.5,unit:'scoop'}].entries())store=add(store,{...event('f'+i,'food',p),sequence:i+1});const before=JSON.stringify(store),recent=T.recentFoods(store,today);assert.deepEqual(recent.map(p=>[p.name,p.amount,p.unit]),[['Another brand',1.5,'scoop'],['Labelled powder',37.25,'g'],['Labelled powder',1.5,'scoop']]);recent[0].amount=99;assert.equal(JSON.stringify(store),before);assert(!Object.hasOwn(T.recentFoods(store,today)[0],'protein'));
});
test('recent portions deduplicate only exact snapshots and Undo can reveal an earlier matching portion',()=>{
  const food={name:'My eggs',amount:3,unit:'egg'};let store=add(undefined,{...event('first','food',food),sequence:1});store=add(store,{...event('other','food',{...food,amount:2}),sequence:2});store=add(store,{...event('repeat','food',food),sequence:3});assert.deepEqual(T.recentFoods(store,today).map(p=>p.amount),[3,2]);store=add(store,{...event('undo','undo',{targetId:'repeat'}),sequence:4});assert.deepEqual(T.recentFoods(store,today).map(p=>p.amount),[2,3]);assert.equal(Object.keys(store.events).length,4);
});
test('recent portions exclude later-day and undone foods as well as shortcut-only records',()=>{
  let store=add(undefined,event('old','food',{name:'Past meal',amount:150,unit:'g'},'2026-10-31'));store=add(store,event('today','food',{name:'Today meal',amount:200,unit:'g'}));store=add(store,event('pin','shortcut',{name:'Shortcut not eaten',amount:2,unit:'egg'}));assert.deepEqual(T.recentFoods(store,'2026-10-31'),[{name:'Past meal',amount:150,unit:'g'}]);store=add(store,event('undo','undo',{targetId:'old'},'2026-10-31'));assert.deepEqual(T.recentFoods(store,'2026-10-31'),[]);assert.throws(()=>T.recentFoods(store,'invalid'));const bad={version:99,events:{}};assert.throws(()=>T.recentFoods(bad,today));assert.deepEqual(bad,{version:99,events:{}});
});
