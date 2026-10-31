const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../workout-rest.js');
function fixture(){let now=1000;return {timer:create({now:()=>now}),set:value=>{now=value;}};}
test('new rest timers start ready and independent without starting a workout',()=>{
  const a=create({now:()=>1000}),b=create({now:()=>1000});
  assert.deepEqual(a.read(),{phase:'ready',durationSeconds:90,remainingMs:90000,seconds:90,text:'1:30'});
  a.change('start');assert.equal(b.read().phase,'ready');
});
test('rest countdown uses elapsed timestamps rather than the number of display callbacks',()=>{
  const {timer,set}=fixture();timer.change('start');set(2250);assert.equal(timer.read().remainingMs,88750);assert.equal(timer.read().text,'1:29');
  set(91000);assert.equal(timer.read().phase,'finished');assert.equal(timer.read().text,'0:00');set(1000000);assert.equal(timer.read().seconds,0);
});
test('pause and resume retain sub-second time without counting paused time',()=>{
  const {timer,set}=fixture();timer.change('start');set(2250);timer.change('pause');set(500000);assert.equal(timer.read().phase,'paused');assert.equal(timer.read().remainingMs,88750);
  timer.change('start');set(588749);assert.equal(timer.read().seconds,1);set(588750);assert.equal(timer.read().phase,'finished');
});
test('immediate pause remains explicitly paused and duration changes cannot erase it',()=>{
  const {timer}=fixture();timer.change('start');timer.change('pause');assert.equal(timer.read().phase,'paused');const before=timer.read();assert.throws(()=>timer.change('duration',60),/Reset/);assert.deepEqual(timer.read(),before);
});
test('duration changes are explicit, bounded and do not start the timer',()=>{
  const {timer}=fixture();for(const value of [15,30,60,90,120,180,300,600,900]){timer.change('duration',value);assert.equal(timer.read().seconds,value);assert.equal(timer.read().phase,'ready');}
  const before=timer.read();for(const value of [0,-1,14,901,90.5,'90',NaN,Infinity,null])assert.throws(()=>timer.change('duration',value));assert.deepEqual(timer.read(),before);
});
test('reset keeps the chosen duration and a finished timer starts a new full rest',()=>{
  const {timer,set}=fixture();timer.change('duration',30);timer.change('start');set(40000);assert.equal(timer.read().phase,'finished');timer.change('start');assert.equal(timer.read().seconds,30);timer.change('reset');assert.equal(timer.read().phase,'ready');assert.equal(timer.read().seconds,30);
});
test('repeated start cannot extend a running deadline and pause cannot resurrect an expired rest',()=>{
  const {timer,set}=fixture();timer.change('start');set(2000);timer.change('start');assert.equal(timer.read().seconds,89);set(92000);timer.change('pause');assert.equal(timer.read().phase,'finished');
});
test('a backwards clock is bounded by the chosen duration and reads never expose mutable state',()=>{
  const {timer,set}=fixture();timer.change('start');set(0);const result=timer.read();assert.equal(result.seconds,90);result.durationSeconds=999;assert.equal(timer.read().durationSeconds,90);
});
test('invalid clocks and unsupported commands do not partially change the timer',()=>{
  const {timer,set}=fixture(),before=timer.read();assert.throws(()=>timer.change('unknown'));assert.deepEqual(timer.read(),before);
  for(const value of [NaN,Infinity,-1,1.5]){set(value);assert.throws(()=>timer.change('start'));}set(1000);assert.deepEqual(timer.read(),before);
  set(Number.MAX_SAFE_INTEGER);assert.throws(()=>timer.change('start'));set(1000);assert.deepEqual(timer.read(),before);
});
