const browsers=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(out,{recursive:true});const results=[];
(async()=>{
 const browser=await browsers[process.env.TEST_BROWSER || 'chromium'].launch({headless:true});
 async function run(name,fn){
  const context=await browser.newContext({viewport:{width:1206,height:866},timezoneId:'Asia/Kuala_Lumpur'});
  await context.route('https://**/*',route=>route.fulfill({status:503,body:'No external requests in tests'}));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.stack));
  try{await page.goto(URL+'?preview=1');await fn(page,context);assert.deepEqual(errors,[]);results.push({name,pass:true});}
  catch(error){results.push({name,pass:false,error:error.stack,pageErrors:errors});await page.screenshot({path:out+'/responsive-failure-'+results.length+'.png'}).catch(()=>{});}
  console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 await run('Today uses the full board width after either saved column preference, including portrait desktops',async page=>{
  for(const columns of [2,3]){
   await page.evaluate(columns=>{state.board.columnCount=columns;setWorkspaceMode('board');renderCardsOnly({force:true});},columns);
   await page.locator('#todayModeButton').click();
   for(const [width,height] of [[1206,866],[1080,1920],[900,1600],[768,1024],[701,1024],[700,1024],[680,1024],[390,844],[320,740],[1440,2560]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const result=await page.evaluate(()=>{const board=document.querySelector('#boardGrid').getBoundingClientRect(),intro=document.querySelector('.today-intro').getBoundingClientRect(),grid=document.querySelector('.today-cards').getBoundingClientRect();return {board:board.width,grid:grid.width,aligned:Math.abs(board.left-grid.left)<2,below:grid.top>=intro.bottom,cards:[...document.querySelectorAll('.today-cards>.task-card')].map(c=>c.getBoundingClientRect().width)};});
    assert.ok(result.aligned&&result.below,JSON.stringify({width,columns,...result}));assert.ok(result.grid>=result.board-2,JSON.stringify(result));
    assert.ok(result.cards.every(w=>w>=Math.min(300,result.board)-2),JSON.stringify({width,columns,...result}));
    if(width<=700)assert.ok(result.cards.every(w=>Math.abs(w-result.board)<2),JSON.stringify({width,...result}));
    if(width>700&&result.board>=658&&result.board<=995){const gap=await page.evaluate(()=>document.querySelector('.today-cards>:nth-child(3)').getBoundingClientRect().top-document.querySelector('.today-cards>:first-child').getBoundingClientRect().bottom);assert.ok(gap<30,JSON.stringify({width,gap}));}
   }
  }
 });
 await run('Board chooser keeps normal-sized choices separate from the title',async page=>{
  assert.equal(await page.locator('#boardSwitcherButton').count(),1);
  await page.locator('#boardSwitcherButton').click();
  const menu=page.locator('#boardSwitcherMenu');assert.equal(await menu.isVisible(),true);
  assert.ok(await menu.locator('[role=menuitemradio]').evaluateAll(nodes=>nodes.every(e=>parseFloat(getComputedStyle(e).fontSize)<=16)));
 });
 await run('Daily inputs, dates and menus stay readable and clickable on phone and portrait desktop',async page=>{
  await page.locator('#todayModeButton').click();
  await page.locator('.diary-thoughts').fill('I took a short walk today.\nIt helped to make a little space for myself.');
  await page.getByLabel('Quick note',{exact:true}).fill('An idea to come back to: a quiet weekend by the sea.');
  await page.locator('.side-note-add').click();
  await page.locator('.planner-linked-add-input').fill('Arrange a short walk and call someone I care about');await page.locator('.planner-linked-add-input').press('Enter');
  await page.evaluate(()=>flushDeviceWrites());
  for(const [width,height] of [[320,740],[390,844],[680,1024],[700,1024],[701,1024],[768,1024],[900,1600],[1080,1920],[1206,866],[1440,2560]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(700);
   const geometry=await page.evaluate(()=>[...document.querySelectorAll('.today-cards>.task-card')].map(card=>{
    const body=card.querySelector('.card-body'),r=card.getBoundingClientRect();
    return {type:card.className,overflow:body.scrollWidth-body.clientWidth,width:r.width,left:r.left,right:r.right};
   }));
   assert.ok(geometry.every(r=>r.overflow<=1&&r.left>=0&&r.right<=width),JSON.stringify({width,geometry}));
   const compose=await page.locator('.side-note-compose').evaluate(e=>{const input=e.querySelector('textarea').getBoundingClientRect(),button=e.querySelector('button').getBoundingClientRect();return {width:e.clientWidth,inputWidth:input.width,below:button.top>=input.bottom,height:button.height};});
   assert.ok(compose.inputWidth>=compose.width-2&&compose.below&&compose.height>=44,JSON.stringify(compose));
   assert.ok(await page.locator('.diary-nav strong,.diary-nav span').evaluateAll(nodes=>nodes.every(e=>e.scrollWidth<=e.clientWidth+1)));
   assert.equal(await page.locator('.mood-picker button').count(),7);
   assert.ok(await page.locator('.side-note-actions .card-menu-toggle svg').evaluate(e=>{const r=e.getBoundingClientRect(),button=e.parentElement.getBoundingClientRect();return r.width>=18&&r.height>=18&&r.left>=button.left&&r.right<=button.right&&r.top>=button.top&&r.bottom<=button.bottom;}));
   const add=page.locator('.planner-linked-add-button');await add.scrollIntoViewIfNeeded();
   assert.ok(await add.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
   await page.locator('.type-diary .card-menu-toggle').click();const edit=page.locator('.card-menu:not([hidden]) [data-card-action=edit]');await edit.waitFor({state:'visible'});
   assert.ok(await edit.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));await page.keyboard.press('Escape');
   await page.evaluate(()=>{document.querySelector('.workspace').scrollTop=0;window.scrollTo(0,0);});await page.waitForTimeout(100);
   await page.screenshot({path:out+'/today-'+width+'x'+height+'.png',fullPage:width<701});
   if(width===390)await page.screenshot({path:out+'/phone-390.png'});
  }
  await page.reload();await page.locator('#todayModeButton').click();
  assert.equal(await page.locator('.diary-thoughts').inputValue(),'I took a short walk today.\nIt helped to make a little space for myself.');
  assert.equal(await page.locator('.side-note-text').innerText(),'An idea to come back to: a quiet weekend by the sea.');assert.equal(await page.locator('.planner-linked-copy').innerText(),'Arrange a short walk and call someone I care about');
 });
 await run('Board menu supports keyboard, long names, scrolling and independent board selection',async(page,context)=>{
  await page.evaluate(async()=>{
   state.boards.push(...Array.from({length:24},(_,i)=>createBoardRecord({id:'extra-'+i,name:i===23?'Work and personal research notes with a very long board name':'Board '+String(i+1).padStart(2,'0'),cards:[makeCard({type:'sidenote',title:'Notes '+i})]})));
   saveState({skipCloud:true});await flushDeviceWrites();renderBoardMeta();
  });
  const initial=await page.evaluate(()=>state.activeBoardId);
  await page.locator('#boardSwitcherButton').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.boardId),'extra-23');
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>state.activeBoardId),'extra-23');assert.equal(await page.locator('#boardSwitcherMenu').isVisible(),false);
  await page.locator('#boardSwitcherButton').click();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.boardId),initial);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'boardSwitcherButton');
  const second=await context.newPage();await second.goto(URL+'?preview=1');await second.evaluate(id=>switchBoard(id),initial);
  for(const width of [320,390,1080]){
   await page.setViewportSize({width,height:width===1080?1920:844});await page.waitForTimeout(150);await page.locator('#boardSwitcherButton').click();
   const menu=page.locator('#boardSwitcherMenu');assert.ok(await menu.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth+1;}));
   await menu.getByRole('menuitemradio',{name:'Board 12',exact:true}).click();assert.equal(await page.evaluate(()=>state.activeBoardId),'extra-11');
   await page.locator('#boardSwitcherButton').click();await page.keyboard.press('w');await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>state.activeBoardId),'extra-23');assert.equal(await second.evaluate(()=>state.activeBoardId),initial);
   await page.locator('#boardSwitcherButton').click();await page.screenshot({path:out+'/board-picker-'+width+'.png'});await page.keyboard.press('Escape');
  }
  await page.reload();assert.equal(await page.evaluate(()=>state.activeBoardId),'extra-23');
 });
 await run('Resizing during unfinished diary writing keeps the same input and manual card positions',async page=>{
  await page.evaluate(async()=>{state.board.layout='custom';state.cards.forEach((card,index)=>{card.layoutColumn=index%3;card.layoutOrder=index;});saveState({skipCloud:true});await flushDeviceWrites();});
  const positions=await page.evaluate(()=>state.cards.map(card=>[card.id,card.layoutColumn,card.layoutOrder]));
  await page.locator('#todayModeButton').click();const input=page.locator('.diary-thoughts');await input.fill('First line while I think.\nAn unfinished second thought');await input.evaluate(e=>window.writingInput=e);
  for(const [width,height] of [[390,844],[1080,1920],[900,1600],[390,600]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(150);
   assert.equal(await input.evaluate(e=>e===window.writingInput&&e===document.activeElement),true);
   assert.equal(await input.inputValue(),'First line while I think.\nAn unfinished second thought');
  }
  await input.press('End');await input.pressSequentially(' that is still here.');await page.locator('#boardModeButton').click();await page.evaluate(()=>flushDeviceWrites());
  assert.deepEqual(await page.evaluate(()=>state.cards.map(card=>[card.id,card.layoutColumn,card.layoutOrder])),positions);
  await page.reload();assert.match(await page.locator('.diary-thoughts').inputValue(),/that is still here\./);
 });
 await run('All card bodies fit portrait board columns and survive mode and width changes',async page=>{
  await page.evaluate(async()=>{state.cards=Object.keys(TYPE_META).map((type,index)=>({...makeCard({type,title:'Sample '+type,description:'A readable record\nAnother line',category:'Personal'}),order:index}));saveState({skipCloud:true});await flushDeviceWrites();renderCardsOnly({force:true});});
  const ids=await page.evaluate(()=>state.cards.map(card=>card.id).sort());
  for(const columns of [2,3])for(const width of [320,390,680,700,701,768,900,1080,1206,1440]){
   await page.setViewportSize({width,height:1600});await page.evaluate(columns=>{state.board.columnCount=columns;renderCardsOnly({force:true});},columns);await page.waitForTimeout(120);
   const issues=await page.evaluate(()=>[...document.querySelectorAll('#boardGrid .task-card')].flatMap(card=>{const body=card.querySelector('.card-body'),r=card.getBoundingClientRect();return body.scrollWidth>body.clientWidth+1 || r.right>innerWidth+1 || r.left<0?[{type:card.className,overflow:body.scrollWidth-body.clientWidth,width:r.width}]:[];}));
   assert.deepEqual(issues,[],JSON.stringify({width,columns,issues}));
  }
  assert.deepEqual(await page.evaluate(()=>state.cards.map(card=>card.id).sort()),ids);
 });
 await run('Board picker options stay focused during saves and outside click or Tab dismisses the menu',async page=>{
  await page.evaluate(()=>{state.boards.push(createBoardRecord({id:'work',name:'Work',cards:[]}));renderBoardMeta();});
  await page.locator('#boardSwitcherButton').click();await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.boardId),'work');
  await page.evaluate(async()=>{saveState({skipCloud:true});await flushDeviceWrites();renderBoardMeta();});
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.boardId),'work');
  await page.keyboard.press('Tab');assert.equal(await page.locator('#boardSwitcherMenu').isVisible(),false);
  await page.locator('#boardSwitcherButton').click();await page.locator('#headerSaveStatus').click();assert.equal(await page.locator('#boardSwitcherMenu').isVisible(),false);
 });
 await run('Floating card actions open the right editor, archive, move and retain removed sample records',async page=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{const card=makeCard({type:'checklist',title:'Menu test',description:'Keep every recorded line',items:['My original step']});card.items[0].done=true;card.id='menu-test';state.cards=[card];state.boards.push(createBoardRecord({id:'destination',name:'Destination',cards:[]}));saveState({skipCloud:true});await flushDeviceWrites();render();});
  const open=async()=>{await page.locator('.task-card[data-id="menu-test"] .card-menu-toggle').click();};
  await open();await page.locator('.card-options-menu:not([hidden]) [data-card-action=edit]').click();assert.equal(await page.locator('#cardTitle').inputValue(),'Menu test');await page.locator('#composerCloseButton').click();
  await open();await page.keyboard.press('Escape');assert.equal(await page.locator('.card-options-menu:not([hidden])').count(),0);
  await open();await page.locator('.card-options-menu:not([hidden]) [data-card-action=archive]').click();assert.equal(await page.evaluate(()=>getArchivedCards().some(c=>c.id==='menu-test')),true);
  await page.evaluate(()=>restoreArchivedCard('menu-test'));
  await open();await page.locator('.card-options-menu:not([hidden]) [data-card-action=move]').click();await page.locator('#moveBoardSelect').selectOption('destination');await page.locator('#moveCardConfirmButton').click();
  await page.locator('#boardSwitcherButton').click();await page.getByRole('menuitemradio',{name:'Destination',exact:true}).click();assert.equal(await page.locator('.task-card[data-id="menu-test"]').count(),1);
  await open();await page.setViewportSize({width:900,height:1600});await page.waitForTimeout(150);assert.equal(await page.locator('.card-options-menu:not([hidden])').count(),0);
  await open();await page.locator('.card-options-menu:not([hidden]) [data-card-action=delete]').click();await page.evaluate(()=>flushDeviceWrites());await page.reload();
  const kept=await page.evaluate(()=>getArchivedCards().find(c=>c.id==='menu-test'));assert.equal(kept.description,'Keep every recorded line');assert.equal(kept.items[0].done,true);assert.equal(kept.archiveReason,'removed from board');
 });
 await run('Phone and tablet navigation has four equal targets and never covers an open menu',async page=>{
  await page.evaluate(()=>{state.boards.push(...Array.from({length:12},(_,i)=>createBoardRecord({id:'nav-'+i,name:'Navigation board '+i,cards:[]})));renderBoardMeta();});
  for(const width of [320,390,700,701,768,900,980]){
   await page.setViewportSize({width,height:480});await page.waitForTimeout(150);
   const nav=await page.locator('.rail-nav').evaluate(e=>{const buttons=[...e.querySelectorAll('button')].filter(b=>b.offsetWidth>0),rects=buttons.map(b=>b.getBoundingClientRect());return {count:buttons.length,widths:rects.map(r=>r.width),endGap:e.getBoundingClientRect().right-rects.at(-1).right,clickable:buttons.every((b,i)=>b.contains(document.elementFromPoint(rects[i].x+rects[i].width/2,rects[i].y+rects[i].height/2)))};});
   assert.equal(nav.count,4);assert.ok(Math.max(...nav.widths)-Math.min(...nav.widths)<1&&Math.abs(nav.endGap)<2&&nav.clickable,JSON.stringify({width,nav}));
   await page.locator('#boardSwitcherButton').click();assert.ok(await page.locator('#boardSwitcherMenu').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.sidebar').getBoundingClientRect().top));await page.keyboard.press('Escape');
   await page.locator('.type-sidenote .card-menu-toggle').click();const menu=page.locator('.card-options-menu:not([hidden])');assert.ok(await menu.evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.sidebar').getBoundingClientRect().top));
   assert.ok(await menu.locator('button:not(:disabled)').evaluateAll(nodes=>nodes.every(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})));await page.keyboard.press('Escape');
  }
 });
 fs.writeFileSync(out+'/responsive-results.json',JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
