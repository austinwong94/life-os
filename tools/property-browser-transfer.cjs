// Offline comparison and guarded activation. Original bytes are never rewritten.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
function refuse(){throw new Error('Browser migration needs review. Original copies have not been changed.');}
function prepare(payloadText,baseline,{sourceOwner,targetOwner,sourceProject}={}){
  if(typeof payloadText!=='string' || !object(baseline) || !uuid(sourceOwner) || !uuid(targetOwner) || sourceOwner===targetOwner || !/^[a-z]{20}$/.test(sourceProject))refuse();
  let browser;try{browser=JSON.parse(payloadText);}catch{refuse();}
  if(!object(browser) || browser.ownerId!==sourceOwner || !Number.isFinite(Date.parse(browser.exportedAt)))refuse();
  for(const key of ['bookings','documents']){
    if(!Array.isArray(browser[key]) || !Array.isArray(baseline[key]))refuse();
    const ids=browser[key].map(row=>row?.id);
    if(ids.some(id=>typeof id!=='string' || !id) || new Set(ids).size!==ids.length || baseline[key].some(row=>!ids.includes(row.id)))refuse();
  }
  const changes=[];
  function compare(before,after,path){
    if(before===undefined){changes.push(path);return;}
    if(after===undefined)refuse();
    if(Array.isArray(before)){
      if(!Array.isArray(after) || after.length<before.length)refuse();
      before.forEach((row,i)=>{
        const match=object(row) && typeof row.id==='string'?after.find(candidate=>candidate?.id===row.id):after[i];
        compare(row,match,path+'['+i+']');
      });
      if(after.length>before.length)changes.push(path+'.added');
    }else if(object(before)){
      if(!object(after))refuse();
      for(const key of new Set([...Object.keys(before),...Object.keys(after)]))compare(before[key],after[key],path+'.'+key);
    }else if(!isDeepStrictEqual(before,after))changes.push(path);
  }
  for(const key of ['bookings','documents','taxPlan','profitData','appSettings'])compare(baseline[key],browser[key],key);
  // Root extensions remain intact; Auth ownership changes only in the active copy.
  const data={...structuredClone(baseline),...structuredClone(browser),ownerId:targetOwner};
  const manifest={format:'life-os-property-browser-comparison-v1',source_project:sourceProject,source_owner_id:sourceOwner,owner_id:targetOwner,exported_at:browser.exportedAt,sha256:hash(payloadText),bookings:browser.bookings.length,documents:browser.documents.length,changed_paths:changes,owner_metadata_mapped:true};
  return {payloadText,baseline:structuredClone(baseline),data,manifest};
}
function importSql(plan){
  const verified=prepare(plan.payloadText,plan.baseline,{sourceOwner:plan.manifest.source_owner_id,targetOwner:plan.manifest.owner_id,sourceProject:plan.manifest.source_project});
  if(!isDeepStrictEqual(verified,plan))refuse();
  const hex=Buffer.from(JSON.stringify(plan)).toString('hex');
  return `begin;
create temporary table property_browser_input on commit drop as select convert_from(decode('${hex}','hex'),'UTF8')::jsonb v;
do $browser$
declare v jsonb; w public.property_workspaces; m jsonb;
begin
 select i.v into strict v from property_browser_input i; m:=v->'manifest';
 perform pg_advisory_xact_lock(hashtextextended('property-browser:'||(m->>'owner_id'),0));
 select * into strict w from public.property_workspaces where user_id=(m->>'owner_id')::uuid and record_key='sunrise-villa-main' for update;
 if w.data<>v->'baseline' and w.data<>v->'data' then raise exception 'Property workspace changed; comparison required'; end if;
 insert into public.property_browser_backups(owner_id,source_owner_id,source_project,sha256,payload_text,payload,comparison)
 values((m->>'owner_id')::uuid,(m->>'source_owner_id')::uuid,m->>'source_project',m->>'sha256',v->>'payloadText',(v->>'payloadText')::jsonb,m) on conflict(owner_id,sha256) do nothing;
 if not exists(select 1 from public.property_browser_backups b where b.owner_id=(m->>'owner_id')::uuid and b.sha256=m->>'sha256' and b.payload_text=v->>'payloadText' and b.comparison=m) then raise exception 'Original browser readback mismatch'; end if;
 if w.data<>v->'data' then update public.property_workspaces set data=v->'data' where id=w.id and data=v->'baseline'; if not found then raise exception 'Stale property workspace'; end if; end if;
 update public.property_migration_control set local_comparison_verified=true,updated_at=clock_timestamp() where owner_id=w.user_id and source_project=m->>'source_project';
 if not found then raise exception 'Migration controls missing'; end if;
end $browser$;
select jsonb_build_object('original_verified',b.sha256=encode(sha256(convert_to(b.payload_text,'UTF8')),'hex'),'active_matches',w.data=i.v->'data','bookings',jsonb_array_length(w.data->'bookings'),'documents',jsonb_array_length(w.data->'documents')) verification from property_browser_input i join public.property_browser_backups b on b.owner_id=(i.v->'manifest'->>'owner_id')::uuid and b.sha256=i.v->'manifest'->>'sha256' join public.property_workspaces w on w.user_id=b.owner_id and w.record_key='sunrise-villa-main';
commit;`;
}
module.exports={prepare,importSql};
