const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const merge = require('../state-merge.js');

function storageStore() {
  const storage = {};
  Object.defineProperties(storage, {
    getItem: {value: key => storage[key] ?? null},
    setItem: {value: (key, value) => {storage[key] = String(value);}},
    removeItem: {value: key => {delete storage[key];}}
  });
  return storage;
}
function device({storage=storageStore(),search='',locks=[]}={}) {
  const context = {localStorage: storage, LifeStateMerge: merge, LifeStorageScope:require('../storage-scope.js').create(search),
    crypto: {randomUUID: () => 'test-tab'},
    navigator: {locks: {request: (name, action) => {locks.push(name);return Promise.resolve().then(action);}}}};
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

test('normal and preview queues cannot replay or consume each other on the same origin',async()=>{
  const storage=storageStore(),normal=device({storage}),preview=device({storage,search:'?preview=1'});
  const base={boards:[{id:'board',name:'Initial'}]},state=name=>({boards:[{id:'board',name}]});
  normal.stage(base,state('Saved work'));preview.stage(base,state('Preview work'));
  assert.equal(normal.prefix,'life-os-pending-v2:');assert.notEqual(normal.prefix,preview.prefix);
  assert.equal(normal.pending().length,1);assert.equal(preview.pending().length,1);
  assert.equal(normal.replay(base).state.boards[0].name,'Saved work');assert.equal(preview.replay(base).state.boards[0].name,'Preview work');
  const original=storage.getItem(normal.pending()[0].key);preview.configure(()=>true);await preview.flush();
  assert.equal(preview.pending().length,0);assert.equal(storage.getItem(normal.pending()[0].key),original);
});
test('malformed pending data only blocks its own scope and is never removed by the other scope',()=>{
  const storage=storageStore(),normal=device({storage}),preview=device({storage,search:'?preview=1'});
  storage.setItem(normal.prefix+'old-tab:1','{broken');assert.throws(()=>normal.pending());assert.equal(preview.pending().length,0);
  assert.equal(preview.replay({boards:[]}).state.boards.length,0);assert.equal(storage.getItem(normal.prefix+'old-tab:1'),'{broken');
  storage.setItem(preview.prefix+'preview-tab:1','{also-broken');assert.throws(()=>preview.pending());
});
test('normal lock names stay compatible while preview device and cloud locks are separate',async()=>{
  const normalNames=[],previewNames=[],normal=device({locks:normalNames}),preview=device({search:'?preview',locks:previewNames});
  await normal.locked(()=>true);await normal.cloudLocked(()=>true);await preview.locked(()=>true);await preview.cloudLocked(()=>true);
  assert.deepEqual(normalNames,['life-os-device-snapshot-v2','life-os-cloud-and-restore-v1']);
  assert.ok(previewNames.every(name=>!normalNames.includes(name)));assert.equal(new Set(previewNames).size,2);
});
