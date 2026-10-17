const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const review=fs.readFileSync('restore-review.js','utf8'),experience=fs.readFileSync('experience.js','utf8');
const reader=review.slice(review.indexOf('async function readBackupFile('),review.indexOf('\nfunction summarizeRestoreBoard('));
const validator=experience.slice(experience.indexOf('function isValidBackup('),experience.indexOf('\nfunction restorePlannerTask('));
assert.ok(reader&&validator);
const context={Blob,TYPE_META:{diary:{},quote:{},planner:{}}};vm.createContext(context);vm.runInContext(validator+'\n'+reader,context);
const workspace=()=>({boards:[{id:'personal',name:'Original board',cards:[{id:'diary',type:'diary',diaryEntries:{'2026-10-17':{thoughts:'Every line.\nSecond line.'}},unknownField:{keep:true}}],archivedCards:[]}],customRoot:'Retain this'});
const file=value=>new File([JSON.stringify(value)],'backup.json',{type:'application/json'});

test('legacy and small wrapped workspaces retain every original field without normalization',async()=>{
 for(const value of [workspace(),{state:workspace()}, {app:'Life OS',format:'life-os-full-backup-v2',state:workspace(),localRecovery:{futureField:'retain'}}]){
  const before=JSON.stringify(value),result=await context.readBackupFile(file(value));assert.equal(JSON.stringify(result),before);assert.equal(JSON.stringify(value),before);
 }
});
test('large supported recovery envelopes are accepted without removing or merging recovery copies',async()=>{
 const value={app:'Life OS',format:'life-os-full-backup-v2',state:workspace(),localRecovery:{originalRecoveryCache:JSON.stringify([{state:{notes:'Original history'.repeat(1800000)}}]),futureField:{retain:true}}};
 const input=file(value);assert.ok(input.size>25000000);const result=await context.readBackupFile(input);
 assert.equal(JSON.stringify(result),JSON.stringify(value));assert.equal(JSON.stringify(result.state),JSON.stringify(workspace()));
});
test('oversized and invalid file metadata is refused before reading any file content',async()=>{
 for(const size of [0,-1,NaN,Infinity,1.2,128*1024*1024+1]){let reads=0;await assert.rejects(context.readBackupFile({size,text:async()=>{reads++;return '{}';}}),/Nothing was replaced/);assert.equal(reads,0);}
});
test('large unknown envelopes and oversized main workspaces fail closed without trimming anything',async()=>{
 const padding='x'.repeat(25000001);
 await assert.rejects(context.readBackupFile(file({state:workspace(),localRecovery:{padding}})),/Only a Life OS full-backup-v2/);
 const state=workspace();state.unknownSavedWriting=padding;
 await assert.rejects(context.readBackupFile(file({app:'Life OS',format:'life-os-full-backup-v2',state})),/main workspace exceeds/);assert.equal(state.unknownSavedWriting,padding);
});
test('malformed JSON, duplicate identities, unsupported cards and read failures never become empty restores',async()=>{
 await assert.rejects(context.readBackupFile(new File(['{bad'],'bad.json')),/could not be read as JSON/);
 await assert.rejects(context.readBackupFile({size:20,text:async()=>{throw Error('private path or contents');}}),error=>/could not be read as JSON/.test(error.message)&&!error.message.includes('private path'));
 for(const change of [s=>s.boards.push(s.boards[0]),s=>s.boards[0].cards.push(s.boards[0].cards[0]),s=>{s.boards[0].cards[0].type='unsupported';}]){const state=workspace();change(state);const before=JSON.stringify(state);await assert.rejects(context.readBackupFile(file(state)),/invalid or duplicate records/);assert.equal(JSON.stringify(state),before);}
});
test('a rejected file never flushes pending writing, normalizes a record or opens replacement review',async()=>{
 const app=fs.readFileSync('app.js','utf8'),source=app.slice(app.indexOf('async function importBoardBackup('),app.indexOf('\nfunction saveState(options'));
 let flushes=0,normalizations=0,reviews=0;const alerts=[];
 const fixture={File,Blob,TYPE_META:context.TYPE_META,hasUnfinishedRestoreEditor:()=>false,corruptLocalStateDetected:false,
  flushDeviceWrites:async()=>{flushes++;return true;},rehydrateState:()=>{normalizations++;},reviewBackupRestore:()=>{reviews++;},
  window:{alert:message=>alerts.push(message)},elements:{importDataFile:{value:'selected'}},state:Object.freeze({diary:'Every original character.'})};
 vm.createContext(fixture);vm.runInContext(validator+'\n'+reader+'\n'+source,fixture);
 const before=JSON.stringify(fixture.state);
 assert.equal(await fixture.importBoardBackup(new File(['{broken'],'bad.json')),false);
 assert.equal(flushes,0);assert.equal(normalizations,0);assert.equal(reviews,0);assert.equal(JSON.stringify(fixture.state),before);assert.match(alerts[0],/could not be read as JSON/);assert.equal(fixture.elements.importDataFile.value,'');
});
