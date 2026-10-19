(() => {
  'use strict';
  function host(){
    if(window.parent===window || location.origin==='null')throw new Error('Open Properties inside Life OS.');
    const api=window.parent.LifePropertiesHost;
    if(!api || window.parent.location.origin!==location.origin || !api.accepts(window))throw new Error('Properties parent is not authorized.');
    return api;
  }
  function standby(message,kind='busy'){
    document.getElementById('cloudAuthPanel').hidden=true;
    document.getElementById('appShell').hidden=true;
    window.PropertyStartupState=kind;
    const panel=document.createElement('section');panel.id='propertyStartupError';panel.setAttribute('aria-label','Properties connection');
    const title=document.createElement('h2');title.textContent=kind==='busy'?'Properties is open in another tab':'Properties paused in this tab';
    const status=document.createElement('p');status.setAttribute('role','status');status.textContent=message;
    const retry=document.createElement('button');retry.type='button';retry.textContent='Use Properties in this tab';
    panel.append(title,status,retry);document.getElementById('propertyStartupError')?.remove();document.body.append(panel);
    let channel,waiting=false;
    retry.onclick=async()=>{
      if(waiting)return;waiting=true;retry.disabled=true;
      try{
        const current=await host().session(window),owner=current.user.id;
        const available=await navigator.locks.request('life-os-properties-editor:'+owner,{ifAvailable:true},lock=>Boolean(lock));
        if(available){const url=new URL(location.href);url.searchParams.delete('standby');location.replace(url.href);return;}
        if(typeof BroadcastChannel!=='function')throw new Error('coordination unavailable');
        channel?.close();channel=new BroadcastChannel('life-os-properties-handoff:'+owner);
        const request=crypto.randomUUID();
        channel.onmessage=event=>{
          if(event.data?.request!==request)return;
          waiting=false;retry.disabled=false;
          if(event.data.type==='released'){const url=new URL(location.href);url.searchParams.delete('standby');location.replace(url.href);}
          else if(event.data.type==='kept')status.textContent='The other tab has an open form or changes still saving. Finish saving there, then try again. Nothing was closed or discarded.';
        };
        channel.postMessage({type:'request',request});
        status.textContent='Checking whether the other Properties tab can safely pause. Your records and unfinished forms will be kept.';
        setTimeout(()=>{if(waiting){waiting=false;retry.disabled=false;status.textContent='The other Properties tab is using an older version or is not responding. Keep any unfinished forms open. Close only a saved Properties tab, then choose Use Properties in this tab again.';}},5000);
      }catch{waiting=false;retry.disabled=false;status.textContent='Could not switch Properties safely. Your other tab and all records are kept. Try again when its changes are saved.';}
    };
    host().state?.(window,kind);
  }
  window.PropertyHost=Object.freeze({
    get url(){return host().url;},get key(){return host().key;},
    session:()=>host().session(window),account:()=>host().account(window),
    standby,
    failed(error){
      if(error?.code==='property_editor_busy'){standby('Your Life OS account is connected. Only one tab edits the shared property cache at a time to protect unfinished changes.');return;}
      const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='Properties could not open. Your original records remain preserved. Return to Life OS and reconnect your account, then retry.';document.getElementById('propertyStartupError')?.remove();message.id='propertyStartupError';document.body.append(message);if(error)console.error('Property startup failed',error.name,String(error.stack || '').split('\n').slice(1).join('\n'));
    }
  });
  try{host();}catch{document.documentElement.hidden=true;window.addEventListener('DOMContentLoaded',()=>{document.documentElement.hidden=false;window.PropertyHost.failed();},{once:true});}
})();
