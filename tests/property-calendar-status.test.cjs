const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {describe,create}=require('../property-calendar-status.js');
const now=Date.parse('2026-10-18T16:00:00Z');
const row={owner_id:'owner',status:'success',last_success_at:'2026-10-18T15:07:02Z',last_attempt_at:'2026-10-18T15:07:00Z',block_count:23};
test('calendar success is based on the last successful server refresh, not a browser save',()=>{
  const model=describe(row,now);assert.equal(model.state,'success');assert.equal(model.count,23);assert.equal(model.lastSuccess,Date.parse(row.last_success_at));assert.deepEqual(describe({...row,block_count:0},now).count,0);
});
test('failed attempts retain the last successful time and warn even if it was recent',()=>{
  const model=describe({...row,status:'error'},now);assert.equal(model.state,'error');assert.equal(model.lastSuccess,Date.parse(row.last_success_at));assert.match(model.warning,/retained/);
});
test('overdue and stalled jobs cannot continue showing a green status',()=>{
  assert.equal(describe(row,now+91*60000).state,'warning');assert.equal(describe({...row,status:'running',last_attempt_at:new Date(now-60000).toISOString()},now).state,'running');assert.equal(describe({...row,status:'running'},now).state,'warning');
});
test('unknown, invalid, future, and unconfigured results never claim success',()=>{
  for(const value of [null,{}, {...row,last_success_at:null},{...row,last_success_at:'not-a-date'},{...row,last_success_at:'2027-01-01T00:00:00Z'},{...row,status:'not_configured'}])assert.equal(describe(value,now).state,'unknown');
});
function elements(){
  const child=()=>({textContent:'',hidden:false,disabled:false,attributes:{},listeners:{},removeAttribute(name){delete this.attributes[name];},addEventListener(name,fn){this.listeners[name]=fn;}});
  const selectors=Object.fromEntries(['[data-calendar-state]','time','[data-calendar-detail]','[data-calendar-warning]','button'].map(key=>[key,child()]));
  const host={dataset:{},querySelector:selector=>selectors[selector]};return {host,selectors,document:{getElementById:()=>host}};
}
test('status checks are read-only, keep success visible on network failure and do not duplicate pending reads',async()=>{
  const ui=elements();let result=[row],fail=false,calls=0;
  const monitor=create({...ui,read:async()=>{calls++;if(fail)throw Error('private-token');return result;},identity:()=> 'owner',active:()=>true,now:()=>now});
  await monitor.refresh();assert.equal(ui.host.dataset.status,'success');const text=ui.selectors.time.textContent;
  fail=true;await monitor.refresh();assert.equal(ui.host.dataset.status,'unknown');assert.equal(ui.selectors.time.textContent,text);assert.doesNotMatch(JSON.stringify(ui),/private-token/);assert.equal(calls,2);
});
test('late responses and foreign-owner rows cannot expose another account or repaint a cleared monitor',async()=>{
  const ui=elements();let owner='owner',resolve,calls=0;
  const monitor=create({...ui,identity:()=>owner,active:()=>true,now:()=>now,read:()=>{calls++;return new Promise(done=>{resolve=done;});}});
  const pending=monitor.refresh();await monitor.refresh();assert.equal(calls,1);monitor.clear();owner='different';resolve([row]);await pending;assert.equal(ui.host.dataset.status,'unknown');assert.match(ui.selectors.time.textContent,/not recorded/);
  const other=create({...ui,identity:()=>owner,active:()=>true,now:()=>now,read:async()=>[row]});await other.refresh();assert.equal(ui.host.dataset.status,'unknown');assert.match(ui.selectors.time.textContent,/not recorded/);
});
test('telemetry schema is owner-read-only and service-only writers are invokers',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261018152124_property_calendar_sync_health.sql','utf8');assert.match(sql,/enable row level security/i);assert.match(sql,/auth.uid\(\)\) = owner_id/);assert.doesNotMatch(sql,/security definer|update public\.property_workspaces|delete from|drop table/i);assert.match(sql,/grant select on public.property_calendar_sync_status to authenticated/);assert.match(sql,/run_id=p_run and status='running'/);assert.match(sql,/else last_success_at end/);assert.match(sql,/from public,anon,authenticated/);
});
