const test=require('node:test'),assert=require('node:assert/strict'),T=require('../cloud-transport.js');
function clock(){let next=0;const queue=new Map();return {queue,setTimer:(fn,ms)=>{queue.set(++next,{fn,ms});return next;},clearTimer:id=>queue.delete(id),fire(){const [id,item]=queue.entries().next().value;queue.delete(id);item.fn();return item.ms;}};}
test('Retry-After uses seconds or HTTP date, rejects invalid values and never invents a negative wait',()=>{
  const now=Date.parse('2026-10-16T04:00:00Z');assert.equal(T.retryAfter('30',now),30000);assert.equal(T.retryAfter('Fri, 16 Oct 2026 04:01:00 GMT',now),60000);
  for(const input of ['',null,'-1','garbage','Fri, 16 Oct 2026 03:00:00 GMT'])assert.equal(T.retryAfter(input,now),0);
});
test('HTTP transport exposes bounded retry metadata without changing owner headers, method or payload',async()=>{
  const options={method:'PATCH',headers:{Authorization:'Bearer synthetic'},body:'{"state":"original"}'},before=JSON.stringify(options);let seen;
  await assert.rejects(T.json('https://example.invalid/',options,{fetch:async(url,request)=>{seen=request;return new Response('{"message":"busy"}',{status:503,headers:{'Retry-After':'60'}});},readError:async()=> 'Service busy'}),error=>error.name==='CloudRequestError' && error.status===503 && error.retryable && error.retryAfterMs===60000 && error.message==='Service busy');
  assert.equal(JSON.stringify(options),before);assert.equal(seen.body,options.body);assert.equal(seen.headers.Authorization,options.headers.Authorization);assert.equal(seen.method,'PATCH');
});
test('authentication, permission, validation and unclassified server errors are not automatic retries',async()=>{
  for(const status of [400,401,403,404,409,422,501])await assert.rejects(T.json('https://example.invalid/',{},{fetch:async()=>new Response('',{status})}),error=>error.status===status && error.retryable===false);
  for(const status of [408,429,500,502,503,504])await assert.rejects(T.json('https://example.invalid/',{},{fetch:async()=>new Response('',{status})}),error=>error.status===status && error.retryable===true);
});
test('network failure is retryable, malformed successful JSON is not treated as a transient outage',async()=>{
  await assert.rejects(T.json('https://example.invalid/',{},{fetch:async()=>{throw new TypeError('fetch failed');}}),error=>error.retryable===true && !error.message.includes('fetch failed'));
  await assert.rejects(T.json('https://example.invalid/',{},{fetch:async()=>new Response('{broken',{status:200})}),error=>error instanceof SyntaxError && !error.retryable);
});
test('request deadline covers response-body reading and aborts without retrying a write inside the transport',async()=>{
  let calls=0,aborted=false;
  await assert.rejects(T.json('https://example.invalid/',{method:'PATCH'},{timeoutMs:5,fetch:async(_url,request)=>{
    calls++;return {ok:true,json:()=>new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Abort','AbortError'));}))};
  }}),error=>error.retryable===true && /timed out/.test(error.message));assert.equal(calls,1);assert.equal(aborted,true);
});
test('a stalled HTTP error body cannot turn a permission denial into a retry or drop a known server wait',async()=>{
  for(const status of [403,503])await assert.rejects(T.json('https://example.invalid/',{},{timeoutMs:5,readError:response=>response.json(),fetch:async(_url,request)=>({
    ok:false,status,headers:new Headers({'Retry-After':'60'}),json:()=>new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>reject(new DOMException('Abort','AbortError'))))
  })}),error=>error.status===status && error.retryable===(status===503) && error.retryAfterMs===60000);
});
test('retry budget has one timer, increasing waits and a hard limit; explicit reset permits a fresh cycle',()=>{
  const c=clock(),runs=[],r=T.createRetry({...c,allowed:()=>true,run:owner=>runs.push(owner)});
  const error={retryable:true};
  for(const delay of [5000,15000,45000]){assert(r.schedule(error,'owner'));assert(r.schedule(error,'owner'));assert.equal(c.queue.size,1);assert.equal(c.fire(),delay);}
  assert.equal(r.schedule(error,'owner'),false);assert.equal(c.queue.size,0);assert.deepEqual(runs,['owner','owner','owner']);
  r.reset();assert(r.schedule(error,'owner'));assert.equal(c.fire(),5000);
});
test('retry rechecks the original owner and pause guards when its timer fires, and cancellation never runs it',()=>{
  const c=clock(),runs=[];let owner='one',paused=false;
  const r=T.createRetry({...c,allowed:id=>id===owner && !paused,run:id=>runs.push(id)});
  assert(r.schedule({retryable:true},'one'));owner='two';c.fire();assert.deepEqual(runs,[]);
  assert(r.schedule({retryable:true},'two'));paused=true;c.fire();assert.deepEqual(runs,[]);
  paused=false;assert(r.schedule({retryable:true},'two'));r.cancel();assert.equal(c.queue.size,0);assert.deepEqual(runs,[]);
  assert.equal(r.schedule({retryable:false},'two'),false);assert.equal(r.schedule({retryable:true},''),false);
});
test('server wait is respected, and a long Retry-After does not get silently shortened',()=>{
  const c=clock(),r=T.createRetry({...c,allowed:()=>true,run:()=>{}});
  assert(r.schedule({retryable:true,retryAfterMs:60000},'owner'));assert.equal(c.fire(),60000);
  assert(r.schedule({retryable:true,retryAfterMs:900000},'owner'));assert.equal(c.fire(),900000);
  assert.equal(r.schedule({retryable:true,retryAfterMs:2147483648},'owner'),false);assert.equal(c.queue.size,0);
});
