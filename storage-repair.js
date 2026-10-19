(function(){
  'use strict';
  const key=LifeStorageScope.key('life-os-cloud-recovery'),activeKey=LifeStorageScope.key('progress-board-v1');
  const status=document.getElementById('status'),details=document.getElementById('details'),repair=document.getElementById('repairButton');
  const receipt=document.getElementById('receiptButton'),checkpoint=LifeDeviceCheckpoint.create({name:LifeStorageScope.key('life-os-device-checkpoint-v1')});
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
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent='Checkpoint comparison';dd.textContent=comparison.missing+' missing save receipts; '+comparison.differences.length+' differing fields';show();details.append(dt,dd);
      if(comparison.differences.length){const label=document.createElement('dt'),paths=document.createElement('dd');label.textContent='Differing field paths (no private values)';paths.textContent=comparison.differences.slice(0,16).join(', ');details.append(label,paths);}
      if(comparison.repairable){inspected={raw,previous};receipt.hidden=false;status.textContent='Every stored value matches the verified checkpoint except save receipts. Repair can preserve both complete copies, then restore only the missing receipts. It will not replace diary, notes, tasks, settings or cloud records.';}
      else status.textContent=comparison.missing?'The stored copy differs from the verified checkpoint. Automatic receipt repair is refused. Both versions and pending writing remain untouched; a record-by-record recovery is required.':'The stored copy covers the checkpoint. No receipt repair is needed. Pending writing remains untouched.';
    }catch(error){status.textContent='Could not compare complete copies. Nothing was changed. '+error.message;}
  };
  receipt.onclick=async()=>{
    if(!inspected)return;receipt.disabled=true;
    try{await navigator.locks.request(LifeStorageScope.key('life-os-device-snapshot-v2'),async()=>{
      const raw=localStorage.getItem(activeKey),previous=await checkpoint.read();
      if(raw!==inspected.raw || JSON.stringify(previous)!==JSON.stringify(inspected.previous))throw new Error('A copy changed since inspection. Check again.');
      const current=JSON.parse(raw);if(!LifeDeviceCheckpoint.compareReceipts(current,previous).repairable)throw new Error('The copies do not match.');
      // Preserve complete originals outside the constrained localStorage cache.
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(LifeStorageScope.key('life-os-device-checkpoint-v1'),1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const record={format:'life-os-receipt-repair-originals-v1',raw,checkpoint:previous},key='receipt-repair:'+crypto.randomUUID();
      try{
        await new Promise((resolve,reject)=>{const tx=db.transaction('checkpoints','readwrite',{durability:'strict'});tx.objectStore('checkpoints').add(record,key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});
        const retained=await new Promise((resolve,reject)=>{const tx=db.transaction('checkpoints'),r=tx.objectStore('checkpoints').get(key);let value;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error);});
        if(JSON.stringify(retained)!==JSON.stringify(record))throw new Error('Original copy readback did not match.');
      }finally{db.close();}
      if(localStorage.getItem(activeKey)!==raw)throw new Error('Stored records changed during preservation. Check again.');
      const deviceWriteHeads={...current.deviceWriteHeads};for(const [writer,n] of Object.entries(previous.deviceWriteHeads || {}))deviceWriteHeads[writer]=Math.max(Number(deviceWriteHeads[writer]) || 0,n);
      const next={...current,deviceWriteHeads},nextRaw=JSON.stringify(next);localStorage.setItem(activeKey,nextRaw);
      if(localStorage.getItem(activeKey)!==nextRaw)throw new Error('Receipt write could not be verified. Both complete originals remain preserved.');
      await checkpoint.confirm(()=>JSON.parse(localStorage.getItem(activeKey)));
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
