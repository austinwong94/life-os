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
