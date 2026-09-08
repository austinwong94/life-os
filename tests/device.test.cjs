const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const merge = require('../state-merge.js');

function device() {
  const storage = {};
  Object.defineProperties(storage, {
    getItem: {value: key => storage[key] ?? null},
    setItem: {value: (key, value) => {storage[key] = String(value);}},
    removeItem: {value: key => {delete storage[key];}}
  });
  const context = {localStorage: storage, LifeStateMerge: merge,
    crypto: {randomUUID: () => 'test-tab'},
    navigator: {locks: {request: (_name, action) => Promise.resolve().then(action)}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../device-store.js'), 'utf8'), context);
  return context.LifeDeviceStore;
}

test('successive edits retain their own baselines until committed', () => {
  const d = device();
  d.stage({revision: 1}, {revision: 2});
  d.stage({revision: 3}, {revision: 4});
  assert.equal(d.pending().length, 2);
  assert.equal(d.pending()[0].entry.base.revision, 1);
  assert.equal(d.pending()[1].entry.base.revision, 3);
  assert.equal(d.pending()[1].entry.state.revision, 4);
});

test('flush drains an edit staged while a previous snapshot is committing', async () => {
  const d = device();
  const committed = [];
  d.stage({revision: 0}, {revision: 1});
  d.configure(entries => {
    committed.push(entries[0].entry.state.revision);
    if (committed.length === 1) d.stage({revision: 1}, {revision: 2});
    return true;
  });
  assert.equal(await d.flush(), true);
  assert.deepEqual(committed, [1, 2]);
  assert.equal(d.pending().length, 0);
});

test('a failed shared commit keeps the complete pending copy', async () => {
  const d = device();
  d.stage({}, {text: 'Every character remains here.'});
  d.configure(() => false);
  assert.equal(await d.flush(), false);
  assert.equal(d.pending()[0].entry.state.text, 'Every character remains here.');
});

test('recovery skips acknowledged writes left behind after an interrupted cleanup', () => {
  const d = device();
  const original = {boards: [{id: 'board', name: 'Original'}]};
  const first = {boards: [{id: 'board', name: 'First edit'}]};
  const second = {boards: [{id: 'board', name: 'Second edit'}]};
  d.stage(original, first);
  d.stage(first, second);
  const committed = d.replay(original);
  assert.equal(committed.state.boards[0].name, 'Second edit');
  const recovered = d.replay(committed.state);
  assert.equal(recovered.conflicts.length, 0);
  assert.equal(recovered.state.boards[0].name, 'Second edit');
});
