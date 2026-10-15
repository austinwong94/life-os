(function(root){
  'use strict';
  const format='life-os-recovery-vault-v1';
  function combine(archived,current){
    if(!Array.isArray(current))throw new Error('Existing recovery copies need review. Nothing was removed.');
    const rows=new Map();
    for(const item of [...archived,...current]){
      if(!item || typeof item.id!=='string' || !item.id)throw new Error('A recovery copy has no safe identity. Nothing was removed.');
      const raw=JSON.stringify(item),previous=rows.get(item.id);
      if(previous && JSON.stringify(previous)!==raw)throw new Error('Two recovery versions share an identity. Both original copies were kept.');
      rows.set(item.id,item);
    }
    return [...rows.values()].sort((a,b)=>String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  }
  function create({database=indexedDB,name,storage=localStorage,key,locked,subtle=crypto.subtle}){
    let db,ready=false,copies=[],known=new Set(),running=null,lastError='',movedBytes=0;
    const digest=async raw=>[...new Uint8Array(await subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error || new Error('Recovery database request failed.'));});
    const completed=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error || new Error('Recovery database write was not completed.'));});
    async function open(){
      if(db)return db;
      db=await new Promise((resolve,reject)=>{
        const req=database.open(name,1),timer=setTimeout(()=>reject(new Error('Recovery database is unavailable. Original copies were kept.')),10000);
        req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('copies'))req.result.createObjectStore('copies',{keyPath:'id'});};
        req.onsuccess=()=>{clearTimeout(timer);resolve(req.result);};req.onerror=()=>{clearTimeout(timer);reject(req.error);};req.onblocked=()=>{clearTimeout(timer);reject(new Error('Close an older recovery reader before upgrading. Original copies were kept.'));};
      });
      db.onversionchange=()=>{db.close();db=null;ready=false;};return db;
    }
    async function load(){
      const database=await open(),rows=await request(database.transaction('copies','readonly').objectStore('copies').getAll()),next=[],verified=new Set();
      for(const row of rows){
        if(row.format!==format || row.source!==key || typeof row.raw!=='string' || row.id!==await digest(row.raw))throw new Error('A stored recovery copy failed verification. Original copies were kept.');
        next.push(JSON.parse(row.raw));verified.add(row.raw);
      }
      copies=combine(copies,next);for(const raw of verified)known.add(raw);ready=true;
    }
    async function compact(){
      if(running)return running;
      running=locked(async()=>{
        // Other tabs can have archived copies since our last read.
        await load();
        const original=storage.getItem(key);if(!original)return {movedBytes:0};
        const current=JSON.parse(original);combine(copies,current);
        const records=[];for(const item of current){const raw=JSON.stringify(item);records.push({id:await digest(raw),format,source:key,raw});}
        if(records.some(row=>!known.has(row.raw))){
          const tx=(await open()).transaction('copies','readwrite'),done=completed(tx);for(const row of records)tx.objectStore('copies').put(row);await done;
        }
        // Read back every complete value before reducing the localStorage cache.
        const read=(await open()).transaction('copies','readonly');
        const verified=await Promise.all(records.map(row=>request(read.objectStore('copies').get(row.id))));
        for(let i=0;i<records.length;i++)if(verified[i]?.raw!==records[i].raw || verified[i]?.format!==format)throw new Error('Recovery readback did not match. Original copies were kept.');
        copies=combine(copies,current);for(const row of records)known.add(row.raw);
        if(storage.getItem(key)!==original)return {movedBytes:0,changed:true};
        const retained=current.length?[...current].sort((a,b)=>String(b.savedAt || '').localeCompare(String(a.savedAt || ''))).slice(0,1):[],raw=JSON.stringify(retained);
        if(raw.length<original.length){
          storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw new Error('Recovery cache could not be verified. Complete copies remain in the recovery database.');
          movedBytes+=(original.length-raw.length)*2;
        }
        lastError='';return {movedBytes:(original.length-raw.length)*2,count:copies.length};
      }).catch(error=>{lastError=error.message || 'Recovery storage needs attention.';throw error;}).finally(()=>{running=null;});return running;
    }
    return {initialize:compact,compact,refresh:load,all:current=>ready?combine(copies,current):current,canReplace:current=>ready && Array.isArray(current) && current.every(item=>known.has(JSON.stringify(item))),diagnostics:()=>({ready,archivedCopies:copies.length,movedBytes,error:lastError})};
  }
  const api={create,combine};if(typeof module==='object' && module.exports)module.exports=api;else root.LifeRecoveryVault=api;
})(globalThis);

let recoveryVault=null,recoveryVaultTimer=null;
async function initializeRecoveryVault(){
  if(!globalThis.indexedDB || recoveryVault)return;
  recoveryVault=LifeRecoveryVault.create({name:LifeStorageScope.key('life-os-recovery-vault-v1'),key:CLOUD_RECOVERY_KEY,locked:action=>LifeDeviceStore.locked(action)});
  try{
    const result=await recoveryVault.initialize();
    await retryAfterRecoveryCompaction(result);
  }catch(error){setSaveStatus('Recovery copies kept - storage needs attention','error');renderCloudStatus(error.message);}
  window.addEventListener('storage',event=>{if(event.key===CLOUD_RECOVERY_KEY)scheduleRecoveryVault();});
}
function scheduleRecoveryVault(){
  if(!recoveryVault)return;clearTimeout(recoveryVaultTimer);
  recoveryVaultTimer=setTimeout(()=>recoveryVault.compact().then(retryAfterRecoveryCompaction).catch(error=>renderCloudStatus(error.message)),100);
}
async function retryAfterRecoveryCompaction(result){
  if(result.movedBytes>0 && !lastLocalSaveOk){
    saveState({quiet:true,touch:false,skipCloud:true});
    if(await flushDeviceWrites())queueCloudSave({immediate:true,silent:true});
  }
}
