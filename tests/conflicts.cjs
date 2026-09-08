const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const OUT=process.env.TEST_OUTPUT || 'test-results';
fs.mkdirSync(OUT,{recursive:true});
const results=[];
(async()=>{
 const browser=await chromium.launch({headless:true});
 async function run(name,fn){
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Kuala_Lumpur'});
  await context.route('https://**/*',r=>r.fulfill({status:503,body:'No real cloud access in tests'}));
  const p=await context.newPage(),errors=[];p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.stack));p.on('dialog',d=>d.accept());
  try{await p.goto(URL);await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
  catch(e){results.push({name,pass:false,error:e.stack,pageErrors:errors});await p.screenshot({path:OUT+'/conflict-failure-'+results.length+'.png'}).catch(()=>{});}
  console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 async function seed(p,remoteText='Other version.\nA different second line.'){return p.evaluate(async remoteText=>{
  state.boards.push(createBoardRecord({id:'untouched',name:'Other board',cards:[makeCard({type:'quote',title:'Keep this motivation',description:'Original notes'})]}));
  saveState();await flushDeviceWrites();const base=getStateForStorage();
  const diary=state.cards.find(c=>c.type==='diary');updateDiaryEntry(diary,getTodayKey(),{thoughts:'My full entry.\nSecond line.'});await flushDeviceWrites();
  const remote=LifeStateMerge.copy(base);remote.boards[0].cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts=remoteText;
  state.syncConflicts=LifeStateMerge.registerConflicts(LifeStateMerge.merge(base,getStateForStorage(),remote).conflicts.map(c=>({...c,source:'device'})),{},createId);
  saveState({skipCloud:true});await flushDeviceWrites();openRecovery();return state.syncConflicts[0].id;
 },remoteText);}
 await run('review keeps both versions, applies one text field, and preserves other boards',async p=>{
  await seed(p);assert.equal(await p.getByRole('button',{name:'Save choice',exact:true}).isDisabled(),true);
  await p.getByText('Other tab version',{exact:true}).click();await p.getByRole('button',{name:'Save choice',exact:true}).click();await p.getByText(/Choice saved\./).waitFor();
  await p.reload();assert.equal(await p.locator('.diary-thoughts').inputValue(),'Other version.\nA different second line.');
  const result=await p.evaluate(()=>({other:state.boards.find(b=>b.id==='untouched').cards[0].description,copies:readLocalJsonValue(CLOUD_RECOVERY_KEY,[]),conflicts:state.syncConflicts.length}));
  assert.equal(result.other,'Original notes');assert.equal(result.conflicts,0);assert.match(JSON.stringify(result.copies),/My full entry/);assert.match(JSON.stringify(result.copies),/Other version/);
 });
 await run('combined text survives closing and reloading the review without a character cap',async p=>{
  await seed(p);await p.getByText('Combine or edit',{exact:true}).click();const text='A long personal reflection.\n'.repeat(200);
  await p.getByLabel('Combined version').fill(text);await p.getByRole('button',{name:'Close recovery',exact:true}).click();await p.reload();await p.evaluate(()=>openRecovery());
  assert.equal(await p.getByLabel('Combined version').inputValue(),text);await p.getByRole('button',{name:'Save choice',exact:true}).click();await p.getByText(/Choice saved\./).waitFor();
  assert.equal(await p.evaluate(()=>state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts),text);
 });
 await run('stale review refuses overwrite and refreshing retains the combined draft',async p=>{
  await seed(p);await p.getByText('Combine or edit',{exact:true}).click();await p.getByLabel('Combined version').fill('My carefully combined draft');
  await p.evaluate(async()=>{updateDiaryEntry(state.cards.find(c=>c.type==='diary'),getTodayKey(),{thoughts:'Newer writing',sentence:'An unrelated new sentence'});await flushDeviceWrites();});
  await p.getByRole('button',{name:'Save choice',exact:true}).click();await p.getByText(/entry changed after you opened/).waitFor();
  assert.equal(await p.getByLabel('Combined version').inputValue(),'My carefully combined draft');
  await p.getByRole('button',{name:'Refresh comparison',exact:true}).click();await p.getByText(/Current entry refreshed/).waitFor();
  await p.getByRole('button',{name:'Save choice',exact:true}).click();await p.getByText(/Choice saved\./).waitFor();
  assert.equal(await p.evaluate(()=>state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].sentence),'An unrelated new sentence');
 });
 await run('failed recovery backup leaves the original text and comparison untouched',async p=>{
  await seed(p);await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===CLOUD_RECOVERY_KEY)throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
  await p.getByText('Other tab version',{exact:true}).click();await p.getByRole('button',{name:'Save choice',exact:true}).click();await p.getByText(/recovery copy could not be saved/).waitFor();
  const result=await p.evaluate(()=>({thoughts:state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts,count:state.syncConflicts.length}));assert.equal(result.thoughts,'My full entry.\nSecond line.');assert.equal(result.count,1);
 });
 await run('a stale tab cannot resurrect a resolved comparison',async(p,context)=>{
  await seed(p);const q=await context.newPage();await q.goto(URL);const old=await q.evaluate(()=>LifeStateMerge.copy(state.syncConflicts));
  await p.getByText('Other tab version',{exact:true}).click();await p.getByRole('button',{name:'Save choice',exact:true}).click();await p.getByText(/Choice saved\./).waitFor();
  await q.evaluate(async old=>{state.syncConflicts=old;saveState();await flushDeviceWrites();},old);
  assert.equal(await q.evaluate(()=>state.syncConflicts.length),0);assert.equal(await q.evaluate(()=>cloudConflictPending),false);
 });
 await run('comparison is usable on mobile and displays injected markup as text',async p=>{
  await seed(p,'<img src=x onerror="window.injected=true">');
  assert.equal(await p.locator('.conflict-review img').count(),0);
  for(const width of [320,390]){
   await p.setViewportSize({width,height:844});await p.getByText('Other tab version',{exact:true}).click();const button=p.getByRole('button',{name:'Save choice',exact:true});await button.scrollIntoViewIfNeeded();
   const dimensions=await p.evaluate(()=>({page:document.documentElement.scrollWidth,view:innerWidth,dialog:document.querySelector('.recovery-dialog').getBoundingClientRect().toJSON()}));assert.ok(dimensions.page<=dimensions.view);assert.ok(dimensions.dialog.right<=dimensions.view);
  }
  assert.equal(await p.evaluate(()=>window.injected),undefined);
  await p.getByRole('button',{name:'Close recovery',exact:true}).click();
  await p.evaluate(()=>{const conflict=state.syncConflicts[0];conflict.local='Today felt difficult, but I went for a walk.';conflict.remote='I went for a walk and called a friend. That helped.';state.cards.find(c=>c.type==='diary').diaryEntries[getTodayKey()].thoughts=conflict.local;openRecovery();});
  await p.screenshot({path:OUT+'/conflict-mobile.png'});
  await p.setViewportSize({width:1280,height:900});await p.screenshot({path:OUT+'/conflict-desktop.png'});
 });
 fs.writeFileSync(OUT+'/conflict-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
