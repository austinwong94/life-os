const assert = require('node:assert/strict');
const fs = require('node:fs');
const browsers = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const {workspace} = require('./navigation.cjs');
const fixture = require('./coaching-fixture.cjs');
const url = process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out = process.env.TEST_OUTPUT || '/private/tmp/life-os-design';
fs.mkdirSync(out,{recursive:true});
const results = [];

async function seed(page) {
  await page.evaluate(async programme => {
    const source = makeCard({type:'planner',title:'Planning',category:'Personal'});
    source.id = 'design-planner';
    const titles = ['Send the revised launch plan to the team','Make time for a walk','Book a weekend away','Review the customer feedback','Read a chapter','Call a friend'];
    titles.forEach((title,index) => {
      const date = index < 3 ? getTodayKey() : LifePlanning.shift(getTodayKey(),index);
      LifePlanner.add(source,date,title,'design-task-'+index);
      LifePlanner.change(source,'design-task-'+index,{area:index%2?'Personal':'Culturely'});
    });
    LifePlanner.complete(source,'design-task-0',getTodayKey());
    state.cards = [source,
      makeCard({type:'diary',title:'My diary',category:'Personal'}),
      makeCard({type:'sidenote',title:'Quick notes',category:'Personal'}),
      {...makeCard({type:'checklist',title:'Launch checklist',category:'Culturely'}),items:[{id:'check-1',text:'Confirm the launch date with the production team',done:false}]},
      makeCard({type:'quote',title:'Keep going',quote:'One small step is enough for today.\nMake room for the things that matter.'}),
      {...makeCard({type:'event',title:'A weekend outdoors',category:'Personal'}),activity:{title:'A weekend outdoors',area:'Personal',allDay:true,startDate:'2026-09-26',endDate:'2026-09-26',location:'City park',notes:''}}
    ];
    coachingStore().coachingPrograms.push(programme);
    planningSession().columns = 3;
    savePlanningSession();
    saveDailyRecord({kind:'focus',date:getTodayKey(),taskKeys:['design-task-0','design-task-1','design-task-2'].map(id=>JSON.stringify([source.id,id]))});
    saveState();await flushDeviceWrites();renderCardsOnly({force:true});
  },fixture());
}

