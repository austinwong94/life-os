const assert=require('node:assert/strict');
const fs=require('node:fs');
const browsers=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-redesign';
fs.mkdirSync(out,{recursive:true});
const results=[];
(async()=>{
  const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
  async function run(name,action){
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Kuala_Lumpur'});
    await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic redesign test'}));
    const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));
    try{
      await p.goto(url+'?preview=1&liveReload=0');
      await p.evaluate(async()=>{
        const diary=makeCard({type:'diary',title:'Private journal',category:'Personal'});diary.id='redesign-journal';
        diary.diaryEntries={};
        for(let n=1;n<=31;n++)diary.diaryEntries['2026-09-'+String(n).padStart(2,'0')]={thoughts:'Saved original '+n+'\nFull second line',updatedAt:1000+n};
        diary.diaryEntries['2026-10-01']={thoughts:'<img src=x onerror=alert(1)>\nUnicode 中文',updatedAt:2000};
        const note=makeCard({type:'sidenote',title:'Notes',category:'Personal'});note.id='redesign-notes';
        state.cards=[diary,note];state.archivedCards=[];
        saveState();await flushDeviceWrites();renderCardsOnly({force:true});
      });
      await action(p);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(error){results.push({name,pass:false,error:error.stack,errors});await p.screenshot({path:out+'/failure-'+results.length+'.png',fullPage:true}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('Records preserves every source, safe text, privacy defaults, pagination and board boundaries',async p=>{
    await workspace(p,'records');
    assert.equal(await p.locator('.record-entry').count(),30);
    assert.equal(await p.locator('.record-preview').count(),0);
    assert.equal(await p.locator('.record-entry[open]').count(),0);
    await p.getByRole('button',{name:/Show more/}).click();assert.equal(await p.locator('.record-entry').count(),31);
    await p.getByLabel('Search your writing',{exact:true}).fill('Unicode');
    assert.equal(await p.locator('.record-entry').count(),1);
    await p.locator('.record-entry summary').click();
    assert.match(await p.locator('.record-body').innerText(),/<img src=x onerror=alert\(1\)>/);
    assert.equal(await p.locator('.record-body img').count(),0);
    await p.evaluate(()=>{state.activeBoardId='other-board';state.cards=[];state.archivedCards=[];renderCardsOnly({force:true});});
    assert.equal(await p.locator('.record-entry').count(),0);
  });
  await run('Focused diary and note writers retain paused typing across navigation, save and reload',async p=>{
    await workspace(p,'records');await p.getByRole('button',{name:'Write',exact:true}).click();
    const text='A complete thought, not just the first letter.\nAnother line 中文.';
    await p.getByLabel('Diary thoughts',{exact:true}).pressSequentially(text.slice(0,20),{delay:20});
    await p.evaluate(()=>{renderCardsOnly({reason:'tick'});});
    await p.waitForTimeout(1200);
    await p.getByLabel('Diary thoughts',{exact:true}).pressSequentially(text.slice(20),{delay:20});
    assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
    await p.getByRole('button',{name:'History',exact:true}).click();
    await p.evaluate(()=>flushDeviceWrites());await p.reload();await workspace(p,'records');
    await p.getByRole('button',{name:'Write',exact:true}).click();
    assert.equal(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),text);
    await p.getByLabel('Writing source',{exact:true}).selectOption('redesign-notes');
    const note='A note draft I may come back to.';await p.getByLabel('Quick note',{exact:true}).fill(note);
    await p.getByRole('button',{name:'History',exact:true}).click();await p.getByRole('button',{name:'Write',exact:true}).click();
    assert.equal(await p.getByLabel('Quick note',{exact:true}).inputValue(),note);
    await p.getByRole('button',{name:'Add note',exact:true}).click();
    assert.equal(await p.getByLabel('Quick note',{exact:true}).inputValue(),'');
    await p.getByRole('button',{name:'History',exact:true}).click();await p.getByLabel('Search your writing',{exact:true}).fill(note);
    assert.equal(await p.locator('.record-entry').count(),1);
  });
  await run('Continue writing changes the selected original historical page, not today or an archived copy',async p=>{
    await workspace(p,'records');await p.getByLabel('Recorded day',{exact:true}).fill('2026-10-01');
    await p.locator('.record-entry summary').click();await p.getByRole('button',{name:'Continue writing',exact:true}).click();
    assert.match(await p.getByLabel('Diary thoughts',{exact:true}).inputValue(),/Unicode/);
    await p.getByLabel('Diary thoughts',{exact:true}).fill('A historical page\nKept in its original date');
    await p.getByRole('button',{name:'History',exact:true}).click();await p.evaluate(()=>flushDeviceWrites());
    const values=await p.evaluate(()=>{const card=state.cards.find(c=>c.id==='redesign-journal');return {old:card.diaryEntries['2026-10-01'].thoughts,today:card.diaryEntries[getTodayKey()]?.thoughts || ''};});
    assert.equal(values.old,'A historical page\nKept in its original date');assert.equal(values.today,'');
  });
  await run('Delayed capture-dialog close cannot steal focus from the new card editor',async p=>{
    await p.evaluate(()=>{
      document.getElementById('railAddButton').focus();openDailyCapture();
      const dialog=document.getElementById('dailyDialog');dialog.close();openCardComposer();
      document.querySelector('#cardTypeFeatured [data-type=sidenote]').focus();
    });
    await p.waitForTimeout(300);
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.type),'sidenote');
    await p.keyboard.press('ArrowRight');assert.equal(await p.evaluate(()=>document.activeElement.dataset.type),'checklist');
  });
  await run('Primary navigation, Records and daily layout fit phone and portrait without duplicate menus',async p=>{
    for(const width of [320,390,768,1080,1440]){
      await p.setViewportSize({width,height:1000});
      for(const mode of ['records','today']){
        await workspace(p,mode);await p.evaluate(()=>document.fonts.ready);
        assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),mode+' page overflow '+width);
        if(width>980)assert.equal(await p.locator('.mobile-daily-nav:visible').count(),0);
        if(mode==='records'){
          await p.getByRole('button',{name:'History',exact:true}).click();
          await p.getByLabel('Recorded day',{exact:true}).fill('2026-10-01');
          const box=await p.getByLabel('Recorded day',{exact:true}).boundingBox();assert.ok(box.width>=(width<=420?180:140),'Full date entry must remain readable at '+width);
          assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          await p.getByRole('button',{name:'Write',exact:true}).click();
          assert.ok(await p.getByLabel('Diary thoughts',{exact:true}).isVisible());
          const rows=await p.locator('.mood-picker button').evaluateAll(nodes=>new Set(nodes.map(e=>Math.round(e.getBoundingClientRect().top))).size);assert.equal(rows,1);
        }
        await p.screenshot({path:out+'/'+mode+'-'+width+'.png',fullPage:true});
      }
    }
  });
  await browser.close();fs.writeFileSync(out+'/redesign-results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
