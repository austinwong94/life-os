import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { OAuth2Client } from "npm:google-auth-library@10.3.0";
import "../../../planner-store.js";
import "../../../calendar-sync-core.js";

const env = (key: string) => { const value=Deno.env.get(key);if(!value)throw new Error("Calendar setup is incomplete.");return value; };
const scope="https://www.googleapis.com/auth/calendar.app.created";
const app="https://austinwong94.github.io/life-os/";
const origin=new URL(app).origin;
const base=env("SUPABASE_URL");
const callback=base+"/functions/v1/google-calendar/callback";
const db=createClient(base,env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store","Vary":"Origin"};
const error=(message: string,status=400) => Object.assign(new Error(message),{status});
const core=(globalThis as any).LifeCalendarSync;
const planner=(globalThis as any).LifePlanner;
const check=(result: any) => { if(result.error)throw error("Calendar storage unavailable. Existing records were kept.",503);return result.data; };
const encode=(bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const decode=(text: string) => Uint8Array.from(atob(text.replaceAll("-","+").replaceAll("_","/")),char=>char.charCodeAt(0));
async function encryptionKey() {
  const bytes=decode(env("GOOGLE_TOKEN_ENCRYPTION_KEY"));if(bytes.length!==32)throw error("Calendar encryption is not configured.",503);
  return crypto.subtle.importKey("raw",bytes,"AES-GCM",false,["encrypt","decrypt"]);
}
async function seal(value: any,user: string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(user)},await encryptionKey(),new TextEncoder().encode(JSON.stringify(value)));
  return encode(iv)+"."+encode(new Uint8Array(data));
}
async function unseal(value: string,user: string) {
  const [iv,data]=value.split(".");
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:new TextEncoder().encode(user)},await encryptionKey(),decode(data))));
}
async function hash(value: string) {return encode(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))));}
function oauth() {return new OAuth2Client(env("GOOGLE_CLIENT_ID"),env("GOOGLE_CLIENT_SECRET"),callback);}
async function connection(user: string) { return check(await db.from("lifeos_google_connections").select("*").eq("user_id",user).maybeSingle()); }
async function save(user: string,lock: string,updates: any) {
  const rows=check(await db.from("lifeos_google_connections").update(updates).eq("user_id",user).eq("lock_id",lock).gt("locked_until",new Date().toISOString()).select("user_id"));
  if(!rows?.length)throw error("Another sync is in progress. Retry after it finishes.",409);
}
async function source(user: string,boardId: string,expected: string) {
  const row=check(await db.from("user_states").select("state,updated_at").eq("owner_id",user).maybeSingle());
  if(!row || row.updated_at!==expected)throw error("Cloud data changed. Sync Life OS cloud first, then retry Google.",409);
  if(row.state.syncConflicts?.length)throw error("Resolve Life OS saving conflicts before syncing Google.",409);
  const boards=row.state.boards;
  if(!Array.isArray(boards) || boards.filter((b: any)=>b.id===boardId).length!==1)throw error("Board could not be verified.",409);
  return boards.find((b: any)=>b.id===boardId);
}
function safeGoogleError(err: any) {
  const status=Number(err.response?.status || err.status || 503);
  if(status===401 || err.response?.data?.error==="invalid_grant")return error("Google access expired. Disconnect and connect again; your records are kept.",401);
  if(status===403)return error("Google denied access. Check the Calendar API and consent permission.",403);
  if(status===429)return error("Google is busy. Retry later; your records are kept.",429);
  return error("Google request failed. Retry safely; existing records were kept.",503);
}
async function google(client: OAuth2Client,path: string,method="GET",data?: any,etag?: string) {
  try {return (await client.request({url:"https://www.googleapis.com/calendar/v3/"+path,method:method as any,data,headers:etag?{"If-Match":etag}:{},timeout:8000,retry:false})).data as any;}
  catch(err: any) {
    if([404,409,412].includes(err.response?.status))throw error("Google version changed.",err.response.status);
    throw safeGoogleError(err);
  }
}
async function handle(req: Request) {
  const url=new URL(req.url),isCallback=url.pathname.endsWith("/callback");
  if(isCallback) {
    if(req.method!=="GET")throw error("Method not allowed.",405);
    const state=url.searchParams.get("state") || "";
    if(!/^[A-Za-z0-9_-]{43}$/.test(state))throw error("Invalid or expired calendar connection.");
    const records=check(await db.rpc("lifeos_google_claim_state",{p_hash:await hash(state)}));
    const claim=records?.[0];if(!claim)throw error("Invalid or expired calendar connection.");
    const redirect=new URL(app);redirect.searchParams.set("googleCalendar",url.searchParams.has("error")?"denied":"connected");
    if(!url.searchParams.has("error")) {
      const existing=await connection(claim.user_id);
      if(existing?.tokens)throw error("A Google account is already connected. Disconnect first.",409);
      const code=url.searchParams.get("code");if(!code || code.length>4096)throw error("Invalid calendar authorization.");
      const client=oauth(),verifier=await unseal(claim.verifier,claim.user_id);
      let tokens;try {tokens=(await client.getToken({code,codeVerifier:verifier})).tokens;}catch {throw error("Google authorization failed. Please connect again.");}
      if(!tokens.refresh_token || !tokens.scope?.split(" ").includes(scope))throw error("Calendar permission was not granted. Please connect again.");
      const identity=await client.verifyIdToken({idToken:tokens.id_token || "",audience:env("GOOGLE_CLIENT_ID")});
      const subject=identity.getPayload()?.sub;if(!subject)throw error("Google identity could not be verified.");
      if(existing && existing.google_subject!==subject)throw error("Reconnect the same Google account to keep your calendar mapping. Switching accounts needs a reviewed migration.",409);
      if(existing) {
        const updated=check(await db.from("lifeos_google_connections").update({tokens:await seal(tokens,claim.user_id)}).eq("user_id",claim.user_id).is("tokens",null).select("user_id"));
        if(!updated.length)throw error("Connection changed in another tab. Check its status.",409);
      } else check(await db.from("lifeos_google_connections").insert({user_id:claim.user_id,google_subject:subject,tokens:await seal(tokens,claim.user_id)}));
    }
    return new Response(null,{status:303,headers:{Location:redirect.href,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }
  if(req.headers.get("origin")!==origin)throw error("Open the live Life OS website to connect Google.",403);
  if(req.method==="OPTIONS")return new Response(null,{headers});
  if(req.method!=="POST")throw error("Method not allowed.",405);
  const authorization=req.headers.get("authorization") || "";
  if(!authorization.startsWith("Bearer "))throw error("Sign in to Life OS cloud first.",401);
  const {data:{user},error:authError}=await db.auth.getUser(authorization.slice(7));
  if(authError || !user)throw error("Sign in to Life OS cloud first.",401);
  if(Number(req.headers.get("content-length") || 0)>8192)throw error("Request too large.",413);
  const raw=await req.text();if(raw.length>8192)throw error("Request too large.",413);
  let body;try {body=JSON.parse(raw);}catch {throw error("Invalid calendar request.");}
  const row=await connection(user.id);
  if(body.action==="status")return {configured:["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_TOKEN_ENCRYPTION_KEY"].every(key=>Boolean(Deno.env.get(key))),connected:Boolean(row?.tokens),calendarReady:Boolean(row?.calendar_id),boardIds:row?.board_ids || [],lastSyncAt:row?.last_sync_at || null,provisioningPending:Boolean(row?.provisioning_started_at && !row.calendar_id)};
  if(body.action==="connect") {
    if(row?.tokens)throw error("Google is already connected. Disconnect before changing accounts.",409);
    await encryptionKey();
    const client=oauth(),pkce=await client.generateCodeVerifierAsync(),state=encode(crypto.getRandomValues(new Uint8Array(32)));
    check(await db.from("lifeos_google_oauth_states").delete().eq("user_id",user.id));
    check(await db.from("lifeos_google_oauth_states").insert({state_hash:await hash(state),user_id:user.id,verifier:await seal(pkce.codeVerifier,user.id),expires_at:new Date(Date.now()+600000).toISOString()}));
    return {url:client.generateAuthUrl({access_type:"offline",prompt:"consent",scope:["openid",scope],state,code_challenge:pkce.codeChallenge,code_challenge_method:"S256" as any})};
  }
  if(!row?.tokens)throw error("Connect Google Calendar first.",409);
  const lock=crypto.randomUUID(),claimed=check(await db.rpc("lifeos_google_lock",{p_user:user.id,p_lock:lock}));
  if(!claimed?.length)throw error("Another device is syncing. Retry shortly.",409);
  const live=claimed[0];
  try {
    const client=oauth();client.setCredentials(await unseal(live.tokens,user.id));
    if(body.action==="disconnect") {
      let revoked=true;try {await client.revokeCredentials();}catch {revoked=false;}
      // Keep calendar and receipts so reconnecting cannot silently duplicate records.
      await save(user.id,lock,{tokens:null,board_ids:[]});
      check(await db.from("lifeos_google_oauth_states").delete().eq("user_id",user.id));
      return {connected:false,retainedCalendar:true,revoked};
    }
    if(!["provision","sync","preview","pause"].includes(body.action))throw error("Unknown calendar action.");
    if(body.action==="pause") {await save(user.id,lock,{board_ids:live.board_ids.filter((id: string)=>id!==String(body.boardId || ""))});return {paused:true};}
    const board=await source(user.id,String(body.boardId || ""),String(body.cloudVersion || ""));
    const events=await core.collect(user.id,board,planner);
    if(body.action==="preview")return {count:events.length,items:events.map((e: any)=>({id:e.id,title:e.summary,date:e.start.date || e.start.dateTime,kind:e.extendedProperties.private.kind}))};
    if(body.action==="provision") {
      if(!live.calendar_id) {
        if(live.provisioning_started_at)throw error("Calendar creation needs review. Do not create another calendar; see the setup guide.",409);
        await save(user.id,lock,{provisioning_started_at:new Date().toISOString()});
        const calendar=await google(client,"calendars","POST",{summary:"Life OS",description:"Private Life OS calendar",timeZone:"Asia/Kuala_Lumpur"});
        await save(user.id,lock,{calendar_id:calendar.id});
      }
      return {calendarReady:true};
    }
    if(!live.calendar_id)throw error("Create the dedicated Life OS calendar first.",409);
    const receipts=live.receipts || {},cursors=Object.assign(Object.create(null),live.cursors || {}),result={created:0,updated:0,unchanged:0,conflicts:[] as any[],remaining:0,retained:0};
    const path="calendars/"+encodeURIComponent(live.calendar_id)+"/events";
    const api={get:async(id: string)=>{try {return await google(client,path+"/"+id);}catch(err: any){if(err.status===404)return null;throw err;}},
      insert:(event: any)=>google(client,path,"POST",event),patch:(id: string,event: any,etag: string)=>google(client,path+"/"+id,"PATCH",event,etag)};
    const started=Date.now();
    // Bound function duration; receipts allow the next run to resume safely.
    const ordered=core.resume(events,cursors[board.id]);let processed=0;
    for(const desired of ordered) {
      if(Date.now()-started>45000){result.remaining=ordered.length-processed;break;}
      await source(user.id,board.id,body.cloudVersion);
      const outcome=await core.syncOne(desired,receipts[desired.id],api,async(receipt: any)=>{
        receipts[desired.id]=receipt;await save(user.id,lock,{receipts,cursors});
      });
      if(outcome.status==="conflict")result.conflicts.push({id:desired.id,title:desired.summary,reason:outcome.reason});
      else (result as any)[outcome.status]++;
      processed++;cursors[board.id]=desired.id;
      await save(user.id,lock,{cursors});
    }
    const ids=new Set(events.map((e: any)=>e.id));
    result.retained=Object.entries(receipts).filter(([id,r]: any)=>r.body?.extendedProperties?.private?.board===board.id && !ids.has(id)).length;
    await save(user.id,lock,{cursors,tokens:await seal(client.credentials,user.id),board_ids:body.enableAuto?[...new Set([...live.board_ids,board.id])]:live.board_ids,
      ...(result.conflicts.length || result.remaining?{}:{last_sync_at:new Date().toISOString()})});
    return result;
  } finally {await db.from("lifeos_google_connections").update({lock_id:null,locked_until:null}).eq("user_id",user.id).eq("lock_id",lock);}
}
Deno.serve(async req=>{
  try {const result=await handle(req);return result instanceof Response?result:new Response(JSON.stringify(result),{headers:{...headers,"Content-Type":"application/json"}});}
  catch(err: any) {
    const status=err.status || 503,message=err.status?err.message:"Calendar connection unavailable. Your Life OS records were kept.";
    return new Response(JSON.stringify({error:message}),{status,headers:{...headers,"Content-Type":"application/json"}});
  }
});
