const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const browsers=require('playwright'),{buildRelease}=require('../build-release.cjs');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-startup-repeat';fs.mkdirSync(out,{recursive:true});
const output=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-startup-repeat-')),release=buildRelease({output});
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/?preview=1&liveReload=0';
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Use an isolated local server, never a production URL');
(async()=>{
 const browser=await browsers[process.env.TEST_BROWSER || 'webkit'].launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1080,height:1100}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url()),file=u.pathname.slice(1) || 'index.html';
   if(process.env.TEST_URL && u.origin===new URL(url).origin)return route.continue();
   if(u.origin!=='http://127.0.0.1:5180' || !release.files[file])return route.fulfill({status:404,body:'Synthetic startup only'});
   return route.fulfill({body:fs.readFileSync(path.join(output,file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',headers:{'cache-control':'no-store'}});
  });
  await context.addInitScript(()=>{
   window.startupDiagnostics=[];
   const sheets=()=>[...document.querySelectorAll('link[rel="stylesheet"],style[data-release-style]')].map(link=>({href:link.href || link.dataset.releaseStyle,loaded:Boolean(link.sheet),disabled:link.disabled}));
   let api;
   Object.defineProperty(window,'LifeReleaseStartup',{configurable:true,get:()=>api,set:value=>{
    api=Object.freeze({...value,begin(){
     const before=sheets();
     try{return value.begin();}catch(error){
      const after=sheets();getComputedStyle(document.documentElement).getPropertyValue('color');
      startupDiagnostics.push({before,after,afterStyleFlush:sheets(),error:error.message});throw error;
     }
    }});
   }});
   window.addEventListener('error',event=>startupDiagnostics.push({message:event.message,target:event.target?.src || event.target?.href,type:event.target?.tagName}),true);
  });
  const pages=[await context.newPage(),await context.newPage(),await context.newPage()],results=[];
  for(let round=0;round<Number(process.env.TEST_REPEATS || 25);round++){
   const rows=await Promise.all(pages.map(async(page,index)=>{
    const network=[];const failure=req=>network.push({url:req.url(),failure:req.failure()});page.on('requestfailed',failure);
    const consoleErrors=[];const log=message=>{if(message.type()==='error')consoleErrors.push(message.text());};page.on('console',log);
    try{
     if(round)await page.reload();else await page.goto(url);
     const view=await page.evaluate(()=>{
      let releaseId;try{releaseId=loadedReleaseId();}catch{}
      return {starting:document.body.hasAttribute('data-release-starting'),diagnostics:startupDiagnostics,readyState:document.readyState,releaseId};
     });
     if(view.starting){
      const before=Date.now();
      try{await page.waitForFunction(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].every(link=>link.sheet),null,{timeout:3000});view.stylesReadyAfterMs=Date.now()-before;}catch{view.stylesReadyAfterMs=null;}
      view.later=await page.evaluate(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>({href:link.href,loaded:Boolean(link.sheet)})));
     }
     return {round,index,...view,network,consoleErrors};
    }finally{page.off('requestfailed',failure);page.off('console',log);}
   }));
   const failures=rows.filter(row=>row.starting || row.diagnostics.length || row.releaseId!==release.id);
   results.push(...rows);if(round%10===0 || failures.length)console.log(JSON.stringify({round,ready:rows.length-failures.length}));
   if(failures.length){fs.writeFileSync(out+'/results.json',JSON.stringify({release:release.id,results},null,2));assert.fail(JSON.stringify(failures,null,2));}
  }
  fs.writeFileSync(out+'/results.json',JSON.stringify({release:release.id,results},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(output,{recursive:true,force:true}));
