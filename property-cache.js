(function(root){
  'use strict';
  const allowed=/^sunrise-villa-(?:bookings|tax-plan|documents|profit|settings|recovery|recovery-session|sync-state)-v1$/;
  root.LifePropertyCache=Object.freeze({async open(owner){
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(owner))throw new Error('Property cache owner is missing.');
    if(!navigator.locks?.request)throw new Error('This browser cannot coordinate safe property editing.');
    let release,lockDone;
    await new Promise((resolve,reject)=>{lockDone=navigator.locks.request('life-os-properties-editor:'+owner,{ifAvailable:true},async lock=>{if(!lock){reject(Object.assign(new Error('Properties is already open in another Life OS tab.'),{code:'property_editor_busy'}));return;}await new Promise(done=>{release=done;resolve();});}).catch(reject);});
    let db;
    try{db=await new Promise((resolve,reject)=>{const request=indexedDB.open('life-os-properties-v1:'+owner,1);request.onupgradeneeded=()=>request.result.createObjectStore('values');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Property cache is busy.'));});}catch(error){release();await lockDone;throw error;}
    let memory;
    try{memory=new Map(await new Promise((resolve,reject)=>{const values=[],tx=db.transaction('values'),request=tx.objectStore('values').openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){values.push([cursor.key,cursor.value]);cursor.continue();}};tx.oncomplete=()=>resolve(values);tx.onabort=()=>reject(tx.error);}));}
    catch(error){db.close();release();await lockDone;throw error;}
    let tail=Promise.resolve(),pending=0,failure=false,closed=false;
    const change=(key,value)=>{
      if(closed)throw new Error('Properties moved to another tab. This cache is closed.');
      if(!allowed.test(key))throw new Error('Unexpected property cache key.');
      if(value===null)memory.delete(key);else memory.set(key,String(value));
      pending++;
      tail=tail.then(()=>new Promise((resolve,reject)=>{const tx=db.transaction('values','readwrite'),store=tx.objectStore('values');if(value===null)store.delete(key);else store.put(String(value),key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);})).catch(()=>{failure=true;}).finally(()=>{pending--;});
    };
    return Object.freeze({getItem:key=>memory.get(key)??null,setItem:(key,value)=>change(key,value),removeItem:key=>change(key,null),pending:()=>pending>0 || failure,flush:async()=>{await tail;if(failure)throw new Error('Property cache save failed. Keep this tab open and export a backup.');},close:()=>{if(pending || failure)throw new Error('Property cache has pending changes.');closed=true;db.close();release();return lockDone;}});
  }});
})(window);
