const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const URL = process.env.TEST_URL || 'http://127.0.0.1:5180/';
const out = process.env.TEST_OUTPUT || '/private/tmp/life-os-test-results';
fs.mkdirSync(out, {recursive: true});
const results = [];

(async () => {
  const browser = await chromium.launch({headless: true});
  async function run(name, fn) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, timezoneId: 'Asia/Kuala_Lumpur', hasTouch: true});
    await context.route('https://**/*', r => r.fulfill({status: 503, body: 'No external services in tests'}));
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(8000); page.on('pageerror', e => errors.push(e.stack)); page.on('dialog', d => d.accept());
    try {
      await page.goto(URL + '?preview=1'); await fn(page); assert.deepEqual(errors, []);
      results.push({name, pass: true});
    } catch (error) {
      results.push({name, pass: false, error: error.stack, pageErrors: errors});
      await page.screenshot({path: out + '/catalogue-failure-' + results.length + '.png'}).catch(() => {});
    }
    console.log(JSON.stringify(results.at(-1))); await context.close();
  }
  await run('Seven everyday choices, ten more types, and opening Add does not modify saved cards', async page => {
    const before = await page.evaluate(() => JSON.stringify(state.cards));
    await page.locator('#railAddButton').click();
    assert.deepEqual(await page.locator('#cardTypeFeatured button').evaluateAll(buttons => buttons.map(b => b.dataset.type)), ['planlist','diary','sidenote','checklist','quote','fitness','food']);
    assert.equal(await page.locator('#cardTypeMore').getAttribute('open'), null);
    assert.equal(await page.locator('#cardTypeMoreCount').innerText(), '10');
    assert.equal(await page.evaluate(() => getSelectedFormType()), 'sidenote');
    assert.equal(await page.locator('#cardTypeSelection').innerText(), 'Side notes');
    await page.locator('#composerCloseButton').click();
    assert.equal(await page.evaluate(() => JSON.stringify(state.cards)), before);
  });
  await run('Searching More types keeps input focus, common fields and the chosen type', async page => {
    await page.locator('#railAddButton').click();
    await page.locator('#cardTitle').fill('My unfinished thought');
    await page.locator('#cardDescription').fill('Line one\nLine two');
    await page.locator('#cardTypeMore > summary').click();
    await page.getByLabel('Find another type').pressSequentially('goal', {delay: 30});
    assert.equal(await page.getByLabel('Find another type').inputValue(), 'goal');
    assert.equal(await page.getByLabel('Find another type').evaluate(e => e === document.activeElement), true);
    await page.locator('#cardTypeMoreOptions [data-type=minutes]').click();
    assert.equal(await page.evaluate(() => getSelectedFormType()), 'minutes');
    await page.getByLabel('Find another type').fill('<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#cardTypeEmpty').isVisible(), true);
    assert.equal(await page.evaluate(() => getSelectedFormType()), 'minutes');
    await page.getByLabel('Find another type').fill('');
    await page.locator('#cardTypeMore > summary').click();
    assert.equal(await page.locator('#cardTypeSelection').innerText(), 'Goal');
    assert.equal(await page.locator('#cardTitle').inputValue(), 'My unfinished thought');
    assert.equal(await page.locator('#cardDescription').inputValue(), 'Line one\nLine two');
    await page.locator('#priorityButtons [data-priority=high]').click();
    assert.equal(await page.locator('#cardTypeMore').getAttribute('open'), null);
  });
  await run('Type and priority choices support keyboard navigation without losing focus', async page => {
    await page.locator('#railAddButton').click();
    await page.locator('#cardTypeFeatured [data-type=sidenote]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => getSelectedFormType()), 'checklist');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.type), 'checklist');
    await page.keyboard.press('Home'); assert.equal(await page.evaluate(() => getSelectedFormType()), 'planlist');
    await page.locator('#priorityButtons [data-priority=normal]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#prioritySelection').innerText(), 'Important');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.priority), 'high');
    await page.keyboard.press('End'); assert.equal(await page.locator('#prioritySelection').innerText(), 'Secondary');
    assert.equal(await page.locator('#priorityButtons [aria-checked=true]').count(), 1);
  });
  await run('All 21 existing types remain editable with their original ID and type', async page => {
    const cards = await page.evaluate(async () => {
      state.cards = Object.keys(TYPE_META).map(type => makeCard({type, title: 'Legacy ' + type})); saveState(); await flushDeviceWrites(); renderCardsOnly({force: true});
      return state.cards.map(c => ({id:c.id, type:c.type}));
    });
    for (const card of cards) {
      await page.evaluate(id => startEditingCard(id), card.id);
      assert.equal(await page.evaluate(() => getSelectedFormType()), card.type);
      assert.equal(await page.locator('#cardTypeButtons [aria-checked=true]').count(), 1);
      if (['lab','workout'].includes(card.type)) {
        assert.equal(await page.locator('#cardTypeMore').getAttribute('open'), '');
        await page.locator('#cardTypeFeatured [data-type=sidenote]').click();
        await page.locator('#cardTypeMoreOptions [data-type=' + card.type + ']').click();
        assert.equal(await page.evaluate(() => getSelectedFormType()), card.type);
      }
      await page.locator('#submitCardButton').click();
      assert.equal(await page.locator('#cardComposerPanel').isVisible(), false);
      assert.equal(await page.evaluate(id => state.cards.find(c => c.id === id)?.type, card.id), card.type);
    }
    await page.evaluate(() => flushDeviceWrites()); await page.reload();
    assert.deepEqual(await page.evaluate(() => state.cards.map(c => ({id:c.id, type:c.type}))), cards);
  });
  await run('Editing metadata preserves Motivation text, today notes and completed legacy items', async page => {
    const cards = await page.evaluate(async () => {
      const types = ['quote','sidenote','brief','lab','workout','daily','checklist','routine','weekly','monthly','annual','minutes'];
      state.cards = types.map(type => makeCard({type, title: 'Preserve ' + type, description: 'First line\nSecond line'}));
      for (const card of state.cards) {
        if (card.items) card.items = [{id:card.type+'-1',text:'Same item',done:true},{id:card.type+'-2',text:'Same item',done:false}];
        if (card.steps) card.steps = [{id:'lab-1',name:'Same step',deliverable:'Keep this',done:true},{id:'lab-2',name:'Same step',deliverable:'Keep this',done:false}];
        if (card.exercises) card.exercises = [{id:'workout-1',name:'Same exercise',prescription:'3 x 8',done:true},{id:'workout-2',name:'Same exercise',prescription:'3 x 8',done:false}];
        if (card.type === 'quote') card.description = '\nFirst line\nSecond line\n';
        if (card.checks?.length) card.checks[0] = true;
        if (card.type === 'brief') card.reviewed = true;
        if (card.type === 'minutes') card.currentValue = 42;
        if (card.type === 'sidenote') {
          card.sideNoteEntries[getTodayKey()] = normalizeSideNoteEntry({notes:[{id:'precious-note',text:'Keep every line\nIncluding today',createdAt:123,updatedAt:456}]});
          card.sideNoteEntries['2020-01-01'] = normalizeSideNoteEntry({notes:[{id:'old-note',text:'Earlier memory',createdAt:123,updatedAt:456}]});
          card.sideNoteDrafts[getTodayKey()] = 'Still thinking about this';
        }
      }
      saveState(); await flushDeviceWrites(); renderCardsOnly({force:true});
      window.recordSnapshot = card => JSON.stringify(Object.fromEntries(['type','description','sideNoteEntries','sideNoteDrafts','steps','exercises','items','checks','reviewed','currentValue','history'].filter(key => card[key] !== undefined).map(key => [key,card[key]])));
      return state.cards.map(card => ({id:card.id,type:card.type,before:window.recordSnapshot(card)}));
    });
    const changes = [];
    for (const card of cards) {
      await page.evaluate(id => startEditingCard(id), card.id);
      await page.locator('#cardTitle').fill('Renamed ' + card.type);
      await page.locator('#submitCardButton').click();
      const after = await page.evaluate(id => window.recordSnapshot(state.cards.find(c => c.id === id)), card.id);
      if (after !== card.before) changes.push({type:card.type,before:JSON.parse(card.before),after:JSON.parse(after)});
    }
    assert.deepEqual(changes, []);
  });
  await run('Editing an empty legacy list does not insert default tasks', async page => {
    for (const type of ['daily','checklist','routine','lab','workout','brief']) {
      const id = await page.evaluate(type => {const card=makeCard({type,title:'Empty '+type});const key=type==='brief'?'sections':type==='lab'?'steps':type==='workout'?'exercises':'items';card[key]=[];state.cards=[card];saveState();renderCardsOnly({force:true});startEditingCard(card.id);return card.id;}, type);
      await page.locator('#submitCardButton').click();
      const size = await page.evaluate(id => {const card=state.cards.find(c=>c.id===id);return (card.items||card.steps||card.exercises||card.sections||[]).length;}, id);
      assert.equal(size, 0, type);
    }
  });
  await run('Each featured card can be created from Add and survives reload', async page => {
    await page.evaluate(async () => {state.cards=[];saveState();await flushDeviceWrites();renderCardsOnly({force:true});});
    for (const type of ['planlist','diary','sidenote','checklist','quote','fitness','food']) {
      await page.locator('#railAddButton').click(); await page.locator('#cardTypeFeatured [data-type=' + type + ']').click();
      await page.locator('#cardTitle').fill('Sample ' + type);
      if (type === 'quote') await page.locator('#cardDescription').fill('One line\nAnother line');
      await page.locator('#submitCardButton').click();
      assert.equal(await page.locator('#cardComposerPanel').isVisible(), false);
    }
    await page.evaluate(() => flushDeviceWrites()); await page.reload();
    assert.deepEqual(await page.evaluate(() => state.cards.map(c => c.type).sort()), ['planlist','diary','sidenote','checklist','quote','fitness','food'].sort());
    assert.equal(await page.locator('.quote-block p').innerText(), 'One line\nAnother line');
  });
  await run('Feeling changes update immediately without replacing diary writing, and can be cleared', async page => {
    const thoughts = page.locator('.diary-thoughts');
    const text = 'I am still writing.\n' + 'These thoughts matter to me. '.repeat(150);
    await thoughts.fill(text); await thoughts.evaluate(e => {window.originalThoughtField=e;});
    await page.locator('.mood-picker [aria-label=Calm]').click();
    assert.equal(await page.locator('.diary-feeling-selection').innerText(), 'Calm');
    assert.equal(await page.locator('.mood-picker [aria-label=Calm]').getAttribute('aria-pressed'), 'true');
    assert.equal(await thoughts.evaluate(e => e === window.originalThoughtField), true);
    assert.equal(await thoughts.inputValue(), text);
    await page.locator('.mood-picker [aria-label=Calm]').click();
    assert.equal(await page.locator('.diary-feeling-selection').innerText(), 'Not set');
    assert.equal(await page.locator('.mood-picker [aria-pressed=true]').count(), 0);
    await page.locator('.mood-picker [aria-label=Meh]').click();
    await page.evaluate(() => flushDeviceWrites()); await page.reload();
    assert.equal(await thoughts.inputValue(), text);
    assert.equal(await page.locator('.diary-feeling-selection').innerText(), 'Meh');
  });
  await run('Composer labels and diary feelings fit narrow screens, with reachable save controls', async page => {
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900}); await page.waitForTimeout(350);
      assert.equal(await page.locator('.mood-picker button').evaluateAll(buttons => buttons.length===7 && buttons.every(e => {const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect(),first=buttons[0].getBoundingClientRect();return r.width>=32 && r.width<=45 && r.height===44 && Math.abs(r.top-first.top)<1 && r.left>=p.left-1 && r.right<=p.right+1;})), true);
      await page.locator('#railAddButton').click();
      const failures = await page.locator('.type-button-copy strong,.type-button-copy small').evaluateAll(labels => labels.filter(e => e.getBoundingClientRect().width && e.scrollWidth>e.clientWidth+1).map(e => e.textContent));
      assert.deepEqual(failures, []);
      await page.locator('#cardTypeFeatured').evaluate(e => e.scrollIntoView({block:'start',behavior:'instant'}));
      await page.screenshot({path:out+'/catalogue-'+width+'.png'});
      assert.equal(await page.locator('#submitCardButton').isVisible(), true);
      await page.locator('#composerCloseButton').click();
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('.type-diary').screenshot({path:out+'/diary-feelings-mobile.png'});
  });
  fs.writeFileSync(out+'/catalogue-results.json',JSON.stringify(results,null,2));
  await browser.close(); if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
