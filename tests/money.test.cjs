const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../money-store.js'),merge=require('../state-merge.js');
const today='2026-10-12',end='2026-10-31';
const account=(id,owner='personal',opening=100000)=>({id,name:id,owner,openingCents:opening,openingDate:'2026-10-01',reservedCents:10000});
const entry=(id,patch={})=>({id,kind:'expense',title:id,amountCents:10000,accountId:'bank',status:'settled',date:today,dueDate:today,repeat:'none',category:'Food & drinks',note:'',...patch});
const ledger=()=>({...M.empty(),accounts:[account('bank'),account('villa','villa',500000)]});
const creditLedger=()=>({...ledger(),accounts:[...ledger().accounts,{...account('card','personal',120000),type:'credit',reservedCents:0}]});
const cardPlan=(patch={})=>entry('phone_plan',{kind:'transfer',toAccountId:'card',status:'planned',repeat:'monthly',dueDate:'2026-10-15',date:'2026-10-15',endDate:'2026-12-15',paymentPlan:{count:3,finalCents:9000},...patch});
test('credit debt is not cash; purchases count once and bank-to-card repayments are not expenses',()=>{
  const l=creditLedger(),before=M.copy(l);l.entries=[entry('purchase',{accountId:'card',amountCents:5000}),entry('repayment',{kind:'transfer',toAccountId:'card',amountCents:20000})];
  const s=M.summary(l,today,end);assert.equal(s.actualCents,80000);assert.equal(s.creditOwedCents,105000);assert.equal(s.spentCents,5000);assert.equal(s.availableCents,-35000);assert.equal(s.receivedCents,0);
  assert.equal(M.balance(l,'card',today),-105000);assert.deepEqual(M.validate(before),before);assert.equal(M.monthly(l,'2026-10',today,'personal').repaymentsCents,20000);
});
test('card instalment dates, final amounts and payments left survive a paid month and void',()=>{
  let l=creditLedger();l.entries=[cardPlan()];assert.deepEqual(M.upcoming(l,'2027-01-31').map(e=>e.amountCents),[10000,10000,9000]);
  const due=M.upcoming(l,end)[0];l=M.settle(l,due,10000,today,today);assert.equal(M.cardPlans(l,today)[0].remaining,2);assert.equal(M.cardPlans(l,today)[0].remainingCents,19000);assert.equal(M.summary(l,today,end).spentCents,0);
  const paid=l.entries.find(e=>e.scheduleId);l=M.change(l,'entries',{...paid,voidedAt:1},paid);assert.equal(M.cardPlans(l,today)[0].remaining,3);assert.equal(M.upcoming(l,end).length,1);l=M.settle(l,M.upcoming(l,end)[0],10000,today,today);assert.equal(M.cardPlans(l,today)[0].remaining,2);assert.equal(l.entries.length,2);
  assert.throws(()=>M.settle(l,M.upcoming(l,'2026-11-30')[0],5000,today,today));
});
test('total card bill replaces explicitly covered instalments, partial payment keeps remainder and full payment covers the month',()=>{
  let l=creditLedger();l.entries=[cardPlan()];const due=M.upcoming(l,end)[0];
  const bill=entry('bill',{kind:'transfer',toAccountId:'card',status:'planned',amountCents:30000,dueDate:'2026-10-20',monthBill:'2026-10',coveredPaymentIds:[due.id]});l=M.change(l,'entries',bill,undefined);
  assert.equal(M.summary(l,today,end).committedCents,30000);assert.deepEqual(M.upcoming(l,end).map(e=>e.id),['bill']);
  l=M.payBill(l,l.entries.find(e=>e.id==='bill'),10000,today,today,'partial');assert.equal(M.balance(l,'bank',today),90000);assert.equal(M.summary(l,today,end).committedCents,20000);assert.equal(M.cardPlans(l,today)[0].remaining,3);
  const remaining=l.entries.find(e=>e.id==='bill');assert.throws(()=>M.payBill(l,bill,1000,today,today,'stale'));assert.throws(()=>M.payBill(l,remaining,20001,today,today,'over'));
  l=M.payBill(l,remaining,20000,today,today,'final');assert.equal(M.balance(l,'bank',today),70000);assert.equal(M.balance(l,'card',today),-90000);assert.equal(M.summary(l,today,end).spentCents,0);assert.equal(M.upcoming(l,end).length,0);assert.equal(M.cardPlans(l,today)[0].remaining,2);assert.equal(M.monthly(l,'2026-10',today).repaymentsCents,30000);
  l=M.change(l,'entries',cardPlan({id:'new_plan'}),undefined);assert.equal(M.upcoming(l,end).length,1,'a later-added plan is not silently paid by an old bill');
});
test('card debt reserve and scheduled payments are not subtracted twice; cash forecasts do not assume future receipts are available',()=>{
  const l=creditLedger();l.entries=[cardPlan(),entry('airbnb',{kind:'income',status:'planned',amountCents:50000,dueDate:'2026-10-30'})];
  const s=M.summary(l,today,end);assert.equal(s.actualCents,100000);assert.equal(s.committedCents,10000);assert.equal(s.unscheduledCardCents,110000);assert.equal(s.availableCents,-30000);assert.equal(s.projectedCents,140000);
  assert.equal(M.summary(l,today,end,'villa').creditOwedCents,0);assert.equal(M.summary(l,today,end,'villa').actualCents,500000);
});
test('historical month and category totals include card charges but exclude opening debt, transfers, expected income and future dates',()=>{
  const l=creditLedger();l.entries=[entry('card_food',{accountId:'card',date:'2026-10-02'}),entry('cash_food',{amountCents:5000}),entry('older',{date:'2026-10-01',category:'Other'}),entry('repay',{kind:'transfer',toAccountId:'card'}),entry('expected',{kind:'income',status:'planned'})];
  const monthly=M.monthly(l,'2026-10',today,'personal');assert.equal(monthly.spentCents,25000);assert.equal(monthly.receivedCents,0);assert.equal(monthly.categories.find(c=>c.name==='Food & drinks').spentCents,15000);assert.equal(M.monthly(l,'2026-09',today).spentCents,0);assert.throws(()=>M.monthly(l,'2026-13',today));
});
test('duplicate bills, invalid card types, cash reserves on debt and invalid finite terms are refused without changing records',()=>{
  const l=creditLedger(),before=M.copy(l);assert.throws(()=>M.change(l,'accounts',{...l.accounts[2],reservedCents:1},l.accounts[2]));assert.throws(()=>M.change(l,'accounts',{...l.accounts[2],type:'unknown'},l.accounts[2]));
  assert.throws(()=>M.change(l,'entries',cardPlan({paymentPlan:{count:2.5}}),undefined));assert.throws(()=>M.change(l,'entries',entry('card_income',{kind:'income',accountId:'card'}),undefined));
  const bill=entry('bill',{kind:'transfer',toAccountId:'card',status:'planned',monthBill:'2026-10'});const next=M.change(l,'entries',bill,undefined);assert.throws(()=>M.change(next,'entries',{...bill,id:'another'},undefined));assert.deepEqual(l,before);
});
test('competing partial bill payments trigger whole-record conflict; independent board money still merges without data loss',()=>{
  const l=creditLedger();l.entries=[entry('bill',{kind:'transfer',toAccountId:'card',status:'planned',monthBill:'2026-10'})];
  const base={boards:[{id:'one',money:l},{id:'two',money:ledger()}]},a=M.copy(base),b=M.copy(base);
  a.boards[0].money=M.payBill(l,l.entries[0],1000,today,today,'pay_a',1);b.boards[0].money=M.payBill(l,l.entries[0],2000,today,today,'pay_b',2);
  const r=merge.merge(base,a,b);assert(r.conflicts.some(c=>c.kind==='money-record'));assert.equal(r.boards[0].money.entries.filter(e=>e.billId==='bill').length,2);assert.deepEqual(r.boards[1],base.boards[1]);
  assert.equal(M.billRemaining(r.boards[0].money,r.boards[0].money.entries.find(e=>e.id==='bill')),7000,'both real payments reduce the remainder even while their record conflict needs review');
});
test('scheduled card charges reserve cash without pretending they are bank payments or already spent',()=>{
  const l=creditLedger();l.entries=[entry('subscription',{accountId:'card',status:'planned',repeat:'monthly',dueDate:'2026-10-18'})];const s=M.summary(l,today,end);assert.equal(s.actualCents,100000);assert.equal(s.spentCents,0);assert.equal(s.committedCents,0);assert.equal(s.futureCardChargesCents,10000);assert.equal(s.unscheduledCardCents,130000);assert.equal(s.availableCents,-40000);
});
test('JSONB property reordering does not refuse a valid financial edit but a changed value still does',()=>{
  const l=creditLedger();l.entries=[entry('food')];const expected=Object.fromEntries(Object.entries(l.entries[0]).reverse());assert.equal(M.change(l,'entries',{...expected,title:'Lunch'},expected).entries[0].title,'Lunch');assert.throws(()=>M.change(l,'entries',{...expected,title:'Lunch'},{...expected,amountCents:1}));
});
test('decimal money parsing is exact, rejects exponent, commas, overflow and three decimals',()=>{
  assert.equal(M.cents('0.29'),29);assert.equal(M.cents('123.45'),12345);assert.equal(M.cents('-0.50',{signed:true}),-50);
  for(const value of ['1e2','1,000','0.001','-1','Infinity','100000000000'])assert.throws(()=>M.cents(value));
});
test('received, released and planned income do not double-count money; reserves affect only available amount',()=>{
  const l=ledger();l.entries=[entry('food'),entry('airbnb',{kind:'income',accountId:'villa',amountCents:120000,status:'released',dueDate:'2026-10-18'}),entry('rent',{status:'planned',dueDate:'2026-10-15',amountCents:30000})];
  const s=M.summary(l,today,end);assert.equal(s.actualCents,90000);assert.equal(s.committedCents,30000);assert.equal(s.availableCents,50000);assert.equal(s.projectedCents,60000);assert.equal(s.spentCents,10000);
  assert.equal(M.summary(l,today,end,'villa').actualCents,500000);assert.equal(M.summary(l,today,end,'villa').projectedCents,620000);
  const paid=M.settle(l,l.entries[1],119900,today,today);assert.equal(M.summary(paid,today,end,'villa').actualCents,619900);assert.equal(M.summary(paid,today,end,'villa').incomingCents,0);assert.equal(paid.entries.length,3);
});
test('transfers move account and owner balances without creating income or expense',()=>{
  const l=ledger();l.entries=[entry('draw',{kind:'transfer',accountId:'villa',toAccountId:'bank',amountCents:50000})];
  assert.equal(M.summary(l,today,end).actualCents,150000);assert.equal(M.summary(l,today,end,'villa').actualCents,450000);assert.equal(M.summary(l,today,end,'all').actualCents,600000);assert.equal(M.summary(l,today,end).receivedCents,0);assert.equal(M.summary(l,today,end).spentCents,0);
  assert.throws(()=>M.validate({...l,entries:[{...l.entries[0],toAccountId:'villa'}]}));
});
test('monthly schedules are derived without mutations and Jan 31 recovers in March after leap February',()=>{
  const l=ledger();l.entries=[entry('bill',{status:'planned',dueDate:'2028-01-31',date:'2028-01-31',repeat:'monthly'})];const before=M.copy(l);
  assert.deepEqual(M.upcoming(l,'2028-03-31').map(e=>e.dueDate),['2028-01-31','2028-02-29','2028-03-31']);assert.deepEqual(l,before);
});
test('paying or cancelling a recurring occurrence suppresses only its stable identity and never recreates it',()=>{
  let l=ledger();l.entries=[entry('bill',{status:'planned',dueDate:'2026-10-05',date:'2026-10-05',repeat:'monthly',endDate:'2026-12-05'})];
  const due=M.upcoming(l,'2026-12-31');l=M.settle(l,due[0],11000,today,today);assert.equal(M.summary(l,today,end).spentCents,11000);assert.deepEqual(M.upcoming(l,'2026-12-31').map(e=>e.dueDate),['2026-11-05','2026-12-05']);
  const cancelled={...M.upcoming(l,'2026-12-31')[0],status:'cancelled',voidedAt:1};delete cancelled.virtual;l=M.change(l,'entries',cancelled,undefined);
  assert.deepEqual(M.upcoming(l,'2027-03-31').map(e=>e.dueDate),['2026-12-05']);assert.throws(()=>M.settle(l,due[0],10000,today,today));
});
test('overdue bills remain commitments and a forecast exposes cash shortage before a later receipt',()=>{
  const l=ledger();l.entries=[entry('bill',{status:'planned',dueDate:'2026-10-02',amountCents:120000}),entry('payout',{status:'planned',kind:'income',dueDate:'2026-10-20',amountCents:150000})];
  const s=M.summary(l,today,end);assert.equal(s.projectedCents,130000);assert.equal(s.lowCents,-20000);assert.equal(s.timeline[0].date,today);
});
test('same-day receipts cannot hide a conservative outgoing shortfall; forecast horizon excludes later income',()=>{
  const l=ledger();l.entries=[entry('bill',{status:'planned',amountCents:120000,dueDate:'2026-10-20'}),entry('pay',{status:'planned',kind:'income',amountCents:150000,dueDate:'2026-10-20'}),entry('far',{status:'planned',kind:'income',amountCents:900000,dueDate:'2027-01-01'})];
  const s=M.summary(l,today,end);assert.equal(s.lowCents,-20000);assert.equal(s.incomingCents,150000);
});
test('future paid dates and dates preceding opening balance are refused, malformed data is retained rather than guessed',()=>{
  const l=ledger();assert.throws(()=>M.settle(l,entry('missing',{status:'planned'}),1000,'2026-10-13',today));
  assert.throws(()=>M.validate({...l,entries:[entry('early',{date:'2026-09-30'})]}));assert.throws(()=>M.validate({...l,entries:[entry('missing',{accountId:'unknown'})]}));assert.throws(()=>M.validate({...l,entries:[entry('released',{status:'released'})]}));
  assert.throws(()=>M.validate(JSON.parse('{"schemaVersion":1,"currency":"MYR","accounts":[],"entries":[],"budgets":[],"__proto__":{}}')));
});
test('reconciliation adjustment changes balance but never spending, and void restores original totals',()=>{
  const l=ledger();l.entries=[entry('adjust',{kind:'adjustment',amountCents:-12345})];assert.equal(M.summary(l,today,end).actualCents,87655);assert.equal(M.summary(l,today,end).spentCents,0);
  l.entries[0].voidedAt=1;assert.equal(M.summary(l,today,end).actualCents,100000);
});
test('budgets are independent by month, owner and category',()=>{
  const l=ledger();l.entries=[entry('food')];l.budgets=[{id:M.budgetId('personal','2026-10','All'),owner:'personal',month:'2026-10',category:'All',limitCents:20000},{id:M.budgetId('villa','2026-10','All'),owner:'villa',month:'2026-10',category:'All',limitCents:90000},{id:M.budgetId('personal','2026-11','All'),owner:'personal',month:'2026-11',category:'All',limitCents:50000}];
  const s=M.summary(l,today,end);assert.equal(s.budgets.length,1);assert.equal(s.budgets[0].spentCents,10000);assert.equal(s.budgets[0].limitCents,20000);
});
test('stale changes are refused without mutation; full previous versions are kept',()=>{
  const l=ledger(),before=M.copy(l);const added=M.change(l,'entries',entry('food'),undefined,1);assert.deepEqual(l,before);
  const original=added.entries[0],changed=M.change(added,'entries',{...original,title:'Lunch'},original,2);assert.equal(changed.entries[0].history[0].record.title,'food');assert.throws(()=>M.change(changed,'entries',{...original,title:'Dinner'},original));
});
test('two-board and independent-entry changes merge without mixing the same record',()=>{
  const base={boards:[{id:'one',money:ledger()},{id:'two',money:ledger()}]},a=M.copy(base),b=M.copy(base);
  a.boards[0].money=M.change(a.boards[0].money,'entries',entry('lunch'),undefined,1);b.boards[1].money=M.change(b.boards[1].money,'entries',entry('dinner'),undefined,1);
  let r=merge.merge(base,a,b);assert.equal(r.conflicts.length,0);assert.equal(r.boards[0].money.entries[0].title,'lunch');assert.equal(r.boards[1].money.entries[0].title,'dinner');
  b.boards[0].money=M.change(b.boards[0].money,'entries',entry('coffee'),undefined,1);r=merge.merge(base,a,b);assert.equal(r.boards[0].money.entries.length,2);
});
test('same financial record conflict keeps amount, account and status together; review is guarded and exact-scoped',()=>{
  const l=ledger();l.entries=[entry('pay',{status:'planned'})];const base={boards:[{id:'one',money:l},{id:'other',money:ledger()}]},a=M.copy(base),b=M.copy(base),original=l.entries[0];
  a.boards[0].money=M.change(l,'entries',{...original,amountCents:20000},original,1);b.boards[0].money=M.change(l,'entries',{...original,status:'settled',date:'2026-10-11'},original,2);
  const r=merge.merge(base,a,b);assert.equal(r.conflicts.length,1);assert.equal(r.conflicts[0].kind,'money-record');assert.equal(r.boards[0].money.entries[0].status,'planned');
  const snapshot={boards:r.boards,syncConflicts:merge.registerConflicts(r.conflicts,{},()=> 'conflict')},c=snapshot.syncConflicts[0],inspection=merge.inspectMoneyConflict(snapshot,c);assert.equal(inspection.editable,true);
  const chosen=merge.resolveMoneyConflict(snapshot,c,inspection.current,c.remote);assert.equal(chosen.boards[0].money.entries[0].amountCents,10000);assert.equal(chosen.boards[0].money.entries[0].status,'settled');assert.deepEqual(chosen.boards[1],snapshot.boards[1]);assert.equal(chosen.syncConflicts.length,0);assert.throws(()=>merge.resolveMoneyConflict(chosen,c,inspection.current,c.remote));
});
test('simultaneous balance checks with one zero adjustment keep one checkpoint record instead of adding both',()=>{
  const base={boards:[{id:'one',money:ledger()}]},a=M.copy(base),b=M.copy(base),check=entry('check_same',{kind:'adjustment',amountCents:0});
  a.boards[0].money=M.change(a.boards[0].money,'entries',check,undefined,1);b.boards[0].money=M.change(b.boards[0].money,'entries',{...check,amountCents:-1000},undefined,2);
  const result=merge.merge(base,a,b);assert.equal(result.boards[0].money.entries.length,1);assert.equal(result.conflicts[0].kind,'money-record');assert.equal(result.boards[0].money.entries[0].amountCents,0);
});
test('cloud financial review acknowledges only the exact baseline and owner, including concurrently added payouts',()=>{
  const base={boards:[{id:'one',money:ledger()}]},a=M.copy(base),b=M.copy(base),record=entry('payout_same',{kind:'income',status:'planned'});
  a.boards[0].money=M.change(a.boards[0].money,'entries',record,undefined,1);b.boards[0].money=M.change(b.boards[0].money,'entries',{...record,amountCents:20000},undefined,2);
  const r=merge.merge(base,a,b),snapshot={boards:r.boards,syncConflicts:merge.registerConflicts(r.conflicts.map(c=>({...c,source:'cloud',ownerId:'owner',baseDigest:'exact'})),{},()=> 'conflict')},c=snapshot.syncConflicts[0];
  const next=merge.resolveMoneyConflict(snapshot,c,merge.inspectMoneyConflict(snapshot,c).current,c.local);
  const acknowledged=merge.reviewedCloudBaseline(base,next.conflictResolutions,'owner','exact');assert.equal(acknowledged.boards[0].money.entries[0].amountCents,20000);assert.equal(merge.merge(acknowledged,next,b).conflicts.length,0);
  assert.deepEqual(merge.reviewedCloudBaseline(base,next.conflictResolutions,'other','exact'),base);assert.deepEqual(merge.reviewedCloudBaseline(base,next.conflictResolutions,'owner','wrong'),base);
});
test('summary-card view preferences cannot pause financial saving or change ledger ownership',()=>{
  const base={boards:[{id:'one',cards:[{id:'summary',type:'money',moneyOwner:'personal'}],money:ledger()}]},local=M.copy(base),remote=M.copy(base);local.boards[0].cards[0].moneyOwner='villa';remote.boards[0].cards[0].moneyOwner='all';
  const result=merge.merge(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.boards[0].cards[0].moneyOwner,'villa');assert.deepEqual(result.boards[0].money,base.boards[0].money);
});
