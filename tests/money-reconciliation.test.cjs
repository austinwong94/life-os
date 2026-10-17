const test=require('node:test'),assert=require('node:assert/strict'),M=require('../money-store.js');
const today='2026-10-12';
const account=(id,type='cash')=>({id,name:id,type,owner:'personal',openingCents:100000,openingDate:'2026-10-01',reservedCents:type==='cash'?10000:0,extra:{keep:true}});
const entry=(id,patch={})=>({id,title:id,kind:'expense',status:'settled',repeat:'none',amountCents:1234,date:today,dueDate:today,accountId:'bank',category:'Other',note:'Original\nNote',...patch});
const ledger=()=>({...M.empty(),accounts:[account('bank'),account('card','credit')]});
test('balance comparison uses recorded cash, not reserves or expected income, and preserves all originals',()=>{
  const l=ledger();l.entries=[entry('lunch'),entry('expected',{kind:'income',status:'planned',amountCents:99999}),entry('void',{voidedAt:1})];const before=M.copy(l);
  assert.deepEqual(M.reconciliation(l,'bank','950.00',today),{credit:false,recordedCents:98766,actualCents:95000,differenceCents:-3766,adjustmentCents:-3766,checkedBalanceCents:95000});assert.deepEqual(l,before);
});
test('cash overdrafts and card overpayments retain signed balances while card debt changes use the correct inverse sign',()=>{
  const l=ledger();
  assert.deepEqual(M.reconciliation(l,'bank','-12.34',today),{credit:false,recordedCents:100000,actualCents:-1234,differenceCents:-101234,adjustmentCents:-101234,checkedBalanceCents:-1234});
  assert.deepEqual(M.reconciliation(l,'card','900.10',today),{credit:true,recordedCents:100000,actualCents:90010,differenceCents:-9990,adjustmentCents:9990,checkedBalanceCents:-90010});
  assert.deepEqual(M.reconciliation(l,'card','-2.25',today),{credit:true,recordedCents:100000,actualCents:-225,differenceCents:-100225,adjustmentCents:100225,checkedBalanceCents:225});
});
test('matching balances and decimal adjustments stay exact; unavailable accounts, dates, precision and oversized differences fail closed',()=>{
  const l=ledger();l.accounts[0].openingCents=30;assert.equal(M.reconciliation(l,'bank','0.30',today).adjustmentCents,0);assert.equal(M.reconciliation(l,'bank','0.10',today).adjustmentCents,-20);
  const before=M.copy(l);for(const amount of ['','1.234','1e3','1,000.00','NaN'])assert.throws(()=>M.reconciliation(l,'bank',amount,today));assert.throws(()=>M.reconciliation(l,'missing','0.30',today));assert.throws(()=>M.reconciliation(l,'bank','0.30','invalid'));assert.throws(()=>M.reconciliation(l,'bank','0.30','2026-09-30'));assert.deepEqual(l,before);
  l.accounts[0].openingCents=100000000000;assert.throws(()=>M.reconciliation(l,'bank','-1000000000.00',today),/difference/);
});
