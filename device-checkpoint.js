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
  function create({database=root.indexedDB,name}){
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
    return {check,confirm,read,snapshot:()=>verified?copy(verified):null};
  }
  const api={create,covers,heads};
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeDeviceCheckpoint=api;
})(globalThis);
