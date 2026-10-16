const {test}=require('node:test'),assert=require('node:assert/strict');
const {covers,heads}=require('../device-checkpoint.js');
test('checkpoint receipts never approve a backwards shared snapshot or an absent writer',()=>{
  const previous={deviceWriteHeads:{one:98,two:82,three:85}};
  assert.equal(covers({deviceWriteHeads:{one:86,two:98,three:85}},previous),false);
  assert.equal(covers({deviceWriteHeads:{one:98,two:98,three:85}},previous),true);
  assert.equal(covers({deviceWriteHeads:{one:100,two:98}},previous),false);
  assert.equal(covers({},{}),true);
  assert.equal(covers({deviceWriteHeads:Object.create({one:100})},{deviceWriteHeads:{one:98}}),false);
});
test('invalid checkpoint counters are refused rather than treated as receipts',()=>{
  for(const n of [-1,0.5,'2',Infinity,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>heads({deviceWriteHeads:{one:n}}),/need review/);
  for(const value of [[],false,0,''])assert.throws(()=>heads({deviceWriteHeads:value}),/need review/);
  assert.deepEqual(heads({}),{});assert.deepEqual(heads({deviceWriteHeads:{one:0}}),{one:0});
});
