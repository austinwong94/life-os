const test=require('node:test'),assert=require('node:assert/strict'),merge=require('../state-merge.js');
const reorder=value=>Array.isArray(value)?value.map(reorder):value && typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorder(value[key])])):value;
const base={boards:[{id:'home',cards:[{id:'planner',type:'planner',plannerSchemaVersion:2,plannerTasks:[{id:'task',title:'Original',dateKey:'2026-10-14',done:false,completedAt:0,completedOn:'',archivedAt:0,deletedAt:0,updatedAt:1}]}],archivedCards:[]}],deletedBoardIds:{}};
test('JSONB reordering alone cannot make a one-device task edit conflict with unchanged cloud data',()=>{
 const local=structuredClone(base);local.boards[0].cards[0].plannerTasks[0].title='New title';local.boards[0].cards[0].plannerTasks[0].updatedAt=2;
 const result=merge.merge(base,local,reorder(base));assert.equal(result.conflicts.length,0);assert.equal(result.boards[0].cards[0].plannerTasks[0].title,'New title');
});
test('different complete task versions still conflict after JSONB reordering and retain both choices',()=>{
 const local=structuredClone(base),remote=reorder(base);Object.assign(local.boards[0].cards[0].plannerTasks[0],{title:'Computer title',dateKey:'2026-10-15'});Object.assign(remote.boards[0].cards[0].plannerTasks[0],{title:'Phone title',dateKey:'2026-10-16'});
 const result=merge.merge(base,local,remote);assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].local.title,'Computer title');assert.equal(result.conflicts[0].remote.title,'Phone title');
});
test('semantic JSON equality preserves array order, property presence, text whitespace and JSON Date/undefined semantics',()=>{
 assert(merge.equal({a:1,b:{c:2,d:3}},{b:{d:3,c:2},a:1}));
 assert.equal(merge.equal([1,2],[2,1]),false);assert.equal(merge.equal({text:'Full text'},{text:'F'}),false);assert.equal(merge.equal({text:'Line\n'},{text:'Line'}),false);
 assert.equal(merge.equal({a:1},{a:1,b:null}),false);assert(merge.equal({a:undefined},{}));assert(merge.equal(new Date('2026-10-14T00:00:00Z'),'2026-10-14T00:00:00.000Z'));
 assert.equal(merge.equal(new Date('2026-10-14T00:00:00Z'),new Date('2026-10-15T00:00:00Z')),false);
});
