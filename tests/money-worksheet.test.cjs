const test=require('node:test'),assert=require('node:assert/strict'),M=require('../money-store.js');
const today='2026-10-18',month='2026-10';
const account=(id,owner='personal',type='cash')=>({id,name:id,owner,type,openingCents:100000,openingDate:'2026-09-01',reservedCents:0});
const entry=(id,patch={})=>({id,title:id,kind:'expense',status:'planned',repeat:'none',amountCents:1234,date:today,dueDate:today,accountId:'bank',category:'Personal Spending',note:'',...patch});
const ledger=()=>({...M.empty(),accounts:[account('bank'),account('villa','villa'),account('card','personal','credit')]});
test('worksheet separates actual, committed, considering, expected and received without mutating records',()=>{
  const l=ledger();l.entries=[entry('paid',{status:'settled'}),entry('committed',{purchaseIntent:'committed'}),entry('wish',{purchaseIntent:'considering'}),entry('expected',{kind:'income',status:'released'}),entry('received',{kind:'income',status:'settled'}),entry('void',{voidedAt:1}),entry('cancelled',{status:'cancelled'}),entry('november',{dueDate:'2026-11-01'}),entry('villa',{accountId:'villa'})];
  const before=M.copy(l),s=M.worksheet(l,month,today,'personal');
  assert.equal(s.rows.length,5);assert.deepEqual(s.totals,{paid:1234,received:1234,confirmed:1234,considering:1234,expected:1234,transfer:0,adjustment:0});assert.deepEqual(l,before);
  assert.equal(M.worksheet(l,month,today,'villa').rows.length,1);assert.equal(M.worksheet(l,month,today,'all').rows.length,6);
});
test('worksheet settles a planned purchase once and preserves the original identity and history',()=>{
  let l=ledger();l=M.change(l,'entries',entry('purchase',{purchaseIntent:'considering'}),undefined,1);
  l=M.settle(l,l.entries[0],1501,today,today,2);const s=M.worksheet(l,month,today,'personal');
  assert.equal(l.entries.length,1);assert.equal(l.entries[0].history.length,1);assert.equal(s.rows[0].entry.id,'purchase');assert.equal(s.totals.paid,1501);assert.equal(s.totals.considering,0);assert.equal(s.totals.confirmed,0);
});
test('worksheet generates one monthly occurrence, replaces it with payment and keeps transfers out of spending',()=>{
  let l=ledger();l.entries=[entry('bill',{repeat:'monthly',dueDate:'2026-09-15',endDate:'2026-12-15'}),entry('repay',{kind:'transfer',status:'settled',toAccountId:'card',amountCents:25000})];
  let s=M.worksheet(l,month,today,'personal');assert.equal(s.rows.length,2);assert.equal(s.totals.confirmed,1234);assert.equal(s.totals.transfer,25000);assert.equal(s.totals.paid,0);
  const due=s.rows.find(r=>r.entry.virtual).entry;l=M.settle(l,due,1234,today,today);s=M.worksheet(l,month,today,'personal');assert.equal(s.totals.confirmed,0);assert.equal(s.totals.paid,1234);assert.equal(s.rows.filter(r=>r.entry.scheduleId==='bill').length,1);
});
test('worksheet uses unpaid card bill remainder, hides covered instalments and preserves settlement snapshot',()=>{
  let l=ledger();l.entries=[entry('plan',{kind:'transfer',toAccountId:'card',repeat:'monthly',dueDate:'2026-10-15',endDate:'2026-11-15',paymentPlan:{count:2}})];
  const due=M.upcoming(l,'2026-10-31')[0];l=M.change(l,'entries',entry('totalbill',{kind:'transfer',toAccountId:'card',amountCents:10000,monthBill:month,coveredPaymentIds:[due.id]}),undefined);
  l=M.payBill(l,l.entries.find(e=>e.id==='totalbill'),3000,today,today,'partial');const s=M.worksheet(l,month,today,'personal');
  assert.equal(s.rows.length,2);assert.equal(s.rows.find(r=>r.entry.id==='totalbill').amountCents,7000);assert.deepEqual(s.rows.find(r=>r.entry.id==='totalbill').entry,l.entries.find(e=>e.id==='totalbill'));assert.equal(s.totals.paid,0);
});
test('worksheet filters totals and category totals together, including legacy categories and exact cents',()=>{
  const l=ledger();l.entries=[entry('a',{status:'settled',amountCents:10,category:'Legacy'}),entry('b',{status:'settled',amountCents:20,category:'Legacy'}),entry('c',{category:'Legacy'}),entry('d',{status:'settled'})];
  const s=M.worksheet(l,month,today,'personal','Legacy','paid');assert.equal(s.totals.paid,30);assert.equal(s.totals.confirmed,0);assert.equal(s.rows.length,2);assert.equal(s.categories.length,1);assert.equal(s.categories[0].paid,30);
  assert.throws(()=>M.worksheet(l,'invalid',today));assert.throws(()=>M.worksheet(l,month,today,'invalid'));assert.throws(()=>M.worksheet(l,month,today,'personal','','invalid'));
});
test('worksheet ignores stale considering metadata on recurring obligations, income and repayments',()=>{
  const l=ledger();l.entries=[entry('monthly',{repeat:'monthly',purchaseIntent:'considering'}),entry('payout',{kind:'income',status:'released',purchaseIntent:'considering'}),entry('repayment',{kind:'transfer',toAccountId:'card',purchaseIntent:'considering'})];
  const s=M.worksheet(l,month,today,'personal');assert.equal(s.rows.length,3);assert.equal(s.totals.confirmed,1234);assert.equal(s.totals.considering,0);assert.equal(s.totals.expected,1234);assert.equal(s.totals.transfer,1234);assert.equal(s.categories[0].confirmed,1234);assert.deepEqual(s.rows.find(row=>row.entry.scheduleId==='monthly').bucket,'confirmed');
});
test('worksheet text search filters exact totals and categories together without changing records',()=>{
  const l=ledger();l.entries=[entry('paid',{title:'Birthday cake',status:'settled',amountCents:10}),entry('due',{title:'CAKE order',amountCents:20}),entry('wish',{note:'Try a cake class\nNext month',purchaseIntent:'considering',category:'Entertainment',amountCents:30}),entry('income',{title:'Cake refund',kind:'income',amountCents:40}),entry('other',{status:'settled',amountCents:900}),entry('villa',{title:'Cake',accountId:'villa',amountCents:500})];
  const before=M.copy(l),s=M.worksheet(l,month,today,'personal','','all',' cAkE ');
  assert.equal(s.rows.length,4);assert.deepEqual(s.totals,{paid:10,received:0,confirmed:20,considering:30,expected:40,transfer:0,adjustment:0});assert.equal(s.categories.find(c=>c.name==='Entertainment').considering,30);assert.equal(s.categories.find(c=>c.name==='Personal Spending').paid,10);assert.deepEqual(l,before);
  assert.equal(M.worksheet(l,month,today,'personal','Entertainment','considering','cake').rows.length,1);assert.equal(M.worksheet(l,month,today,'all','','all','cake').rows.length,5);assert.equal(M.worksheet(l,month,today,'personal','','all','nothing').totals.paid,0);
});
test('worksheet treats search as literal Unicode text and supports reversible date ordering without changing totals',()=>{
  const l=ledger();l.entries=[entry('late',{title:'Travel [.* \u65c5\u884c',dueDate:'2026-10-22'}),entry('early',{title:'Travel [.* \u65c5\u884c',dueDate:'2026-10-02'}),entry('same',{title:'Travel [.* \u65c5\u884c',dueDate:'2026-10-02'})];
  const before=M.copy(l),oldest=M.worksheet(l,month,today,'personal','','all',' [.* '),newest=M.worksheet(l,month,today,'personal','','all','[.*','newest');
  assert.deepEqual(oldest.rows.map(r=>r.entry.id),['early','same','late']);assert.deepEqual(newest.rows.map(r=>r.entry.id),['late','early','same']);assert.deepEqual(oldest.totals,newest.totals);assert.deepEqual(oldest.categories,newest.categories);assert.equal(M.worksheet(l,month,today,'personal','','all','\u65c5\u884c').rows.length,3);assert.deepEqual(l,before);
  assert.throws(()=>M.worksheet(l,month,today,'personal','','all',{}));assert.throws(()=>M.worksheet(l,month,today,'personal','','all','','invalid'));
});
test('worksheet CSV exports the applied view in date order without drafts, duplicate totals or source changes',()=>{
  const l=ledger();l.entries=[entry('early',{title:'Cake order',dueDate:'2026-10-02',amountCents:20}),entry('late',{title:'Cake tasting',dueDate:'2026-10-22',amountCents:10}),entry('villa',{title:'Cake private villa',accountId:'villa'}),entry('other',{title:'Other'}),entry('next-month',{title:'Cake next month',dueDate:'2026-11-02'})];
  const before=M.copy(l),csv=M.worksheetCsv(l,month,today,'personal','Personal Spending','confirmed','cake','newest');
  assert(csv.startsWith('\ufeff"Item","Amount (RM)","Status"'));
  const lines=csv.slice(1).split('\r\n');assert.equal(lines.length,3);assert.match(lines[1],/^"Cake tasting","0.10","Confirmed upcoming"/);assert.match(lines[2],/^"Cake order","0.20","Confirmed upcoming"/);
  assert(lines.slice(1).every(line=>line.endsWith('"2026-10","Personal","Personal Spending","Confirmed upcoming","cake","Newest first","2026-10-18"')));
  assert.doesNotMatch(csv,/private villa|next month|"Other"|Subtotal|Current cash/);assert.deepEqual(l,before);
  assert.equal(M.worksheetCsv(l,month,today,'personal','','all','no match').split('\r\n').length,1);
});
test('worksheet CSV matches recurring occurrences, card charges, unpaid bill remainders and signed adjustments',()=>{
  let l=ledger();l.entries=[entry('monthly',{repeat:'monthly',dueDate:'2026-09-15',endDate:'2026-12-15',title:'Internet'}),entry('charge',{status:'settled',accountId:'card',title:'Card purchase',amountCents:10}),entry('adjust',{kind:'adjustment',status:'settled',title:'Reconciled',amountCents:-25}),entry('bill',{kind:'transfer',toAccountId:'card',title:'Card bill',amountCents:10000,monthBill:month})];
  l=M.payBill(l,l.entries.find(e=>e.id==='bill'),3000,today,today,'partial');const before=M.copy(l),csv=M.worksheetCsv(l,month,today,'personal');
  assert.match(csv,/"Internet","12.34","Confirmed upcoming"/);assert.match(csv,/"Card purchase","0.10","Charged to card"/);assert.match(csv,/"Reconciled","-0.25","Balance adjustments"/);assert.match(csv,/"Card bill","70.00","Transfer due"/);assert.match(csv,/"Card bill \(partial payment\)","30.00","Transfer recorded"/);assert.deepEqual(l,before);
  assert.throws(()=>M.worksheetCsv(l,'invalid',today));assert.throws(()=>M.worksheetCsv(l,month,today,'invalid'));
});
test('money CSV quotes Unicode, commas, quotes and multiline notes while protecting formula-like cells',()=>{
  assert.equal(M.csv([['Name','Amount'],['A "quoted", \u65c5\u884c note\nAnother line','12.34']]),'\ufeff"Name","Amount"\r\n"A ""quoted"", \u65c5\u884c note\nAnother line","12.34"');
  for(const value of ['=HYPERLINK("https://invalid.test")',' +SUM(1,2)','-cmd','@test','\t=1','\r=1','\n=1','\uFF1D1+1','\uFF0BSUM(1)','\uFF0D1','\uFF20test'])assert.equal(M.csv([[value]]),'\ufeff"\''+value.replaceAll('"','""')+'"');
  assert.equal(M.csv([['-0.25','0.10','123456.78']]),'\ufeff"-0.25","0.10","123456.78"');
});
