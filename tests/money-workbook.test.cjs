const test=require('node:test'),assert=require('node:assert/strict'),M=require('../money-store.js'),W=require('../money-workbook-core.js');
const today='2026-10-18',session={month:'2026-10',owner:'personal',purchaseCategory:'',sheetBucket:'all',sheetQuery:'',sheetOrder:'oldest'};
const ledger=()=>({...M.empty(),accounts:[{id:'bank',name:'Bank',owner:'personal',type:'cash',openingCents:100000,openingDate:'2026-10-01',reservedCents:0}],entries:[{id:'cake',title:'Cake',amountCents:1000,kind:'expense',status:'settled',repeat:'none',accountId:'bank',date:'2026-10-12',dueDate:'2026-10-12',category:'Personal Spending',note:'Original\nNote',extension:{keep:true}}]});
test('workbook batch edits and additions retain IDs, extension fields, exact cents and original inputs',()=>{
  const l=ledger(),before=M.copy(l),base=W.snapshot(l,session,today),data=M.copy(base.data);data[1][1]='12.34';data.push(['Food','20.10','Confirmed upcoming','Entertainment','Bank','2026-10-20','Two\nlines']);const result=W.prepare(base,data,l,today,{2:'food'});
  assert.equal(result.changed,2);assert.equal(result.ledger.entries.length,2);assert.equal(result.ledger.entries[0].id,'cake');assert.equal(result.ledger.entries[0].amountCents,1234);assert.deepEqual(result.ledger.entries[0].extension,{keep:true});assert.equal(result.ledger.entries[0].history.length,1);assert.equal(result.ledger.entries[1].amountCents,2010);assert.equal(result.ledger.entries[1].purchaseIntent,'committed');assert.deepEqual(l,before);
});
test('invalid later rows, stale ledger, changed day, cleared saved row and changed headings refuse the entire batch',()=>{
  const l=ledger(),before=M.copy(l),base=W.snapshot(l,session,today),data=M.copy(base.data);data[1][1]='12.34';data.push(['Bad','1.234','Paid','','Bank',today,'']);assert.throws(()=>W.prepare(base,data,l,today,{2:'bad'}),/Row 3/);assert.deepEqual(l,before);
  assert.throws(()=>W.prepare(base,base.data,{...l,extra:'new'},today,{}),/changed in another tab/);assert.throws(()=>W.prepare(base,base.data,l,'2026-10-19',{}),/day changed/);
  assert.throws(()=>W.prepare(base,[W.headers,[]],l,today,{}),/cannot delete/);assert.throws(()=>W.prepare(base,[['Other'],...base.data.slice(1)],l,today,{}),/protected column/);
});
test('specialized rows cannot be edited and duplicate accounts cannot silently redirect an existing record',()=>{
  const l=ledger();l.entries.push({...l.entries[0],id:'monthly',title:'Internet',status:'planned',repeat:'monthly'});const base=W.snapshot(l,session,today),data=M.copy(base.data),y=base.rows.findIndex(r=>r.entry.title==='Internet')+1;data[y][1]='1.00';assert.throws(()=>W.prepare(base,data,l,today,{}),/specialized/);
  l.accounts.push({...l.accounts[0],id:'other'});const b=W.snapshot(l,session,today),d=M.copy(b.data);d[1][1]='12.34';assert.equal(W.prepare(b,d,l,today,{}).ledger.entries[0].accountId,'bank');d.push(['New','1.00','Paid','','Bank',today,'']);assert.throws(()=>W.prepare(b,d,l,today,{[d.length-1]:'new'}),/unambiguous/);
});
test('future paid entries and reclassifying settled money fail; a planned purchase can settle on the same identity',()=>{
  const l=ledger(),base=W.snapshot(l,session,today),data=M.copy(base.data);data[1][2]='Confirmed upcoming';assert.throws(()=>W.prepare(base,data,l,today,{}),/reopen/);data[1][2]='Paid';data[1][5]='2026-10-19';assert.throws(()=>W.prepare(base,data,l,today,{}),/future payment/);
  l.entries[0].status='planned';const b=W.snapshot(l,session,today),d=M.copy(b.data);d[1][2]='Paid';d[1][5]=today;const r=W.prepare(b,d,l,today,{});assert.equal(r.ledger.entries.length,1);assert.equal(r.ledger.entries[0].id,'cake');assert.equal(r.ledger.entries[0].status,'settled');
});
test('unsubmitted blank cells do not create records, and literal HTML/formula-like notes are preserved as text',()=>{
  const l=ledger(),base=W.snapshot(l,session,today),data=M.copy(base.data);for(let i=0;i<100;i++)data.push(Array(7).fill(''));assert.equal(W.prepare(base,data,l,today,{}).changed,0);data[1][6]='<img src=x onerror=alert(1)>\n=SUM(B2:B4)';assert.equal(W.prepare(base,data,l,today,{}).ledger.entries[0].note,data[1][6]);
});
test('editing a credit-card charge retains its card accounting instead of refusing its displayed status',()=>{
  const l=ledger();l.accounts[0].type='credit';const b=W.snapshot(l,session,today),d=M.copy(b.data);assert.equal(d[1][2],'Charged to card');d[1][1]='12.34';const r=W.prepare(b,d,l,today,{});assert.equal(r.ledger.entries[0].amountCents,1234);assert.equal(r.ledger.entries[0].accountId,'bank');assert.equal(r.ledger.entries.length,1);
});
test('additional columns save on the record identity, survive sorting and clearing, and never alter balances',()=>{
  const l=ledger(),base=W.snapshot(l,session,today),data=M.copy(base.data);assert.equal(W.columnCount,26);assert.equal(data[0].length,26);
  data[1][7]='Receipt reference';data[1][25]='Two\nlines <img src=x> =SUM(B2:B4)';
  const result=W.prepare(base,data,l,today,{});assert.equal(result.changed,1);assert.equal(result.ledger.entries[0].amountCents,1000);assert.equal(result.ledger.entries[0].sheetCells.H,'Receipt reference');assert.equal(result.ledger.entries[0].sheetCells.Z,data[1][25]);assert.deepEqual(result.ledger.entries[0].extension,{keep:true});
  result.ledger.entries.push({...l.entries[0],id:'other',date:'2026-10-18'});const sorted=W.snapshot(result.ledger,{...session,sheetOrder:'newest'},today),y=sorted.rows.findIndex(row=>row.entry.id==='cake')+1;
  assert.equal(sorted.data[y][25],data[1][25]);const clear=M.copy(sorted.data);clear[y][25]='';const saved=W.prepare(sorted,clear,result.ledger,today,{});assert.equal(saved.ledger.entries.find(e=>e.id==='cake').sheetCells.Z,'');assert.equal(saved.ledger.entries.find(e=>e.id==='cake').history.at(-1).record.sheetCells.Z,data[1][25]);assert.equal(l.entries[0].sheetCells,undefined);
});
test('seven-column drafts remain compatible and detail-only new rows fail atomically without losing the draft',()=>{
  const l=ledger(),base=W.snapshot(l,session,today);base.data=base.data.map(row=>row.slice(0,7));base.rows.forEach(row=>row.values=row.values.slice(0,7));const data=M.copy(base.data);data[1][1]='12.34';assert.equal(W.prepare(base,data,l,today,{}).ledger.entries[0].amountCents,1234);
  data.push(Array(26).fill(''));data[2][25]='Not a purchase yet';const before=M.copy(data);assert.throws(()=>W.prepare(base,data,l,today,{2:'new'}),/Detail cells need a money item/);assert.deepEqual(data,before);assert.equal(l.entries[0].amountCents,1000);
});
test('working columns survive workspace serialization and competing versions remain explicit Money conflicts',()=>{
  const merge=require('../state-merge.js'),l=ledger(),base=W.snapshot(l,session,today),data=M.copy(base.data);data[1][25]='My complete detail\nSecond line';
  const saved=W.prepare(base,data,l,today,{}).ledger,workspace={boards:[{id:'home',cards:[],archivedCards:[],money:l}],deletedBoardIds:{}},local=M.copy(workspace);local.boards[0].money=saved;
  const result=merge.merge(workspace,JSON.parse(JSON.stringify(local)),M.copy(workspace));assert.equal(result.conflicts.length,0);assert.equal(result.boards[0].money.entries[0].sheetCells.Z,data[1][25]);
  const remote=M.copy(workspace);remote.boards[0].money.entries[0].note='A newer phone note';const conflict=merge.merge(workspace,local,remote).conflicts.find(c=>c.kind==='money-record');assert.equal(conflict.local.sheetCells.Z,data[1][25]);assert.equal(conflict.remote.note,'A newer phone note');
});
