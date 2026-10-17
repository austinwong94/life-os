// Offline preservation planner. No network calls, database writes or record activation.
const crypto=require('node:crypto');
const format='life-os-property-preservation-v1';
const resources=Object.freeze(['public.app_data','public.app_data_history','public.bookings','public.ical_blocks','public.booking_candidates','public.ai_usage']);
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const project=value=>typeof value==='string' && /^[a-z]{20}$/.test(value);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const digest=value=>crypto.createHash('sha256').update(value,'utf8').digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
function fail(){throw new Error('Property transfer needs review. No records were changed.');}
function prepare(input,{sourceProject,targetProject,sourceOwner,targetOwner,targetEmail,allowLegacyUnowned=false}={}){
  if(!project(sourceProject) || !project(targetProject) || sourceProject===targetProject || !uuid(sourceOwner) || !uuid(targetOwner) || sourceOwner===targetOwner || typeof targetEmail!=='string' || !targetEmail.includes('@'))fail();
  const backup=copy(input);
  if(backup.format!==format || backup.source_project!==sourceProject || !Number.isFinite(Date.parse(backup.captured_at)) || !Array.isArray(backup.owners) || backup.owners.length!==1 || backup.owners[0].id!==sourceOwner || backup.owners[0].email?.toLowerCase()!==targetEmail.toLowerCase() || !Array.isArray(backup.records) || !object(backup.resource_counts) || resources.some(key=>!Object.hasOwn(backup.resource_counts,key)) || Object.keys(backup.resource_counts).some(key=>!resources.includes(key)))fail();
  // Buckets/attachments require an independent object export, never a silent skip.
  if(backup.storage_objects!==0)fail();
  const seen=new Set(),counts=Object.fromEntries(resources.map(key=>[key,0])),records=[];
  for(const record of backup.records){
    if(!object(record) || !resources.includes(record.resource) || typeof record.key!=='string' || !record.key || record.key.length>200 || /[\u0000-\u001f]/.test(record.key) || typeof record.payload_text!=='string' || !/^[a-f0-9]{64}$/.test(record.sha256) || digest(record.payload_text)!==record.sha256)fail();
    const identity=JSON.stringify([record.resource,record.key]);if(seen.has(identity))fail();seen.add(identity);counts[record.resource]++;
    let row;try{row=JSON.parse(record.payload_text);}catch{fail();}if(!object(row))fail();
    const legacy=record.resource==='public.booking_candidates' && record.source_owner_id===null && !Object.hasOwn(row,'user_id');
    if(legacy?!allowLegacyUnowned:record.source_owner_id!==sourceOwner || row.user_id!==sourceOwner)fail();
    if(record.resource!=='public.ai_usage' && (typeof row.id==='string' || Number.isSafeInteger(row.id)) && String(row.id)!==record.key)fail();
    records.push({resource:record.resource,source_key:record.key,source_owner_id:record.source_owner_id,owner_assignment:legacy?'legacy-project-scoped':'verified-source-owner',payload_text:record.payload_text,sha256:record.sha256});
  }
  if(resources.some(key=>!Number.isSafeInteger(backup.resource_counts[key]) || backup.resource_counts[key]<0 || backup.resource_counts[key]!==counts[key]))fail();
  records.sort((a,b)=>a.resource.localeCompare(b.resource)||a.source_key.localeCompare(b.source_key));
  const manifest={format,source_project:sourceProject,target_project:targetProject,source_owner_id:sourceOwner,target_owner_id:targetOwner,captured_at:backup.captured_at,counts,records:records.map(({resource,source_key,sha256,owner_assignment})=>({resource,source_key,sha256,owner_assignment}))};
  const batchId=digest(JSON.stringify(manifest));
  return {batchId,manifest,records,summary:{records:records.length,counts:{...counts},legacyUnownedReview:records.filter(row=>row.owner_assignment==='legacy-project-scoped').length,payloadBytes:records.reduce((sum,row)=>sum+Buffer.byteLength(row.payload_text,'utf8'),0)}};
}
function importSql(plan){
  // All values, including unknown guest text, enter SQL as UTF-8 JSON data.
  if(!object(plan) || digest(JSON.stringify(plan.manifest))!==plan.batchId || !Array.isArray(plan.records))fail();
  if(plan.records.length!==plan.manifest.records.length || plan.records.some((r,i)=>digest(r.payload_text)!==r.sha256 || r.resource!==plan.manifest.records[i].resource || r.source_key!==plan.manifest.records[i].source_key || r.sha256!==plan.manifest.records[i].sha256 || r.owner_assignment!==plan.manifest.records[i].owner_assignment || r.source_owner_id!==(r.owner_assignment==='legacy-project-scoped'?null:plan.manifest.source_owner_id)))fail();
  const hex=Buffer.from(JSON.stringify({batch_id:plan.batchId,manifest:plan.manifest,records:plan.records}),'utf8').toString('hex');
  return `begin;
create temporary table property_transfer_input on commit drop as select convert_from(decode('${hex}','hex'),'UTF8')::jsonb as value;
do $transfer$
declare v jsonb; n integer;
begin
  select value into strict v from property_transfer_input;
  if not exists(select 1 from auth.users where id=(v->'manifest'->>'target_owner_id')::uuid) then raise exception 'Target property owner is missing'; end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='property_transfer_records' and c.relrowsecurity) then raise exception 'Protected transfer tables are not ready'; end if;
  perform pg_advisory_xact_lock(hashtextextended('life-os-property-transfer:'||(v->>'batch_id'),0));
  insert into public.property_transfer_batches(batch_id,owner_id,source_project,source_owner_id,manifest)
  values(v->>'batch_id',(v->'manifest'->>'target_owner_id')::uuid,v->'manifest'->>'source_project',(v->'manifest'->>'source_owner_id')::uuid,v->'manifest') on conflict(batch_id) do nothing;
  if not exists(select 1 from public.property_transfer_batches b where b.batch_id=v->>'batch_id' and b.owner_id=(v->'manifest'->>'target_owner_id')::uuid and b.source_project=v->'manifest'->>'source_project' and b.source_owner_id=(v->'manifest'->>'source_owner_id')::uuid and b.manifest=v->'manifest') then raise exception 'Existing transfer batch differs'; end if;
  insert into public.property_transfer_records(batch_id,owner_id,resource,source_key,source_owner_id,owner_assignment,payload_text,payload,sha256)
  select v->>'batch_id',(v->'manifest'->>'target_owner_id')::uuid,r->>'resource',r->>'source_key',(r->>'source_owner_id')::uuid,r->>'owner_assignment',r->>'payload_text',(r->>'payload_text')::jsonb,r->>'sha256' from jsonb_array_elements(v->'records') r on conflict(batch_id,resource,source_key) do nothing;
  select count(*) into n from public.property_transfer_records where batch_id=v->>'batch_id';
  if n<>jsonb_array_length(v->'records') then raise exception 'Transfer count mismatch'; end if;
  if exists(select 1 from jsonb_array_elements(v->'records') r left join public.property_transfer_records saved on saved.batch_id=v->>'batch_id' and saved.resource=r->>'resource' and saved.source_key=r->>'source_key' where saved.source_key is null or saved.owner_id<>(v->'manifest'->>'target_owner_id')::uuid or saved.source_owner_id is distinct from (r->>'source_owner_id')::uuid or saved.owner_assignment<>r->>'owner_assignment' or saved.payload_text<>r->>'payload_text' or saved.payload<>(r->>'payload_text')::jsonb or saved.sha256<>r->>'sha256') then raise exception 'Transfer readback mismatch'; end if;
end $transfer$;
select batch_id,resource,count(*) as records,bool_and(sha256=encode(sha256(convert_to(payload_text,'UTF8')),'hex')) as verified from public.property_transfer_records where batch_id=(select value->>'batch_id' from property_transfer_input) group by batch_id,resource;
commit;`;
}
module.exports={prepare,importSql,digest,resources,format};
