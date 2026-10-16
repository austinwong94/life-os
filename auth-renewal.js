(function(root){
  'use strict';
  const format='life-os-auth-renewal-v1';
  function hasIdentity(value){
    return Boolean(value && !Array.isArray(value) && typeof value.access_token==='string' && value.access_token && typeof value.user?.id==='string' && value.user.id && (value.refresh_token==null || typeof value.refresh_token==='string'));
  }
  async function digest(token){
    if(typeof token!=='string' || !token)throw new Error('A renewal token is required.');
    const bytes=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  function validate(row){
    if(row===undefined)return;
    if(!row || Array.isArray(row) || row.format!==format || !['pending','applied'].includes(row.status) || typeof row.attempt!=='string' || !row.attempt || row.attempt.length>100 || Object.keys(row).some(key=>!['format','status','attempt'].includes(key))){
      const error=new Error('Sign-in renewal receipts need review. Existing credentials and records were kept.');error.name='AuthRenewalReceiptError';throw error;
    }
  }
  function create({database=root.indexedDB,name}){
    let connection=null,opening=null;
    function failure(){const error=new Error('Sign-in renewal coordination is unavailable. Existing credentials and records were kept; retry when device storage is available.');error.name='AuthRenewalStorageError';return error;}
    async function open(){
      if(connection)return connection;
      if(!opening)opening=new Promise((resolve,reject)=>{
        if(!database){reject(failure());return;}
        let req;try{req=database.open(name,1);}catch{reject(failure());return;}
        let settled=false;
        const finish=(error,db)=>{
          if(settled){if(db)db.close();return;}
          settled=true;clearTimeout(timer);error?reject(error):resolve(db);
        };
        const timer=setTimeout(()=>finish(failure()),10000);
        req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('receipts'))req.result.createObjectStore('receipts');};
        req.onerror=req.onblocked=()=>finish(failure());
        req.onsuccess=()=>finish(null,req.result);
      }).then(db=>{connection=db;db.onversionchange=()=>{db.close();connection=null;};return db;}).finally(()=>{opening=null;});
      return opening;
    }
    async function access(key,change){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('receipts',change?'readwrite':'readonly',change?{durability:'strict'}:undefined);
        let value,settled=false,read=false;
        const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
        const timer=setTimeout(()=>{finish(failure());try{tx.abort();}catch{}},10000);
        tx.oncomplete=()=>finish(read?null:failure());tx.onabort=tx.onerror=()=>finish(failure());
        const store=tx.objectStore('receipts'),req=store.get(key);
        req.onsuccess=()=>{
          try{
            read=true;validate(req.result);value=change?change(req.result):req.result;
            if(change && value!==req.result)store.put(value,key);
          }catch(error){finish(error);try{tx.abort();}catch{}}
        };
      }).catch(error=>{throw error.name==='AuthRenewalReceiptError'?error:failure();});
    }
    async function claim(token){
      if(!root.crypto?.subtle || !root.crypto?.randomUUID)throw failure();
      const key=await digest(token);
      // Web Locks serialize claim/exchange/receipt publication. Pending means
      // the previous response may have been lost, not proof of a token rotation.
      const row=await access(key,previous=>previous?.status==='applied'?previous:{format,status:'pending',attempt:root.crypto.randomUUID()});
      const check=await access(key);
      if(JSON.stringify(check)!==JSON.stringify(row))throw failure();
      return {key,attempt:row.attempt,applied:row.status==='applied'};
    }
    async function complete(claim){
      if(!/^[a-f0-9]{64}$/.test(claim?.key || '') || typeof claim.attempt!=='string')throw failure();
      const row=await access(claim.key,previous=>{
        if(!previous || previous.attempt!==claim.attempt)throw failure();
        return {...previous,status:'applied'};
      });
      const check=await access(claim.key);
      if(JSON.stringify(check)!==JSON.stringify(row))throw failure();
    }
    return {claim,complete};
  }
  const api={create,digest,validate,hasIdentity};
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeAuthRenewal=api;
})(globalThis);
