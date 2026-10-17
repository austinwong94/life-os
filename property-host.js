(() => {
  'use strict';
  function host(){
    if(window.parent===window || location.origin==='null')throw new Error('Open Properties inside Life OS.');
    const api=window.parent.LifePropertiesHost;
    if(!api || window.parent.location.origin!==location.origin || !api.accepts(window))throw new Error('Properties parent is not authorized.');
    return api;
  }
  window.PropertyHost=Object.freeze({
    get url(){return host().url;},get key(){return host().key;},
    session:()=>host().session(window),account:()=>host().account(window),
    failed(error){const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error?.code==='property_editor_busy'?'Properties is already open in another Life OS tab. Continue editing there; your other boards remain available.':'Properties could not open. Your original records remain preserved. Return to Life OS and reconnect your account, then retry.';document.getElementById('propertyStartupError')?.remove();message.id='propertyStartupError';document.body.append(message);if(error)console.error('Property startup failed',error.name,String(error.stack || '').split('\n').slice(1).join('\n'));}
  });
  try{host();}catch{document.documentElement.hidden=true;window.addEventListener('DOMContentLoaded',()=>{document.documentElement.hidden=false;window.PropertyHost.failed();},{once:true});}
})();
