/* Preview uses separate keys. Normal keys remain unchanged for existing data
   and older clients. This is application isolation, not an encrypted vault. */
(function(root) {
  'use strict';
  function create(search) {
    const preview=new URLSearchParams(search).has('preview');
    const prefix=preview?'life-os-preview-v1:':'';
    return Object.freeze({preview,key:name=>prefix+name});
  }
  const api=Object.freeze({...create(root.location?.search || ''),create});
  root.LifeStorageScope=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(globalThis);
