// AI is disabled by the owner's explicit choice. No payload is read or sent.
Deno.serve(async(req:Request)=>new Response(JSON.stringify({error:'ai_disabled',detail:'AI tools are disabled. No records were uploaded.'}),{status:403,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,apikey,x-client-info'}}));
