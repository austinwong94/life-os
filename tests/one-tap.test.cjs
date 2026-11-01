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
