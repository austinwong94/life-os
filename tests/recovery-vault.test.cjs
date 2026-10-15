const {test}=require('node:test');
const assert=require('node:assert/strict');
const {combine}=require('../recovery-vault.js');
test('recovery union retains complete original records and orders newest first',()=>{
  const older={id:'old',savedAt:'2026-10-13',state:{diary:'Original\n第二行'}};
  const newer={id:'new',savedAt:'2026-10-15',rawState:'unparsed original'};
  const a=JSON.stringify(older),b=JSON.stringify(newer);
  assert.deepEqual(combine([older],[newer,older]),[newer,older]);
  assert.equal(JSON.stringify(older),a);assert.equal(JSON.stringify(newer),b);
});
test('identity collisions or malformed recovery caches refuse consolidation',()=>{
  assert.throws(()=>combine([{id:'same',state:{a:1}}],[{id:'same',state:{a:2}}]),/Both original copies/);
  assert.throws(()=>combine([],{}),/Nothing was removed/);
  assert.throws(()=>combine([],[{state:{a:1}}]),/Nothing was removed/);
});
