const assert=require('node:assert/strict'),fs=require('node:fs'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const appearance=require('../appearance.js');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-appearance';
assert(['localhost','127.0.0.1'].includes(new URL(url).hostname));fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true}),results=[];
  const records=p=>p.evaluate(()=>JSON.stringify(state.boards.map(b=>({id:b.id,cards:b.cards,archivedCards:b.archivedCards,money:b.money,coachingPrograms:b.coachingPrograms}))));
  async function run(name,fn){
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kuala_Lumpur'});await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic test only'}));
    const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.stack));p.setDefaultTimeout(8000);await p.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
    try{await p.goto(url+'?preview=1&liveReload=0');await p.evaluate(async()=>{
      const diary=makeCard({type:'diary',title:'My diary',diaryEntries:{'2026-10-15':{thoughts:'Every original line.\nAn important second line.',updatedAt:1}}});
      state.boards=[createBoardRecord({id:'first',name:'Personal',cards:[diary,makeCard({type:'food',title:'Nutrition'}),makeCard({type:'fitness',title:'Movement'})]}),createBoardRecord({id:'second',name:'Work',cards:[makeCard({type:'quote',title:'A reminder',quote:'Keep the whole original note.'})]})];
      applyBoardToState(state,'first');sessionStorage.setItem(LifeStorageScope.key('life-os-active-board'),'first');state.ui.workspaceMode='board';saveState();await flushDeviceWrites();render();
    });const original=await records(p);await fn(p);await p.evaluate(()=>flushDeviceWrites());assert.equal(await records(p),original);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(e){results.push({name,pass:false,error:e.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  const settings=async p=>{await p.evaluate(()=>openSettingsModal());await p.locator('#appearanceSettings > summary').click();};
  await run('board colours persist through reload and board changes without changing original records',async p=>{
    await settings(p);await p.getByRole('radio',{name:'Rose',exact:true}).first().click();await p.getByRole('radiogroup',{name:'Background tint',exact:true}).getByRole('radio',{name:'Mint',exact:true}).click();
    await p.evaluate(()=>flushDeviceWrites());await p.reload();
    assert.deepEqual(await p.evaluate(()=>state.board.appearance),{accent:'#b34463',background:'mint'});
    assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--action-fill').trim()),'#b34463');
    await p.evaluate(()=>switchBoard('second'));assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--action-fill').trim()),'#2b57c7');
    await p.evaluate(()=>switchBoard('first'));assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()),'#f3f8f5');
    await settings(p);await p.getByRole('button',{name:'Reset appearance',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.deepEqual(await p.evaluate(()=>state.board.appearance),{accent:'#2b57c7',background:'white'});
  });
  await run('custom colours and keyboard swatches are accessible and do not leave a hard-coded blue primary command',async p=>{
    await settings(p);await p.getByRole('radiogroup',{name:'Accent colour',exact:true}).getByRole('radio',{name:'Blue',exact:true}).press('End');assert.equal(await p.getByRole('radio',{name:'Graphite',exact:true}).getAttribute('aria-checked'),'true');
    await p.locator('#appearanceCustomAccent').fill('#fff000');await p.locator('#appearanceCustomAccent').dispatchEvent('input');await p.evaluate(()=>flushDeviceWrites());
    const token=await p.evaluate(()=>LifeAppearance.tokens(state.board.appearance));assert.equal(token['--action-fill'],'#fff000');assert(appearance.contrast(token['--action-on'],token['--action-fill'])>=4.5);
    await p.getByRole('button',{name:'Close settings',exact:true}).click();await p.waitForFunction(()=>getComputedStyle(document.getElementById('railAddButton')).backgroundColor==='rgb(255, 240, 0)');
    assert.equal(await p.locator('#railAddButton').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 240, 0)');
    await p.reload();assert.equal(await p.evaluate(()=>state.board.appearance.accent),'#fff000');
  });
  await run('restrained headings and metrics fit every workspace; colour controls fit a phone without reducing touch targets',async p=>{
    for(const width of [320,390,1080,1440]){
      await p.setViewportSize({width,height:width<=390?844:1000});
      for(const mode of ['today','tasks','calendar','priorities','money','records','board']){
        await workspace(p,mode);await p.waitForFunction(mode=>document.body.dataset.workspace===mode,mode);
        const sizes=await p.locator('.daily-head h2,.momentum-progress-head h2,.plan-workspace-heading h2,.records-head h2,.money-heading h2,.momentum-metric>strong,.money-stat strong,.food-calories strong,.card-main h3').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length).map(n=>({text:n.textContent,size:parseFloat(getComputedStyle(n).fontSize)})));
        assert(sizes.every(n=>n.size<=24),JSON.stringify({width,mode,sizes}));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        if(mode==='priorities')await p.screenshot({path:out+'/progress-'+width+'.png'});
      }
      await settings(p);assert(await p.locator('.settings-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
      assert(await p.locator('.appearance-swatches button,#appearanceCustomAccent,#resetAppearanceButton').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height>=43.9)));
      await p.locator('#appearanceSettings').evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));await p.screenshot({path:out+'/appearance-'+width+'.png'});
      const geometry=await p.locator('.settings-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
      assert(geometry.left>=0 && geometry.right<=width+1 && geometry.top>=0 && geometry.bottom<=((width<=390)?844:1000)+1,JSON.stringify({width,geometry}));
      const blocked=await p.locator('.appearance-swatches button').evaluateAll(ns=>ns.filter(n=>{const r=n.getBoundingClientRect();return !n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}).map(n=>n.getAttribute('aria-label')));
      assert.deepEqual(blocked,[],'Colour swatches must not be covered by navigation at '+width);
      await p.getByRole('button',{name:'Close settings',exact:true}).click();
      await p.evaluate(()=>document.getElementById('appearanceSettings').open=false);
    }
  });
  await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