(async () => {
  const browser = await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,action) {
    const context = await browser.newContext({viewport:{width:1080,height:1200},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',route=>route.fulfill({status:503,body:'Isolated synthetic design test'}));
    const p = await context.newPage(),errors = [];
    p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));
    await p.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));
    try {await p.goto(url+'?preview=1&liveReload=0');await seed(p);await action(p);assert.deepEqual(errors,[]);results.push({name,pass:true});}
    catch(error) {results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Five workspaces fit phone, tablet, portrait and wide desktop without losing controls',async p=>{
    for(const width of [320,390,768,1080,1440]) {
      await p.setViewportSize({width,height:1000});
      for(const mode of ['board','today','tasks','calendar','priorities']) {
        await workspace(p,mode);
        if(mode==='tasks')await p.getByRole('button',{name:'All tasks',exact:true}).click();
        await p.waitForFunction(mode=>state.ui.workspaceMode===mode,mode);
        await p.evaluate(()=>new Promise(requestAnimationFrame));
        if(width<=980) {
          const active=await p.locator('.mobile-daily-nav[aria-pressed=true]:visible').evaluateAll(nodes=>nodes.map(e=>e.id));
          assert.deepEqual(active,[{board:'mobileBoardButton',priorities:'mobileMoreButton',calendar:'mobileTasksButton',tasks:'mobileTasksButton',today:'mobileTodayButton'}[mode]]);
        }
        await p.evaluate(()=>document.fonts.ready);
        assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),mode+' page overflow at '+width);
        const clipped = await p.locator('.daily-head,.task-heading,.task-capture,.daily-journals,.calendar-toolbar,.coaching-priority-choices').evaluateAll(nodes=>nodes.filter(e=>e.getBoundingClientRect().width && e.scrollWidth>e.clientWidth+1).map(e=>e.className));
        assert.deepEqual(clipped,[],mode+' clipped controls at '+width);
        await p.screenshot({path:out+'/'+mode+'-'+width+'.png',fullPage:true});
      }
    }
  });
  await run('Next-step progress uses only visible chosen tasks and remains truthful after completion and reload',async p=>{
    await workspace(p,'today');
    assert.equal(await p.getByRole('progressbar',{name:'Chosen next steps complete'}).getAttribute('value'),'1');
    assert.equal(await p.getByRole('progressbar',{name:'Chosen next steps complete'}).getAttribute('max'),'3');
    await p.getByRole('checkbox',{name:'Mark done: Make time for a walk',exact:true}).click();
    assert.equal(await p.getByRole('checkbox',{name:'Mark open: Make time for a walk',exact:true}).isChecked(),true);
    assert.match(await p.locator('.daily-focus-progress').innerText(),/2 of 3/);
    assert.equal(await p.locator('.daily-focus-section .planner-linked-copy').count(),3);
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'today');
    assert.match(await p.locator('.daily-focus-progress').innerText(),/2 of 3/);
    await p.getByRole('button',{name:'Lighter day',exact:true}).click();
    assert.match(await p.locator('.daily-focus-progress').innerText(),/1 of 1/);
    await p.getByRole('button',{name:'Choose',exact:true}).click();
    while(await p.locator('#dailyDialog input:checked').count())await p.locator('#dailyDialog input:checked').first().uncheck();
    await p.getByRole('button',{name:'Keep next steps',exact:true}).click();
    assert.equal(await p.getByRole('progressbar',{name:'Chosen next steps complete'}).count(),0);
    assert.equal(await p.getByRole('button',{name:'Choose',exact:true}).evaluate(e=>e.classList.contains('is-primary')),true);
    assert.equal(await p.evaluate(()=>LifePlanner.ensure(state.cards.find(c=>c.id==='design-planner')).length),6);
  });
  await run('Full diary text survives responsive navigation and paused typing; feelings stay on one row',async p=>{
    await workspace(p,'today');const text='A complete thought, with time to think.\nAnother line to keep for later.';
    await p.getByLabel('Diary thoughts',{exact:true}).fill(text);await p.evaluate(()=>flushDeviceWrites());
    for(const width of [320,390,1080]) {
      await p.setViewportSize({width,height:1000});
      assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
      const rows=await p.locator('.mood-picker button').evaluateAll(nodes=>new Set(nodes.map(e=>Math.round(e.getBoundingClientRect().top))).size);
      assert.equal(rows,1);
      await workspace(p,'tasks');await workspace(p,'today');
      assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
    }
    await p.reload();await workspace(p,'today');assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
  });
  await run('Three task columns really fit portrait width and desktop touch controls remain usable',async p=>{
    await workspace(p,'tasks');await p.getByRole('button',{name:'All tasks',exact:true}).click();
    for(const width of [1055,1079,1080]) {
      await p.setViewportSize({width,height:1200});
      await p.waitForFunction(()=>new Set([...document.querySelectorAll('.task-results .workspace-task-list > .planner-linked-item')].map(e=>Math.round(e.getBoundingClientRect().left))).size===3);
      const counts=await p.evaluate(async()=>{
        const frames=[];
        for(let frame=0;frame<5;frame++) {
          await new Promise(requestAnimationFrame);
          frames.push(new Set([...document.querySelectorAll('.task-results .workspace-task-list > .planner-linked-item')].map(e=>Math.round(e.getBoundingClientRect().left))).size);
        }
        return frames;
      });
      assert.deepEqual(counts,[3,3,3,3,3],'Three stable rendered columns at '+width);
    }
    await p.setViewportSize({width:390,height:844});
    for(const id of ['mobileTodayButton','mobileTasksButton','mobileBoardButton','mobileMoreButton']) {
      const box=await p.locator('#'+id).boundingBox();assert.ok(box.width>=44&&box.height>=44,id);
    }
    await p.getByRole('button',{name:'Task options: Make time for a walk',exact:true}).click();
    const menu=p.locator('.planner-task-menu:visible');assert.equal(await menu.count(),1);
    assert.ok(await menu.evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}));
    await p.keyboard.press('Escape');
  });
  await browser.close();fs.writeFileSync(out+'/design-results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
