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
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(e.stack));
    page.on('dialog', d => d.accept());
    try {
      await page.goto(URL + '?preview=1');
      await fn(page);
      assert.deepEqual(errors, []);
      results.push({name, pass: true});
    } catch (error) {
      results.push({name, pass: false, error: error.stack, pageErrors: errors});
      await page.screenshot({path: out + '/usability-failure-' + results.length + '.png'}).catch(() => {});
    }
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
  async function seedHealth(page) {
    await page.evaluate(async () => {
      state.ui.workspaceMode = 'board';
      state.cards = [makeCard({type: 'food', title: 'Food today'}), makeCard({type: 'fitness', title: 'Movement'})];
      const food = state.cards[0], entry = getFoodEntry(food);
      entry.meals[0].name = 'Breakfast';
      const egg = food.foodLibrary.find(item => item.name === 'Egg');
      addFoodItemToMeal(food, getTodayKey(), entry.meals[0].id, egg.id);
      saveState(); await flushDeviceWrites(); renderCardsOnly({force: true}); renderBoardMeta();
    });
  }
  async function resize(page, width) {
    await page.setViewportSize({width, height: 900});
    await page.waitForTimeout(350);
  }

  await run('Filters disclosure matches its state, stays hidden on Today and remembers board preference', async page => {
    const count = await page.evaluate(() => state.cards.length);
    for (const open of [false, true]) {
      await page.evaluate(open => {state.ui.controlsOpen = open; renderBoardMeta();}, open);
      const filters = page.locator('#topControlsToggleButton');
      assert.equal(await filters.getAttribute('aria-expanded'), String(open));
      assert.equal(await page.locator('#boardToolbar').isVisible(), open);
      await filters.click();
      assert.equal(await filters.getAttribute('aria-expanded'), String(!open));
      assert.equal(await page.locator('#boardToolbar').isVisible(), !open);
      await page.locator('#todayModeButton').click();
      assert.equal(await filters.isVisible(), false);
      assert.equal(await filters.getAttribute('aria-expanded'), 'false');
      await page.evaluate(() => toggleBoardControls());
      assert.equal(await page.evaluate(() => state.ui.controlsOpen), !open);
      await page.locator('#boardModeButton').click();
      assert.equal(await filters.isVisible(), true);
      assert.equal(await filters.getAttribute('aria-expanded'), String(!open));
      assert.equal(await page.locator('#boardToolbar').isVisible(), !open);
    }
    assert.equal(await page.evaluate(() => state.cards.length), count);
  });

  await run('Health cards show full nutrition labels and every workout part at phone/tablet/desktop widths', async page => {
    await seedHealth(page);
    for (const width of [320, 390, 768, 1440]) {
      await resize(page, width);
      const report = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#boardGrid .task-card')];
        const failures = [];
        for (const el of document.querySelectorAll('.food-macro span,.food-macro small,.food-meal-summary strong,.food-meal-summary small,.food-chip-row button span')) {
          if (el.getBoundingClientRect().width && el.scrollWidth > el.clientWidth + 1) failures.push(el.textContent);
        }
        const partBounds = document.querySelector('.fitness-parts').getBoundingClientRect();
        const parts = [...document.querySelectorAll('.fitness-parts button')].map(e => {
          const r = e.getBoundingClientRect(); return {name: e.getAttribute('aria-label'), height: r.height, fits: r.left >= partBounds.left - 1 && r.right <= partBounds.right + 1};
        });
        return {failures, parts, overflow: document.documentElement.scrollWidth > innerWidth, cardsFit: cards.every(e => e.getBoundingClientRect().right <= innerWidth + 1), labels: [...document.querySelectorAll('.food-macro > span')].map(e => e.textContent)};
      });
      assert.deepEqual(report.failures, [], JSON.stringify({width, report}));
      assert.equal(report.overflow, false); assert.equal(report.cardsFit, true);
      assert.deepEqual(report.labels, ['Protein', 'Carbs', 'Fat', 'Fiber']);
      assert.equal(report.parts.length, 9); assert.ok(report.parts.every(p => p.height >= 44 && p.fits));
      await page.evaluate(() => {window.scrollTo(0, 0); elements.workspace.scrollTop = 0;});
      await page.screenshot({path: out + '/health-' + width + '.png'});
    }
  });

  await run('Eight meals are reachable; long names, quantity conversion, food removal and collapse still work', async page => {
    await seedHealth(page);
    for (let i = 4; i <= 8; i++) {
      await page.locator('.food-add-meal').click();
      await page.getByLabel('Custom meal name', {exact: true}).fill('Meal ' + i);
      await page.getByTitle('Add custom meal', {exact: true}).click();
    }
    assert.equal(await page.locator('.food-meal-tabs [role=tab]').count(), 8);
    for (let i = 8; i > 1; i--) await page.getByTitle('Previous meal', {exact: true}).click();
    assert.equal(await page.getByLabel('Meal name', {exact: true}).inputValue(), 'Breakfast');
    await page.getByLabel('Egg unit', {exact: true}).selectOption('g');
    await page.getByLabel('Egg amount', {exact: true}).fill('100');
    await page.getByLabel('Egg amount', {exact: true}).press('Tab');
    const totals = await page.evaluate(() => getFoodEntryTotals(state.cards[0], getFoodEntry(state.cards[0])));
    await page.getByLabel('Egg unit', {exact: true}).selectOption('serving');
    assert.deepEqual(await page.evaluate(() => getFoodEntryTotals(state.cards[0], getFoodEntry(state.cards[0]))), totals);
    await page.locator('.food-meal-details > summary').click();
    await page.locator('.food-add-food-panel > summary').click();
    await page.evaluate(async () => {await flushDeviceWrites();});
    await page.reload();
    assert.equal(await page.locator('.food-meal-details').getAttribute('open'), null);
    assert.equal(await page.locator('.food-add-food-panel').getAttribute('open'), null);
    await page.locator('.food-meal-details > summary').click();
    await page.getByLabel('Remove Egg', {exact: true}).click();
    assert.equal(await page.locator('.food-item-row').count(), 0);
    for (let i = 1; i < 8; i++) await page.getByTitle('Next meal', {exact: true}).click();
    const name = page.getByLabel('Meal name', {exact: true});
    await name.fill('Afternoon meal after a long walk'); await name.press('Tab');
    const active = page.locator('.food-meal-tabs [aria-selected=true]');
    assert.match(await active.innerText(), /Afternoon meal after a long walk/);
    assert.equal(await active.locator('span').evaluate(e => e.scrollWidth <= e.clientWidth + 1), true);
    assert.equal(await page.getByTitle('Next meal', {exact: true}).isDisabled(), true);
    await page.screenshot({path: out + '/meal-eight-mobile.png'});
  });

  await run('Pace updates during multi-digit input without losing focus; part switching preserves metrics and history', async page => {
    await seedHealth(page);
    await page.locator('.fitness-metrics > summary').click();
    await page.getByLabel('Weight (kg)', {exact: true}).pressSequentially('72.35', {delay: 40});
    await page.locator('.fitness-metrics > summary').click();
    await page.locator('.fitness-parts').getByRole('button', {name: 'Running', exact: true}).click();
    const minutes = page.locator('.fitness-active').getByLabel('Minutes', {exact: true});
    await minutes.pressSequentially('30', {delay: 40});
    const km = page.locator('.fitness-active').getByLabel('Km', {exact: true});
    await km.pressSequentially('5.25', {delay: 40});
    assert.equal(await km.inputValue(), '5.25');
    assert.equal(await km.evaluate(e => e === document.activeElement), true);
    assert.equal(await page.locator('.fitness-pace').innerText(), '5.7 min/km');
    await km.fill('0'); assert.equal(await page.locator('.fitness-pace').innerText(), 'Pace');
    await km.fill('5'); assert.equal(await page.locator('.fitness-pace').innerText(), '6.0 min/km');
    await page.locator('.fitness-parts').getByRole('button', {name: 'Chest', exact: true}).click();
    assert.equal(await page.locator('.fitness-metrics').getAttribute('open'), null);
    assert.equal(await page.locator('.fitness-parts [aria-pressed=true]').getAttribute('aria-label'), 'Chest');
    await page.evaluate(() => flushDeviceWrites()); await page.reload();
    assert.equal(await page.locator('.fitness-metrics').getAttribute('open'), null);
    const saved = await page.evaluate(() => getFitnessEntry(state.cards.find(c => c.type === 'fitness')));
    assert.equal(saved.metrics.weightKg, 72.35); assert.equal(saved.parts.running.distanceKm, 5); assert.equal(saved.parts.running.durationMinutes, 30);
    await page.locator('.type-fitness').screenshot({path: out + '/workout-mobile.png'});
  });

  await run('Read-only detached fitness preview uses its own numbers, not the live card with the same ID', async page => {
    await seedHealth(page);
    const result = await page.evaluate(() => {
      const live = state.cards.find(c => c.type === 'fitness'), date = getTodayKey();
      const entry = getFitnessEntry(live, date); entry.parts.running.active = true; entry.parts.running.distanceKm = 5; entry.parts.running.durationMinutes = 30;
      const before = JSON.stringify(live.fitnessEntries);
      const detached = structuredClone(live); detached.fitnessEntries[date].parts.running.distanceKm = 10;
      const preview = renderFitnessCardioEditor(detached, date, getFitnessPartMeta('running'), detached.fitnessEntries[date].parts.running);
      return {pace: preview.querySelector('.fitness-pace').textContent, unchanged: before === JSON.stringify(live.fitnessEntries)};
    });
    assert.deepEqual(result, {pace: '3.0 min/km', unchanged: true});
  });

  await run('Changing columns and switching workspace views do not rewrite health records', async page => {
    await seedHealth(page);
    const snapshot = () => page.evaluate(() => state.cards.map(c => ({id: c.id, foodEntries: c.foodEntries, foodLibrary: c.foodLibrary, foodTargets: c.foodTargets, fitnessEntries: c.fitnessEntries})));
    const before = await snapshot();
    for (const columns of [2, 3]) {
      await page.evaluate(columns => {state.board.columnCount = columns; renderCardsOnly({force: true});}, columns);
      await resize(page, 320); await resize(page, 1440);
    }
    await page.locator('#todayModeButton').click(); await page.locator('#boardModeButton').click();
    await page.evaluate(() => flushDeviceWrites()); await page.reload();
    assert.deepEqual(await snapshot(), before);
  });
  await run('Health card menus remain visible and clickable above the new container layouts', async page => {
    await seedHealth(page);
    for (const width of [320, 390, 1440]) {
      await resize(page, width);
      for (const type of ['food', 'fitness']) {
        const card = page.locator('.type-' + type);
        await card.locator('.card-menu-toggle').evaluate(e => e.scrollIntoView({block: 'center', behavior: 'instant'}));
        await card.locator('.card-menu-toggle').click();
        const menuButtons = page.locator('.card-options-menu:not([hidden]) button');
        assert.equal(await menuButtons.count(),4);
        const obscured = await menuButtons.evaluateAll(buttons => buttons.filter(button => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return !hit || !button.contains(hit);
        }).map(button => button.textContent.trim()));
        assert.deepEqual(obscured, [], JSON.stringify({width, type, obscured}));
        await page.evaluate(() => closeCardActionMenus());
      }
    }
  });
  fs.writeFileSync(out + '/usability-results.json', JSON.stringify(results, null, 2));
  await browser.close();
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => {console.error(error); process.exit(1);});
