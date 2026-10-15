const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../money-store.js'),merge=require('../state-merge.js');
const today='2026-10-12',end='2026-10-31';
const ledger=()=>({...M.empty(),accounts:[{id:'bank',name:'Personal bank',owner:'personal',openingCents:100000,openingDate:'2026-10-01',reservedCents:0},{id:'villa',name:'Villa bank',owner:'villa',openingCents:500000,openingDate:'2026-10-01',reservedCents:0}]});
const item=(id,patch={})=>({id,title:id,kind:'expense',repeat:'none',status:'planned',accountId:'bank',amountCents:10000,date:today,dueDate:today,category:'Personal Spending',note:'',purchaseIntent:'considering',...patch});
test('considering purchases total every date without reducing cash or forecast; legacy plans remain commitments',()=>{
  const l=ledger();l.entries=[item('wish'),item('later',{amountCents:20000,dueDate:'2027-06-01'}),item('legacy',{amountCents:3000,purchaseIntent:undefined}),item('committed',{amountCents:4000,purchaseIntent:'committed'})];const before=structuredClone(l),p=M.purchases(l,today,'personal');
  assert.equal(p.plannedCents,37000);assert.equal(p.committedCents,7000);assert.equal(p.purchasedCents,0);assert.equal(M.summary(l,today,end).actualCents,100000);assert.equal(M.summary(l,today,end).committedCents,7000);assert.deepEqual(M.upcoming(l,end).map(e=>e.id),['committed','legacy']);assert.deepEqual(l,before);
});
test('confirming an actual purchase updates one identity and changes actual spending once',()=>{
  let l=ledger();l.entries=[item('wish')];const original=M.copy(l.entries[0]);l=M.settle(l,l.entries[0],9500,today,today,2);const p=M.purchases(l,today,'personal');
  assert.equal(l.entries.length,1);assert.equal(p.plannedCents,0);assert.equal(p.purchasedCents,9500);assert.equal(M.summary(l,today,end).actualCents,90500);assert.equal(M.summary(l,today,end).spentCents,9500);assert.equal(M.summary(l,today,end).committedCents,0);assert.equal(l.entries[0].history[0].record.amountCents,10000);assert.throws(()=>M.settle(l,original,9500,today,today));
});
test('categories and owners remain independent, with historical names and other income excluded',()=>{
  const l=ledger();l.entries=[item('villa-category',{category:'Sunrise Villa'}),item('villa-owner',{category:'Sunrise Villa',accountId:'villa',amountCents:5000}),item('fun',{status:'settled',category:'Entertainment',amountCents:2500}),item('legacy',{category:'Old category',amountCents:1500}),item('pay',{kind:'income',purchaseIntent:undefined})];
  const all=M.purchases(l,today,'all');assert.equal(all.plannedCents,16500);assert.equal(all.purchasedCents,2500);assert.equal(M.purchases(l,today,'personal','Sunrise Villa').plannedCents,10000);assert.equal(M.purchases(l,today,'villa','Sunrise Villa').plannedCents,5000);assert.deepEqual(all.categories.find(c=>c.name==='Entertainment'),{name:'Entertainment',plannedCents:0,purchasedCents:2500});assert(all.categories.some(c=>c.name==='Old category'));
});
test('voided, cancelled, future recorded and monthly repayment records never enter purchase totals',()=>{
  const l=ledger();l.entries=[item('cancelled',{status:'cancelled'}),item('voided',{voidedAt:1}),item('future',{status:'settled',date:'2026-10-20'}),item('bill',{repeat:'monthly',purchaseIntent:undefined})];
  const occurrence=M.upcoming(l,today).find(e=>e.scheduleId==='bill');l.entries.push({...occurrence,status:'settled',virtual:undefined});const p=M.purchases(l,today);assert.equal(p.planned.length,0);assert.equal(p.purchased.length,0);assert.equal(p.categories.length,0);
});
test('purchase metadata survives serialization without converting existing entries or retained history',()=>{
  const l=ledger();l.entries=[item('old',{purchaseIntent:undefined,history:[{at:1,record:{title:'Original writing'}}]}),item('wish')];const raw=JSON.parse(JSON.stringify(l)),roundTrip=M.validate(raw);assert.deepEqual(roundTrip,raw);assert.equal(Object.hasOwn(roundTrip.entries[0],'purchaseIntent'),false);assert.equal(roundTrip.entries[0].history[0].record.title,'Original writing');
});
test('invalid purchase metadata is refused; older clients retaining it cannot hide income, transfers or recurring bills',()=>{
  assert.throws(()=>M.validate({...ledger(),entries:[item('bad',{purchaseIntent:'bad'})]}));
  for(const patch of [{kind:'income'},{repeat:'monthly'},{kind:'transfer',toAccountId:'villa'}]){const l={...ledger(),entries:[item('retained',patch)]};assert.equal(M.upcoming(l,today).length,1);assert.deepEqual(M.validate(l),l);}
  assert.throws(()=>M.purchases(ledger(),'invalid'));assert.throws(()=>M.purchases(ledger(),today,'invalid'));
});
test('independent purchases merge; competing confirmation and edit remain a guarded financial-record conflict',()=>{
  const base={boards:[{id:'one',money:ledger()}]},a=M.copy(base),b=M.copy(base);a.boards[0].money=M.change(a.boards[0].money,'entries',item('first'),undefined,1);b.boards[0].money=M.change(b.boards[0].money,'entries',item('second'),undefined,1);assert.equal(merge.merge(base,a,b).boards[0].money.entries.length,2);
  base.boards[0].money.entries=[item('same')];a.boards[0].money=M.settle(base.boards[0].money,base.boards[0].money.entries[0],10000,today,today,2);b.boards[0].money=M.change(base.boards[0].money,'entries',{...base.boards[0].money.entries[0],amountCents:12000},base.boards[0].money.entries[0],3);const result=merge.merge(base,a,b);assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].kind,'money-record');
});
