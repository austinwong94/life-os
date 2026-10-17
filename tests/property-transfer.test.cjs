const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../tools/property-transfer.cjs');
const sourceOwner='11111111-1111-4111-8111-111111111111',targetOwner='22222222-2222-4222-8222-222222222222';
const options={sourceProject:'s'.repeat(20),targetProject:'t'.repeat(20),sourceOwner,targetOwner,targetEmail:'owner@example.test',allowLegacyUnowned:true};
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
  const records=[['public.app_data','copy-one',{id:'copy-one',user_id:sourceOwner,data:{bookings:[{id:'b',guest:'Fictional guest',notes:'Every line\n\u4fdd\u7559'}],unknown:{keep:null}},record_key:'same-key'}],['public.app_data','copy-two',{id:'copy-two',user_id:sourceOwner,data:{bookings:[{id:'b',guest:'Earlier fictional guest'}]},record_key:'same-key'}],['public.app_data_history','9',{id:9,user_id:sourceOwner,data:{bookings:[]}}],['public.ical_blocks','4',{id:4,user_id:sourceOwner,uid:'same-feed-uid',start_date:'2026-10-17',end_date:'2026-10-19'}],['public.booking_candidates','candidate',{id:'candidate',raw:{text:'Fictional email only'}}]].map(([resource,key,row])=>{const payload_text=JSON.stringify(row);return {resource,key,source_owner_id:row.user_id || null,payload_text,sha256:T.digest(payload_text)};});
  return {format:T.format,source_project:options.sourceProject,captured_at:'2026-10-17T00:00:00Z',owners:[{id:sourceOwner,email:options.targetEmail}],storage_objects:0,records,resource_counts:Object.fromEntries(T.resources.map(resource=>[resource,records.filter(row=>row.resource===resource).length]))};
}
test('preservation keeps duplicate logical workspace copies, exact unknown fields, history and original owners',()=>{
  const backup=fixture(),original=clone(backup),plan=T.prepare(backup,options);assert.equal(plan.records.length,5);assert.equal(plan.summary.counts['public.app_data'],2);assert.equal(plan.summary.legacyUnownedReview,1);assert.equal(plan.manifest.target_owner_id,targetOwner);assert.equal(plan.records[0].source_owner_id,sourceOwner);for(const row of plan.records)assert.equal(row.payload_text,backup.records.find(r=>r.key===row.source_key && r.resource===row.resource).payload_text);assert.deepEqual(backup,original);assert.equal(T.prepare(backup,options).batchId,plan.batchId);
});
test('record text, attachment content and decimal lexemes are preserved without JSON reserialization',()=>{
  const b=fixture(),r=b.records[0];r.payload_text='{"id":"copy-one","user_id":"'+sourceOwner+'","amount":0.123456789012345678901234,"attachment":"data:image/png;base64,FAKE","note":"First\\nSecond"}';r.sha256=T.digest(r.payload_text);const p=T.prepare(b,options);assert.equal(p.records.find(r=>r.source_key==='copy-one').payload_text,r.payload_text);const sql=T.importSql(p);assert(sql.includes('decode('));assert(!sql.includes('data:image/png'));assert(!sql.includes('First'));
});
test('target account mapping must match the verified source identity and projects must differ',()=>{
  for(const change of [{targetEmail:'other@example.test'},{sourceProject:options.targetProject},{sourceOwner:targetOwner},{targetOwner:sourceOwner},{targetOwner:'invalid'}])assert.throws(()=>T.prepare(fixture(),{...options,...change}));const b=fixture();b.owners.push({id:targetOwner,email:options.targetEmail});assert.throws(()=>T.prepare(b,options));
});
test('unexpected ownership or unowned records cannot silently become the destination owners data',()=>{
  const b=fixture();assert.throws(()=>T.prepare(b,{...options,allowLegacyUnowned:false}));b.records[0].source_owner_id=targetOwner;assert.throws(()=>T.prepare(b,options));const other=fixture();const row=JSON.parse(other.records[0].payload_text);row.user_id=targetOwner;other.records[0].payload_text=JSON.stringify(row);other.records[0].sha256=T.digest(other.records[0].payload_text);assert.throws(()=>T.prepare(other,options));
});
test('corrupt text, wrong hashes and duplicate resource identities refuse without changing the backup',()=>{
  for(const change of [b=>b.records[0].payload_text+='x',b=>b.records[0].sha256='0'.repeat(64),b=>{b.records[0].payload_text='private broken JSON';b.records[0].sha256=T.digest(b.records[0].payload_text);},b=>b.records.push(clone(b.records[0]))]){const b=fixture();change(b);const original=clone(b);assert.throws(()=>T.prepare(b,options));assert.deepEqual(b,original);}
});
test('all six resources, including empty tables, must have exact counts before planning',()=>{
  for(const change of [b=>delete b.resource_counts['public.bookings'],b=>b.resource_counts['public.app_data']++,b=>b.resource_counts.unknown=0,b=>b.resource_counts['public.bookings']=-1,b=>b.storage_objects=1,b=>b.source_project=options.targetProject]){const b=fixture();change(b);assert.throws(()=>T.prepare(b,options));}
});
test('same source key across different tables remains independent and dangerous text is data not SQL',()=>{
  const b=fixture();b.records[2].key='copy-one';const row=JSON.parse(b.records[2].payload_text);row.id='copy-one';row.note="'); delete from public.user_states; --";b.records[2].payload_text=JSON.stringify(row);b.records[2].sha256=T.digest(b.records[2].payload_text);const sql=T.importSql(T.prepare(b,options));assert(!sql.includes(row.note));assert(!/delete from|update public\.user_states|truncate|drop table public/i.test(sql));assert.equal(T.prepare(b,options).records.length,5);
});
test('import SQL is transactional, idempotent, verifies full payloads and never upserts existing Life OS state',()=>{
  const p=T.prepare(fixture(),options),sql=T.importSql(p);assert(sql.startsWith('begin;'));assert(sql.endsWith('commit;'));assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/on conflict\(batch_id,resource,source_key\) do nothing/);assert.match(sql,/Transfer readback mismatch/);assert.match(sql,/saved\.payload_text<>/);assert(!/user_states|auth\.identities|auth\.sessions/.test(sql));assert(!/insert into auth\.users/i.test(sql));
});
test('mutating a prepared plan cannot bypass manifest and payload fingerprints',()=>{
  for(const edit of [p=>p.manifest.target_owner_id=sourceOwner,p=>p.records[0].payload_text+=' ',p=>p.records[0].source_key='changed',p=>p.records[0].owner_assignment='legacy-project-scoped',p=>p.records[0].source_owner_id=targetOwner]){const p=T.prepare(fixture(),options);edit(p);assert.throws(()=>T.importSql(p));}
});
test('prepared schema uses owner-only RLS and preserves immutable copies rather than copying permissive source policies',()=>{
  const sql=fs.readFileSync(require.resolve('../supabase/migrations/20261016223941_property_preservation_staging.sql'),'utf8');assert.equal((sql.match(/enable row level security/g)||[]).length,2);assert.equal((sql.match(/create policy/g)||[]).length,2);assert.equal((sql.match(/using \(\(select auth.uid\(\)\)=owner_id\)/g)||[]).length,2);assert.match(sql,/revoke all .* from public,anon,authenticated/);assert(!/security definer|using \(true\)|create policy.*for (insert|update|delete)/i.test(sql));assert.match(sql,/foreign key \(batch_id,owner_id,source_owner_id\)/);assert.match(sql,/sha256=encode\(sha256/);
});
