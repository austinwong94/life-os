const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {create}=require('../storage-scope.js');
test('normal records, credentials, recovery, drafts and locks keep their exact existing keys',()=>{
  const scope=create('?liveReload=0');assert.equal(scope.preview,false);
  for(const key of ['progress-board-v1','life-os-before-storage-v3','life-os-cloud-session','life-os-cloud-base-v2','life-os-cloud-recovery','life-os-diary-entry-backups','life-os-restore-guard-v1','life-os-active-board','life-os-planning:board','life-os-coaching:board','life-os-daily:board','life-os-conflict-draft:id','life-os-device-snapshot-v2'])assert.equal(scope.key(key),key);
});
test('preview keys are stable, separate and keep the existing presence-based URL flag behavior',()=>{
  for(const search of ['?preview=1','?preview','?preview=0','?liveReload=0&preview=1']){
    const scope=create(search);assert.equal(scope.preview,true);assert.equal(scope.key('progress-board-v1'),'life-os-preview-v1:progress-board-v1');
    assert.ok(!scope.key('life-os-pending-v2:').startsWith(create('').key('life-os-pending-v2:')));
  }
});
test('selected scope is immutable and does not change when URL navigation is simulated',()=>{
  const location={search:'?preview=1'},context={location,URLSearchParams};vm.runInNewContext(fs.readFileSync(require.resolve('../storage-scope.js'),'utf8'),context);
  location.search='';assert.equal(context.LifeStorageScope.preview,true);assert.equal(Object.isFrozen(context.LifeStorageScope),true);
  assert.equal(context.LifeStorageScope.key('example'),'life-os-preview-v1:example');
});
