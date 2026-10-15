const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../money-store.js'),merge=require('../state-merge.js');
const today='2026-10-15';
function base(){return {...M.empty(),accounts:[{id:'bank',name:'Bank',owner:'personal',openingCents:1000000,openingDate:'2026-01-01',reservedCents:0},{id:'villa',name:'Villa bank',owner:'villa',openingCents:2000000,openingDate:'2026-01-01',reservedCents:0}]};}
function loan(patch={}){return {id:'home',title:'Home loan',kind:'expense',status:'planned',repeat:'monthly',accountId:'bank',amountCents:100000,date:today,dueDate:today,category:'Loans',note:'Private loan note',loan:{bank:'Sample bank',balanceCents:1100000,balanceDate:'2026-10-14',balanceUpdatedAt:100,startDate:today},...patch};}
const add=(ledger=base(),patch={},remaining=12)=>M.saveLoan(ledger,loan(patch),undefined,remaining,100);
const next=ledger=>M.upcoming(ledger,'2027-12-31').find(e=>e.scheduleId==='home');
test('legacy records and unknown fields are unchanged; loans are additive recurring-entry metadata',()=>{
 const l=base();l.custom={private:'Retain all information'};const before=M.copy(l),created=add(l);
 assert.deepEqual(l,before);assert.equal(created.schemaVersion,1);assert.deepEqual(created.custom,l.custom);assert.equal(created.entries.length,1);assert.equal(created.entries[0].endDate,'2027-09-15');
 assert.equal(M.loans(before,today).length,0);
});
test('principal, repayment total, current cash and forecast payments remain separate and counted once',()=>{
 const l=add(),totals=M.loanTotals(l,today);assert.equal(totals.balanceCents,1100000);assert.equal(totals.scheduledCents,1200000);assert.equal(totals.monthlyCents,100000);
 const s=M.summary(l,today,'2026-12-31');assert.equal(s.actualCents,1000000);assert.equal(s.committedCents,300000);assert.equal(s.availableCents,700000);assert.equal(s.spentCents,0);
});
test('calendar passage does not pay a loan or erase arrears',()=>{
 const l=add(),d=M.loanDetail(l,'home','2027-01-16');assert.equal(d.remaining,12);assert.equal(d.overdue,4);assert.equal(d.nextDate,today);assert.equal(d.finishDate,'2027-09-15');
});
test('one full repayment reduces cash and repayment count, but never guesses a new principal balance',()=>{
 const l=add(),paid=M.settle(l,next(l),100000,today,today,200),d=M.loanDetail(paid,'home',today);
 assert.equal(d.remaining,11);assert.equal(d.nextDate,'2026-11-15');assert.equal(d.balanceCents,1100000);assert.equal(d.balanceNeedsUpdate,true);
 assert.equal(M.summary(paid,today,'2026-10-31').actualCents,900000);assert.equal(M.summary(paid,today,'2026-10-31').committedCents,0);
 assert.throws(()=>M.settle(paid,next(l),100000,today,today),/changed/);
 assert.throws(()=>M.settle(l,next(l),50000,today,today),/full instalment/);
});
test('a voided repayment becomes due again, can be re-recorded once, and keeps its history',()=>{
 let l=add();l=M.settle(l,next(l),100000,today,today,200);const payment=l.entries.find(e=>e.scheduleId==='home');
 l=M.change(l,'entries',{...payment,voidedAt:300},payment,300);assert.equal(M.loanDetail(l,'home',today).remaining,12);assert.equal(M.summary(l,today,'2026-10-31').committedCents,100000);
 l=M.settle(l,next(l),100000,today,today,400);assert.equal(M.loanDetail(l,'home',today).remaining,11);assert.equal(M.summary(l,today,'2026-10-31').actualCents,900000);assert(l.entries.find(e=>e.scheduleId==='home').history.length>=2);
});
test('a cancelled loan occurrence does not pretend the bank debt has been paid',()=>{
 let l=add(),occurrence=next(l);delete occurrence.virtual;
 l=M.change(l,'entries',{...occurrence,status:'cancelled'},undefined,200);assert.equal(M.loanDetail(l,'home',today).remaining,12);assert.equal(M.summary(l,today,'2026-10-31').committedCents,100000);
});
test('editing the remaining term after payment retains the paid slot rather than extending by accident',()=>{
 let l=add();l=M.settle(l,next(l),100000,today,today,200);const original=l.entries[0];
 l=M.saveLoan(l,{...original,title:'Renamed loan'},original,11,300);assert.equal(l.entries[0].loan.installments,12);assert.equal(l.entries[0].endDate,'2027-09-15');assert.equal(M.loanDetail(l,'home',today).remaining,11);assert.equal(l.entries.find(e=>e.scheduleId==='home').amountCents,100000);
 assert.throws(()=>M.saveLoan(l,{...l.entries[0],loan:{...l.entries[0].loan,startDate:'2026-11-15'}},l.entries[0],11),/fixed/);
});
test('tracking an existing schedule uses its identity and cash history, with a new explicit statement baseline',()=>{
 let l=base();const schedule={...loan(),dueDate:'2026-01-15',date:'2026-01-15'};delete schedule.loan;l=M.change(l,'entries',schedule,undefined,1);
 const oct=M.upcoming(l,today).find(e=>e.dueDate===today);l=M.settle(l,oct,100000,today,today,2);const original=l.entries[0],cash=M.balance(l,'bank',today);
 l=M.saveLoan(l,{...original,loan:{...loan().loan,startDate:'2026-11-15'}},original,24,3);
 assert.equal(l.entries.filter(e=>e.repeat==='monthly').length,1);assert.equal(M.balance(l,'bank',today),cash);assert.equal(M.loanDetail(l,'home',today).remaining,24);assert.equal(M.loanDetail(l,'home',today).paid,0);assert.equal(M.loanDetail(l,'home',today).finishDate,'2028-10-15');assert.equal(M.upcoming(l,'2026-11-30').length,1);
});
test('month-end dates, leap February and a different final instalment are calculated exactly',()=>{
 const l=add(base(),{dueDate:'2028-01-31',date:'2028-01-31',loan:{...loan().loan,startDate:'2028-01-31',finalCents:250000}},3);
 assert.deepEqual(M.upcoming(l,'2028-04-30').map(e=>[e.dueDate,e.amountCents]),[['2028-01-31',100000],['2028-02-29',100000],['2028-03-31',250000]]);
 assert.equal(M.loanDetail(l,'home',today).scheduledCents,450000);
});
test('loan totals and planned spending stay scoped to each owner and board',()=>{
 const personal=add(),villa=M.saveLoan(personal,{...loan(),id:'business',accountId:'villa'},undefined,6,200);
 assert.equal(M.loanTotals(villa,today,'personal').rows.length,1);assert.equal(M.loanTotals(villa,today,'villa').rows.length,1);assert.equal(M.loanTotals(villa,today,'all').rows.length,2);
 const planned={id:'laptop',title:'Laptop',accountId:'bank',kind:'expense',status:'planned',repeat:'none',date:'2026-10-20',dueDate:'2026-10-20',amountCents:200000,category:'Shopping',note:'',spendingPlan:true};
 const updated=M.change(villa,'entries',planned,undefined);assert.equal(M.summary(updated,today,'2026-10-31','personal').committedCents,300000);assert.equal(M.summary(updated,today,'2026-10-31','villa').committedCents,100000);
});
test('a loan removal is recoverable, does not erase repayments, and does not affect bank cash',()=>{
 let l=add();l=M.settle(l,next(l),100000,today,today,200);const source=l.entries[0];
 l=M.change(l,'entries',{...source,voidedAt:300},source,300);assert.equal(M.loanTotals(l,today).rows.length,0);assert.equal(M.loans(l,today).length,1);assert.equal(M.balance(l,'bank',today),900000);assert.equal(M.upcoming(l,'2027-09-30').length,0);
 const removed=l.entries[0],restored={...removed};delete restored.voidedAt;l=M.change(l,'entries',restored,removed,400);assert.equal(M.loanDetail(l,'home',today).remaining,11);
});
test('zero future instalments do not invent a payment or imply that the manual bank balance is zero',()=>{
 const l=add(base(),{},0);assert.equal(M.upcoming(l,'2028-01-01').length,0);assert.equal(M.loanDetail(l,'home',today).remaining,0);assert.equal(M.loanDetail(l,'home',today).balanceCents,1100000);
});
test('invalid amounts, fractional terms, excessive terms and impossible end dates are rejected without mutation',()=>{
 const l=base(),before=M.copy(l);for(const n of [-1,1.5,1201,Infinity])assert.throws(()=>add(l,{},n));
 for(const patch of [{bank:''},{balanceCents:-1},{balanceDate:'2026-02-30'},{finalCents:0}])assert.throws(()=>add(l,{loan:{...loan().loan,...patch}}));
 assert.throws(()=>add(l,{dueDate:'9999-12-01',loan:{...loan().loan,startDate:'9999-12-01'}},12));assert.deepEqual(l,before);
});
test('loan changes use existing whole-record conflict protection, while separate repayments merge',()=>{
 const l=add(),baseState={boards:[{id:'one',money:l},{id:'other',money:base()}]},a=M.copy(baseState),b=M.copy(baseState);
 const original=l.entries[0];a.boards[0].money=M.change(l,'entries',{...original,loan:{...original.loan,balanceCents:1000000}},original,200);b.boards[0].money=M.change(l,'entries',{...original,amountCents:105000},original,300);
 const r=merge.merge(baseState,a,b);assert.equal(r.conflicts[0].kind,'money-record');assert.deepEqual(r.boards[1],baseState.boards[1]);assert.equal(r.conflicts[0].local.loan.balanceCents,1000000);assert.equal(r.conflicts[0].remote.amountCents,105000);
 const separateA=M.copy(baseState),separateB=M.copy(baseState),due=M.upcoming(l,'2026-11-30');
 separateA.boards[0].money=M.settle(l,due[0],100000,today,today,200);separateB.boards[0].money=M.settle(l,due[1],100000,today,today,300);
 const combined=merge.merge(baseState,separateA,separateB);assert.equal(combined.conflicts.length,0);assert.equal(M.loanDetail(combined.boards[0].money,'home',today).remaining,10);assert.equal(M.balance(combined.boards[0].money,'bank',today),800000);
});
test('same-day payments with equal clock timestamps still flag an unverified balance, while explicit statement verification clears it',()=>{
 let l=add(base(),{loan:{...loan().loan,balanceDate:today,balanceUpdatedAt:100,balancePaymentIds:[]}});
 l=M.settle(l,next(l),100000,today,today,100);assert.equal(M.loanDetail(l,'home',today).balanceNeedsUpdate,true);
 const source=l.entries[0],payment=l.entries.find(e=>e.scheduleId==='home');
 l=M.change(l,'entries',{...source,loan:{...source.loan,balancePaymentIds:[payment.id]}},source,100);assert.equal(M.loanDetail(l,'home',today).balanceNeedsUpdate,false);
});
