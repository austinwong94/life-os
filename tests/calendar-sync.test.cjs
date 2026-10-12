const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('../calendar-sync-core.js');
const P=require('../planner-store.js');
const copy=x=>structuredClone(x);
const board=()=>({id:'board-1',cards:[{id:'planner',type:'planner',plannerSchemaVersion:2,plannerTasks:[{id:'task',title:'Walk',dateKey:'2026-10-11',done:false,notes:'Private thoughts'}]},
  {id:'activity',type:'event',activity:{title:'Trip',allDay:true,startDate:'2026-12-28',endDate:'2027-01-02',notes:'Private diary',location:'Park'}},
  {id:'diary',type:'diary',diaryEntries:{'2026-10-11':{thoughts:'Must never export'}}}],archivedCards:[]});
async function harness() {
  const desired=(await C.collect('user',board(),P))[0];let remote=null,receipt=null,writes=0;
  return {desired,get remote(){return remote;},set remote(x){remote=x;},get receipt(){return receipt;},set receipt(x){receipt=x;},get writes(){return writes;},
    api:{get:async()=>copy(remote),insert:async(event)=>{writes++;remote={...copy(event),etag:'"one"'};return copy(remote);},patch:async(id,event,etag)=>{
      assert.equal(etag,remote.etag);writes++;remote={...remote,...copy(event),etag:'"two"'};return copy(remote);
    }},save:async(value)=>{receipt=copy(value);}};
}
test('stable event IDs are isolated by owner, board and source, not title or date',async()=>{
  const a=await C.collect('user',board(),P),b=board();b.cards[0].plannerTasks[0].title='Renamed';b.cards[0].plannerTasks[0].dateKey='2026-10-12';
  assert.equal(a[0].id,(await C.collect('user',b,P))[0].id);assert.match(a[0].id,/^[0-9a-v]{66}$/);
  b.id='other';assert.notEqual(a[0].id,(await C.collect('user',b,P))[0].id);assert.notEqual(a[0].id,(await C.collect('other',board(),P))[0].id);
});
test('collection preserves originals, exports inclusive all-day end, excludes sensitive records',async()=>{
  const b=board(),before=copy(b),events=await C.collect('user',b,P);assert.deepEqual(b,before);
  assert.equal(events[1].end.date,'2027-01-03');assert.equal(events.length,2);assert.doesNotMatch(JSON.stringify(events),/Private|diary|Must never/);
});
test('undated, parked, removed and archived tasks do not create Google events',async()=>{
  const b=board(),base=b.cards[0].plannerTasks[0];b.cards[0].plannerTasks.push({...base,id:'undated',dateKey:''},{...base,id:'deleted',deletedAt:1},{...base,id:'archived',archivedAt:1},{...base,id:'parked',status:'parked'});
  assert.equal((await C.collect('user',b,P)).length,2);
});
test('archived planner source keeps canonical active tasks, not repeated projections',async()=>{
  const b=board();b.archivedCards.push(b.cards.shift());b.archivedCards[0].plannerEntries={'2026-10-12':{note:'Walk'}};
  assert.equal((await C.collect('user',b,P)).filter(e=>e.extendedProperties.private.kind==='task').length,1);
});
test('invalid times and duplicate task identity stop before exporting any records',async()=>{
  const b=board();b.cards[0].plannerTasks.push(copy(b.cards[0].plannerTasks[0]));await assert.rejects(C.collect('user',b,P),/Duplicate/);
  b.cards.shift();b.cards[0].activity={title:'Bad',allDay:false,startAt:'bad',endAt:'bad'};await assert.rejects(C.collect('user',b,P),/times/);
});
test('retries and unchanged runs cannot create duplicate events',async()=>{
  const h=await harness();assert.equal((await C.syncOne(h.desired,h.receipt,h.api,h.save)).status,'created');
  assert.equal((await C.syncOne(h.desired,h.receipt,h.api,h.save)).status,'unchanged');assert.equal(h.writes,1);
});
test('rename and completion update the same ID, preserve unmanaged Google notes',async()=>{
  const h=await harness();await C.syncOne(h.desired,h.receipt,h.api,h.save);h.remote.description='Google note';
  const renamed={...h.desired,summary:'Completed: Renamed'};
  assert.equal((await C.syncOne(renamed,h.receipt,h.api,h.save)).status,'updated');assert.equal(h.remote.id,h.desired.id);assert.equal(h.remote.description,'Google note');
});
test('Google edits and cancellation are held for review, never overwritten or recreated',async()=>{
  const h=await harness();await C.syncOne(h.desired,h.receipt,h.api,h.save);h.remote.summary='Google edit';
  assert.equal((await C.syncOne(h.desired,h.receipt,h.api,h.save)).status,'conflict');assert.equal(h.writes,1);
  h.remote=null;assert.equal((await C.syncOne(h.desired,h.receipt,h.api,h.save)).status,'conflict');assert.equal(h.writes,1);
});
test('lost response after successful insert resumes without duplicates',async()=>{
  const h=await harness(),insert=h.api.insert;h.api.insert=async event=>{await insert(event);throw new Error('Lost response');};
  await assert.rejects(C.syncOne(h.desired,h.receipt,h.api,h.save),/Lost/);assert.ok(h.receipt.pending);
  assert.equal((await C.syncOne(h.desired,h.receipt,h.api,h.save)).status,'unchanged');assert.equal(h.writes,1);
});
test('lost update receipt resumes even if a new local revision exists',async()=>{
  const h=await harness();await C.syncOne(h.desired,h.receipt,h.api,h.save);
  const next={...h.desired,summary:'Revision 1'},patch=h.api.patch;h.api.patch=async(...args)=>{await patch(...args);throw new Error('Lost');};
  await assert.rejects(C.syncOne(next,h.receipt,h.api,h.save),/Lost/);h.api.patch=patch;
  assert.equal((await C.syncOne({...next,summary:'Revision 2'},h.receipt,h.api,h.save)).status,'updated');assert.equal(h.remote.summary,'Revision 2');
});
test('conditional write conflicts preserve the remote version',async()=>{
  const h=await harness();await C.syncOne(h.desired,h.receipt,h.api,h.save);h.api.patch=async()=>{throw Object.assign(new Error('Changed'),{status:412});};
  assert.equal((await C.syncOne({...h.desired,summary:'New'},h.receipt,h.api,h.save)).status,'conflict');assert.equal(h.remote.summary,h.desired.summary);
});
test('remote deletion during a failed update does not recreate the deleted event',async()=>{
  const h=await harness();await C.syncOne(h.desired,h.receipt,h.api,h.save);h.receipt={...h.receipt,pending:C.managed({...h.desired,summary:'New'})};h.remote=null;
  assert.equal((await C.syncOne(h.desired,h.receipt,h.api,h.save)).status,'conflict');assert.equal(h.writes,1);
});
test('Google timezone formatting and property order cannot produce false edits',async()=>{
  const a={summary:'Meeting',start:{dateTime:'2026-10-11T10:00:00Z'},end:{dateTime:'2026-10-11T11:00:00Z'},extendedProperties:{private:{lifeos:'1',board:'a'}}};
  const b={...a,start:{timeZone:'Asia/Kuala_Lumpur',dateTime:'2026-10-11T18:00:00+08:00'},extendedProperties:{private:{board:'a',lifeos:'1'}}};assert.equal(C.equal(a,b),true);
});
test('bounded sync windows resume across a large history instead of starving newer entries',()=>{
  const events=Array.from({length:500},(_,i)=>({id:String(i).padStart(4,'0')}));let cursor='',seen=new Set();
  for(let run=0;run<10;run++)for(const e of C.resume(events,cursor).slice(0,50)){seen.add(e.id);cursor=e.id;}
  assert.equal(seen.size,500);assert.equal(C.resume(events,'0499')[0].id,'0000');
  assert.equal(C.resume(events.filter(e=>e.id!=='0100'),'0100')[0].id,'0101');assert.deepEqual(events[0],{id:'0000'});
});
test('backend is not bundled publicly and cannot write the existing user_states table',()=>{
  const manifest=require('../release-files.json');assert.ok(manifest.includes('google-calendar.js'));assert.ok(manifest.every(path=>!path.includes('supabase')));
  const source=fs.readFileSync('supabase/functions/google-calendar/index.ts','utf8');assert.match(source,/db\.auth\.getUser/);assert.match(source,/If-Match/);
  assert.equal((source.match(/from\("user_states"\)/g)||[]).length,1);assert.match(source,/from\("user_states"\)\.select/);
  const sql=fs.readFileSync('supabase/migrations/20261011_google_calendar.sql','utf8');assert.doesNotMatch(sql,/\b(drop|truncate)\b|alter table public\.user_states/i);assert.match(sql,/revoke all/);
});
