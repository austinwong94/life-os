(() => {
  'use strict';
  if(window.LifeStartupBlocked)return;
  const button=planningButton('Properties',()=>setWorkspaceMode('properties'),'calendar');button.id='propertiesModeButton';
  document.querySelector('.workspace-modes').append(button);
  let frame=null,owner=null,opening=false,history=null,retryTimer=null,retryAttempt=0,wasVisible=false,frameTimer=null;
  const root=planningNode('section','properties-workspace');root.hidden=true;root.setAttribute('aria-label','Properties');elements.boardGrid.after(root);
  const heading=planningNode('header','properties-heading'),title=planningNode('div');title.append(planningNode('h1','','Properties'),planningNode('p','','Sunrise Villa & Windmill Villa'));
  const status=planningNode('p','properties-status','Sign in to Life OS to open your property records.');status.setAttribute('role','status');
  const retry=planningButton('Open properties',()=>open(),'arrow-right'),archive=planningButton('Migration history',()=>openHistory(),'archive');
  const reconnect=planningButton('Reconnect Life OS',()=>openSettingsModal(),'cloud');reconnect.hidden=true;
  const repair=planningButton('Recover save space',()=>window.open('storage-repair.html'+location.search,'_blank','noopener,noreferrer'),'archive');repair.hidden=true;
  function retryLabel(label){retry.querySelector('span').textContent=label;retry.setAttribute('aria-label',label);}
  const actions=planningNode('div','properties-actions');actions.append(archive,repair,reconnect,retry);heading.append(title,actions);root.append(heading,status);
  function cancelRetry(){clearTimeout(retryTimer);retryTimer=null;}
  function watchFrame(){
    clearTimeout(frameTimer);
    frameTimer=setTimeout(()=>{
      if(!frame || frame.contentWindow?.PropertyOperations || loadCloudSession()?.user?.id!==owner)return;
      root.dataset.connection='loading-error';retry.hidden=false;retryLabel('Retry loading');
      status.textContent='Your Life OS account is connected, but the Properties page did not finish loading. Retry loading. Your existing records and other tabs are kept.';
    },20000);
  }
  function clearHistory(){
    const previous=history;if(!previous)return;history=null;previous.abort.abort();
    if(previous.dialog.open)previous.dialog.close();previous.dialog.replaceChildren();
  }
  async function openHistory(){
    clearHistory();
    const dialog=dailyDialog('Migration history'),message=planningNode('p','','Loading protected original copies...');dialog.append(message);
    const request={dialog,owner:loadCloudSession()?.user?.id,abort:new AbortController()};history=request;
    const currentRequest=()=>history===request && dialog.open && loadCloudSession()?.user?.id===request.owner;
    dialog.addEventListener('close',()=>{if(history===request)clearHistory();},{once:true});
    try{
      const current=await ensureCloudSession(),ownerId=current.user.id;
      if(!currentRequest() || request.owner!==ownerId)throw new Error('Account changed');
      async function read(path){if(!currentRequest())throw new Error('Account changed');const response=await fetch(SUPABASE_CONFIG.url+'/rest/v1/'+path,{headers:{apikey:SUPABASE_CONFIG.anonKey,Authorization:'Bearer '+current.access_token},signal:AbortSignal.any([request.abort.signal,AbortSignal.timeout(20000)])});if(!response.ok)throw new Error('Unavailable');const data=await response.json();if(!currentRequest())throw new Error('Account changed');return data;}
      const batches=await read('property_transfer_batches?select=batch_id,manifest,staged_at&owner_id=eq.'+encodeURIComponent(ownerId)+'&order=staged_at.desc');
      if(batches.length!==1)throw new Error('Ambiguous migration');const batch=batches[0];
      const rows=await read('property_transfer_records?select=resource,source_key,payload_text,sha256&owner_id=eq.'+encodeURIComponent(ownerId)+'&batch_id=eq.'+encodeURIComponent(batch.batch_id)+'&order=resource,source_key&limit=1000');
      const browserCopies=await read('property_browser_backups?select=payload_text,sha256,comparison,preserved_at&owner_id=eq.'+encodeURIComponent(ownerId)+'&order=preserved_at.desc&limit=1000');
      if(!Array.isArray(rows) || !Array.isArray(browserCopies) || !Array.isArray(batch.manifest?.records) || rows.length!==batch.manifest.records.length)throw new Error('Incomplete migration');
      const expected=new Map();
      const key=record=>JSON.stringify([record.resource,record.source_key]);
      for(const record of batch.manifest.records){
        if(typeof record.resource!=='string' || typeof record.source_key!=='string' || !/^[a-f0-9]{64}$/.test(record.sha256) || expected.has(key(record)))throw new Error('Invalid migration manifest');
        expected.set(key(record),record.sha256);
      }
      for(const row of rows){if(expected.get(key(row))!==row.sha256)throw new Error('Original identity mismatch');expected.delete(key(row));}
      if(expected.size)throw new Error('Missing original');
      for(const row of [...rows,...browserCopies]){if(!currentRequest() || typeof row.payload_text!=='string')throw new Error('Copy unavailable');const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.payload_text)),hash=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==row.sha256)throw new Error('Copy mismatch');}
      if(!currentRequest())throw new Error('Account changed');
      message.textContent=rows.length+' original cloud records and '+browserCopies.length+' browser backups verified. These copies are read-only and separate from current property edits.';
      for(const row of rows.filter(r=>r.resource==='public.app_data')){const payload=JSON.parse(row.payload_text),item=planningNode('p','');item.textContent=String(payload.updated_at)+' · '+(payload.data?.bookings?.length || 0)+' bookings · '+(payload.data?.documents?.length || 0)+' documents';dialog.append(item);}
      for(const copy of browserCopies){const item=planningNode('p','');item.textContent='Browser backup · '+String(copy.comparison.exported_at)+' · '+copy.comparison.bookings+' bookings · '+copy.comparison.documents+' documents';dialog.append(item);}
      dialog.append(planningButton('Download original migration copies',()=>{
        if(!currentRequest())return;
        const blob=new Blob([JSON.stringify({format:'life-os-property-original-copies-v1',manifest:batch.manifest,records:rows,browser_backups:browserCopies},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='life-os-property-original-copies.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      },'download'));
    }catch{if(currentRequest())message.textContent='Could not verify the original copies. Sign in to Life OS and retry. No records were changed.';else if(history===request)clearHistory();}
  }
  function accepts(child){return Boolean(frame && frame.contentWindow===child && frame.isConnected);}
  async function session(child){
    if(!accepts(child))throw new Error('Property frame does not match.');
    const current=await ensureCloudSession();
    if(!accepts(child) || current.user.id!==owner || loadCloudSession()?.user?.id!==owner)throw new Error('The property account changed.');
    // The bridge sends access credentials only; the iframe is still same-origin.
    return {access_token:current.access_token,expires_at:current.expires_at,user:{id:current.user.id,email:current.user.email}};
  }
  window.LifePropertiesHost=Object.freeze({get url(){return SUPABASE_CONFIG.url;},get key(){return SUPABASE_CONFIG.anonKey;},accepts,session,account(child){if(accepts(child))openSettingsModal();}});
  async function open(){
    if(opening)return;cancelRetry();opening=true;retry.disabled=true;reconnect.hidden=true;repair.hidden=true;
    status.textContent='Checking your existing Life OS connection...';
    try{
      if(PREVIEW_MODE){status.textContent='Properties uses your signed-in Life OS account. This preview cannot access private property records.';return;}
      const current=await ensureCloudSession();
      if(loadCloudSession()?.user?.id!==current.user.id)throw new Error('Account changed');
      if(state.ui.workspaceMode!=='properties')return;
      retryAttempt=0;
      if(frame){
        if(current.user.id!==owner)throw new Error('Account changed');
        // A never-loaded document cannot contain an editor or an unfinished
        // form. Never reload a mounted operations document to retry access.
        if(root.dataset.connection==='loading-error' && frame.contentDocument?.URL==='about:blank'){
          const url=new URL(frame.src);url.searchParams.set('startup',String(Date.now()));frame.src=url.href;watchFrame();
        }
        root.dataset.connection='connected';
        frame.hidden=false;frame.inert=false;retry.hidden=true;retryLabel('Open properties');
        status.textContent='Bookings and documents use your Life OS cloud account. Original copies are available in Migration history.';return;
      }
      owner=current.user.id;
      root.dataset.connection='connected';
      frame=document.createElement('iframe');frame.id='propertyOperationsFrame';frame.title='Property bookings, calendar, payments and documents';frame.loading='eager';frame.src='property-operations.html'+location.search;frame.referrerPolicy='no-referrer';
      status.textContent='Bookings and documents use your Life OS cloud account. Original copies are available in Migration history.';root.append(frame);retry.hidden=true;watchFrame();
    }catch(error){
      if(!frame)owner=null;
      const failure=LifeAuthRenewal.describeFailure(error,{signedIn:Boolean(loadCloudSession()?.access_token)});
      root.dataset.connection=failure.kind;status.textContent=failure.message;retry.hidden=false;retryLabel(frame?'Reconnect properties':'Retry connection');
      reconnect.hidden=!['signin','account'].includes(failure.kind);repair.hidden=failure.kind!=='storage';
      renderCloudStatus(normalizeCloudError(error.message || failure.message));
      if(failure.retry && retryAttempt<3 && state.ui.workspaceMode==='properties' && navigator.onLine!==false){
        const delay=[5000,15000,45000][retryAttempt++];retryTimer=setTimeout(()=>{retryTimer=null;void open();},delay);
      }
    }
    finally{opening=false;retry.disabled=false;}
  }
  window.renderPropertiesWorkspace=()=>{
    if(history && loadCloudSession()?.user?.id!==history.owner)clearHistory();
    const visible=state.ui.workspaceMode==='properties';root.hidden=!visible;elements.boardGrid.hidden=visible;button.setAttribute('aria-pressed',String(visible));
    if(!visible)cancelRetry();
    if(visible && !frame && (!wasVisible || !root.dataset.connection))void open();
    wasVisible=visible;
    // Keep the embedded operations document mounted across navigation. Changing
    // sections must not reconstruct an unfinished booking/payment form.
    if(frame && !PREVIEW_MODE && loadCloudSession()?.user?.id!==owner){frame.hidden=true;frame.inert=true;retry.hidden=false;retryLabel('Reconnect properties');status.textContent='The Life OS account changed. Property records are locked. Keep this tab open if it contains unsaved changes.';}
  };
  window.addEventListener('storage',event=>{if(event.key===CLOUD_SESSION_KEY){retryAttempt=0;window.renderPropertiesWorkspace();if(!root.hidden)void open();}});
  window.addEventListener('online',()=>{if(!root.hidden){retryAttempt=0;void open();}});
  // Same-tab sign-out does not emit a storage event. Lock the mounted view even
  // while it is hidden and preserve its pending draft rather than clearing it.
  window.setInterval(()=>{if((frame && loadCloudSession()?.user?.id!==owner) || (history && loadCloudSession()?.user?.id!==history.owner))window.renderPropertiesWorkspace();},1000);
  window.addEventListener('beforeunload',event=>{if(frame?.contentWindow?.PropertyOperations?.pending()){event.preventDefault();event.returnValue='';}});
  window.renderPropertiesWorkspace();
})();
