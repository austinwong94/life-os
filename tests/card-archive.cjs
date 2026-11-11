const fs=require('node:fs'),assert=require('node:assert/strict'),browsers=require('playwright');
const {workspace}=require('./navigation.cjs');
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/',out=process.env.TEST_OUTPUT || '/private/tmp/life-os-card-archive';
fs.mkdirSync(out,{recursive:true});const results=[];
(async()=>{
 const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
 async function run(name,fn){
  if(process.env.TEST_CASE_PATTERN && !new RegExp(process.env.TEST_CASE_PATTERN).test(name))return;
  const context=await browser.newContext({viewport:{width:1080,height:1100},timezoneId:'Asia/Kuala_Lumpur'});await context.route('https://**/*',r=>r.fulfill({status:503,body:'Synthetic test only'}));
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(6500);await p.clock.setFixedTime(new Date('2026-11-11T04:00:00Z'));
  try{
   await p.goto(url+'?preview=1&liveReload=0');await p.evaluate(async()=>{
    const source={...makeCard({type:'checklist',title:'SAMPLE family project',category:'Personal'}),id:'archive-source',order:1,custom:{keep:'every unknown field'},items:[{id:'cake',text:'Buy cake',done:true,custom:'Keep task metadata'}]};
    const diary={...makeCard({type:'diary',title:'SAMPLE diary',category:'Personal'}),id:'archive-diary',order:2};getDiaryEntry(diary,getTodayKey()).thoughts='Every complete line\nStill here';
    state.cards=[source,diary];state.archivedCards=[];state.boards.push(createBoardRecord({id:'archive-other',name:'Other board',cards:[{...LifeStateMerge.copy(source),title:'SAMPLE other board project',custom:{keep:'other board'}}]}));saveState();await flushDeviceWrites();renderCardsOnly({force:true});
   });await workspace(p,'board');await p.evaluate(()=>flushDeviceWrites());await fn(p,context);assert.deepEqual(errors,[]);results.push({name,pass:true});
  }catch(error){results.push({name,pass:false,error:error.stack,pageErrors:errors});await p.screenshot({path:out+'/failure-'+results.length+'.png'}).catch(()=>{});}
  console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 const lists=p=>p.evaluate(()=>LifeStateMerge.copy({cards:state.cards,archivedCards:getArchivedCards()}));
 const fail=p=>p.evaluate(()=>{window.originalArchiveStage=LifeDeviceStore.stage;LifeDeviceStore.stage=()=>{throw new Error('Synthetic storage refusal');};});
 const recover=p=>p.evaluate(()=>{LifeDeviceStore.stage=originalArchiveStage;});
 await run('archive safety: refused archiving preserves both original lists and does not offer a false Undo',async p=>{
  const before=await lists(p);await fail(p);await p.evaluate(()=>archiveCard('archive-source'));assert.deepEqual(await lists(p),before);assert.equal(await p.locator('#undoToast').getAttribute('hidden'),'');await recover(p);assert.equal(await p.evaluate(()=>archiveCard('archive-source')),true);await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.evaluate(()=>getArchivedCards().filter(c=>c.id==='archive-source').length),1);
 });
 await run('archive safety: refused restore keeps the full archived card and retry restores it once',async p=>{
  await p.evaluate(async()=>{archiveCard('archive-source');await flushDeviceWrites();clearUndoToast();});const before=await lists(p);await fail(p);await p.evaluate(()=>restoreArchivedCard('archive-source'));assert.deepEqual(await lists(p),before);await recover(p);assert.equal(await p.evaluate(()=>restoreArchivedCard('archive-source')),true);await p.evaluate(()=>flushDeviceWrites());await p.reload();assert.equal(await p.evaluate(()=>state.cards.filter(c=>c.id==='archive-source').length),1);assert.equal(await p.evaluate(()=>getArchivedCards().filter(c=>c.id==='archive-source').length),0);
 });
 await run('archive safety: failed Undo retains the archived card and can be retried without losing diary writing',async p=>{
  await p.evaluate(async()=>{archiveCard('archive-source');await flushDeviceWrites();});const before=await lists(p);await fail(p);await p.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await lists(p),before);assert.equal(await p.getByRole('button',{name:'Undo',exact:true}).isVisible(),true);await recover(p);await p.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await p.evaluate(()=>state.cards.filter(c=>c.id==='archive-source').length),1);assert.equal(await p.evaluate(()=>getDiaryEntry(state.cards.find(c=>c.id==='archive-diary'),getTodayKey()).thoughts),'Every complete line\nStill here');
 });
 await run('archive safety: Undo cannot restore a copied-ID card on another board',async p=>{
  await p.evaluate(async()=>{window.archiveOwner=state.activeBoardId;const other=state.boards.find(b=>b.id==='archive-other');other.archivedCards=[{...other.cards[0],archivedAt:Date.now(),archiveReason:'archived'}];other.cards=[];archiveCard('archive-source');await flushDeviceWrites();switchBoard('archive-other');});const before=await lists(p);await p.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await lists(p),before);assert.equal(await p.evaluate(()=>getArchivedCards()[0].title),'SAMPLE other board project');await p.evaluate(()=>switchBoard(archiveOwner));assert.equal(await p.evaluate(()=>getArchivedCards().filter(c=>c.id==='archive-source').length),1);
 });
 await run('archive safety: a changed archived record is never replaced by an old Undo snapshot',async p=>{
  await p.evaluate(async()=>{archiveCard('archive-source');await flushDeviceWrites();getArchivedCards()[0].custom.keep='Newer archived information';saveState();await flushDeviceWrites();});const before=await lists(p);await p.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await lists(p),before);assert.equal(await p.getByRole('button',{name:'Undo',exact:true}).isVisible(),false);
 });
 await run('archive safety: duplicate source identities and target collisions keep every original record',async p=>{
  const duplicate=await p.evaluate(()=>{state.cards.push(LifeStateMerge.copy(state.cards[0]));const before=LifeStateMerge.copy({cards:state.cards,archivedCards:getArchivedCards()}),ok=archiveCard('archive-source');return {before,ok,after:LifeStateMerge.copy({cards:state.cards,archivedCards:getArchivedCards()})};});assert.equal(duplicate.ok,false);assert.deepEqual(duplicate.after,duplicate.before);
  const collision=await p.evaluate(async()=>{state.cards.pop();archiveCard('archive-source');await flushDeviceWrites();state.cards.push({...LifeStateMerge.copy(getArchivedCards()[0]),title:'Another original with the same ID'});const before=LifeStateMerge.copy({cards:state.cards,archivedCards:getArchivedCards()}),ok=restoreArchivedCard('archive-source');return {before,ok,after:LifeStateMerge.copy({cards:state.cards,archivedCards:getArchivedCards()})};});assert.equal(collision.ok,false);assert.deepEqual(collision.after,collision.before);
 });
 await run('archive safety: a running timer retains elapsed remaining time and restores paused',async p=>{
  const result=await p.evaluate(()=>{const c=state.cards[0];c.timerMode='hours';c.duration=600;c.remaining=600;c.runningSince=Date.now()-90000;const archived=archiveCard(c.id),remaining=getArchivedCards()[0].remaining,paused=getArchivedCards()[0].runningSince;const restored=restoreArchivedCard(c.id);return {archived,restored,remaining,paused,active:state.cards.find(x=>x.id===c.id)};});assert.equal(result.archived,true);assert.equal(result.restored,true);assert.equal(result.remaining,510);assert.equal(result.paused,null);assert.equal(result.active.remaining,510);assert.equal(result.active.runningSince,null);
 });
 await run('archive safety: an open source editor keeps its complete unsubmitted draft',async p=>{
  await p.evaluate(()=>startEditingCard('archive-source'));await p.locator('#cardTitle').fill('Every character of my unsaved title');const before=await lists(p);assert.equal(await p.evaluate(()=>archiveCard('archive-source')),false);assert.deepEqual(await lists(p),before);assert.equal(await p.locator('#cardTitle').inputValue(),'Every character of my unsaved title');assert.equal(await p.evaluate(()=>editingCardId),'archive-source');
 });
 await run('archive safety: moving another card does not reset an unrelated open editor',async p=>{
  await p.evaluate(()=>startEditingCard('archive-diary'));await p.locator('#cardTitle').fill('Unsubmitted diary card title');assert.equal(await p.evaluate(()=>archiveCard('archive-source')),true);assert.equal(await p.locator('#cardTitle').inputValue(),'Unsubmitted diary card title');assert.equal(await p.evaluate(()=>editingCardId),'archive-diary');
 });
 await run('archive safety: Remove uses the same rollback rather than silently hiding a card',async p=>{
  const before=await lists(p);await fail(p);assert.equal(await p.evaluate(()=>deleteCard('archive-source')),false);assert.deepEqual(await lists(p),before);
 });
 await run('archive safety: stale card-menu snapshots cannot archive changed information',async p=>{
  await p.locator('.task-card[data-id="archive-source"] .card-menu-toggle').click();await p.evaluate(()=>{state.cards.find(c=>c.id==='archive-source').custom.keep='Newer information after menu opened';});const before=await lists(p);await p.locator('[data-card-action="archive"]:visible').click();assert.deepEqual(await lists(p),before);
 });
 await run('archive safety: detached menus cannot act on another board with a copied card ID',async p=>{
  await p.locator('.task-card[data-id="archive-source"] .card-menu-toggle').click();await p.evaluate(()=>{window.oldArchiveButton=document.querySelector('[data-card-action="archive"]:not([hidden])');window.oldArchiveMenu=oldArchiveButton.closest('.card-options-menu');switchBoard('archive-other');});const before=await lists(p);await p.evaluate(()=>oldArchiveButton.click());assert.deepEqual(await lists(p),before);
 });
 await run('archive safety: switching boards draws current controls immediately despite the previous typing guard',async p=>{
  await p.evaluate(()=>{textEditGuardUntil=Date.now()+10000;switchBoard('archive-other');});await p.locator('.task-card[data-id="archive-source"] .card-menu-toggle').click();const button=p.locator('.card-options-menu:not([hidden]) [data-card-action="archive"]');assert.equal(await button.isVisible(),true);await button.click();assert.equal(await p.evaluate(()=>getArchivedCards()[0].title),'SAMPLE other board project');await p.evaluate(()=>switchBoard(state.boards.find(b=>b.id!=='archive-other').id));assert.equal(await p.evaluate(()=>state.cards.find(c=>c.id==='archive-source').custom.keep),'every unknown field');
 });
 await run('archive safety: populated daily content cards retain original payloads through repeated archive and restore',async p=>{
  const result=await p.evaluate(async()=>{
   const types=['diary','sidenote','food','fitness','quote','planner','checklist'];const findings=[];
   for(const type of types){
    const c=makeCard({type,title:'SAMPLE '+type,description:'Line one\nLine two'});const day=getTodayKey();
    if(type==='diary')getDiaryEntry(c,day).thoughts='Complete sample diary\nSecond line';
    if(type==='sidenote'){getSideNoteEntry(c,day).notes.push({id:'sample-note',text:'An idea\nAnother line',createdAt:Date.now(),updatedAt:Date.now(),original:true});c.sideNoteDrafts[day]='Unsubmitted note\nKeep every character';}
    if(type==='fitness'){const e=getFitnessEntry(c,day);e.metrics.weightKg=72.45;e.notes='Sample workout\nFull detail';e.parts.chest={active:true,exercises:[{id:'sample-press',name:'Sample press',sets:3,reps:'12',weightKg:25.5,notes:'Controlled reps'}]};}
    if(type==='food'){const e=getFoodEntry(c,day);e.meals[0].items.push(normalizeFoodItem({id:'sample-egg',foodId:'egg',name:'Sample egg',amount:2,unit:'serving',servingUnit:'egg',servingGrams:50,kcal:72,protein:6.3,carbs:0.4,fat:4.8,fiber:0,source:'Synthetic test'}));e.notes='Sample meal record';}
    if(type==='planner')getPlannerEntry(c,day).note='Sample planned task\nAdditional detail';
    if(type==='checklist')c.items=[{id:'sample-child',text:'Sample child',done:true,completedAt:Date.now(),custom:'Keep child history'}];
    c.custom={original:['Unrecognized payload','Must remain']};c.order=nextOrder();state.cards.push(c);saveState();render();await flushDeviceWrites();
    const payload=x=>{const copy=LifeStateMerge.copy(x);for(const key of ['order','archivedAt','archiveReason','runningSince'])delete copy[key];return copy;};
    const before=payload(state.cards.find(x=>x.id===c.id));let ok=true;
    for(let i=0;i<2;i++){ok=archiveCard(c.id,{showUndo:false})&&ok;ok=restoreArchivedCard(c.id)&&ok;}
    findings.push({type,ok,before,after:payload(state.cards.find(x=>x.id===c.id)),count:state.cards.filter(x=>x.id===c.id).length});
   }return findings;
  });for(const row of result){assert.equal(row.ok,true,row.type);assert.equal(row.count,1,row.type);assert.deepEqual(row.after,row.before,row.type);}
 });
 await run('archive safety: independent tabs keep both board archives and complete diary writing',async(p,context)=>{
  await p.evaluate(()=>flushDeviceWrites());const q=await context.newPage();await q.goto(url+'?preview=1&liveReload=0');await q.evaluate(()=>switchBoard('archive-other'));await q.evaluate(()=>flushDeviceWrites());assert.equal(await p.evaluate(async()=>{const ok=archiveCard('archive-source');await flushDeviceWrites();return ok;}),true);assert.equal(await q.evaluate(async()=>{const ok=archiveCard('archive-source');await flushDeviceWrites();return ok;}),true);await p.reload();await q.reload();const snapshot=await p.evaluate(()=>getStateForStorage());for(const board of snapshot.boards.filter(b=>b.id===snapshot.activeBoardId || b.id==='archive-other'))assert.equal(board.archivedCards.filter(c=>c.id==='archive-source').length,1);assert(snapshot.boards.some(b=>b.cards.some(c=>c.id==='archive-diary' && c.diaryEntries['2026-11-11'].thoughts==='Every complete line\nStill here')));
 });
 for(const width of [320,390,768,1080,1440])await run('archive safety: visible restore failure and retry at '+width+'px',async p=>{
  await p.setViewportSize({width,height:width===390?480:900});await p.evaluate(()=>{archiveCard('archive-source',{showUndo:false});openRecordsModal();});const before=await lists(p);await fail(p);await p.locator('[data-restore-card="archive-source"]').click();assert.deepEqual(await lists(p),before);const message=p.locator('#recordsActionStatus');assert.equal(await message.isVisible(),true);assert.match(await message.innerText(),/Restore was not saved/);const box=await message.boundingBox();assert(box.x>=0 && box.x+box.width<=width+1);const panel=await p.locator('.records-modal').boundingBox();assert(box.y>=panel.y && box.y+box.height<=panel.y+panel.height+1);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const restore=p.locator('[data-restore-card="archive-source"]');assert.equal(await restore.isVisible(),true);assert((await restore.boundingBox()).height>=44);assert.equal(await p.locator('.archive-card-meta strong').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await p.screenshot({path:out+'/sample-archive-retry-'+width+'.png'});await recover(p);await restore.click();assert.equal(await p.locator('#recordsActionStatus').isVisible(),false);assert.equal(await p.evaluate(()=>state.cards.filter(c=>c.id==='archive-source').length),1);
 });
 await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
