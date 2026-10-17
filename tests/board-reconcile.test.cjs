const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../experimental/board-reconcile.js'),P=require('../planner-store.js');
const clone=value=>JSON.parse(JSON.stringify(value));
function base(){
  const planner={id:'planner',type:'planner'};P.add(planner,'2026-10-15','Original task','task',1000);
  return {boards:[{id:'one',name:'Personal',cards:[{id:'diary',type:'diary',diaryEntries:{'2026-10-16':{thoughts:'Original\nEvery line',sentence:'Original summary'}}},planner],archivedCards:[{id:'archive',text:'Older writing'}]},{id:'two',name:'Work',cards:[{id:'diary',type:'sidenote',text:'Independent notes'}],archivedCards:[]}],deletedBoardIds:{},updatedAt:1,updatedBy:'base',hasUserChanges:false,unknown:{keep:[null,false,0,''],settings:{one:1,two:2}}};
}
test('different-board diary and task updates reuse the existing merger without losing unrelated or unknown records',()=>{
  const b=base(),l=clone(b),r=clone(b),before=clone(b);l.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts+='\nMy full new writing';r.boards[1].cards[0].text='Other board updated';
  const result=R.plan(b,l,r);assert.deepEqual(result.conflicts,[]);assert.deepEqual(result.state.boards,[l.boards[0],r.boards[1]]);assert.deepEqual(result.state.unknown,b.unknown);assert.deepEqual(b,before);assert.deepEqual(l.boards[1],b.boards[1]);result.state.boards=[];assert.deepEqual(r.boards[0],b.boards[0]);
});
test('different fields and different task identities can merge on the same board without replacing text',()=>{
  const b=base(),l=clone(b),r=clone(b);l.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts='Local whole diary';r.boards[0].cards[0].diaryEntries['2026-10-16'].sentence='Remote summary';P.add(l.boards[0].cards[1],'2026-10-16','Local new task','local',2000);P.add(r.boards[0].cards[1],'2026-10-16','Remote new task','remote',3000);
  const result=R.plan(b,l,r);assert.equal(result.conflicts.length,0);assert.deepEqual(result.state.boards[0].cards[0].diaryEntries['2026-10-16'],{thoughts:'Local whole diary',sentence:'Remote summary'});assert.deepEqual(new Set(result.state.boards[0].cards[1].plannerTasks.map(t=>t.id)),new Set(['task','local','remote']));
});
test('same diary field retains both complete versions instead of selecting the newest timestamp',()=>{
  const b=base(),l=clone(b),r=clone(b);l.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts='Local\nEvery character';r.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts='Remote\nEvery character';l.updatedAt=100;r.updatedAt=200;
  const result=R.plan(b,l,r);assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].local,'Local\nEvery character');assert.equal(result.conflicts[0].remote,'Remote\nEvery character');assert.equal(result.state.updatedAt,200);
});
test('planner archive versus stale rename or completion remains a whole-task comparison',()=>{
  const b=base(),l=clone(b),r=clone(b);P.change(l.boards[0].cards[1],'task',{archivedAt:2000},2000);P.change(r.boards[0].cards[1],'task',{title:'Stale rename'},3000);P.complete(r.boards[0].cards[1],'task','2026-10-16',3000);
  const result=R.plan(b,l,r),conflict=result.conflicts.find(c=>c.kind==='planner-task');assert(conflict);assert.equal(conflict.local.archivedAt,2000);assert.equal(conflict.remote.done,true);assert.equal(conflict.remote.title,'Stale rename');
});
test('unknown root settings merge conservatively with missing and null represented separately',()=>{
  const b=base(),l=clone(b),r=clone(b);l.unknown.settings.one=3;r.unknown.settings.two=4;l.unknown.local='New';r.unknown.remote='Other';
  const result=R.plan(b,l,r);assert.deepEqual(result.conflicts,[]);assert.deepEqual(result.state.unknown,{keep:[null,false,0,''],settings:{one:3,two:4},local:'New',remote:'Other'});
  delete l.unknown.keep;r.unknown.keep=null;const conflict=R.plan(b,l,r).conflicts.find(c=>c.kind==='workspace-field');assert.deepEqual(conflict.local,{present:false});assert.deepEqual(conflict.remote,{present:true,value:null});
});
test('root metadata keeps explicit types and cannot silently swallow unrecognised concurrent changes',()=>{
  const b=base(),l=clone(b),r=clone(b);l.updatedAt=2;r.updatedAt=3;l.updatedBy='local';r.updatedBy='remote';l.hasUserChanges=true;r.hasUserChanges=true;const result=R.plan(b,l,r);assert.equal(result.conflicts.length,0);assert.equal(result.state.updatedAt,3);assert.equal(result.state.updatedBy,'local');assert.equal(result.state.hasUserChanges,true);
  l.updatedAt='private text';assert(R.plan(b,l,r).conflicts.some(c=>c.kind==='workspace-field' && c.segments[0]==='updatedAt'));
});
test('deleting a board cannot silently hide another writer editing that board',()=>{
  const b=base(),l=clone(b),r=clone(b);l.boards.splice(1,1);l.deletedBoardIds.two=10;r.boards[1].cards[0].text='A new note that must survive';const result=R.plan(b,l,r),conflict=result.conflicts.find(c=>c.kind==='board-lifecycle');assert(conflict);assert.equal(conflict.local.present,false);assert.equal(conflict.remote.value.cards[0].text,'A new note that must survive');
  const unchanged=R.plan(b,l,b);assert.equal(unchanged.conflicts.length,0);assert.deepEqual(unchanged.state.boards.map(b=>b.id),['one']);
});
test('new board ID collisions and ambiguous existing identities require review',()=>{
  const b=base(),l=clone(b),r=clone(b);l.boards.push({id:'new',name:'Local',cards:[]});r.boards.push({id:'new',name:'Remote',cards:[]});assert(R.plan(b,l,r).conflicts.some(c=>c.kind==='board-identity'));
  for(const edit of [v=>v.boards.push(clone(v.boards[0])),v=>v.boards[0].cards.push(clone(v.boards[0].cards[0])),v=>v.boards[0].archivedCards.push(clone(v.boards[0].cards[0])),v=>v.deletedBoardIds.one=10,v=>v.boards[0].cards[0].id='']){const invalid=base();edit(invalid);assert.throws(()=>R.plan(b,invalid,b),{name:'DeltaReconcileReviewError'});}
});
test('unsafe board properties refuse review while inert unknown root keys remain exact JSON data',()=>{
  const b=base(),l=clone(b),r=clone(b);l.boards[0].unknown=JSON.parse('{"__proto__":{"private":"Kept"}}');assert.throws(()=>R.plan(b,l,r),{name:'DeltaReconcileReviewError'});
  const rootBase=JSON.parse('{"boards":[],"__proto__":{"left":1,"right":2},"constructor":"Original"}'),left=clone(rootBase),right=clone(rootBase);left.__proto__.left=3;right.__proto__.right=4;const result=R.plan(rootBase,left,right);assert.equal(result.conflicts.length,0);assert.deepEqual(JSON.parse(JSON.stringify(result.state)),JSON.parse('{"boards":[],"__proto__":{"left":3,"right":4},"constructor":"Original"}'));assert.equal(Object.getPrototypeOf(result.state),Object.prototype);assert.equal({}.private,undefined);
});
function project(value,id){const b=value.boards.find(b=>b.id===id);value.activeBoardId=id;value.board={name:b.name};value.cards=clone(b.cards);value.archivedCards=clone(b.archivedCards);return value;}
test('active-board compatibility copies are validated and rebuilt for the local view after canonical merging',()=>{
  const b=project(base(),'one'),l=clone(b),r=project(clone(b),'two');l.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts='Local full writing';project(l,'one');r.boards[1].cards[0].text='Other board note';project(r,'two');const result=R.plan(b,l,r);assert.equal(result.conflicts.length,0);assert.equal(result.state.activeBoardId,'one');assert.deepEqual(result.state.cards,result.state.boards[0].cards);assert.deepEqual(result.state.archivedCards,b.archivedCards);assert.equal(result.state.boards[1].cards[0].text,'Other board note');
  l.cards[0].diaryEntries['2026-10-16'].thoughts='Uncaptured projection';assert.throws(()=>R.plan(b,l,r),{name:'DeltaReconcileReviewError'});
});
test('missing or partial projections and removal of the local active board never select an arbitrary replacement',()=>{
  const b=project(base(),'one'),l=clone(b),r=project(clone(b),'two');r.boards.splice(0,1);r.deletedBoardIds.one=10;assert(R.plan(b,l,r).conflicts.some(c=>c.kind==='active-board-removed'));
  delete l.archivedCards;assert.throws(()=>R.plan(b,l,b),{name:'DeltaReconcileReviewError'});assert.throws(()=>R.plan(base(),base(),b),{name:'DeltaReconcileReviewError'});
});
test('the reconciliation adapter and incremental store stay outside the public release manifest',()=>{
  const manifest=require('../release-files.json');assert(!manifest.some(file=>file.startsWith('experimental/')));
});
test('valid board IDs matching inherited properties remain intact through independent edits',()=>{
  const b=base();b.boards[0].id='toString';b.boards[1].id='hasOwnProperty';const l=clone(b),r=clone(b);l.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts='Local writing';r.boards[1].cards[0].text='Other board writing';const result=R.plan(b,l,r);assert.equal(result.conflicts.length,0);assert.deepEqual(result.state.boards.map(b=>b.id),['toString','hasOwnProperty']);assert.deepEqual(result.state.boards,[l.boards[0],r.boards[1]]);
});
