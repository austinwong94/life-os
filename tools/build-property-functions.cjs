// Mechanical source transfer; private backups are inputs only, never public assets.
const fs=require('node:fs'),path=require('node:path');
const {hardenPropertyCalendar}=require('./property-calendar-hardening.cjs');
const input=process.argv[2];if(!input)throw new Error('Provide the protected function-source backup path.');
const data=JSON.parse(fs.readFileSync(input,'utf8')),root=path.resolve(__dirname,'../supabase/functions');
if (fs.readFileSync(path.join(root,'property-ical-cron-sync/index.ts'),'utf8').includes('property_calendar_sync_begin')) {
  throw new Error('Retired-source import would remove calendar monitoring. Maintain the current Life OS functions directly.');
}
const callbacks=['ical-cron-sync','ota-email-ingest','daily-digest'];
const disabledAI=new Set(['guest-reply-draft','receipt-scan','tax-review','tax-doc-analyze','earnings-import']);
// All deployed endpoints require JWTs. Unused external callbacks stay disabled;
// anonymous webhook access is not part of this migration's approved exposure.
for(const fn of data.functions){
  for(const file of fn.files){
    const shared=file.name.includes('/_shared/'),name=shared?path.basename(file.name):'index.ts',dir=shared?'_shared':'property-'+fn.slug;
    let code=file.content;
    if(shared && name==='guards.ts'){
      code=code.replaceAll('return true; // fail open','return false; // fail closed').replaceAll('if (!r.ok) return true;','if (!r.ok) return false;').replace('  } catch {\n    return true;','  } catch {\n    return false;').replaceAll('/rpc/bump_ai_usage','/rpc/property_bump_ai_usage');
    }
    if(!shared){
      if(disabledAI.has(fn.slug)){
        code=`// AI is disabled by the owner's explicit choice. No payload is read or sent.\nDeno.serve(async(req:Request)=>new Response(JSON.stringify({error:'ai_disabled',detail:'AI tools are disabled. No records were uploaded.'}),{status:403,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,apikey,x-client-info'}}));\n`;
        fs.mkdirSync(path.join(root,dir),{recursive:true});fs.writeFileSync(path.join(root,dir,name),code);continue;
      }
      code=code.replaceAll('npm:@supabase/supabase-js@2"','npm:@supabase/supabase-js@2.108.2"');
      for(const [old,next] of [['app_data','property_workspaces'],['ical_blocks','property_ical_blocks'],['booking_candidates','property_booking_candidates']])code=code.replaceAll('.from("'+old+'")','.from("'+next+'")').replaceAll('/rest/v1/'+old+'?','/rest/v1/'+next+'?').replaceAll('/rest/v1/'+old+'`','/rest/v1/'+next+'`');
      code=code.replaceAll('/rpc/bump_ai_usage','/rpc/property_bump_ai_usage').replaceAll('redirect: "follow"','redirect: "error"');
      if(callbacks.includes(fn.slug)){
        code='import {propertyCallbackSecret,propertyCallbackOwner} from "../_shared/property-auth.ts";\n'+code;
        code=code.replace(/Deno\.env\.get\("(ICAL_CRON_SECRET|INGEST_SECRET|DIGEST_SECRET)"\) \?\? ""/g,'await propertyCallbackSecret("$1")');
        const marker=fn.slug==='ota-email-ingest'?'  let payload:':'  const base =';
        const at=code.indexOf(marker,code.indexOf('Deno.serve('));if(at<0)throw new Error('Callback owner boundary changed');
        code=code.slice(0,at)+`  const propertyOwner=await propertyCallbackOwner();\n  if(!propertyOwner)return json({error:'migration_not_activated'},409);\n`+code.slice(at);
        if(fn.slug==='ota-email-ingest'){
          code=code.replace('.eq("confirmation_code", parsed.confirmation_code)','.eq("user_id", propertyOwner).eq("confirmation_code", parsed.confirmation_code)');
          code=code.replace('    source: "airbnb_email",','    user_id: propertyOwner,\n    source: "airbnb_email",');
        }
        code=code.replaceAll('record_key=eq.sunrise-villa-main','record_key=eq.sunrise-villa-main&user_id=eq.${propertyOwner}');
        if(fn.slug==='ical-cron-sync'){
          const start=code.indexOf('    if (blocks.length || !fetchError) {'),end=code.indexOf('    report.push({ user:',start);
          if(start<0 || end<0)throw new Error('iCal refresh boundary changed');
          code=code.slice(0,start)+`    if (!fetchError) {
      const saved=await fetch(base+'/rest/v1/rpc/property_replace_ical_blocks',{method:'POST',headers:H,body:JSON.stringify({p_user:row.user_id,p_blocks:blocks})});
      if(!saved.ok){report.push({user:row.user_id,error:'atomic_refresh_failed'});continue;}
    }
`+code.slice(end);
        }
      }else{
        if(fn.slug==='guest-reply-draft'){
          code='import {underDailyCap} from "../_shared/guards.ts";\n'+code;
          code=code.replace('  const apiKey =',`  if(!(await underDailyCap(req,'guest-reply-draft',60)))return json({error:'daily_limit_reached'},429);\n  const apiKey =`);
        }
        code='import {propertyServe} from "../_shared/property-auth.ts";\n'+code.replace('Deno.serve(','propertyServe(');
      }
    }
    if(!shared)code=hardenPropertyCalendar(code,fn.slug);
    fs.mkdirSync(path.join(root,dir),{recursive:true});fs.writeFileSync(path.join(root,dir,name),code);
  }
}
console.log('Prepared '+data.functions.length+' namespaced property functions; no secrets copied.');
