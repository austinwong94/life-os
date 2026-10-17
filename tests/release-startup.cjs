const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),browsers=require('playwright'),{buildRelease}=require('../build-release.cjs');
const root=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-startup-release-'));
const release=buildRelease({output}),files=new Map(Object.keys(release.files).map(file=>[file,fs.readFileSync(path.join(output,file))]));
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-startup';fs.mkdirSync(out,{recursive:true});
const url='http://127.0.0.1:5180/?preview=1&liveReload=0',results=[];
const baseline='2c1bf351901a2fed26c01283977e301ca3c2b468';
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'}),errors=[];
    await context.route('**/*',r=>r.fulfill({status:503,body:'Synthetic startup only; external service blocked'}));
    const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(()=>{
      window.startupWrites=[];
      const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,clear=Storage.prototype.clear;
      Storage.prototype.setItem=function(k,v){startupWrites.push(['set',k]);return set.call(this,k,v);};
      Storage.prototype.removeItem=function(k){startupWrites.push(['remove',k]);return remove.call(this,k);};
      Storage.prototype.clear=function(){startupWrites.push(['clear']);return clear.call(this);};
    });
    try{await fn(p,context,errors);results.push({name,pass:true});}
    catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:path.join(out,'failure-'+results.length+'.png'),fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  async function serve(p,override=()=>null){
    await p.route('http://127.0.0.1:5180/**',async route=>{
      const request=route.request(),file=new URL(request.url()).pathname.slice(1) || 'index.html';
      const changed=await override(file,request);
      if(changed)return route.fulfill(changed);
      if(!files.has(file))return route.fulfill({status:404,body:'Not in release'});
      return route.fulfill({status:200,body:files.get(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',headers:{'cache-control':'no-store'}});
    });
  }
  const ready=p=>p.waitForFunction(()=>typeof state!=='undefined' && !document.body.hasAttribute('data-release-starting'));
  const blocked=async p=>{
    await p.getByText(/Life OS could not load a complete version/).waitFor();
    assert.equal(await p.evaluate(()=>window.LifeStorageScope),undefined);
    assert.deepEqual(await p.evaluate(()=>startupWrites),[]);
    assert(await p.locator('#releaseStartupRetry').isVisible());
    assert.equal(await p.locator('#appShell').isVisible(),false);
  };
  await run('old cached HTML with new modules stops visibly before opening records',async(p,context,errors)=>{
    const html=execFileSync('git',['show',baseline+':index.html'],{cwd:root});
    await serve(p,file=>file==='index.html'?{body:html,contentType:'text/html'}:null);
    await p.goto(url);await p.waitForTimeout(250);
    assert(errors.some(error=>/required modules are missing/.test(error)),JSON.stringify(errors));
    assert.equal(await p.evaluate(()=>window.LifeStartupBlocked),true);
    assert(await p.getByRole('heading',{name:'Life OS needs a complete update'}).isVisible());
    assert(await p.getByRole('link',{name:'Load the current version'}).isVisible());
    assert.equal(await p.locator('#appShell').isVisible(),false);
    assert.deepEqual(await p.evaluate(()=>startupWrites),[]);
    assert.equal(await p.locator('#releaseStartup').count(),0);
  });
  for(const [label,file,override] of [
    ['missing application bundle','index-startup.js',{status:404,body:'Unavailable'}],
    ['stale cached app','index-startup.js',{status:200,body:'window.untrustedAppRan=true;',contentType:'text/javascript'}]
  ])await run(label+' prevents all application execution and storage changes',async p=>{
    await serve(p,name=>name===file?override:null);await p.goto(url);await blocked(p);
    assert.equal(await p.evaluate(()=>window.untrustedAppRan),undefined);
  });
  await run('release CSS is embedded exactly once and stale standalone stylesheets cannot change its layout',async(p,context,errors)=>{
    let externalStyles=0;
    await serve(p,file=>file.endsWith('.css')?(externalStyles++,{body:'body{display:none}',contentType:'text/css'}):null);
    // Reproduce late external CSSOM visibility without delaying or bypassing
    // startup. The release must not depend on external link.sheet readiness.
    await p.addInitScript(()=>Object.defineProperty(HTMLLinkElement.prototype,'sheet',{get(){return null;}}));
    await p.goto(url);await ready(p);assert.deepEqual(errors,[]);assert.equal(externalStyles,0);
    assert.equal(await p.locator('link[rel="stylesheet"]').count(),0);
    const styles=await p.locator('style[data-release-style]').evaluateAll(nodes=>nodes.map(node=>({file:node.dataset.releaseStyle,css:node.textContent,sheet:Boolean(node.sheet)})));
    const expectedStyles=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<link\s+rel="stylesheet"\s+href="([^"?]+)(?:\?[^\"]*)?"/g)].map(match=>match[1]);
    assert.deepEqual(styles.map(style=>style.file),expectedStyles);
    assert.equal(new Set(styles.map(style=>style.file)).size,expectedStyles.length);
    for(const style of styles){assert.equal(style.css,'\n'+files.get(style.file).toString()+'\n');assert.equal(style.sheet,true);}
    assert(await p.locator('#appShell').isVisible());
    assert.equal(await p.evaluate(()=>getComputedStyle(document.body).display==='none'),false);
  });
  await run('unexpected external release stylesheet refuses startup before any record is opened',async p=>{
    const html=files.get('index.html').toString().replace('</head>','<link rel="stylesheet" href="workspace-shell.css"></head>');
    await serve(p,file=>file==='index.html'?{body:html,contentType:'text/html'}:null);
    await p.goto(url);await blocked(p);
  });
  await run('blocked bootstrap still provides a visible non-script fallback without clearing records',async p=>{
    await serve(p,file=>file==='release-startup.js'?{body:'window.untrustedBootstrapRan=true;',contentType:'text/javascript'}:null);
    await p.goto(url);assert(await p.getByRole('region',{name:'Website startup'}).isVisible());
    assert.equal(await p.locator('#appShell').isVisible(),false);assert(await p.getByRole('link',{name:'Try loading again'}).isVisible());
    assert.equal(await p.evaluate(()=>window.LifeStorageScope),undefined);assert.deepEqual(await p.evaluate(()=>startupWrites),[]);
    assert.equal(await p.evaluate(()=>window.untrustedBootstrapRan),undefined);
  });
  await run('cached preceding HTML refuses an actual newer release bundle and explicit retry opens its matching HTML',async p=>{
    const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-next-release-'));
    try{
      const sourceFiles=require('../release-files.json');
      fs.writeFileSync(path.join(fixture,'release-files.json'),JSON.stringify(sourceFiles));
      for(const file of sourceFiles)fs.copyFileSync(path.join(root,file),path.join(fixture,file));
      fs.appendFileSync(path.join(fixture,'app.js'),'\n// Synthetic next release\n');
      fs.appendFileSync(path.join(fixture,'workspace-shell.css'),'\n:root{--synthetic-release:next}\n');
      const nextOutput=path.join(fixture,'out'),next=buildRelease({root:fixture,output:nextOutput});assert.notEqual(next.id,release.id);
      let precedingHtml=true;
      await serve(p,file=>{
        if(file==='index.html' && precedingHtml)return {body:files.get(file),contentType:'text/html'};
        if(!next.files[file])return null;
        return {body:fs.readFileSync(path.join(nextOutput,file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'};
      });
      await p.goto(url);await blocked(p);
      assert.notEqual(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--synthetic-release').trim()),'next');precedingHtml=false;
      await p.getByRole('link',{name:'Try loading again'}).click();await ready(p);
      assert.equal(await p.evaluate(()=>loadedReleaseId()),next.id);
      assert.equal(new URL(p.url()).searchParams.get('preview'),'1');
      assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--synthetic-release').trim()),'next');
    }finally{fs.rmSync(fixture,{recursive:true,force:true});}
  });
  await run('retry keeps preview scope, uses fresh HTML and preserves existing diary, task and note bytes',async p=>{
    let broken=true;
    await p.addInitScript(()=>{
      if(!localStorage.getItem('startupFixture')){
        const fixture={activeBoardId:'original',boards:[{id:'original',name:'Original',cards:[
          {id:'diary',type:'diary',title:'My diary',diaryEntries:{'2026-10-15':{thoughts:'Every word\nAnd every line',updatedAt:1792012345678}}},
          {id:'notes',type:'sidenote',title:'My notes',sideNoteEntries:{'2026-10-15':{notes:[{id:'note-one',text:'My whole note',createdAt:1792012345678,updatedAt:1792012345678}]}}},
          {id:'task-source',type:'planner',title:'Tasks',plannerSchemaVersion:2,plannerTasks:[{id:'task-one',title:'Keep my task',dateKey:'2026-10-16',originalDateKey:'2026-10-16',done:false,updatedAt:1792012345678}]}
        ],archivedCards:[]}]};
        localStorage.setItem('life-os-preview-v1:progress-board-v1',JSON.stringify(fixture));
        localStorage.setItem('progress-board-v1','normal namespace remains exactly unchanged');
        localStorage.setItem('startupFixture',JSON.stringify(fixture));
      }
      window.startupWrites=[];
    });
    await serve(p,file=>broken && file==='index-startup.js'?{status:404,body:'Incomplete deployment'}:null);
    await p.goto(url);await blocked(p);
    const before=await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
    broken=false;await p.getByRole('link',{name:'Try loading again'}).click();await ready(p);
    assert.equal(new URL(p.url()).searchParams.get('preview'),'1');assert.match(new URL(p.url()).searchParams.get('startup'),/^\d+$/);
    assert.equal(await p.evaluate(()=>localStorage.getItem('progress-board-v1')),before['progress-board-v1']);
    assert.equal(await p.evaluate(()=>state.activeBoardId),'original');
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='diary').diaryEntries['2026-10-15'].thoughts),'Every word\nAnd every line');
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='task-source').plannerTasks.find(t=>t.id==='task-one').title),'Keep my task');
    assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='notes').sideNoteEntries['2026-10-15'].notes.find(n=>n.id==='note-one').text),'My whole note');
    assert.equal(await p.evaluate(()=>loadedReleaseId()),release.id);
  });
  await run('complete checked release supports diary writing, saving, reopen and phone/portrait layouts',async(p,context,errors)=>{
    await serve(p);await p.goto(url);await ready(p);assert.deepEqual(errors,[]);
    await p.evaluate(async()=>{
      state.boards=[createBoardRecord({id:'synthetic',name:'Synthetic',cards:[makeCard({type:'diary',title:'My diary'})]})];
      applyBoardToState(state,'synthetic');saveState({skipCloud:true});await flushDeviceWrites();render();
    });
    const text='Checked release diary\nComplete second line';await p.locator('.diary-thoughts').fill(text);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await ready(p);assert.equal(await p.locator('.diary-thoughts').inputValue(),text);
    for(const width of [320,390,1080]){
      await p.setViewportSize({width,height:1100});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await p.screenshot({path:path.join(out,'checked-release-'+width+'.png')});
    }
    assert.deepEqual(errors,[]);
  });
  await run('recovery page also refuses mixed code before inspecting or altering device copies',async p=>{
    await serve(p,file=>file==='storage-repair-startup.js'?{body:'localStorage.clear();',contentType:'text/javascript'}:null);
    await p.goto('http://127.0.0.1:5180/storage-repair.html?preview=1');
    await p.getByText(/Life OS could not load a complete version/).waitFor();
    assert.deepEqual(await p.evaluate(()=>startupWrites),[]);
    assert.equal(await p.locator('#repairButton').isVisible(),false);
  });
  await run('a stalled bundle leaves a usable retry instead of an interactive incomplete board',async p=>{
    let stalled=true;await serve(p);
    await p.route('**/index-startup.js?*',route=>stalled?undefined:route.fallback());
    await p.goto(url,{waitUntil:'commit'});await p.getByRole('link',{name:'Try loading again'}).waitFor();
    assert.equal(await p.evaluate(()=>window.LifeStorageScope),undefined);assert.deepEqual(await p.evaluate(()=>startupWrites),[]);
    assert.equal(await p.locator('#appShell').isVisible(),false);
    stalled=false;await p.getByRole('link',{name:'Try loading again'}).click();await ready(p);
    assert.match(new URL(p.url()).searchParams.get('startup'),/^\d+$/);
  });
  await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  if(results.some(result=>!result.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(output,{recursive:true,force:true}));
