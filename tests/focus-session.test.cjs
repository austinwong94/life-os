const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('daily-workspace.js','utf8'),from=source.indexOf('function dailyFocusTimerState('),to=source.indexOf('\nfunction dailyFocusKeys(',from),context=vm.createContext({});
assert(from>=0 && to>from);vm.runInContext(source.slice(from,to),context);const read=(timer,now=100000)=>JSON.parse(JSON.stringify(context.dailyFocusTimerState(timer,now))),key=JSON.stringify(['card','task']);
test('focus timer reads distinguish missing running paused and finished without changing saved fields',()=>{
  assert.deepEqual(read(null),{phase:'missing'});assert.deepEqual(read(undefined),{phase:'missing'});
  for(const [timer,phase,text]of [[{key,endAt:160001},'running','01:01'],[{key,remaining:60001},'paused','01:01'],[{key,endAt:99999},'finished','00:00'],[{key,remaining:0},'finished','00:00']]){const before=JSON.stringify(timer),frame=read(timer);assert.equal(frame.phase,phase);assert.equal(frame.text,text);assert.equal(JSON.stringify(timer),before);}
});
test('focus timer rejects malformed identities and clocks while retaining all unknown original data',()=>{
  for(const timer of [false,[],{},'original value',{key:'legacy task',remaining:1000},{key:'["card"]',remaining:1000},{key:'["", "task"]',remaining:1000},{key,endAt:0},{key,endAt:NaN},{key,endAt:Infinity},{key,remaining:-1},{key,remaining:0.5},{key,remaining:'1000'},{key,unknown:{original:'kept'}}]){const before=JSON.stringify(timer);assert.equal(read(timer).phase,'invalid');assert.equal(JSON.stringify(timer),before);}
  assert.equal(read({key,endAt:160000},NaN).phase,'invalid');assert.equal(read({key,endAt:160000},-1).phase,'invalid');
});
test('focus reads use the current deadline rather than decremented storage and preserve extra fields',()=>{
  const timer={key,endAt:160000,remaining:80000,custom:{kept:'Original information'}},before=JSON.stringify(timer);assert.equal(read(timer,100000).remainingMs,60000);assert.equal(read(timer,150000).remainingMs,10000);assert.equal(read(timer,160000).phase,'finished');assert.equal(JSON.stringify(timer),before);
});
