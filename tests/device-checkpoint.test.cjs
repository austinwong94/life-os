const {test}=require('node:test'),assert=require('node:assert/strict');
const {covers,heads,compareReceipts}=require('../device-checkpoint.js');
test('checkpoint receipts never approve a backwards shared snapshot or an absent writer',()=>{
  const previous={deviceWriteHeads:{one:98,two:82,three:85}};
  assert.equal(covers({deviceWriteHeads:{one:86,two:98,three:85}},previous),false);
  assert.equal(covers({deviceWriteHeads:{one:98,two:98,three:85}},previous),true);
  assert.equal(covers({deviceWriteHeads:{one:100,two:98}},previous),false);
  assert.equal(covers({},{}),true);
  assert.equal(covers({deviceWriteHeads:Object.create({one:100})},{deviceWriteHeads:{one:98}}),false);
});
test('receipt recovery permits only identical full copies, never older or altered information',()=>{
  const current={boards:[{id:'one',cards:[{id:'diary',thoughts:'All original words\nSecond line'}]}],ui:{mode:'properties'},unknown:{retained:true},deviceWriteHeads:{a:2}};
  const previous=structuredClone(current);previous.deviceWriteHeads.a=3;
  assert.deepEqual(compareReceipts(current,previous),{missing:1,differences:[],metadataDifferences:[],repairable:true});
  for(const change of [c=>c.boards[0].cards[0].thoughts='T',c=>c.ui.mode='board',c=>c.unknown.retained=false,c=>c.boards=[]]){const other=structuredClone(current);change(other);const result=compareReceipts(other,previous);assert.equal(result.repairable,false);assert(result.differences.length>0);}
  assert.throws(()=>compareReceipts({},previous));assert.throws(()=>compareReceipts({...current,deviceWriteHeads:{a:-1}},previous));
});
test('only validated view/timestamp and derived daily countdown differences are receipt-equivalent',()=>{
  const card={id:'daily',type:'countdown',timerMode:'daily',targetAt:'2026-10-19T15:00:00Z',duration:100,remaining:80};
  const a={updatedAt:100,ui:{workspaceMode:'board'},boards:[{id:'one',archivedCards:[card]}],deviceWriteHeads:{writer:1}},b=structuredClone(a);b.updatedAt=110;b.ui.workspaceMode='properties';b.boards[0].archivedCards[0].duration=90;b.boards[0].archivedCards[0].remaining=70;b.deviceWriteHeads.writer=2;
  const r=compareReceipts(a,b);assert.equal(r.repairable,true);assert.equal(r.metadataDifferences.length,4);assert.equal(r.differences.length,0);
  for(const change of [c=>c.boards[0].archivedCards[0].title='New title',c=>c.boards[0].archivedCards[0].targetAt='2026-10-20T15:00:00Z',c=>c.boards[0].archivedCards[0].timerMode='manual',c=>c.boards[0].archivedCards[0].remaining=-1,c=>c.ui.workspaceMode='unknown',c=>c.updatedAt='100',c=>c.boards[0].archivedCards[0].completedOn='2026-10-18']){const changed=structuredClone(a);change(changed);assert.equal(compareReceipts(changed,b).repairable,false);}
});
test('invalid checkpoint counters are refused rather than treated as receipts',()=>{
  for(const n of [-1,0.5,'2',Infinity,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>heads({deviceWriteHeads:{one:n}}),/need review/);
  for(const value of [[],false,0,''])assert.throws(()=>heads({deviceWriteHeads:value}),/need review/);
  assert.deepEqual(heads({}),{});assert.deepEqual(heads({deviceWriteHeads:{one:0}}),{one:0});
});
