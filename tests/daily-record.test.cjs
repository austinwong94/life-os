const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const planner=require('../planner-store.js'),merge=require('../state-merge.js');
const source=fs.readFileSync('daily-workspace.js','utf8'),from=source.indexOf('function saveDailyRecord('),to=source.indexOf('\nfunction dailySection(',from);
assert(from>=0 && to>from);
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const entry=(id='old',recordedAt=80)=>({id,kind:'review',date:'2026-11-09',recordedAt,mattered:'Every original word\nSecond line',custom:{keep:true}});
const store=(records=[entry()])=>({id:'daily-workspace-board-a',type:'single',dailyWorkspaceStore:true,title:'Original history',workspaceRecords:records,custom:{keep:'Store metadata'}});
function fixture({archive=[],saved=true,id='new',now=100,onSave}={}){
 const state={activeBoardId:'board-a',cards:[{id:'diary',type:'diary',thoughts:'Keep this diary.'}],archivedCards:copy(archive),custom:{keep:'Root metadata'}},calls=[];
 const context={state,LifeStateMerge:merge,LifePlanner:planner,getArchivedCards:()=>Array.isArray(state.archivedCards)?state.archivedCards:[],createId:()=>id,Date:class extends Date{static now(){return now;}},syncActiveBoard:options=>calls.push(['sync',copy(options)]),saveState:()=>{calls.push(['save']);if(onSave)return onSave(state);return saved;}};
 vm.createContext(context);vm.runInContext(source.slice(from,to),context);const message={textContent:''};
 return {state,calls,message,save:fields=>context.saveDailyRecord(fields,message),context};
}
const fields=()=>({kind:'review',date:'2026-11-09',mattered:'A full new reflection\nAll words stay.',easier:'One smaller step',custom:{values:['Keep this unknown field']}});
test('failed first daily save leaves no empty history card and retains the original archive identity',()=>{
 const f=fixture({archive:[{id:'original',type:'quote',text:'Keep this motivation',custom:{original:true}}],saved:false}),before=copy(f.state),archive=f.state.archivedCards;
 assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.equal(f.state.archivedCards,archive);assert.match(f.message.textContent,/Not saved/);
});
for(const owned of [true,false])test('failed first save restores '+(owned?'owned undefined':'absent')+' archive field without adding one',()=>{
 const f=fixture({saved:false});if(owned)f.state.archivedCards=undefined;else delete f.state.archivedCards;const before=Object.hasOwn(f.state,'archivedCards');
 assert.equal(f.save(fields()),false);assert.equal(Object.hasOwn(f.state,'archivedCards'),before);assert.equal(f.state.archivedCards,undefined);
});
test('record identity collision refuses staging instead of deleting the existing entry during rollback',()=>{
 const f=fixture({archive:[store()],saved:false,id:'old'}),before=copy(f.state);
 assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
});
test('record identity collision is checked against every daily history container',()=>{
 const other={...store([entry('other-record')]),id:'other-history'},f=fixture({archive:[store(),other],id:'other-record'}),before=copy(f.state);
 assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
});
test('new history card identity cannot collide with an unrelated archived or visible card',()=>{
 for(const visible of [false,true]){const original={id:'daily-workspace-board-a',type:'quote',text:'The original card stays.'},f=fixture({archive:visible?[]:[original]});if(visible)f.state.cards.push(original);const before=copy(f.state);assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);}
});
test('duplicate target card identities are preserved and refused before staging',()=>{
 const f=fixture({archive:[store(),{id:'daily-workspace-board-a',type:'quote',text:'An unrelated duplicate stays.'}]}),before=copy(f.state);
 assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
});
test('successful record creation deep-copies nested fields so later draft edits cannot rewrite history',()=>{
 const f=fixture({archive:[store()]}),input=fields(),original=copy(f.state.archivedCards[0].workspaceRecords[0]);
 assert.equal(f.save(input),true);const record=copy(f.state.archivedCards[0].workspaceRecords[1]);input.custom.values.push('A later edit');input.mattered='Do not rewrite the saved version';assert.deepEqual(copy(f.state.archivedCards[0].workspaceRecords[1]),record);assert.deepEqual(f.state.archivedCards[0].workspaceRecords[0],original);
 assert.equal(record.id,'new');assert.equal(record.recordedAt,100);assert.deepEqual(record.custom,{values:['Keep this unknown field']});
});
test('existing history rollback removes only the proposed entry without replacing older records or metadata',()=>{
 const f=fixture({archive:[store()],saved:false}),before=copy(f.state),archive=f.state.archivedCards,history=f.state.archivedCards[0].workspaceRecords,original=history[0];
 assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.equal(f.state.archivedCards,archive);assert.equal(history[0],original);
});
test('rollback retains a different entry added during a rejected save',()=>{
 const later=entry('independent',120),f=fixture({archive:[store()],onSave(state){state.archivedCards[0].workspaceRecords.push(later);state.archivedCards[0].custom.later='Keep this too';return false;}});
 assert.equal(f.save(fields()),false);assert.deepEqual(f.state.archivedCards[0].workspaceRecords.map(r=>r.id),['old','independent']);assert.equal(f.state.archivedCards[0].custom.later,'Keep this too');
});
test('rollback never deletes a proposed entry that changed before rejection',()=>{
 const f=fixture({archive:[store()],onSave(state){state.archivedCards[0].workspaceRecords.at(-1).mattered='A different later version';return false;}});
 assert.equal(f.save(fields()),false);assert.equal(f.state.archivedCards[0].workspaceRecords.length,2);assert.equal(f.state.archivedCards[0].workspaceRecords.at(-1).mattered,'A different later version');
});
test('a new history card with later metadata is kept instead of discarding that metadata during rollback',()=>{
 const f=fixture({onSave(state){state.archivedCards.at(-1).custom={later:'Keep this metadata'};return false;}});
 assert.equal(f.save(fields()),false);assert.equal(f.state.archivedCards.length,1);assert.deepEqual(copy(f.state.archivedCards[0].workspaceRecords),[]);assert.deepEqual(f.state.archivedCards[0].custom,{later:'Keep this metadata'});
});
test('failed first save preserves another archive card appended during staging',()=>{
 const later={id:'later-card',type:'sidenote',custom:{keep:true}},f=fixture({onSave(state){state.archivedCards.push(later);return false;}});
 assert.equal(f.save(fields()),false);assert.deepEqual(copy(f.state.archivedCards),[later]);
});
test('a changed board during rejection cannot roll back or synchronize the other board',()=>{
 const other=[{id:'other-card',type:'quote',text:'Independent board'}],f=fixture({onSave(state){state.activeBoardId='board-b';state.archivedCards=other;return false;}});
 assert.doesNotThrow(()=>assert.equal(f.save(fields()),false));assert.equal(f.state.archivedCards,other);assert(!f.calls.some(c=>c[0]==='sync'));
});
test('successful creation keeps a clock ahead of every previous entry without a spread-argument limit',()=>{
 const records=Array.from({length:200000},(_,i)=>({id:'old-'+i,recordedAt:i+1000})),f=fixture({archive:[store(records)]});
 assert.doesNotThrow(()=>assert.equal(f.save(fields()),true));assert.equal(f.state.archivedCards[0].workspaceRecords.at(-1).recordedAt,201000);
});
for(const malformed of [null,{},'original history', [{id:'bad-clock',recordedAt:'100'}]])test('unsupported history is kept unchanged: '+JSON.stringify(malformed),()=>{
 const f=fixture({archive:[store(malformed)]}),before=copy(f.state);assert.doesNotThrow(()=>assert.equal(f.save(fields()),false));assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
});
test('unsupported archive and invalid generated identities are refused without altering either source',()=>{
 for(const value of [null,{legacy:'Keep this original archive'}]){const f=fixture();f.state.archivedCards=value;const before=copy(f.state);assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);}
 for(const id of ['',null,123]){const f=fixture({id}),before=copy(f.state);assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);}
});
test('unconfirmed exceptional save restores the original archive and retains the full input without a phantom saved entry',()=>{
 const f=fixture({onSave(){throw Error('Synthetic sensitive failure detail');}}),input=fields(),before=copy(f.state),draft=copy(input);assert.doesNotThrow(()=>assert.equal(f.save(input),false));assert.deepEqual(f.state,before);assert.deepEqual(input,draft);assert.match(f.message.textContent,/not confirmed/i);assert.doesNotMatch(f.message.textContent,/sensitive failure/);
});
test('invalid clocks or fields cannot create partial history containers',()=>{
 for(const now of [NaN,Infinity,-1,0.5,8640000000000001]){const f=fixture({now}),before=copy(f.state);assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);}
 for(const input of [null,[],{}, {...fields(),date:'2026-02-30'}, {...fields(),kind:''}]){const f=fixture(),before=copy(f.state);assert.equal(f.save(input),false);assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);}
});
test('non-serializable input is rejected before mutating any existing records',()=>{
 const f=fixture({archive:[store()]}),before=copy(f.state),input=fields();input.custom.circular=input;assert.doesNotThrow(()=>assert.equal(f.save(input),false));assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
});
test('distinct valid history containers keep their metadata and share a monotonic clock without being consolidated',()=>{
 const second={...store([entry('second',5000)]),id:'legacy-second-store',custom:{original:'Keep this container'}},f=fixture({archive:[store(),second]}),before=copy(f.state.archivedCards[1]);assert.equal(f.save(fields()),true);assert.equal(f.state.archivedCards[0].workspaceRecords.at(-1).recordedAt,5001);assert.deepEqual(f.state.archivedCards[1],before);assert.equal(f.state.archivedCards.length,2);
});
test('copied earlier versions receive a fresh identity without overwriting either supplied identity or metadata',()=>{
 const f=fixture({archive:[store()]}),input=entry(),before=copy(input);assert.equal(f.save(input),true);assert.deepEqual(input,before);assert.deepEqual(f.state.archivedCards[0].workspaceRecords.map(r=>r.id),['old','new']);assert.equal(f.state.archivedCards[0].workspaceRecords[1].recordedAt,100);assert.deepEqual(f.state.archivedCards[0].workspaceRecords[1].custom,{keep:true});
});
test('rejection after a cloned archive removes only the unchanged proposal and retains all original values',()=>{
 const f=fixture({archive:[store()],onSave(state){state.archivedCards=copy(state.archivedCards);return false;}}),before=copy(f.state);assert.equal(f.save(fields()),false);assert.deepEqual(f.state,before);
});
test('ambiguous post-stage copies are kept rather than deleting every entry with their shared identity',()=>{
 const f=fixture({archive:[store()],onSave(state){state.archivedCards[0].workspaceRecords.push({...copy(state.archivedCards[0].workspaceRecords.at(-1)),custom:{later:'Keep this alternate'}});return false;}});assert.equal(f.save(fields()),false);assert.equal(f.state.archivedCards[0].workspaceRecords.length,3);assert.equal(f.state.archivedCards[0].workspaceRecords[0].id,'old');assert.equal(f.state.archivedCards[0].workspaceRecords.at(-1).custom.later,'Keep this alternate');
});
test('an unavailable identity provider rejects before changing any records or exposing its error',()=>{
 const f=fixture({archive:[store()]}),before=copy(f.state);f.context.createId=()=>{throw Error('Synthetic sensitive identity detail');};assert.doesNotThrow(()=>assert.equal(f.save(fields()),false));assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);assert.doesNotMatch(f.message.textContent,/sensitive identity/);
});
test('a missing original board identity cannot create an unowned history container',()=>{
 for(const id of ['',null,undefined]){const f=fixture();f.state.activeBoardId=id;const archive=f.state.archivedCards;assert.equal(f.save(fields()),false);assert.equal(f.state.archivedCards,archive);assert.equal(f.state.archivedCards.length,0);assert.deepEqual(f.calls,[]);}
});
test('malformed or duplicated original entries are retained instead of normalized into a different history',()=>{
 const disguised=[];disguised.id='array-record';disguised.recordedAt=80;
 for(const records of [[null],[disguised],[{id:' ',recordedAt:80}],[entry('same'),entry('same')],...[NaN,Infinity,-1,0.5,8640000000000000].map(at=>[{id:'bad-time',recordedAt:at}])]){
  const f=fixture({archive:[store()]});f.state.archivedCards[0].workspaceRecords=records;const before=copy(f.state);assert.equal(f.save(fields()),false);assert.deepEqual(copy(f.state),before);assert.equal(f.state.archivedCards[0].workspaceRecords,records);assert.deepEqual(f.calls,[]);
 }
});
