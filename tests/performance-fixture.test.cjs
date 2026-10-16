const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,profiles,summarize}=require('./performance-fixture.cjs');
test('synthetic histories are deterministic, independent and contain no future days',()=>{
  for(const name of Object.keys(profiles)){
    const a=fixture(name),b=fixture(name);assert.deepEqual(a,b);assert.equal(a.boards.length,profiles[name].boards);
    const ids=[];
    for(const board of a.boards){
      assert.equal(Object.keys(board.diaryEntries).length,profiles[name].days);
      assert(Object.keys(board.diaryEntries).every(date=>date<=a.today));assert.equal(board.plannerTasks.length,profiles[name].tasks);
      ids.push(board.id,...board.plannerTasks.map(t=>t.id));
      assert(board.diaryEntries[a.today].thoughts.includes('\n'));
    }
    assert.equal(new Set(ids).size,ids.length);
    a.boards[0].diaryEntries[a.today].thoughts='Different';assert.notEqual(a.boards[1].diaryEntries[a.today].thoughts,'Different');assert.deepEqual(fixture(name),b);
  }
});
test('history size increases monotonically and malformed profile names are refused',()=>{
  const bytes=Object.keys(profiles).map(name=>Buffer.byteLength(JSON.stringify(fixture(name))));assert(bytes[0]<bytes[1] && bytes[1]<bytes[2]);
  for(const value of ['__proto__','constructor','unknown',null])assert.throws(()=>fixture(value));
});
test('timing summaries are sorted without changing samples and reject invalid timings',()=>{
  const values=[10,0,40,20];assert.deepEqual(summarize(values),{samples:4,min:0,median:15,p95:40,max:40});assert.deepEqual(values,[10,0,40,20]);assert.equal(summarize([]),null);
  for(const value of [[NaN],[Infinity],[-1],['2'],null])assert.throws(()=>summarize(value));
});
