const {test,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module');
const originalFetch=global.fetch,originalDeno=global.Deno;
afterEach(()=>{global.fetch=originalFetch;if(originalDeno===undefined)delete global.Deno;else global.Deno=originalDeno;});
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const shared='supabase/functions/_shared/';
const ics=moduleUrl(fs.readFileSync(shared+'ics.ts','utf8'));
const feed=moduleUrl(fs.readFileSync(shared+'property-ical.ts','utf8').replace('"./ics.ts"',JSON.stringify(ics)));
const api=import(feed),limits={maxBytes:4096,timeoutMs:1000};
const event=(uid='synthetic-1',start='20261020',end='20261022')=>`BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nSUMMARY:Private synthetic guest\r\nDESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/SYNTHETIC\r\nEND:VEVENT`;
const calendar=(events=event())=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+(events?events+'\r\n':'')+'END:VCALENDAR\r\n';
test('calendar transport retains exact UTF-8 across chunk boundaries and refuses redirects',async()=>{
  const {fetchPropertyIcs}=await api,body=calendar().replace('Private synthetic guest','A synthetic thought: 世界'),bytes=new TextEncoder().encode(body);let request;
  global.fetch=async(url,init)=>{request={url,init};return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=2)controller.enqueue(bytes.slice(i,i+2));controller.close();}}));};
  assert.equal(await fetchPropertyIcs('https://www.airbnb.com/calendar/ical/synthetic.ics',{...limits,maxBytes:bytes.length}),body);assert.equal(request.init.redirect,'error');assert.equal(request.init.signal.aborted,false);
});
test('calendar URL guards reject foreign hosts, credentials, insecure schemes and unexpected ports before fetch',async()=>{
  const {fetchPropertyIcs}=await api;let calls=0;global.fetch=async()=>{calls++;throw new Error('Unexpected network');};
  for(const url of ['http://airbnb.com/feed','https://airbnb.com.evil.invalid/feed','https://evilairbnb.com/feed','https://127.0.0.1/feed','https://user:password@airbnb.com/feed','https://airbnb.com:8443/feed','not a URL'])await assert.rejects(fetchPropertyIcs(url,limits));
  assert.equal(calls,0);
});
test('declared oversized responses are cancelled before acquiring a body reader',async()=>{
  const {fetchPropertyIcs}=await api;let cancelled=false,read=false;
  const stream=new ReadableStream({cancel(){cancelled=true;}}),getReader=stream.getReader.bind(stream);stream.getReader=(...args)=>{read=true;return getReader(...args);};
  global.fetch=async()=>new Response(stream,{headers:{'content-length':'99999'}});
  await assert.rejects(fetchPropertyIcs('https://booking.com/feed',limits),/^Error: too_large$/);assert.equal(cancelled,true);assert.equal(read,false);
});
test('actual streamed bytes enforce the cap even with missing or dishonest content lengths',async()=>{
  const {fetchPropertyIcs}=await api;
  for(const length of [null,'1']){let cancelled=false,pulls=0;
    global.fetch=async()=>new Response(new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(8));},cancel(){cancelled=true;}}),{headers:length?{'content-length':length}:{}});
    await assert.rejects(fetchPropertyIcs('https://admin.booking.com/feed',{...limits,maxBytes:8}),/^Error: too_large$/);assert.equal(cancelled,true);assert(pulls<=4);
  }
});
test('byte limits cannot be bypassed with multibyte characters',async()=>{
  const {fetchPropertyIcs}=await api;global.fetch=async()=>new Response('界界');await assert.rejects(fetchPropertyIcs('https://airbnb.com/feed',{...limits,maxBytes:5}),/^Error: too_large$/);
});
test('the deadline covers a body that stalls after headers, without awaiting stalled cancellation',{timeout:5000},async()=>{
  const {fetchPropertyIcs}=await api;let read=false,cancelled=false,signal;
  global.fetch=async(_,init)=>{signal=init.signal;return new Response(new ReadableStream({pull(){read=true;return new Promise(()=>{});},cancel(){cancelled=true;return new Promise(()=>{});}}));};
  await assert.rejects(fetchPropertyIcs('https://airbnb.com/feed',{...limits,timeoutMs:20}),/^Error: feed_timeout$/);assert.equal(read,true);assert.equal(cancelled,true);assert.equal(signal.aborted,true);
});
test('the deadline also covers a stalled header request and cancels a late response',{timeout:5000},async()=>{
  const {fetchPropertyIcs}=await api;let resolve,cancelled=false;
  global.fetch=()=>new Promise(done=>{resolve=done;});
  await assert.rejects(fetchPropertyIcs('https://airbnb.com/feed',{...limits,timeoutMs:20}),/^Error: feed_timeout$/);
  resolve(new Response(new ReadableStream({cancel(){cancelled=true;}})));await new Promise(done=>setImmediate(done));assert.equal(cancelled,true);
});
test('provider errors, broken UTF-8 and HTTP failures never echo private feed URLs',async()=>{
  const {fetchPropertyIcs}=await api;
  global.fetch=async()=>{throw new Error('Failed private URL https://airbnb.com/feed?token=synthetic-private');};await assert.rejects(fetchPropertyIcs('https://airbnb.com/feed',limits),/^Error: feed_unavailable$/);
  global.fetch=async()=>new Response(new Uint8Array([0xc3]));await assert.rejects(fetchPropertyIcs('https://airbnb.com/feed',limits),/^Error: invalid_utf8$/);
  global.fetch=async()=>new Response('Private provider details',{status:503});await assert.rejects(fetchPropertyIcs('https://airbnb.com/feed',limits),/^Error: http_503$/);
});
test('strict calendar parsing accepts a valid empty feed and complete folded events without changing dates',async()=>{
  const {parsePropertyIcs}=await api;assert.deepEqual(parsePropertyIcs(calendar(''),{maxEvents:2}),[]);
  const rows=parsePropertyIcs(calendar(event().replace('Private synthetic guest','Private synthetic\r\n guest')),{maxEvents:2});assert.equal(rows.length,1);assert.equal(rows[0].start,'2026-10-20');assert.equal(rows[0].end,'2026-10-22');assert.equal(rows[0].uid,'synthetic-1');
});
test('HTML, empty bodies, truncated calendars, missing versions and mismatched components cannot become empty availability',async()=>{
  const {parsePropertyIcs}=await api;
  for(const body of ['', '<html>Temporarily unavailable</html>',calendar().replace('END:VCALENDAR',''),calendar().replace('END:VEVENT',''),calendar().replace('VERSION:2.0\r\n',''),calendar().replace('END:VEVENT','END:VTODO'),calendar()+calendar('')])assert.throws(()=>parsePropertyIcs(body,{maxEvents:2}),/invalid_calendar/);
});
test('invalid or skipped events and event-limit overflow refuse the complete refresh rather than truncate it',async()=>{
  const {parsePropertyIcs}=await api;
  assert.throws(()=>parsePropertyIcs(calendar(event().replace('UID:synthetic-1\r\n','')),{maxEvents:2}),/invalid_calendar/);
  for(const [start,end] of [['20260231','20260302'],['20261022','20261020'],['20261020','20261020']])assert.throws(()=>parsePropertyIcs(calendar(event('bad',start,end)),{maxEvents:2}),/invalid_event_dates/);
  assert.throws(()=>parsePropertyIcs(calendar(event('first')+'\r\n'+event('second')),{maxEvents:1}),/too_many_events/);
});
let serial=0;
async function handler(slug){
  let run;global.Deno={env:{get:name=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',SUPABASE_ANON_KEY:'synthetic-public'})[name]},serve:fn=>{run=fn;}};
  const auth=moduleUrl(fs.readFileSync(shared+'property-auth.ts','utf8'));
  let source=fs.readFileSync('supabase/functions/property-'+slug+'/index.ts','utf8');
  for(const [path,url] of [['property-auth.ts',auth],['property-ical.ts',feed],['ics.ts',ics]])source=source.replaceAll('"../_shared/'+path+'"',JSON.stringify(url));
  await import(moduleUrl(source)+'#'+(++serial));return run;
}
const owner='11111111-1111-4111-8111-111111111111';
test('scheduled refresh retains the last good snapshot after any malformed, partial or over-limit feed',async()=>{
  const run=await handler('ical-cron-sync'),old=[{uid:'last-good',villa:'Sunrise',start_date:'2026-10-20',end_date:'2026-10-22'}];
  for(const bad of ['<html>Temporary error</html>',calendar().replace('END:VCALENDAR',''),calendar(Array.from({length:301},(_,i)=>event('event-'+i)).join('\r\n'))]){
    let saved=structuredClone(old),writes=0;
    global.fetch=async(url,init)=>{
      const path=new URL(url).pathname;
      if(path.endsWith('/property_callback_secret'))return Response.json('synthetic-secret');
      if(path.endsWith('/property_migration_control'))return Response.json([{owner_id:owner}]);
      if(path.endsWith('/property_workspaces'))return Response.json([{user_id:owner,data:{appSettings:{ical:{sources:[{villa:'Sunrise',url:'https://airbnb.com/good'},{villa:'Windmill',url:'https://booking.com/bad'}]}}}}]);
      if(path.endsWith('/property_replace_ical_blocks')){writes++;saved=JSON.parse(init.body).p_blocks;return Response.json(saved.length);}
      return new Response(path==='/good'?calendar():bad);
    };
    const response=await run(new Request('https://synthetic.invalid/function',{method:'POST',headers:{'x-cron-secret':'synthetic-secret'}}));const result=await response.json();assert(result.report[0].fetchError);assert.equal(writes,0);assert.deepEqual(saved,old);
  }
});
test('successful scheduled refresh writes one owner-scoped atomic snapshot and excludes own exports',async()=>{
  const run=await handler('ical-cron-sync');let writes=0,blocks;
  global.fetch=async(url,init)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/property_callback_secret'))return Response.json('synthetic-secret');
    if(path.endsWith('/property_migration_control'))return Response.json([{owner_id:owner}]);
    if(path.endsWith('/property_workspaces'))return Response.json([{user_id:owner,data:{appSettings:{ical:{sources:[{villa:'Sunrise',url:'https://airbnb.com/feed'}]}}}}]);
    if(path.endsWith('/property_replace_ical_blocks')){writes++;const payload=JSON.parse(init.body);assert.equal(payload.p_user,owner);blocks=payload.p_blocks;return Response.json(blocks.length);}
    return new Response(calendar(event()+'\r\n'+event('own@sunrise-villa.export')));
  };
  const response=await run(new Request('https://synthetic.invalid/function',{method:'POST',headers:{'x-cron-secret':'synthetic-secret'}}));assert.equal(response.status,200);assert.equal(writes,1);assert.equal(blocks.length,1);assert.equal(blocks[0].user_id,owner);assert.equal(blocks[0].villa,'Sunrise');assert(!JSON.stringify(blocks).includes('Private synthetic guest'));
});
test('manual import refuses malformed calendars and never writes bookings or personal records',async()=>{
  const run=await handler('ical-import'),calls=[];
  global.fetch=async(url,init)=>{calls.push({url,method:init?.method || 'GET'});const path=new URL(url).pathname;
    if(path.endsWith('/auth/v1/user'))return Response.json({id:owner});if(path.endsWith('/property_workspaces'))return Response.json([{id:'owned'}]);return new Response('<html>Unavailable</html>');};
  const response=await run(new Request('https://synthetic.invalid/function',{method:'POST',headers:{authorization:'Bearer synthetic-user'},body:JSON.stringify({sources:[{villa:'Sunrise',url:'https://airbnb.com/feed'}]})}));const result=await response.json();assert.equal(result.results[0].ok,false);assert.equal(result.results[0].error,'invalid_calendar');assert(calls.every(call=>call.method==='GET'));assert(!calls.some(call=>call.url.includes('/user_states')));
});
test('automatic calendar telemetry records a successful empty refresh without touching business records',async()=>{
  const run=await handler('ical-cron-sync'),calls=[],runId='22222222-2222-4222-8222-222222222222';
  global.fetch=async(url,init)=>{
    const path=new URL(url).pathname;calls.push({path,body:init?.body && JSON.parse(init.body)});
    if(path.endsWith('/property_callback_secret'))return Response.json('synthetic-secret');
    if(path.endsWith('/property_migration_control'))return Response.json([{owner_id:owner}]);
    if(path.endsWith('/property_calendar_sync_begin'))return Response.json(runId);
    if(path.endsWith('/property_calendar_sync_finish'))return Response.json(true);
    if(path.endsWith('/property_workspaces'))return Response.json([{user_id:owner,data:{appSettings:{ical:{sources:[{url:'https://airbnb.com/feed'}]}}}}]);
    if(path.endsWith('/property_replace_ical_blocks'))return Response.json(0);
    return new Response(calendar(''));
  };
  const response=await run(new Request('https://synthetic.invalid/function',{method:'POST',headers:{'x-cron-secret':'synthetic-secret'}}));assert.equal(response.status,200);assert.equal((await response.json()).statusRecorded,true);
  assert.deepEqual(calls.find(c=>c.path.endsWith('/property_calendar_sync_finish')).body,{p_owner:owner,p_run:runId,p_status:'success',p_blocks:0,p_error:null});assert(!calls.some(c=>c.path.includes('user_states')));
});
test('automatic failure writes only a safe failure code and preserves the last good availability',async()=>{
  const run=await handler('ical-cron-sync'),calls=[];
  global.fetch=async(url,init)=>{
    const path=new URL(url).pathname;calls.push({path,body:init?.body && JSON.parse(init.body)});
    if(path.endsWith('/property_callback_secret'))return Response.json('synthetic-secret');
    if(path.endsWith('/property_migration_control'))return Response.json([{owner_id:owner}]);
    if(path.endsWith('/property_calendar_sync_begin'))return Response.json('22222222-2222-4222-8222-222222222222');
    if(path.endsWith('/property_calendar_sync_finish'))return Response.json(true);
    if(path.endsWith('/property_workspaces'))return Response.json([{user_id:owner,data:{appSettings:{ical:{sources:[{url:'https://airbnb.com/feed?token=private'}]}}}}]);
    return new Response('<html>provider down</html>');
  };
  const response=await run(new Request('https://synthetic.invalid/function',{method:'POST',headers:{'x-cron-secret':'synthetic-secret'}}));assert.equal(response.status,502);const completion=calls.find(c=>c.path.endsWith('/property_calendar_sync_finish')).body;assert.equal(completion.p_status,'error');assert.equal(completion.p_error,'feed_unavailable');assert.doesNotMatch(JSON.stringify(completion),/token|provider|html/);assert(!calls.some(c=>c.path.endsWith('/property_replace_ical_blocks')));
});
test('migration regeneration retains the bounded fetch/parser boundary and refuses unknown source layouts',()=>{
  const {hardenPropertyCalendar}=require('../tools/property-calendar-hardening.cjs');
  for(const slug of ['ical-import','ical-cron-sync']){const source=fs.readFileSync('supabase/functions/property-'+slug+'/index.ts','utf8');assert.equal(hardenPropertyCalendar(source,slug),source);assert.doesNotMatch(source,/res\.text\(|response\.text\(/);assert.match(source,/parsePropertyIcs\(body/);}
  assert.throws(()=>hardenPropertyCalendar('unexpected function layout','ical-import'),/boundary changed/);
  const original='import { parseIcs } from "../_shared/ics.ts";\nconst ALLOWED_HOSTS = ["airbnb.com"];\nfunction hostAllowed(u: URL): boolean { return true; }\nasync function fetchIcs(feedUrl: string): Promise<string> { return (await fetch(feedUrl)).text(); }\npropertyServe(async()=>parseIcs(body, {maxEvents:2}));';
  const converted=hardenPropertyCalendar(original,'ical-import');assert.match(converted,/fetchPropertyIcs\(feedUrl/);assert.match(converted,/parsePropertyIcs\(body/);assert.doesNotMatch(converted,/\.text\(\)|function hostAllowed/);assert.equal(hardenPropertyCalendar(converted,'ical-import'),converted);
});
