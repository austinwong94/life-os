(function(){
  'use strict';
  const key=LifeStorageScope.key('life-os-cloud-recovery'),activeKey=LifeStorageScope.key('progress-board-v1');
  const status=document.getElementById('status'),details=document.getElementById('details'),repair=document.getElementById('repairButton');
  const receipt=document.getElementById('receiptButton'),checkpoint=LifeDeviceCheckpoint.create({name:LifeStorageScope.key('life-os-device-checkpoint-v1'),storage:localStorage,key:activeKey});
  let inspected=null;
  const vault=LifeRecoveryVault.create({name:LifeStorageScope.key('life-os-recovery-vault-v1'),key,locked:action=>{
    if(!navigator.locks?.request)throw new Error('Safe multi-tab coordination is unavailable. Nothing was removed.');
    return navigator.locks.request(LifeStorageScope.key('life-os-device-snapshot-v2'),action);
  }});
  function show(result){
    details.replaceChildren();const add=(label,value)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;details.append(dt,dd);};
    let bytes=0;for(const name of Object.keys(localStorage))bytes+=(name.length+(localStorage.getItem(name)?.length || 0))*2;
    add('Browser storage used (estimate)',(bytes/1048576).toFixed(2)+' MB');
    add('Recent recovery cache',((localStorage.getItem(key)?.length || 0)*2/1048576).toFixed(2)+' MB');
    const archive=vault.diagnostics();add('Verified archived copies',String(archive.archivedCopies));
    if(result){add('Space reclaimed',(Math.max(0,result.movedBytes)/1048576).toFixed(2)+' MB');add('Active records',result.activeChanged?'Changed by another open tab':'Unchanged');}
  }
  repair.onclick=async()=>{
    repair.disabled=true;status.textContent='Preserving complete recovery copies and verifying readback...';
    const before=localStorage.getItem(activeKey);
    try{const result=await vault.compact({releaseCache:true});show({...result,activeChanged:localStorage.getItem(activeKey)!==before});status.textContent=result.changed?'Another tab wrote a recovery copy during verification. Its copy was kept. Run the check again.':'Recovery archive verified. Active records were not replaced. Your original tab can retry device and cloud saving now.';}
    catch(error){status.textContent='Recovery could not complete. Original copies were kept. '+error.message;show();}
    finally{repair.disabled=false;}
  };
  document.getElementById('checkButton').onclick=async()=>{
    receipt.hidden=true;inspected=null;
    try{
      const raw=localStorage.getItem(activeKey),previous=await checkpoint.read(),current=JSON.parse(raw);
      const comparison=LifeDeviceCheckpoint.compareReceipts(current,previous);
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent='Checkpoint comparison';dd.textContent=comparison.missing+' missing save receipts; '+comparison.differences.length+' information differences; '+comparison.metadataDifferences.length+' view/countdown metadata differences';show();details.append(dt,dd);
      if(comparison.differences.length){const label=document.createElement('dt'),paths=document.createElement('dd');label.textContent='Differing field paths (no private values)';paths.textContent=comparison.differences.slice(0,16).join(', ');details.append(label,paths);}
      if(comparison.repairable){inspected={raw,previous};receipt.hidden=false;status.textContent='All information matches the verified checkpoint. Only save receipts and validated view/countdown metadata may differ. Repair preserves both complete originals and changes only missing receipts, keeping current views and countdowns. Diary, notes, tasks, settings and cloud records are not replaced.';}
      else status.textContent=comparison.missing?'The stored copy differs from the verified checkpoint. Automatic receipt repair is refused. Both versions and pending writing remain untouched; a record-by-record recovery is required.':'The stored copy covers the checkpoint. No receipt repair is needed. Pending writing remains untouched.';
    }catch(error){status.textContent='Could not compare complete copies. Nothing was changed. '+error.message;}
  };
  receipt.onclick=async()=>{
    if(!inspected)return;receipt.disabled=true;
    try{await navigator.locks.request(LifeStorageScope.key('life-os-device-snapshot-v2'),async()=>{
      await checkpoint.repair({expectedRaw:inspected.raw,expectedPrevious:inspected.previous});
      receipt.hidden=true;inspected=null;status.textContent='Missing save receipts repaired. All information values are unchanged and both original copies are preserved. Keep your original tab open and retry device saving. This is not a cloud-save receipt.';show();
    });}catch(error){status.textContent='Receipt repair did not complete. Original copies and pending writing were kept. '+error.message;}
    finally{receipt.disabled=false;}
  };
  document.getElementById('backupButton').onclick=async()=>{
    let archiveError='';try{await vault.refresh();}catch(error){archiveError=error.message;}
    const keys=['progress-board-v1','life-os-cloud-recovery','life-os-diary-entry-backups','life-os-before-storage-v3','life-os-cloud-base-v2'].map(name=>LifeStorageScope.key(name));
    const pending=[LifeStorageScope.key('life-os-pending-v2:'),LifeStorageScope.key('life-os-pending-v3:')];
    for(const name of Object.keys(localStorage))if(pending.some(prefix=>name.startsWith(prefix)))keys.push(name);
    const rawCopies=Object.fromEntries(keys.map(name=>[name,localStorage.getItem(name)]));
    let archivedCopies=[];try{archivedCopies=vault.all(JSON.parse(localStorage.getItem(key) || '[]'));}catch(error){archiveError=error.message;}
    const data={format:'life-os-device-recovery-v1',exportedAt:new Date().toISOString(),includesAuthSession:false,archiveError,rawCopies,archivedCopies};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='life-os-device-recovery-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='Device recovery backup download requested. Unstaged writing in another open tab is not included. Keep that tab open.';
  };
  try{show();}catch(error){repair.disabled=true;status.textContent='Browser storage cannot be read. Nothing was changed. '+error.message;}
})();
