const test=require('node:test');
const assert=require('node:assert/strict');
const {collect,filter,validDate}=require('../records-workspace.js');

test('record projection keeps full writing, line breaks, unknown fields and originals unchanged',()=>{
  const body='My private thought\nAnother line 中文\n'.repeat(500);
  const board={id:'a',cards:[{id:'journal',type:'diary',title:'Journal',unknown:{keep:true},diaryEntries:{'2026-10-12':{thoughts:body,sentence:'One thought',feeling:'meh',updatedAt:100},'2026-10-13':{thoughts:'Latest'}}}]};
  const before=JSON.stringify(board),rows=collect(board);
  assert.equal(rows.length,2);assert.equal(rows[0].dateKey,'2026-10-13');assert.equal(rows[1].body,body);
  assert.equal(JSON.stringify(board),before);assert.equal(filter(rows,{query:'中文'}).length,1);
});
test('archived sources without a timestamp remain read-only and are independently filterable',()=>{
  const rows=collect({id:'a',cards:[],archivedCards:[{id:'j',type:'diary',diaryEntries:{'2026-10-12':{thoughts:'Retain me'}}}]});
  assert.equal(rows[0].archived,true);assert.equal(filter(rows,{includeArchived:false}).length,0);assert.equal(rows[0].body,'Retain me');
});
test('same-name or duplicate-ID sources remain separate and boards never mix',()=>{
  const card={id:'same',type:'sidenote',title:'Notes',sideNoteEntries:{'2026-10-12':{notes:[{text:'First'},{text:'Second'}]}}};
  const rows=collect({id:'a',cards:[card,structuredClone(card)]});
  assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.key)).size,4);assert.ok(rows.every(r=>r.boardId==='a'));
  assert.equal(collect({id:'b',cards:[]}).length,0);
});
test('legacy notes and motivation are available without invented dates or migrations',()=>{
  const rows=collect({id:'a',cards:[{id:'n',type:'sidenote',sideNoteEntries:{'2026-10-10':{note:'Legacy note'}}},{id:'q',type:'quote',quote:'My motivation\nSecond line'}]});
  assert.equal(rows.length,2);assert.equal(filter(rows,{type:'quote'})[0].dateKey,'');assert.equal(filter(rows,{date:'2026-10-10'})[0].body,'Legacy note');
});
test('blank, malformed and impossible-date entries never crash record history or alter input',()=>{
  const board={id:'a',cards:[null,{id:'j',type:'diary',diaryEntries:{'2026-02-30':{thoughts:'Invalid date'},'2026-10-12':null,'2026-10-13':{thoughts:''}}}]};
  const before=JSON.stringify(board);assert.deepEqual(collect(board),[]);assert.equal(JSON.stringify(board),before);
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);
});
