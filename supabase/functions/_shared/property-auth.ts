const env=(name:string)=>Deno.env.get(name) || '';
const headers=()=>({'content-type':'application/json',apikey:env('SUPABASE_SERVICE_ROLE_KEY'),authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY')});
const json=(error:string,status:number)=>new Response(JSON.stringify({error}),{status,headers:{'content-type':'application/json','access-control-allow-origin':'*'}});
export function propertyServe(handler:(req:Request)=>Promise<Response>){
  Deno.serve(async(req:Request)=>{
    if(req.method==='OPTIONS')return handler(req);
    if(req.method!=='POST')return json('method_not_allowed',405);
    const token=req.headers.get('authorization') || '';
    if(!/^Bearer [A-Za-z0-9_.-]+$/.test(token))return json('unauthorized',401);
    try{
      const response=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),authorization:token},signal:AbortSignal.timeout(10000)});
      if(!response.ok)return json('unauthorized',401);
      const user=await response.json();
      if(!/^[a-f0-9-]{36}$/.test(user.id || ''))return json('unauthorized',401);
      const owned=await fetch(env('SUPABASE_URL')+'/rest/v1/property_workspaces?select=id&user_id=eq.'+encodeURIComponent(user.id)+'&limit=1',{headers:headers(),signal:AbortSignal.timeout(10000)});
      if(!owned.ok || !(await owned.json()).length)return json('property_access_required',403);
      if(Number(req.headers.get('content-length') || 0)>12000000)return json('too_large',413);
      const reader=req.body?.getReader(),parts:Uint8Array[]= [];let bytes=0;
      if(reader){
        const timeout=setTimeout(()=>{void reader.cancel();},15000);
        try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>12000000){await reader.cancel();return json('too_large',413);}parts.push(value);}}finally{clearTimeout(timeout);}
      }
      const body=new Uint8Array(bytes);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.byteLength;}
      return await handler(new Request(req.url,{method:req.method,headers:req.headers,body}));
    }catch{return json('property_service_unavailable',503);}
  });
}
export async function propertyCallbackSecret(name:string):Promise<string>{
  if(!['ICAL_CRON_SECRET','INGEST_SECRET','DIGEST_SECRET'].includes(name))return '';
  try{const response=await fetch(env('SUPABASE_URL')+'/rest/v1/rpc/property_callback_secret',{method:'POST',headers:headers(),body:JSON.stringify({p_name:name}),signal:AbortSignal.timeout(10000)});return response.ok?String(await response.json() || ''):'';}catch{return '';}
}
export async function propertyCallbackOwner():Promise<string>{
  try{const response=await fetch(env('SUPABASE_URL')+'/rest/v1/property_migration_control?select=owner_id&integration_cutover_verified=eq.true',{headers:headers(),signal:AbortSignal.timeout(10000)});if(!response.ok)return '';const rows=await response.json();return rows.length===1?rows[0].owner_id:'';}catch{return '';}
}
