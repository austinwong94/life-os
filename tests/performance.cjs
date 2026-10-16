// Lab timings from isolated synthetic records, never an existing browser profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto'),browsers=require('playwright'),{buildRelease}=require('../build-release.cjs');
const {fixture,profiles,summarize,seedWorkspace}=require('./performance-fixture.cjs'),{workspace}=require('./navigation.cjs');
const engine=process.env.TEST_BROWSER || 'chromium';
assert(['chromium','webkit'].includes(engine),'Use Chromium or WebKit');
const selected=(process.env.PERF_PROFILES || Object.keys(profiles).join(',')).split(',');
assert(selected.length && new Set(selected).size===selected.length && selected.every(p=>Object.hasOwn(profiles,p)),'Invalid profiles');
const samples=Number(process.env.PERF_SAMPLES || 3);assert(Number.isSafeInteger(samples) && samples>=1 && samples<=10,'Use 1-10 samples');
const out=path.resolve(process.env.TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'life-os-performance-')));
fs.mkdirSync(out,{recursive:true});
const artifact=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-performance-release-')),release=buildRelease({output:artifact});
const files=new Map(Object.keys(release.files).map(file=>[file,fs.readFileSync(path.join(artifact,file))]));
const origin='http://127.0.0.1:5199',url=origin+'/?preview=1&liveReload=0';
const hash=text=>createHash('sha256').update(text).digest('hex');
const report={release:release.id,artifact,engine,samples,generatedAt:new Date().toISOString(),environment:{platform:os.platform(),arch:os.arch(),cpus:os.cpus().length,cpuModel:os.cpus()[0]?.model,node:process.version,playwright:require('playwright/package.json').version},method:'Headless lab; immutable assets fulfilled in memory, no external network, fresh contexts, synthetic records, no CPU throttling. Reload timings include application startup and automation overhead, not real network speed. Frame latency is not field INP. Small sample counts are a baseline, not a reliable tail estimate.',advisoryBudgetsMs:{synchronousDiaryUpdate:100,inputToNextFrame:200,reloadReady:2500},results:[]};

function installProbe(){
  if(window.lifePerformanceProbe)return;
  const stage=LifeDeviceStore.stage;
  const probe=window.lifePerformanceProbe={stages:[],frames:[]};
  LifeDeviceStore.stage=function(...args){const start=performance.now();try{return stage.apply(this,args);}finally{probe.stages.push(performance.now()-start);}};
  document.addEventListener('input',event=>{
    if(event.target.getAttribute('aria-label')!=='Diary thoughts')return;
    const start=performance.now();requestAnimationFrame(()=>probe.frames.push(performance.now()-start));
  },true);
  probe.records=snapshot=>(snapshot.boards || []).map(board=>({id:board.id,cards:[...(board.cards || []),...(board.archivedCards || [])].map(card=>{
    const result={id:card.id,type:card.type,title:card.title};
    for(const key of ['diaryEntries','sideNoteEntries','sideNoteDrafts','fitnessEntries','foodEntries','foodLibrary','foodTargets','plannerTasks','plannerLegacyEntries','archivedAt','unknownOriginal'])if(Object.hasOwn(card,key))result[key]=LifeStateMerge.copy(card[key]);
    if(board.id==='synthetic-0' && card.id==='synthetic-0-diary')delete result.diaryEntries['2026-10-16'];
    return result;
  })}));
}

