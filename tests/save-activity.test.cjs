const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('function saveState(options'),end=source.indexOf('\nfunction persistLocalDraftState(',start);
function fixture(overrides={}){
 const calls={stage:0,cloud:0,touch:0,status:[]},c={state:{updatedAt:1},applyingExternalStorageUpdate:false,corruptLocalStateDetected:false,lastLocalSaveOk:true,lastDeviceSaveError:null,localMergeBase:{},localStateSource:'stored',deviceSavedAt:0,cloudSaveEnabled:true,cloudConflictPending:false,cloudPushInFlight:false,cloudSaveTimer:null,cloudStartupCheck:{pending:false},cloudSyncRetry:{status:()=>({scheduled:false})},navigator:{onLine:true},LifeStateMerge:{equal:()=>false},LifeDeviceStore:{stage:()=>calls.stage++},touchState:()=>calls.touch++,syncActiveBoard:()=>{},getStateForStorage:()=>({preserved:'All original information'}),flushDeviceWrites:()=>Promise.resolve(true),isRestoreSyncPaused:()=>false,cloudReviewStatusLabel:()=> 'Changes need review',deviceSaveFailureReason:()=> 'Device saving needs attention',setSaveStatus:(...args)=>calls.status.push(args),queueCloudSave:()=>{calls.cloud++;c.cloudSaveTimer=123;},...overrides};
 c.cloudCheckGeneration=0;vm.createContext(c);vm.runInContext(source.slice(start,end),c);return {c,calls};
}
test('a local-only navigation save never claims a cloud upload is running',()=>{
 const {c,calls}=fixture();assert.equal(c.saveState({touch:false,skipCloud:true}),true);assert.deepEqual(calls.status.at(-1),['Saved on device','local']);assert.equal(calls.cloud,0);assert.equal(calls.touch,0);assert.equal(calls.stage,1);
});
test('local-only saves retain truthful pending activity when a cloud save really exists',()=>{
 for(const [flags,label]of [[{cloudPushInFlight:true},'Saved on device, syncing'],[{cloudSaveTimer:123},'Saved on device - cloud save queued'],[{cloudSyncRetry:{status:()=>({scheduled:true})}},'Saved on device - retrying cloud']]){
  const {c,calls}=fixture(flags);c.saveState({touch:false,skipCloud:true});assert.equal(calls.status.at(-1)[0],label);assert.equal(calls.cloud,0);
 }
});
test('an ordinary edit queues its existing cloud path while skipCloud never invents activity',()=>{
 const {c,calls}=fixture();c.saveState({quiet:true});assert.equal(calls.cloud,1);assert.equal(calls.touch,1);assert.equal(calls.status.at(-1)[0],'Saved on device - cloud save queued');
 const skipped=fixture();skipped.c.saveState({skipCloud:true});assert.equal(skipped.calls.cloud,0);assert.equal(skipped.calls.status.at(-1)[0],'Saved on device');
});
test('device failure conflict restore pause and offline status take precedence over cloud activity',()=>{
 for(const [flags,label]of [[{LifeDeviceStore:{stage:()=>{throw Error('Synthetic failure');}}},/Not saved on device/],[{cloudConflictPending:true},/Changes need review/],[{isRestoreSyncPaused:()=>true},/cloud paused/],[{navigator:{onLine:false}},/Offline/]]){
  const {c,calls}=fixture({...flags,cloudPushInFlight:true});c.saveState({touch:false,skipCloud:true});assert.match(calls.status.at(-1)[0],label);
 }
});
test('queued timer bookkeeping distinguishes cancelled work from a running save',()=>{
 const timers=new Map(),seen=[],c={cloudSaveEnabled:true,cloudSession:{access_token:'synthetic'},corruptLocalStateDetected:false,cloudConflictPending:false,cloudCheckGeneration:0,cloudSaveTimer:null,lastLocalSaveOk:true,CLOUD_SAVE_DEBOUNCE_MS:1400,navigator:{onLine:true},isRestoreSyncPaused:()=>false,cloudSyncRetry:{status:()=>({scheduled:false})},setSaveStatus:()=>{},window:{clearTimeout:id=>timers.delete(id),setTimeout:fn=>{const id=timers.size+1;timers.set(id,fn);return id;}}};
 c.pushCloudState=()=>seen.push(c.cloudSaveTimer);vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function clearQueuedCloudSave('),source.indexOf('\nfunction canRetryCloudSave(')),c);
 c.queueCloudSave({silent:true});assert.equal(timers.size,1);c.clearQueuedCloudSave();assert.equal(c.cloudSaveTimer,null);assert.equal(timers.size,0);assert.deepEqual(seen,[]);
 c.queueCloudSave({silent:true});const callback=timers.get(c.cloudSaveTimer);callback();assert.deepEqual(seen,[null]);assert.equal(c.cloudSaveTimer,null);
});
test('a retry for a different account cannot cancel the current account queued save',async()=>{
 const c={PREVIEW_MODE:false,cloudSaveEnabled:true,isRestoreSyncPaused:()=>false,corruptLocalStateDetected:false,cloudSession:{user:{id:'current-owner'}},clearQueuedCloudSave(){throw Error('Must not cancel this owner save');},cloudCheckGeneration:7};vm.createContext(c);const from=source.indexOf('async function pushCloudState('),to=source.indexOf('\nasync function pullCloudState(',from);assert(from>=0 && to>from);vm.runInContext(source.slice(from,to),c);await c.pushCloudState({retryOwnerId:'previous-owner'});assert.equal(c.cloudCheckGeneration,7);
});
