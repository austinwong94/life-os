const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module');
let handler;
global.Deno={env:{get:name=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-private-key',SUPABASE_ANON_KEY:'synthetic-public-key'})[name]},serve:fn=>{handler=fn;}};
const load=name=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/'+name,'utf8'))).toString('base64'));
const owner='11111111-1111-4111-8111-111111111111';
test('property function authorization rejects missing credentials before any provider request',async()=>{
  const auth=await load('property-auth.ts');let requests=0,called=false;global.fetch=async()=>{requests++;throw new Error('No network');};auth.propertyServe(async()=>{called=true;return new Response('private');});
  const response=await handler(new Request('https://synthetic.invalid/function',{method:'POST',body:'{}'}));assert.equal(response.status,401);assert.equal(requests,0);assert.equal(called,false);
});
test('property function checks a genuine Auth user and owned workspace, not a decoded subject alone',async()=>{
  const auth=await load('property-auth.ts');let called=false;
  global.fetch=async url=>url.endsWith('/auth/v1/user')?Response.json({id:owner}):Response.json([]);auth.propertyServe(async()=>{called=true;return new Response('private');});
  const response=await handler(new Request('https://synthetic.invalid/function',{method:'POST',headers:{authorization:'Bearer synthetic-token'},body:'{}'}));assert.equal(response.status,403);assert.equal(called,false);
});
test('valid property requests retain the complete bounded body and pass only after ownership validation',async()=>{
  const auth=await load('property-auth.ts');const seen=[];global.fetch=async url=>{seen.push(url);return Response.json(url.endsWith('/auth/v1/user')?{id:owner}:[{id:'owned-workspace'}]);};
  auth.propertyServe(async req=>Response.json(await req.json()));const body={sources:[],note:'Complete multiline\nUnchanged'};
  const response=await handler(new Request('https://synthetic.invalid/function',{method:'POST',headers:{authorization:'Bearer synthetic-token'},body:JSON.stringify(body)}));assert.deepEqual(await response.json(),body);assert.equal(seen.length,2);
});
test('property AI limiter fails closed without a user, on database errors and on transport failures',async()=>{
  const guards=await load('guards.ts');assert.equal(await guards.underDailyCap(new Request('https://synthetic.invalid'),'test',2),false);
  const token='e30.'+Buffer.from(JSON.stringify({sub:owner})).toString('base64url')+'.signature',request=new Request('https://synthetic.invalid',{headers:{authorization:'Bearer '+token}});
  global.fetch=async()=>new Response('unavailable',{status:503});assert.equal(await guards.underDailyCap(request,'test',2),false);global.fetch=async()=>{throw new Error('Unavailable');};assert.equal(await guards.underDailyCap(request,'test',2),false);
});
test('disabled AI functions cannot read records, make provider calls or expose a secret',()=>{
  for(const name of ['earnings-import','guest-reply-draft','receipt-scan','tax-doc-analyze','tax-review']){const source=fs.readFileSync('supabase/functions/property-'+name+'/index.ts','utf8');assert.match(source,/ai_disabled/);assert.doesNotMatch(source,/fetch\(|req\.json|ANTHROPIC_API_KEY|api\.anthropic/);}
});
test('scheduled iCal refresh is atomic and never deletes the last good snapshot after a feed error',()=>{
  const source=fs.readFileSync('supabase/functions/property-ical-cron-sync/index.ts','utf8');assert.match(source,/if \(!fetchError\)/);assert.match(source,/property_replace_ical_blocks/);assert.doesNotMatch(source,/method: "DELETE"/);assert.match(source,/redirect: "error"/);
});