(async()=>{
  let browser;
  try{
    browser=await browsers[engine].launch({headless:true});report.environment.browser=browser.version();
    for(const name of selected){
      const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'}),errors=[],external=[];
      const result={profile:name,shape:{...profiles[name]},metrics:{},pass:false};report.results.push(result);
      await context.route('**/*',route=>{
        const request=new URL(route.request().url());
        if(request.origin!==origin){external.push(request.origin);return route.fulfill({status:503,body:'Synthetic lab: external access blocked'});}
        const file=request.pathname.slice(1) || 'index.html',body=files.get(file);
        return route.fulfill(body?{status:200,body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',headers:{'cache-control':'no-store'}}:{status:404,body:'Not in immutable lab package'});
      });
      const p=await context.newPage();p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));
      await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
      try{
        await p.goto(url);await p.waitForFunction(()=>typeof state!=='undefined' && !document.body.hasAttribute('data-release-starting'));
        const input=fixture(name);result.fixtureBytes=Buffer.byteLength(JSON.stringify(input));
        const seeded=await p.evaluate(seedWorkspace,input);
        result.setup=seeded;
        if(!seeded.flushed){
          await p.evaluate(installProbe);
          const original=await p.evaluate(()=>lifePerformanceProbe.records(state));
          const expected=await p.evaluate(()=>state.cards.find(c=>c.id==='synthetic-0-diary').diaryEntries['2026-10-16'].thoughts);
          const retained=await p.evaluate(()=>{
            const entries=LifeDeviceStore.pending();
            return {count:entries.length,matching:entries.some(packet=>LifeStateMerge.equal(lifePerformanceProbe.records(packet.entry.state),lifePerformanceProbe.records(state)) && packet.entry.state.boards[0].cards[0].diaryEntries['2026-10-16'].thoughts===state.cards[0].diaryEntries['2026-10-16'].thoughts),error:lastDeviceSaveError?.name || null};
          });
          result.capacityAccepted=false;assert(seeded.staged && retained.count>0 && retained.matching && seeded.previousMainUnchanged,'Failed large-history save did not preserve the pending source or main copy');
          await p.reload();await p.waitForFunction(()=>typeof state!=='undefined' && !document.body.hasAttribute('data-release-starting'));await p.evaluate(installProbe);
          assert.equal(await p.evaluate(()=>corruptLocalStateDetected),false);assert.deepEqual(await p.evaluate(()=>lifePerformanceProbe.records(state)),original);
          assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='synthetic-0-diary').diaryEntries['2026-10-16'].thoughts),expected);
          result.retained={pendingJournal:true,mainUnchanged:true,fullDiaryAfterReload:true,earlierRecords:true,otherBoards:true,archive:true};result.refusal=retained;
          throw new Error('Capacity gate failed: journal and reload preserved records, but the main device copy could not commit. This profile is NOT accepted.');
        }
        assert(seeded.staged,'Synthetic history could not be staged; this profile is NOT accepted');result.capacityAccepted=true;
        await workspace(p,'board');assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);
        await p.evaluate(installProbe);
        const original=await p.evaluate(()=>lifePerformanceProbe.records(state));result.originalRecordsSha256=hash(JSON.stringify(original));
        const syncTimes=[],flushTimes=[],reloadTimes=[],stageTimes=[],frameTimes=[];
        let expected=await p.getByLabel('Diary thoughts',{exact:true}).inputValue();
        for(let i=0;i<samples;i++){
          expected+='\nSynthetic measured thought '+i+': every character remains.';
          const measurement=await p.evaluate(async text=>{
            const start=performance.now();updateDiaryEntry(state.cards.find(c=>c.id==='synthetic-0-diary'),'2026-10-16',{thoughts:text});const synchronousMs=performance.now()-start;
            const flushStart=performance.now(),ok=await flushDeviceWrites();return {synchronousMs,flushMs:performance.now()-flushStart,ok,staged:lastLocalSaveOk,stages:lifePerformanceProbe.stages.splice(0)};
          },expected);
          assert(measurement.ok && measurement.staged,'Diary update was not retained');syncTimes.push(measurement.synchronousMs);flushTimes.push(measurement.flushMs);stageTimes.push(...measurement.stages);
          assert.deepEqual(await p.evaluate(()=>lifePerformanceProbe.records(state)),original);
          const checkpoint=await p.evaluate(()=>LifeDeviceStore.readCheckpoint());assert.equal(checkpoint.boards[0].cards[0].diaryEntries[input.today].thoughts,expected);
          // Navigate only this isolated lab page; never refresh an owner's tab.
          const start=performance.now();await p.reload();await p.waitForFunction(()=>typeof state!=='undefined' && !document.body.hasAttribute('data-release-starting') && document.querySelector('#appShell')?.getClientRects().length);reloadTimes.push(performance.now()-start);
          await workspace(p,'board');assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);await p.evaluate(installProbe);
          assert.deepEqual(await p.evaluate(()=>lifePerformanceProbe.records(state)),original);assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),expected);
          const writer=p.getByLabel('Diary thoughts',{exact:true});await writer.focus();await writer.evaluate(el=>el.setSelectionRange(el.value.length,el.value.length));
          await writer.pressSequentially(' thinking',{delay:0});expected+=' thinking';
          assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);
          await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          assert.equal(await writer.inputValue(),expected);assert.deepEqual(await p.evaluate(()=>lifePerformanceProbe.records(state)),original);
          const probe=await p.evaluate(()=>({stages:lifePerformanceProbe.stages.splice(0),frames:lifePerformanceProbe.frames.splice(0)}));stageTimes.push(...probe.stages);frameTimes.push(...probe.frames);
          assert.equal(probe.frames.length,9,'Every synthetic input event must produce a measured frame');
        }
        assert.equal(await p.evaluate(()=>flushDeviceWrites()),true);
        const final=await p.evaluate(async()=>({stored:JSON.parse(localStorage.getItem(STORAGE_KEY)),checkpoint:await LifeDeviceStore.readCheckpoint(),pending:LifeDeviceStore.pending().length,conflicts:state.syncConflicts.length,storage:LifeDeviceStore.diagnostics()}));
        assert.equal(final.pending,0);assert.equal(final.conflicts,0);assert.equal(final.stored.boards[0].cards[0].diaryEntries[input.today].thoughts,expected);
        assert.deepEqual(final.checkpoint,final.stored);assert.deepEqual(await p.evaluate(snapshot=>lifePerformanceProbe.records(snapshot),final.stored),original);
        result.metrics={synchronousDiaryUpdateMs:summarize(syncTimes),flushAfterUpdateMs:summarize(flushTimes),reloadReadyMs:summarize(reloadTimes),journalStageMs:summarize(stageTimes),inputToNextFrameMs:summarize(frameTimes)};
        result.advisories=[];
        for(const [metric,budget] of [['synchronousDiaryUpdateMs',100],['inputToNextFrameMs',200],['reloadReadyMs',2500]])if(result.metrics[metric]?.max>budget)result.advisories.push(metric+' exceeded provisional '+budget+'ms budget');
        result.retained={fullLatestDiary:true,earlierRecords:true,otherBoards:true,archive:true,checkpointReadback:true,pending:0,conflicts:0};result.finalStorage=final.storage;
        result.externalRequestsBlocked=external.length;assert.deepEqual(errors,[]);
        await p.screenshot({path:path.join(out,name+'-'+engine+'.png'),fullPage:false});
        result.pass=true;
      }catch(error){result.error=error.message;result.pageErrors=errors;process.exitCode=1;}
      finally{await context.close();fs.writeFileSync(path.join(out,'performance-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(result));}
    }
  }finally{if(browser)await browser.close();}
  console.log('Performance evidence: '+out);
})().catch(error=>{console.error(error);process.exitCode=1;});
