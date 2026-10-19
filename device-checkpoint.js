(function(root){
  'use strict';
  const format='life-os-device-checkpoint-v1';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function heads(snapshot){
    const value=snapshot?.deviceWriteHeads ?? {};
    if(!value || typeof value!=='object' || Array.isArray(value) || Object.values(value).some(n=>!Number.isSafeInteger(n) || n<0))throw new Error('Device save receipts need review. Original copies were kept.');
    return value;
  }
  function covers(snapshot,required){
    const current=heads(snapshot),previous=heads(required);
    return Object.entries(previous).every(([writer,n])=>n===0 || (Object.hasOwn(current,writer) && current[writer]>=n));
  }
  function pending(){
    const error=new Error('Waiting for this tab to see the verified device save. Pending writing and the verified checkpoint are kept.');
    error.name='DeviceCommitPendingError';return error;
  }
  function compareReceipts(current,previous){
    if(!current || !previous || !Array.isArray(current.boards) || !Array.isArray(previous.boards))throw new Error('Both complete device copies are required. Nothing was replaced.');
    heads(current);heads(previous);
    const differences=[],metadataDifferences=[];
    const modes=new Set(['board','today','tasks','calendar','priorities','money','records','properties']);
    const nonnegative=n=>typeof n==='number' && Number.isFinite(n) && n>=0;
    function metadata(path){
      if(path==='updatedAt')return nonnegative(current.updatedAt) && nonnegative(previous.updatedAt);
      if(path==='ui.workspaceMode')return modes.has(current.ui?.workspaceMode) && modes.has(previous.ui?.workspaceMode);
      const match=path.match(/^(?:boards\.(\d+)\.)?(cards|archivedCards)\.(\d+)\.(duration|remaining)$/);
      if(!match)return false;
      const card=s=>{const parent=match[1]===undefined?s:s.boards?.[Number(match[1])];return parent?.[match[2]]?.[Number(match[3])];};
      const a=card(current),b=card(previous);
      return a?.timerMode==='daily' && b?.timerMode==='daily' && typeof a.id==='string' && a.id===b.id && a.type===b.type &&
        typeof a.targetAt==='string' && a.targetAt===b.targetAt && Number.isFinite(Date.parse(a.targetAt)) && nonnegative(a[match[4]]) && nonnegative(b[match[4]]);
    }
    const difference=path=>(metadata(path)?metadataDifferences:differences).push(path || 'workspace');
    function compare(a,b,path){
      if(a===b)return;
      if(!a || !b || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b)){difference(path);return;}
      const keys=new Set([...Object.keys(a),...Object.keys(b)]);
      for(const key of keys){if(!path && key==='deviceWriteHeads')continue;const next=path?path+'.'+key:key;
        if(!Object.hasOwn(a,key) || !Object.hasOwn(b,key))differences.push(next);else compare(a[key],b[key],next);
      }
    }
    compare(current,previous,'');
    const missing=Object.entries(heads(previous)).filter(([key,n])=>Number(heads(current)[key] || 0)<n).length;
    return {missing,differences,metadataDifferences,repairable:missing>0 && differences.length===0};
  }
  function create({database=root.indexedDB,name,storage,key}){
    let connection=null,opening=null,verified=null;
    const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error || new Error('Device checkpoint request failed.'));});
    const completed=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error || new Error('Device checkpoint was not committed. Pending copies were kept.'));});
    async function bounded(work,tx){
      let timer;
      try{return await Promise.race([work,new Promise((resolve,reject)=>{
        timer=setTimeout(()=>{
          const error=new Error('Device checkpoint storage timed out. Pending writing was kept.');error.name='DeviceCheckpointTimeoutError';
          reject(error);try{tx.abort();}catch{}
        },10000);
      })]);}
      finally{clearTimeout(timer);}
    }
    function decode(row){
      if(row===undefined)return null;
      if(row?.format!==format || typeof row.raw!=='string')throw new Error('The verified device checkpoint needs recovery. It has not been replaced.');
      const snapshot=JSON.parse(row.raw);
      if(!snapshot || !Array.isArray(snapshot.boards))throw new Error('The verified device checkpoint is invalid. It has not been replaced.');
      heads(snapshot);return snapshot;
    }
    async function open(){
      if(connection)return connection;
      if(!opening)opening=new Promise((resolve,reject)=>{
        if(!database){reject(new Error('IndexedDB is unavailable. Your pending writing is kept; use a browser that permits device storage.'));return;}
        const req=database.open(name,1);let settled=false;
        const finish=(error,value)=>{
          if(settled){if(value)value.close();return;}
          settled=true;clearTimeout(timer);error?reject(error):resolve(value);
        };
        const timer=setTimeout(()=>finish(new Error('Device checkpoint storage timed out. Pending writing was kept.')),10000);
        req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('checkpoints'))req.result.createObjectStore('checkpoints');};
        req.onerror=()=>finish(req.error || new Error('Device checkpoint storage is unavailable.'));
        req.onblocked=()=>finish(new Error('Device checkpoint storage is blocked. Keep your writing open and retry.'));
        req.onsuccess=()=>finish(null,req.result);
      }).then(db=>{
        connection=db;db.onversionchange=()=>{db.close();connection=null;};return db;
      }).finally(()=>{opening=null;});
      return opening;
    }
    async function read(){
      const db=await open(),tx=db.transaction('checkpoints','readonly'),done=completed(tx);
      const [row]=await bounded(Promise.all([request(tx.objectStore('checkpoints').get('current')),done]),tx);
      verified=decode(row);return verified?copy(verified):null;
    }
    async function check(readSnapshot,{recover=false}={}){
      const previous=await read(),current=readSnapshot();
      // Recovery is only used by the existing explicit, reviewed corrupt-data restore.
      if(previous && !(recover && !current) && (!current || !covers(current,previous)))throw pending();
      return previous;
    }
    async function repair({expectedRaw,expectedPrevious}={}){
      if(!storage || !key)throw new Error('Receipt recovery storage was not configured.');
      const raw=storage.getItem(key),previous=await read();
      if(expectedRaw!==undefined && raw!==expectedRaw || expectedPrevious!==undefined && JSON.stringify(previous)!==JSON.stringify(expectedPrevious))throw new Error('A copy changed since inspection. Check again.');
      const current=JSON.parse(raw);if(!compareReceipts(current,previous).repairable)throw pending();
      const db=await open(),original={format:'life-os-receipt-repair-originals-v1',raw,checkpoint:previous},archiveKey='receipt-repair:'+root.crypto.randomUUID();
      const tx=db.transaction('checkpoints','readwrite',{durability:'strict'}),done=completed(tx);
      try{tx.objectStore('checkpoints').add(original,archiveKey);}catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
      await bounded(done,tx);
      const verify=db.transaction('checkpoints'),verifiedDone=completed(verify);
      const [retained]=await bounded(Promise.all([request(verify.objectStore('checkpoints').get(archiveKey)),verifiedDone]),verify);
      if(JSON.stringify(retained)!==JSON.stringify(original))throw new Error('Original copy readback did not match. Nothing was replaced.');
      const latest=await read();
      if(JSON.stringify(latest)!==JSON.stringify(previous) || storage.getItem(key)!==raw)throw new Error('A copy changed during preservation. Check again.');
      const receipts=new Map(Object.entries(heads(current)));
      for(const [writer,n] of Object.entries(heads(previous)))receipts.set(writer,Math.max(Number(receipts.get(writer)) || 0,n));
      const deviceWriteHeads=Object.fromEntries(receipts);
      const nextRaw=JSON.stringify({...current,deviceWriteHeads});storage.setItem(key,nextRaw);
      if(storage.getItem(key)!==nextRaw)throw new Error('Receipt write could not be verified. Both originals are preserved.');
      await confirm(()=>JSON.parse(storage.getItem(key)));
    }
    async function confirm(readSnapshot){
      const snapshot=readSnapshot();
      if(!snapshot)return;
      if(!Array.isArray(snapshot.boards))throw new Error('The device snapshot could not be verified. Pending copies were kept.');
      heads(snapshot);
      const raw=JSON.stringify(snapshot),db=await open(),tx=db.transaction('checkpoints','readwrite',{durability:'strict'}),done=completed(tx);
      const store=tx.objectStore('checkpoints'),req=store.get('current');let failure;
      req.onsuccess=()=>{
        try{
          const previous=decode(req.result);
          if(previous && !covers(snapshot,previous))throw pending();
          if(req.result?.raw!==raw)store.put({format,raw},'current');
        }catch(error){failure=error;try{tx.abort();}catch{}}
      };
      try{await bounded(done,tx);}catch(error){throw failure || error;}
      const check=await read();
      if(JSON.stringify(check)!==raw)throw new Error('Device checkpoint readback did not match. Pending copies were kept.');
    }
    return {check,confirm,read,repair,snapshot:()=>verified?copy(verified):null};
  }
  const api={create,covers,heads,compareReceipts};
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeDeviceCheckpoint=api;
})(globalThis);
