const dailySessions = new Map();
let dailyFocusSessionView=null;
let deviceSavedAt = 0;
let publishedReleaseCheckAt=0,publishedReleaseCheckInFlight=false;
let publishedUpdateInFlight=false;

function loadedReleaseId() {
  const bundle=[...document.scripts].find(script=>new URL(script.src || location.href).pathname.endsWith('/index-startup.js'));
  const script=[...document.scripts].find(script=>new URL(script.src || location.href).pathname.endsWith('/daily-workspace.js'));
  const id=bundle || script?new URL((bundle || script).src).searchParams.get('v'):'';
  return /^[a-f0-9]{16}$/.test(id || '')?id:'';
}
function canApplyPublishedUpdate() {
  try{return lastLocalSaveOk && !corruptLocalStateDetected && !isUserEditingCriticalDraft() && !hasUnsubmittedDraftText() && LifeDeviceStore.pending().length===0;}
  catch{return false;}
}
async function applyPublishedUpdate() {
  if(publishedUpdateInFlight)return false;
  publishedUpdateInFlight=true;
  const button=document.getElementById('releaseUpdateButton'),message=document.getElementById('releaseUpdateMessage');
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
  if(message)message.textContent='Checking device save before updating...';
  let reloading=false;
  try{
    let confirmed=false;
    try{confirmed=await flushDeviceWrites();}catch{/* An update must never bypass a failed save. */}
    if(confirmed!==true){
      if(message)message.textContent='Device save is not confirmed. Keep this tab open and retry saving, or download your information before updating. Your writing has not been changed.';
      return false;
    }
    if(!canApplyPublishedUpdate()){
      if(message)message.textContent='Finish or save your open draft before updating. Your writing has not been changed.';
      return false;
    }
    // Conflicts are stored records, not permission to discard either version.
    const url=new URL(location.href);url.searchParams.set('startup',String(Date.now()));
    if(/^[a-f0-9]{16}$/.test(button?.dataset.release || ''))url.searchParams.set('v',button.dataset.release);
    window.location.replace(url.href);reloading=true;return true;
  }finally{
    if(!reloading){
      publishedUpdateInFlight=false;
      if(button){button.disabled=false;button.removeAttribute('aria-busy');}
    }
  }
}
async function checkPublishedRelease(currentId=loadedReleaseId()) {
  if(!/^[a-f0-9]{16}$/.test(currentId || '') || publishedReleaseCheckInFlight || Date.now()-publishedReleaseCheckAt<30000)return;
  publishedReleaseCheckAt=Date.now();publishedReleaseCheckInFlight=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(new URL('release.json?check='+Date.now(),location.href),{cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const release=await response.json();
    if(!/^[a-f0-9]{16}$/.test(release.id || '') || !/^[a-f0-9]{64}$/.test(release.files?.['index.html'] || '') || release.id===currentId)return;
    if(document.getElementById('releaseUpdateNotice'))return;
    const notice=planningNode('section','release-update-notice');notice.id='releaseUpdateNotice';notice.setAttribute('aria-label','Website update');
    const message=planningNode('p','','A newer version of Life OS is available.');message.id='releaseUpdateMessage';message.setAttribute('role','status');
    const update=planningButton('Update now',applyPublishedUpdate,'rotate-ccw');update.id='releaseUpdateButton';update.dataset.release=release.id;
    notice.append(message,update);
    document.querySelector('.workspace-navigation').after(notice);
  }catch{/* Offline checks must never interrupt recording or saving. */}
  finally{clearTimeout(timeout);publishedReleaseCheckInFlight=false;}
}
function initializePublishedUpdates() {
  if(PREVIEW_MODE || location.protocol!=='https:' || !loadedReleaseId())return;
  checkPublishedRelease();setInterval(()=>{if(document.visibilityState==='visible')checkPublishedRelease();},60000);
  window.addEventListener('focus',()=>checkPublishedRelease());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkPublishedRelease();});
}

function dailySession() {
  const key = state.activeBoardId;
  if (!dailySessions.has(key)) {
    let saved = {}; try { saved = JSON.parse(sessionStorage.getItem(LifeStorageScope.key('life-os-daily:'+key)) || '{}'); } catch {}
    dailySessions.set(key, {light:false, sections:{agenda:true,routine:true,diary:true,sidenote:true}, ...saved});
  }
  return dailySessions.get(key);
}
function saveDailyDraft(boardId=state.activeBoardId,{silent=false}={}) {
  try {
    const session=boardId===state.activeBoardId?dailySession():dailySessions.get(boardId);
    if(!session)throw new Error('The original board draft is unavailable.');
    sessionStorage.setItem(LifeStorageScope.key('life-os-daily:'+boardId), JSON.stringify(session));return true;
  }
  catch { if(!silent)setSaveStatus('Draft only in memory - storage unavailable', 'error'); return false; }
}
function dailyRecords(board) {
  const cards = board ? board.archivedCards || [] : getArchivedCards();
  return cards.filter(c=>c.dailyWorkspaceStore).flatMap(c=>c.workspaceRecords || []);
}
function latestDailyRecord(kind, date) {
  return dailyRecords().filter(e=>e.kind===kind && e.date===date).sort((a,b)=>b.recordedAt-a.recordedAt || b.id.localeCompare(a.id))[0];
}
function dailyFocusKey(task) {return JSON.stringify([task.card.id,task.taskId]);}
function dailyFocusTimerState(timer,now=Date.now()) {
  if(timer===undefined || timer===null)return {phase:'missing'};
  const invalid={phase:'invalid'};
  if(!timer || typeof timer!=='object' || Array.isArray(timer) || typeof timer.key!=='string' || !Number.isSafeInteger(now) || now<0)return invalid;
  let key;try{key=JSON.parse(timer.key);}catch{return invalid;}
  if(!Array.isArray(key) || key.length!==2 || key.some(value=>typeof value!=='string' || !value.trim()))return invalid;
  const running=timer.endAt!==undefined && timer.endAt!==null;
  const value=running?timer.endAt:timer.remaining;
  if(!Number.isSafeInteger(value) || value<0 || running && value===0)return invalid;
  const remainingMs=running?Math.max(0,value-now):value,seconds=Math.ceil(remainingMs/1000);
  return {phase:!remainingMs?'finished':running?'running':'paused',key:timer.key,remainingMs,text:String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};
}
function dailyFocusKeys(day,items) {
  const record=latestDailyRecord('focus',day);
  if(record?.taskKeys)return record.taskKeys;
  // Only unambiguous old references may be displayed; never pick by title.
  return (record?.taskIds || []).flatMap(id=>{const matches=items.filter(t=>t.taskId===id);return matches.length===1?[dailyFocusKey(matches[0])]:[];});
}
function saveDailyRecord(fields, message) {
  const refuse=(text='Not saved. Your draft is kept; please retry.')=>{if(message)message.textContent=text;return false;};
  const reviewNeeded=()=>refuse('Daily history needs review. Your existing records and draft were kept.');
  const boardId=state.activeBoardId,hadArchive=Object.hasOwn(state,'archivedCards'),originalArchive=state.archivedCards;
  if(typeof boardId!=='string' || !boardId.trim() || originalArchive!==undefined && !Array.isArray(originalArchive) || !Array.isArray(state.cards))return reviewNeeded();
  const archive=getArchivedCards(),cards=[...state.cards,...archive],stores=archive.filter(card=>card?.dailyWorkspaceStore),ids=new Set();
  const validTime=value=>Number.isSafeInteger(value) && value>=0 && Number.isFinite(new Date(value).getTime());
  let recordedAt=Date.now();if(!validTime(recordedAt))return refuse('Not saved. Device time is unavailable; your draft is kept.');
  for(const source of stores){
    if(typeof source!=='object' || Array.isArray(source) || typeof source.id!=='string' || !source.id.trim() || cards.filter(card=>card?.id===source.id).length!==1 || !Array.isArray(source.workspaceRecords))return reviewNeeded();
    for(const entry of source.workspaceRecords){
      if(!entry || typeof entry!=='object' || Array.isArray(entry) || typeof entry.id!=='string' || !entry.id.trim() || ids.has(entry.id) || !validTime(entry.recordedAt) || !validTime(entry.recordedAt+1))return reviewNeeded();
      ids.add(entry.id);recordedAt=Math.max(recordedAt,entry.recordedAt+1);
    }
  }
  let copied;
  try{copied=LifeStateMerge.copy(fields);}catch{return refuse();}
  if(!copied || typeof copied!=='object' || Array.isArray(copied) || typeof copied.kind!=='string' || !copied.kind.trim() || !LifePlanner.validDate(copied.date))return refuse();
  let id;try{id=createId();}catch{return refuse();}
  if(typeof id!=='string' || !id.trim() || ids.has(id))return refuse();
  let store=stores[0];const created=!store;
  if(created){
    if(cards.some(card=>card?.id==='daily-workspace-'+boardId))return reviewNeeded();
    // A known, non-planner container survives older board normalizers without
    // being selected by an older client's planner writer. Records are immutable.
    store = {id:'daily-workspace-'+boardId, type:'single', title:'Daily workspace records', category:'Personal',
      plannerSourceOnly:true, dailyWorkspaceStore:true,
      archivedAt:1, createdAt:1, workspaceRecords:[]};
  }
  const emptyStore=created?LifeStateMerge.copy(store):null,record={...copied,id,recordedAt},expected=LifeStateMerge.copy(record);
  if(created)state.archivedCards=[...archive,store];
  store.workspaceRecords.push(record);
  let failureMessage;
  try{if(saveState()===true)return true;}
  catch{failureMessage='Save was not confirmed. Keep this page open; your full draft is kept. Please retry.';}
  if(state.activeBoardId!==boardId)return refuse(failureMessage);
  const liveArchive=getArchivedCards(),matches=[...state.cards,...liveArchive].filter(card=>card?.id===store.id),live=matches[0];
  if(matches.length!==1 || !live?.dailyWorkspaceStore || !Array.isArray(live.workspaceRecords))return refuse(failureMessage);
  const entries=live.workspaceRecords.filter(entry=>entry?.id===id);
  if(entries.length!==1 || !LifeStateMerge.equal(entries[0],expected))return refuse(failureMessage);
  live.workspaceRecords.splice(live.workspaceRecords.indexOf(entries[0]),1);
  // Remove only this newly created empty container, never later records or metadata.
  if(created && LifeStateMerge.equal(live,emptyStore)){
    const remaining=liveArchive.filter(card=>card!==live);
    if(Array.isArray(originalArchive) && remaining.length===archive.length && remaining.every((card,index)=>card===archive[index]))state.archivedCards=originalArchive;
    else if(originalArchive===undefined && !remaining.length){if(hadArchive)state.archivedCards=undefined;else delete state.archivedCards;}
    else state.archivedCards=remaining;
  }
  syncActiveBoard({touchBoard:false});return refuse(failureMessage);
}
function dailySection(title, action) {
  const section=planningNode('section','daily-section'),header=planningNode('header','daily-section-head');
  header.append(planningNode('h3','',title));if(action)header.append(action);section.append(header);return section;
}
function dailyDialog(title) {
  const existing=document.getElementById('dailyDialog');existing?.close();existing?.remove();
  const previous=document.activeElement,dialog=planningNode('dialog','daily-dialog');dialog.id='dailyDialog';
  const heading=planningNode('h2','',title);heading.id='dailyDialogTitle';dialog.setAttribute('aria-labelledby',heading.id);
  const head=planningNode('header','daily-section-head');head.append(heading,planningIcon('Close',()=>dialog.close(),'x'));dialog.append(head);
  document.body.append(dialog);dialog.addEventListener('close',()=>{
    // A delayed close must not steal focus from a newly opened editor.
    const restoreFocus=document.activeElement===document.body || dialog.contains(document.activeElement);
    dialog.remove();
    if(restoreFocus && previous?.isConnected && !document.querySelector('dialog[open]'))previous.focus({preventScroll:true});
  },{once:true});dialog.showModal();return dialog;
}
function openDailyMore() {
  const dialog=dailyDialog('More'),list=planningNode('div','daily-menu');
  for(const [label,icon,action] of [
    ['Capture','plus',openDailyCapture],['My board','layout-grid',()=>setWorkspaceMode('board')],['Priorities','check',()=>setWorkspaceMode('priorities')],
    ['Records','pencil',()=>setWorkspaceMode('records')],['Money','bar-chart',()=>setWorkspaceMode('money')],['Weekly review','bar-chart',openDailyReview],['Archive','archive',openRecordsModal],['Reports','bar-chart',openReportsModal],
    ['Settings','settings',openSettingsModal],['One Tap experiment','play',()=>setWorkspaceMode('oneTap')],['Saving & version','check',openSaveDetails]
  ])list.append(planningButton(label,()=>{dialog.close();action();},icon));dialog.append(list);
}
function initializeDailyWorkspace() {
  const nav=document.querySelector('.rail-nav');
  const add=(id,label,icon,action,before)=>{
    const button=planningButton(label,action,icon);button.id=id;button.className='rail-button mobile-daily-nav';
    const text=button.lastChild,small=planningNode('small','',label);text.replaceWith(small);
    if(before)nav.insertBefore(button,before);else nav.append(button);
  };
  add('mobileTodayButton','Today','calendar',()=>setWorkspaceMode('today'),elements.railAddButton);
  add('mobileTasksButton','Plan','check',()=>setWorkspaceMode('tasks'),elements.railAddButton);
  add('mobileHealthButton','Health','dumbbell',()=>setWorkspaceMode('health'),elements.railAddButton);
  add('mobileBoardButton','Board','layout-grid',()=>setWorkspaceMode('board'));
  add('mobileProgressButton','Progress','bar-chart',()=>setWorkspaceMode('priorities'));
  add('mobileCalendarButton','Calendar','calendar',()=>setWorkspaceMode('calendar'));
  add('mobileMoreButton','More','more-vertical',openDailyMore);
  document.querySelector('.workspace-navigation').append(document.getElementById('mobileMoreButton'));
  elements.railAddButton.setAttribute('aria-label','Capture or add card');elements.railAddButton.title='Capture or add card';
  // Replace the original listener without leaving two competing Add actions.
  elements.railAddButton.addEventListener('click',event=>{event.stopImmediatePropagation();openDailyCapture();},{capture:true});
  document.getElementById('weeklyReviewButton').onclick=openDailyReview;
  document.getElementById('headerSaveStatus').onclick=openSaveDetails;
  document.getElementById('headerSaveStatus').title=(PREVIEW_MODE?'Preview · ':'')+'Version '+(loadedReleaseId() || 'Unversioned source')+' · Saving details';
  renderDailyNavigation();
  initializePublishedUpdates();
}
function renderDailyNavigation() {
  for(const mode of ['today','tasks','calendar'])document.getElementById('mobile'+mode[0].toUpperCase()+mode.slice(1)+'Button')?.setAttribute('aria-pressed',String(state.ui.workspaceMode===mode));
  document.getElementById('mobileTasksButton')?.setAttribute('aria-pressed',String(['tasks','calendar'].includes(state.ui.workspaceMode)));
  document.getElementById('mobileBoardButton')?.setAttribute('aria-pressed',String(state.ui.workspaceMode==='board'));
  document.getElementById('mobileHealthButton')?.setAttribute('aria-pressed',String(state.ui.workspaceMode==='health'));
  document.getElementById('mobileProgressButton')?.setAttribute('aria-pressed',String(state.ui.workspaceMode==='priorities'));
  const more=document.getElementById('mobileMoreButton');
  if(more){const active=['board','records','money','priorities','properties','oneTap'].includes(state.ui.workspaceMode);more.setAttribute('aria-pressed',String(active));more.dataset.current=String(active);}
  document.getElementById('mobileCalendarButton')?.setAttribute('aria-pressed','false');
}
function openSaveDetails() {
  const dialog=dailyDialog('Saving & version'),details=planningNode('dl','daily-save-details');dialog.append(details);
  const storageDisclosure=planningNode('details','daily-save-storage'),storageSummary=planningNode('summary','','Storage & recovery details'),storageDetails=planningNode('dl','daily-save-storage-details');
  storageDisclosure.append(storageSummary,storageDetails);
  const render=()=>{
    details.replaceChildren();storageDetails.replaceChildren();const add=(label,text)=>details.append(planningNode('dt','',label),planningNode('dd','',text));
    const addStorage=(label,text)=>storageDetails.append(planningNode('dt','',label),planningNode('dd','',text));
    add('Loaded version',loadedReleaseId() || 'Unversioned source');add('Environment',PREVIEW_MODE?'Separate preview records - cloud disabled':location.hostname==='127.0.0.1'||location.hostname==='localhost'?'Local development':'This website');
    let pending;try{pending=LifeDeviceStore.pending().length;}catch{}
    add('Device',corruptLocalStateDetected?'Recovery required':pending===undefined?'Device copies could not be checked':pending>0?'Pending copies kept - shared save not confirmed':lastLocalSaveOk?'Saved on this device':'Saving failed - export your writing');
    add('Last device write',deviceSavedAt?formatRecordDateTime(deviceSavedAt):'No write recorded in this tab yet');
    add('Pending device copies',pending===undefined?'Unable to read':String(pending));
    const signedIn=Boolean(cloudSession?.user?.id);
    add('Cloud',PREVIEW_MODE?'Disabled in preview':!signedIn?'Not signed in':/Cloud session expired|Sign-in failed:|Sign-in could not be saved/.test(cloudStatusMessage || '')?'Sign-in needed':cloudConflictPending?(state.syncConflicts?.length?'Paused - review conflicting changes':'Paused - compare device and cloud copies'):isRestoreSyncPaused()?'Paused after restore':!navigator.onLine?'Offline':cloudPushInFlight?'Syncing':cloudSyncRetry.status().scheduled?'Waiting to retry (not saved to cloud)':cloudSaveTimer!==null?'Cloud save queued (not saved to cloud)':cloudStartupCheck.pending?'Checking saved cloud records (read only)':cloudSaveEnabled?'Automatic sync enabled (not a save receipt)':'Sync paused');
    if(signedIn && cloudStartupCheck.checkedAt){add('Read-only cloud check',formatRecordDateTime(cloudStartupCheck.checkedAt));add('Result at that time',cloudStartupCheck.message);if(cloudStartupCheck.cloudVersionAt)add('Cloud version checked',formatRecordDateTime(cloudStartupCheck.cloudVersionAt));}
    add('Last known save/load timestamp',getKnownCloudUpdatedAt()?formatRecordDateTime(getKnownCloudUpdatedAt()):'No saved receipt in this browser');
    if(signedIn && cloudMergeBase?.ownerId===cloudSession.user.id){
      let count;try{count=String(LifeCloudCopies.changedBoardIds(getStateForStorage(),cloudMergeBase.state).length);}catch{count='Unable to compare';}
      add('Boards with record changes',count);
    }
    add('Changes needing review',String(state.syncConflicts?.length || 0));
    if(lastDeviceSaveError)add('Last device save issue',deviceSaveFailureReason()+' '+formatRecordDateTime(lastDeviceSaveError.at));
    try{
      const storage=LifeDeviceStore.diagnostics(),mb=bytes=>(bytes/1048576).toFixed(2)+' MB';
      addStorage('Browser storage used (estimate)',mb(storage.totalBytes));
      addStorage('Pending copy storage',mb(storage.pendingBytes));
      const labels=[[STORAGE_KEY,'Active information'],[CLOUD_RECOVERY_KEY,'Recent recovery cache'],[DIARY_BACKUP_KEY,'Diary recovery copies'],[PRE_UPGRADE_KEY,'Original pre-upgrade copy'],[CLOUD_BASE_KEY,'Cloud comparison copy']];
      for(const [key,label] of labels)addStorage(label,mb((localStorage.getItem(key)?.length || 0)*2));
      if(typeof recoveryVault!=='undefined' && recoveryVault){
        const archive=recoveryVault.diagnostics();addStorage('Recovery archive',archive.error || (archive.ready?archive.archivedCopies+' verified copies in IndexedDB':'Opening recovery archive'));
        addStorage('Space reclaimed this tab',mb(archive.movedBytes));
      }
    }catch{addStorage('Browser storage','Access unavailable');}
  };render();const timer=setInterval(render,1500);dialog.addEventListener('close',()=>clearInterval(timer),{once:true});
  const actions=planningNode('div','daily-actions');
  const feedback=planningNode('p','daily-message');feedback.setAttribute('role','status');
  const retry=planningButton('Retry device save',async()=>{
    retry.disabled=true;feedback.textContent='Checking pending device copies...';
    const saved=await retryDeviceSave();
    if(saved){
      lastDeviceSaveError=null;
      setSaveStatus(cloudConflictPending?cloudReviewStatusLabel():isRestoreSyncPaused()?'Saved on device - cloud paused':navigator.onLine?'Saved on device':'Offline - saved on device',cloudConflictPending?'error':'local');
      renderCloudStatus('Device save confirmed. This action is not a verified cloud save receipt.');
      if(cloudSaveEnabled && !PREVIEW_MODE && !cloudConflictPending && !isRestoreSyncPaused())queueCloudSave({silent:true});
    }
    let retained=false;try{retained=LifeDeviceStore.pending().length>0;}catch{}
    feedback.textContent=saved?'Device save confirmed.':retained?'Device save is not confirmed. Pending copies are kept; keep this tab open.':'Not saved on this device. Keep this tab open and download your information or open Recovery.';
    render();retry.disabled=false;
  },'check');actions.append(retry);
  actions.append(planningButton('Download my information',exportReadableDataArchive,'download'),planningButton('Recovery',()=>{dialog.close();openRecovery();},'archive'),planningButton('Cloud settings',()=>{dialog.close();openSettingsModal();},'settings'));
  if(PREVIEW_MODE){
    const link=planningNode('a','planning-button','Open saved workspace'),url=new URL(location.href);
    url.searchParams.delete('preview');url.hash='';link.href=url.href;actions.append(link);
  }
  dialog.append(feedback,actions,storageDisclosure);
}
function openDailyCapture() {
  const boardId=state.activeBoardId,today=getTodayKey(),session=dailySession(),draft=session.capture ||= {kind:'task',text:'',date:today,area:''};
  const dialog=dailyDialog('Capture'),form=planningNode('form','daily-form'),message=planningNode('p','daily-message');message.setAttribute('role','status');
  dialog.classList.add('daily-capture-dialog');
  const editable=()=>dialog.open && dialog.isConnected && session.capture===draft;
  const current=()=>editable() && state.activeBoardId===boardId && dailySession()===session;
  const kind=planningSelect([['task','Task'],['note','Quick note'],['experience','Experience to try']],draft.kind,value=>{if(!editable())return;draft.kind=value;dateChoices.hidden=value==='note';saveDailyDraft(boardId);});
  const text=planningNode('textarea');text.rows=3;text.required=true;text.value=draft.text;text.oninput=()=>{if(!editable())return;draft.text=text.value;const kept=saveDailyDraft(boardId);message.dataset.state=kept?'kept':'error';message.textContent=kept?'Draft kept in this tab':'Draft only in memory - storage unavailable';};
  const date=planningInput('date',draft.date,value=>{if(!editable())return;draft.date=value;saveDailyDraft(boardId);});
  date.setAttribute('aria-label','Date (optional for tasks)');
  const dateChoices=planningCaptureDates(date,today,current);dateChoices.hidden=draft.kind==='note';
  const dateField=planningNode('div','planning-date-field');dateField.append(planningField('Date (optional for tasks)',planningOptionalDate(date,'Clear capture date',()=>{if(!editable())return;draft.date='';saveDailyDraft(boardId);})),dateChoices);
  form.append(planningField('Capture as',kind),planningField('What is on your mind?',text),dateField,
    planningField('Area',planningSelect(taskAreaOptions(draft.area),draft.area,value=>{if(!editable())return;draft.area=value;saveDailyDraft(boardId);})));
  const save=planningButton('Save capture',null,'check');save.type='submit';save.classList.add('is-primary');
  form.append(message,save,planningButton('Add a card instead',()=>{dialog.close();openCardComposer();},'layout-grid'));
  form.onsubmit=event=>{
    event.preventDefault();delete message.dataset.state;if(!current() || getTodayKey()!==today){message.textContent='The board or day changed. Reopen this capture on the original board. Your draft is kept.';return;}
    if(!draft.text.trim() || (draft.date && !LifePlanner.validDate(draft.date)))return;
    if(draft.pendingKind && draft.pendingKind!==draft.kind){message.textContent='Retry the original capture type before changing it.';return;}
    draft.pendingId ||= createId();draft.pendingKind=draft.kind;saveDailyDraft(boardId);
    if(draft.kind==='note'){
      if(draft.pendingTarget && draft.pendingTarget.date!==(draft.date || getTodayKey())){message.textContent='Retry the original note date before changing it.';return;}
      let card=draft.pendingTarget?resolveLiveCard({id:draft.pendingTarget.cardId}):state.cards.find(c=>c.type==='sidenote' && c.id===session.cardChoices?.sidenote) || state.cards.find(c=>c.type==='sidenote');
      if(draft.pendingTarget && card?.type!=='sidenote'){message.textContent='The original notes card moved. Your draft is kept.';return;}
      if(!card){card=makeCard({type:'sidenote',title:'Quick notes',category:draft.area || 'Personal'});state.cards.push(card);}
      const day=draft.date || getTodayKey(),entry=getSideNoteEntry(card,day),existing=entry.notes.find(n=>n.id===draft.pendingId);draft.pendingTarget={cardId:card.id,date:day};
      if(existing && draft.pendingBase && !LifeStateMerge.equal(existing,draft.pendingBase)){message.textContent='This note changed elsewhere. Your draft is kept.';return;}
      const note=existing || normalizeSideNoteItem({id:draft.pendingId,text:draft.text});note.text=draft.text.trim();note.updatedAt=Date.now();if(!existing)entry.notes.push(note);entry.updatedAt=Date.now();draft.pendingBase=LifeStateMerge.copy(note);
    }else{
      const source=getPlannerSourceCards().find(c=>LifePlanner.ensure(c).some(t=>t.id===draft.pendingId)) || getPlannerWriteSourceCard({category:draft.area || 'Unsorted'},draft.date);
      let task=LifePlanner.ensure(source).find(t=>t.id===draft.pendingId);
      if(task && draft.pendingBase && !LifeStateMerge.equal(task,draft.pendingBase)){message.textContent='This task changed elsewhere. Your draft is kept.';return;}
      task ||= LifePlanner.add(source,draft.date,draft.text,draft.pendingId);
      LifePlanner.change(source,task.id,{title:draft.text.trim(),dateKey:draft.date,area:draft.area,intent:draft.kind==='experience'?'experience':'task',status:'todo'});LifePlanner.project(source);draft.pendingBase=LifeStateMerge.copy(task);
    }
    saveDailyDraft(boardId);if(!saveState()){message.textContent='Not saved. Your draft is kept; please retry.';return;}
    delete session.capture;saveDailyDraft(boardId);dialog.close();renderCardsOnly({force:true});
  };dialog.append(form);text.focus();
}
function renderDailyHome() {
  const root=elements.boardGrid,session=dailySession(),day=getTodayKey();
  const boardId=state.activeBoardId,preferenceMessage=planningNode('p','daily-message daily-personalization-message');preferenceMessage.setAttribute('role','status');preferenceMessage.hidden=true;
  const head=planningNode('header','daily-head'),copy=planningNode('div');copy.append(planningNode('h2','','Today'));
  const actions=planningNode('div','daily-actions');
  const light=planningButton('Lighter day',()=>{
    if(!head.isConnected || head.hidden || light.hidden || state.activeBoardId!==boardId || day!==getTodayKey() || state.ui.workspaceMode!=='today' || dailySession()!==session || document.querySelector('dialog[open]'))return;
    const had=Object.hasOwn(session,'light'),before=session.light;session.light=!before;
    if(!saveDailyDraft(boardId,{silent:true})){if(had)session.light=before;else delete session.light;preferenceMessage.textContent='Lighter day was not saved. The previous setting is kept; please retry.';preferenceMessage.hidden=false;return;}
    renderCardsOnly({force:true});
  });light.setAttribute('aria-pressed',String(session.light));
  actions.append(light,planningIcon('Customize Today',openDailyPreferences,'settings'),planningButton('Capture',openDailyCapture,'plus'));
  head.append(copy,actions);root.append(head,preferenceMessage);
  const layout=planningNode('div','daily-layout');root.append(layout);
  const columns=planningNode('div','daily-columns');layout.append(columns);
  const context=planningNode('div','daily-context');
  renderMomentumToday(context,session.light);
  const all=getWorkspaceTaskItems(),focusIds=dailyFocusKeys(day,all);
  const focus=dailySection('My next step',planningButton('Choose',openDailyFocus,'pencil'));
  renderDailyFocusSession(focus);
  const selected=focusIds.map(key=>all.find(t=>dailyFocusKey(t)===key)).filter(Boolean),visible=session.light?selected.slice(0,1):selected;
  focus.classList.add('daily-focus-section');
  if(visible.length){
    const completed=visible.filter(item=>item.done).length;
    const progress=planningNode('div','daily-focus-progress');
    const label=planningNode('span','',`${completed} of ${visible.length} next steps complete`);
    const meter=planningNode('progress');meter.max=visible.length;meter.value=completed;meter.setAttribute('aria-label','Chosen next steps complete');
    progress.append(label,meter);focus.append(progress);
  }else {
    focus.querySelector('.planning-button').classList.add('is-primary');
    const empty=planningNode('div','momentum-focus-empty');empty.append(planningNode('strong','','One thing is enough to begin.'));
    focus.append(empty);
  }
  for(const item of visible){
    const step=planningNode('div','daily-focus-step');step.dataset.focusKey=dailyFocusKey(item);step.append(renderWorkspaceTaskItem({...item,workspaceTask:true,undated:!item.dateKey,scheduledDate:item.dateKey,dateKey:day}));focus.append(step);
    if(item.done)continue;
    const plan=latestDailyRecord('focus',day)?.plans?.[dailyFocusKey(item)] || {},tools=planningNode('div','daily-step-tools');
    const start=planningButton('Start',()=>openDailyStart(item,plan),'play');start.dataset.dailyStartKey=dailyFocusKey(item);
    tools.append(planningNode('span','daily-muted',plan.nextAction || item.nextAction || ''),start,planningIcon('Next-step options: '+item.title,()=>openDailyStepOptions(item),'more-vertical'));step.append(tools);
  }
  const records=dailyRecords().filter(e=>e.kind==='focus' && e.date===day),original=records.slice().sort((a,b)=>a.recordedAt-b.recordedAt)[0];
  if(original && !LifeStateMerge.equal(original.taskKeys,focusIds))focus.append(planningNode('small','daily-muted','Plan revised. Your original choices remain in the weekly review.'));
  const plans=latestDailyRecord('focus',day)?.plans || {},budget=latestDailyRecord('focus',day)?.budgetMinutes;
  const capacity=LifeMomentum.capacity(visible.map(t=>{const plan=plans[dailyFocusKey(t)];return plan && Object.hasOwn(plan,'minutes')?plan.minutes:t.estimatedMinutes || '';}),budget);
  if(visible.length)focus.append(planningNode('small','daily-capacity',dailyCapacityText(capacity)));
  const suggestions=planningNode('div','daily-suggestion-slot');focus.append(suggestions);renderDailySuggestions(suggestions,all,focusIds,session.light);
  const overview=planningNode('div','daily-actions daily-focus-footer');
  overview.append(planningButton('All tasks ('+all.length+')',()=>{planningSession().view='all';planningSession().area='*';planningSession().search='';savePlanningSession();setWorkspaceMode('tasks');}),
    planningButton('My board',()=>setWorkspaceMode('board')));focus.append(overview);columns.append(focus);refreshDailyFocusSession();
  if(session.sections.health!==false)context.prepend(renderDailyHealth());
  if(!session.light && session.sections.followups!==false)renderDailyFollowUps(context,all);
  if(!session.light && session.sections.agenda!==false){
    const agenda=dailySection('Coming up',planningButton('Calendar',()=>setWorkspaceMode('calendar'),'calendar'));
    const items=dailyUpcoming(day);
    items.slice(0,3).forEach(item=>{const row=planningNode('div','daily-agenda-row');row.append(planningNode('strong','',item.title),planningNode('small','',item.detail));agenda.append(row);});
    if(items.length)context.append(agenda);
  }
  if(!session.light && session.sections.routine!==false){
    const section=dailySection('My priorities',planningButton('Priorities',()=>setWorkspaceMode('priorities'),'check')),program=coachingProgram();
    section.classList.add('daily-priorities');
    if(program){
      if(LifeCoaching.metrics(program).some(m=>m.kind==='weekly'))renderCoachingQuickWeek(section,program);
      const progress=planningNode('details','daily-priority-progress');progress.append(planningNode('summary','','Recorded target progress'));
      for(const priority of program.priorities){const result=LifeCoaching.completion(program,priority.krs.flatMap(k=>k.metrics),day);const line=planningNode('div','daily-priority-line');line.append(planningNode('span','',priority.title),planningNode('strong','',result.percent===null?'Not recorded':result.percent+'%'));progress.append(line);}section.append(progress);
    }else section.append(planningNode('p','daily-muted','No priorities programme on this board.'));
    if(program)context.append(section);
  }
  const week=dailyWeekStart(day),completed=dailyCompletedTasks(week,day);
  const done=planningNode('details','daily-completed');done.append(planningNode('summary','','Completed this week ('+completed.length+')'),planningNode('small','daily-muted',formatPlannerOriginDate(week)+' - '+formatPlannerOriginDate(day)));
  completed.sort((a,b)=>b.completedOn.localeCompare(a.completedOn)).forEach(t=>done.append(planningNode('p','',formatPlannerOriginDate(t.completedOn)+' · '+t.title)));
  const grid=planningNode('div','today-cards daily-journals'),journalActions=planningNode('div','daily-journal-actions');
  for(const type of ['diary','sidenote']){
    if(session.sections[type]===false)continue;
    const cards=state.cards.filter(c=>c.type===type),card=cards.find(c=>c.id===session.cardChoices?.[type]) || cards[0];
    if(card){
      const article=renderCard(card),title=article.querySelector('.card-main h3'),menu=article.querySelector('.card-menu-shell');
      for(const [name,value] of [['accent','--action'],['soft','--action-soft'],['ink','--ink'],['muted','--muted']])article.style.setProperty('--card-'+name,'var('+value+')');
      const heading=planningNode('header','daily-journal-head');heading.append(title,menu);article.prepend(heading);
      article.querySelector('.card-topline').hidden=true;article.classList.add('daily-journal-source');grid.append(article);
    }
    else journalActions.append(planningButton(type==='diary'?'Add a diary':'Add quick notes',()=>{openCardComposer();setFormType(type);renderConditionalFields();},'plus'));
  }
  grid.classList.toggle('has-single-journal',grid.querySelectorAll('.task-card').length===1);
  if(journalActions.childElementCount)grid.append(journalActions);
  layout.append(grid,context);root.append(done);
}
function renderDailyFollowUps(parent,items) {
  const day=getTodayKey(),boardId=state.activeBoardId,session=dailySession();
  const summary=LifeMomentum.followUps(items.map(item=>({...dailySuggestionProjection(item),followUp:item.followUp})),{today:day});
  if(!summary.due.length && !summary.undated.length && !summary.review.length)return;
  const open=planningButton('Waiting on',()=>{
    if(!section.isConnected || document.hidden || state.activeBoardId!==boardId || getTodayKey()!==day || state.ui.workspaceMode!=='today' || dailySession()!==session || document.querySelector('dialog[open]'))return;
    planningSession().view='waiting';planningSession().area='*';planningSession().search='';savePlanningSession();setWorkspaceMode('tasks');
  },'arrow-right');
  const section=dailySection('Follow-ups',open);section.classList.add('daily-follow-ups');section.setAttribute('aria-label','Waiting task follow-ups');
  if(summary.due.length){
    section.append(planningNode('p','daily-follow-up-count',summary.due.length+' follow-up'+(summary.due.length===1?'':'s')+' due'));
    for(const item of summary.due.slice(0,3)){
      const row=planningNode('div','daily-follow-up-row');row.dataset.followUpKey=item.key;
      const date=planningNode('time','',item.followUp===day?'Due today':'Follow-up '+formatPlannerOriginDate(item.followUp));date.dateTime=item.followUp;
      row.append(planningNode('strong','',item.title),planningNode('small','daily-muted',item.area),date);section.append(row);
    }
    if(summary.due.length>3)section.append(planningNode('small','daily-muted',summary.due.length-3+' more in Waiting on'));
  }
  if(summary.undated.length)section.append(planningNode('p','daily-muted',summary.undated.length+' waiting task'+(summary.undated.length===1?' has':'s have')+' no follow-up date.'));
  if(summary.review.length)section.append(planningNode('p','daily-muted',summary.review.length+' waiting entr'+(summary.review.length===1?'y needs':'ies need')+' review before showing a due date.'));
  parent.append(section);
}
function renderDailyFocusSession(parent) {
  const root=planningNode('section','daily-active-focus'),copy=planningNode('div','daily-active-focus-copy'),title=planningNode('strong'),status=planningNode('small'),clock=planningNode('output'),message=planningNode('p','daily-message');
  root.setAttribute('aria-label','Current focus session');clock.setAttribute('aria-label','Session time remaining');clock.setAttribute('aria-live','off');message.setAttribute('role','status');
  const view={root,title,status,clock,message,boardId:state.activeBoardId,day:getTodayKey(),session:dailySession(),expected:null};
  const current=()=>dailyFocusSessionView===view && root.isConnected && !root.hidden && view.boardId===state.activeBoardId && view.day===getTodayKey() && state.ui.workspaceMode==='today' && dailySession()===view.session && !document.querySelector('dialog[open]');
  const canAct=()=>current() && dailyFocusTimerState(view.session.focusTimer).phase!=='invalid' && LifeStateMerge.equal(view.session.focusTimer,view.expected);
  const open=planningIcon('Return to focus session',()=>{
    if(!canAct())return;
    const matches=getWorkspaceTaskItems().filter(task=>dailyFocusKey(task)===view.expected.key);
    if(matches.length!==1 || matches[0].done || !dailySuggestionProjection(matches[0]).editable || dailySuggestionProjection(matches[0]).blocked){message.textContent='The task changed or moved. Reopen Today to review it.';return;}
    const plan=latestDailyRecord('focus',view.day)?.plans?.[view.expected.key] || {};openDailyStart(matches[0],plan);
  },'play');
  const dismiss=planningIcon('Dismiss focus session',()=>{
    if(!canAct())return;
    const before=view.session.focusTimer;delete view.session.focusTimer;
    if(!saveDailyDraft(view.boardId)){view.session.focusTimer=before;message.textContent='The timer was not dismissed. It is kept here; retry when draft saving is available.';return;}
    refreshDailyFocusSession();
  },'x');
  view.open=open;view.dismiss=dismiss;copy.append(title,status);root.append(copy,clock,open,dismiss,message);parent.append(root);dailyFocusSessionView=view;
}
function refreshDailyFocusSession() {
  const view=dailyFocusSessionView;if(!view)return;
  if(!view.root.isConnected || view.boardId!==state.activeBoardId || view.day!==getTodayKey() || state.ui.workspaceMode!=='today'){
    view.root.hidden=true;dailyFocusSessionView=null;return;
  }
  const timer=view.session.focusTimer,frame=dailyFocusTimerState(timer);
  for(const button of view.root.parentElement.querySelectorAll('[data-daily-start-key]')){
    const label=frame.key===button.dataset.dailyStartKey?'Open session':'Start';
    if(button.getAttribute('aria-label')!==label){button.setAttribute('aria-label',label);button.querySelector('span').textContent=label;}
  }
  view.root.hidden=frame.phase==='missing';if(view.root.hidden)return;
  const matches=frame.phase==='invalid'?[]:getWorkspaceTaskItems().filter(task=>dailyFocusKey(task)===frame.key),task=matches.length===1?matches[0]:null;
  const label=frame.phase==='invalid'?'Saved timer needs review':(task?.done?'Task completed · ':'')+({running:'Running',paused:'Paused',finished:'Session finished'}[frame.phase]);
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  text(view.title,task?.title || 'Saved focus session');text(view.status,label);text(view.clock,frame.text || '--:--');
  view.open.disabled=!task || task.done || !dailySuggestionProjection(task).editable || dailySuggestionProjection(task).blocked;
  view.dismiss.disabled=frame.phase==='invalid';view.expected=LifeStateMerge.copy(timer);
}
function openDailyPreferences() {
  const dialog=dailyDialog('Customize Today'),session=dailySession(),boardId=state.activeBoardId,day=getTodayKey(),mode=state.ui.workspaceMode;
  const message=planningNode('p','daily-message daily-preference-message');message.setAttribute('role','status');
  const current=()=>dialog.open && dialog.isConnected && !dialog.hidden && document.getElementById('dailyDialog')===dialog && boardId===state.activeBoardId && day===getTodayKey() && mode===state.ui.workspaceMode && dailySession()===session;
  const commit=(change,restore)=>{
    if(!current())return false;
    change();
    if(!saveDailyDraft(boardId,{silent:true})){restore();message.dataset.state='error';message.textContent='Preference was not saved. The previous setting is kept; please retry.';return false;}
    message.dataset.state='kept';message.textContent='Preference saved on this tab.';renderCardsOnly({force:true});return true;
  };
  for(const [key,label] of [['health','Food & movement'],['followups','Waiting task follow-ups'],['agenda','Upcoming activities'],['routine','Priority progress'],['diary','Diary'],['sidenote','Quick notes']]){
    const row=planningNode('label','daily-check'),check=planningInput('checkbox','',()=>{});check.checked=session.sections[key]!==false;
    check.onchange=()=>{
      const had=Object.hasOwn(session.sections,key),before=session.sections[key],value=check.checked;
      if(!commit(()=>session.sections[key]=value,()=>{if(had)session.sections[key]=before;else delete session.sections[key];}))check.checked=session.sections[key]!==false;
    };row.append(check,planningNode('span','',label));dialog.append(row);
    if(['diary','sidenote'].includes(key)){
      const cards=state.cards.filter(c=>c.type===key);
      if(cards.length>1){
        let selected;
        const choice=planningSelect(cards.map(c=>[c.id,c.title]),session.cardChoices?.[key] || cards[0].id,value=>{
          if(!current()){choice.value=selected;return;}
          const matches=[...state.cards,...getArchivedCards()].filter(c=>c.id===value);
          if(matches.length!==1 || matches[0].type!==key || !state.cards.includes(matches[0])){choice.value=selected;message.dataset.state='error';message.textContent='The selected card changed or moved. Reopen Customize Today.';return;}
          const had=Object.hasOwn(session,'cardChoices'),before=session.cardChoices;
          if(commit(()=>session.cardChoices={...(before || {}),[key]:value},()=>{if(had)session.cardChoices=before;else delete session.cardChoices;}))selected=value;
          else choice.value=selected;
        });selected=choice.value;dialog.append(planningField(label+' card',choice));
      }
    }
  }
  dialog.append(message);
}
function dailyCapacityText(capacity){
  const parts=[];
  if(capacity.estimated)parts.push(capacity.total+' minutes estimated'+(capacity.available!==null?' / '+capacity.available+' available':''));
  else if(capacity.available!==null)parts.push(capacity.available+' minutes available');
  if(capacity.missing)parts.push(capacity.missing+' step'+(capacity.missing===1?'':'s')+' without an estimate');
  if(capacity.invalid || capacity.invalidBudget)parts.push('Check your time estimates');
  if(capacity.overBy)parts.push(capacity.overBy+' minutes over your available time');
  else if(capacity.remaining!==null && capacity.estimated)parts.push(capacity.remaining+' minutes unallocated');
  return parts.join(' · ');
}
function dailyMinuteChoices(input,values,label,canApply){
  const root=planningNode('div','daily-minute-choices');root.setAttribute('role','group');root.setAttribute('aria-label',label);
  const buttons=[];
  const apply=value=>{if(!root.isConnected || !input.isConnected || root.closest('dialog')?.open===false || !canApply())return;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
  for(const value of values){const button=planningButton(value+' min',()=>apply(String(value)));button.setAttribute('aria-label',label+': '+value+' minutes');buttons.push([button,value]);root.append(button);}
  const clear=planningButton('',()=>apply(''),'x');clear.setAttribute('aria-label','Clear '+label.toLowerCase());clear.title=clear.getAttribute('aria-label');root.append(clear);
  const refresh=()=>{for(const [button,value] of buttons)button.setAttribute('aria-pressed',String(input.value!=='' && Number(input.value)===value));clear.disabled=input.value==='';};
  input.addEventListener('input',refresh);refresh();return root;
}
function openDailyFocus() {
  const dialog=dailyDialog('Choose up to three next steps'),day=getTodayKey(),boardId=state.activeBoardId,mode=state.ui.workspaceMode,items=getWorkspaceTaskItems().filter(item=>item.sourceKind!=='card' || item.editable),session=dailySession(),ownerId=state.cloudOwnerId || '',restoreId=readRestoreGuard().id || '';
  const baseline=LifeStateMerge.copy(latestDailyRecord('focus',day) || null);
  const history=()=>dailyRecords().filter(record=>record.kind==='focus' && record.date===day).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const baselineHistory=LifeStateMerge.copy(history());let recordedHistory=null,busy=false,deviceConfirmed=false,submittedDraft,submittedDraftRef;
  dialog.addEventListener('close',()=>{
    if(boardId!==state.activeBoardId || day!==getTodayKey() || state.ui.workspaceMode!=='today')return;
    const slot=elements.boardGrid.querySelector('.daily-suggestion-slot');
    if(slot){const current=getWorkspaceTaskItems();slot.replaceChildren();renderDailySuggestions(slot,current,dailyFocusKeys(day,current),dailySession().light);}
  },{once:true});
  const drafts=session.focusDrafts ||= {};const previous=drafts[day] || baseline,selected=new Set((previous?.taskKeys || dailyFocusKeys(day,items)).filter(key=>items.some(t=>dailyFocusKey(t)===key))),plans=LifeStateMerge.copy(previous?.plans || {});
  const summary=planningNode('p','daily-plan-capacity');summary.setAttribute('aria-live','polite');summary.setAttribute('aria-atomic','true');
  const refreshCapacity=()=>{const capacity=LifeMomentum.capacity([...selected].map(key=>plans[key]?.minutes),budget.value);summary.textContent=(selected.size?selected.size+' next step'+(selected.size===1?'':'s'):'No next steps selected')+(dailyCapacityText(capacity)?' · '+dailyCapacityText(capacity):'');};
  const draftFeedback=planningNode('div','daily-draft-feedback'),draftStatus=planningNode('p','daily-draft-status');draftStatus.setAttribute('aria-live','polite');
  const draftReceipt=saved=>{draftStatus.textContent=saved?'Draft saved on this tab.':'Draft not saved on this tab. Keep this page open and retry.';draftStatus.classList.toggle('is-error',!saved);retryDraft.hidden=saved;};
  const keepDraft=()=>{
    if(!canApply())return false;
    session.focusDrafts[day]={...LifeStateMerge.copy(session.focusDrafts[day] || {}),taskKeys:[...selected],plans:LifeStateMerge.copy(plans),budgetMinutes:budget.value,baseFocusId:baseline?.id || null};
    const saved=saveDailyDraft(boardId);draftReceipt(saved);refreshCapacity();return saved;
  };
  const budget=planningInput('number',previous?.budgetMinutes || '',()=>keepDraft());budget.min=1;budget.max=1440;budget.step=1;
  dialog.classList.add('daily-focus-dialog');
  const current=()=>dialog.open && dialog.isConnected && !dialog.hidden && dialog.getClientRects().length>0 && document.getElementById('dailyDialog')===dialog && boardId===state.activeBoardId && day===getTodayKey() && state.ui.workspaceMode===mode && dailySession()===session && (state.cloudOwnerId || '')===ownerId && (readRestoreGuard().id || '')===restoreId;
  const canApply=(cleanup=false)=>{
    if(busy)return false;
    if(boardId!==state.activeBoardId || day!==getTodayKey()){message.textContent='The board or day changed. Reopen Choose on the original board. Your draft is kept.';return false;}
    if(!current())return false;
    if(session.focusDrafts!==drafts){message.textContent='Your draft changed elsewhere. It has been kept; reopen Choose.';return false;}
    if(recordedHistory && !cleanup){message.textContent='Your plan was recorded. Retry draft cleanup before editing.';return false;}
    return true;
  };
  const retryDraft=planningButton('Retry draft save',()=>keepDraft(),'rotate-ccw');retryDraft.hidden=true;draftFeedback.append(draftStatus,retryDraft);
  dialog.append(planningField('Available minutes (optional)',budget),dailyMinuteChoices(budget,[30,60,120,240],'Available time',canApply),summary);
  const message=planningNode('p','daily-message daily-focus-message');message.setAttribute('role','status');
  dialog.append(draftFeedback);
  if(session.focusDrafts[day]){let persisted;try{persisted=JSON.parse(sessionStorage.getItem(LifeStorageScope.key('life-os-daily:'+boardId)) || '{}').focusDrafts?.[day];}catch{}draftReceipt(LifeStateMerge.equal(persisted,session.focusDrafts[day]));}
  if(session.focusDrafts[day] && session.focusDrafts[day].baseFocusId!==(baseline?.id || null)){
    const current=dailyFocusKeys(day,items).map(key=>items.find(item=>dailyFocusKey(item)===key)?.title || 'Task no longer available');
    dialog.append(planningNode('p','daily-focus-comparison','Your retained draft is shown below. Current saved choices: '+(current.join('; ') || 'None')+'.'));
  }
  const search=planningInput('search','',()=>{});search.placeholder='Find a task';search.setAttribute('aria-label','Find a next step');dialog.append(search);
  const list=planningNode('div','daily-focus-options');dialog.append(list);
  items.filter(t=>!t.done || selected.has(dailyFocusKey(t))).forEach(t=>{
    const key=dailyFocusKey(t),row=planningNode('label','daily-check'),check=planningInput('checkbox','',()=>{});check.checked=selected.has(key);check.setAttribute('aria-label',t.title);row.dataset.search=[t.title,t.sourceTitle,t.group].filter(Boolean).join(' ').toLocaleLowerCase();
    check.onchange=()=>{if(!canApply())return;if(check.checked && selected.size>=3){check.checked=false;message.textContent='Three selected. Uncheck one to choose another.';return;}check.checked?selected.add(key):selected.delete(key);refreshChoice();message.textContent='';keepDraft();};
    const copy=planningNode('span','',t.title);if(t.sourceKind==='card')copy.append(planningNode('small','daily-task-source',t.sourceLabel+' · '+t.sourceTitle));row.append(check,copy);
    const wrapper=planningNode('div','daily-choice');wrapper.dataset.search=row.dataset.search;
    const more=planningNode('details','daily-step-plan');more.append(planningNode('summary','','Plan this step'));
    const plan=plans[key] ||= {nextAction:t.nextAction || '',minutes:t.estimatedMinutes || '',startTime:t.startTime || ''};
    const minutes=planningInput('number',plan.minutes,value=>{if(!canApply())return;plan.minutes=value;keepDraft();});minutes.min=1;minutes.max=1440;minutes.step=1;
    const quick=dailyMinuteChoices(minutes,[5,15,30,60],'Estimate for '+t.title,canApply);
    const refreshChoice=()=>{quick.hidden=!check.checked;more.hidden=!check.checked;};
    more.append(planningField('Estimated minutes: '+t.title,minutes),planningField('Next action: '+t.title,planningInput('text',plan.nextAction,value=>{if(!canApply())return;plan.nextAction=value;keepDraft();})),planningField('Start time: '+t.title,planningInput('time',plan.startTime,value=>{if(!canApply())return;plan.startTime=value;keepDraft();})));
    wrapper.append(row,quick,more);refreshChoice();list.append(wrapper);
  });search.oninput=()=>list.querySelectorAll('.daily-choice').forEach(row=>row.hidden=!row.dataset.search.includes(search.value.toLocaleLowerCase()));
  const refreshControls=()=>{
    if(busy)dialog.setAttribute('aria-busy','true');else dialog.removeAttribute('aria-busy');
    for(const input of dialog.querySelectorAll('input, .daily-minute-choices button'))input.disabled=busy || Boolean(recordedHistory);
    save.disabled=busy;retryDraft.disabled=busy;retryDraft.hidden=Boolean(recordedHistory) || retryDraft.hidden;
  };
  const draftCurrent=()=>session.focusDrafts===drafts && drafts[day]===submittedDraftRef && LifeStateMerge.equal(drafts[day],submittedDraft);
  const finish=()=>{
    if(!current() || !deviceConfirmed)return;
    if(!LifeStateMerge.equal(history(),recordedHistory)){message.textContent='Your next steps changed in another tab. Your draft is kept; reopen Choose to review the latest plan.';return;}
    if(!draftCurrent()){message.textContent='Your next-step draft changed elsewhere. It has been kept; reopen Choose.';return;}
    const hadDraft=Object.hasOwn(session.focusDrafts,day),draft=session.focusDrafts[day];delete session.focusDrafts[day];
    if(!saveDailyDraft(boardId)){
      if(hadDraft)session.focusDrafts[day]=draft;
      message.textContent='Your plan was recorded, but its tab draft could not be cleared. Keep this page open and retry.';
      save.setAttribute('aria-label','Retry draft cleanup');save.querySelector('span').textContent='Retry draft cleanup';retryDraft.hidden=true;
      for(const input of dialog.querySelectorAll('input, .daily-minute-choices button'))input.disabled=true;
      return;
    }
    dialog.close();renderCardsOnly({force:true});
  };
  const save=planningButton('Keep next steps',async()=>{
    if(!canApply(true))return;
    if(recordedHistory && !LifeStateMerge.equal(history(),recordedHistory)){message.textContent='Your next steps changed in another tab. Your draft is kept; reopen Choose to review the latest plan.';return;}
    if(recordedHistory && !draftCurrent()){message.textContent='Your next-step draft changed elsewhere. It has been kept; reopen Choose.';return;}
    if(!recordedHistory){
      if(!LifeStateMerge.equal(history(),baselineHistory)){message.textContent='Your next steps changed in another tab. Your draft is kept; reopen Choose to review the latest plan.';return;}
      const live=getWorkspaceTaskItems();
      if([...selected].some(key=>live.filter(item=>dailyFocusKey(item)===key && (item.sourceKind!=='card' || item.editable)).length!==1)){message.textContent='A selected task moved or is no longer available. Your draft is kept; reopen Choose to review it.';return;}
      const validMinutes=value=>value==='' || Number.isInteger(Number(value)) && Number(value)>0 && Number(value)<=1440;
      if(!validMinutes(budget.value) || [...selected].some(key=>!validMinutes(plans[key].minutes))){message.textContent='Use whole minutes between 1 and 1440.';return;}
      const fields={taskKeys:[...selected],plans:Object.fromEntries([...selected].map(key=>[key,plans[key]])),budgetMinutes:budget.value?Number(budget.value):null};
      const unchanged=baseline && LifeStateMerge.equal(fields,{taskKeys:baseline.taskKeys,plans:baseline.plans,budgetMinutes:baseline.budgetMinutes});
      if(!unchanged && !saveDailyRecord({kind:'focus',date:day,...fields},message))return;
      recordedHistory=LifeStateMerge.copy(history());submittedDraftRef=drafts[day];submittedDraft=LifeStateMerge.copy(submittedDraftRef);
    }
    busy=true;refreshControls();message.dataset.state='saving';message.textContent='Confirming device save...';
    try{
      if(!deviceConfirmed){try{deviceConfirmed=await flushDeviceWrites()===true;}catch{/* Preserve the staged plan and full draft for retry. */}}
      if(!current()){
        if(dialog.open && dialog.isConnected && !dialog.hidden && document.getElementById('dailyDialog')===dialog)message.textContent='This plan, board, day or account changed. Your draft is kept; reopen Choose.';
        return;
      }
      if(!LifeStateMerge.equal(history(),recordedHistory) || !draftCurrent()){message.textContent='Your plan or draft changed elsewhere. Both have been kept; reopen Choose.';return;}
      if(!deviceConfirmed){message.textContent='Device save is not confirmed. Your plan and full draft are kept; please retry.';save.setAttribute('aria-label','Retry plan save');save.querySelector('span').textContent='Retry plan save';return;}
      finish();
    }finally{busy=false;message.dataset.state='error';refreshControls();}
  },'check');dialog.append(message,save);refreshCapacity();
}
function dailySuggestionProjection(item) {
  return {key:dailyFocusKey(item),title:item.title,dateKey:item.dateKey || '',deadline:item.deadline || '',priority:item.priority || 'normal',status:item.status || 'todo',done:Boolean(item.done),
    editable:item.sourceKind!=='card' || item.editable,coachingProgramId:item.coachingProgramId || '',
    blocked:dailyTaskCompletionPending(item.card.id,item.sourceKind==='card'?item.ref.itemId:item.taskId,item.sourceKind) || [...state.cards,...getArchivedCards()].filter(card=>card.id===item.card.id).length!==1,
    area:[item.area,item.group,item.card.category].find(value=>typeof value==='string' && value.trim()) || 'Unsorted'};
}
function chooseDailySuggestion(boardId,day,expected,message) {
  if(boardId!==state.activeBoardId || day!==getTodayKey()){message.textContent='The board or day changed. Reopen Today before choosing.';return false;}
  const session=dailySession(),all=getWorkspaceTaskItems(),keys=dailyFocusKeys(day,all),current=all.filter(item=>dailyFocusKey(item)===expected.key);
  if(session.focusDrafts?.[day]){message.textContent='Your next-step draft is kept. Use Choose to finish it first.';return false;}
  if(keys.includes(expected.key)){message.textContent='Already in your next steps.';return false;}
  if(keys.length>=3){message.textContent='Three next steps are already chosen. Use Choose to change your plan.';return false;}
  if(current.length!==1 || !LifeStateMerge.equal(dailySuggestionProjection(current[0]),expected) || !LifeMomentum.suggest([expected],{today:day}).length){message.textContent='This task changed. Reopen Today to choose its current version.';return false;}
  const previous=latestDailyRecord('focus',day),plans=LifeStateMerge.copy(previous?.plans || {}),item=current[0];
  plans[expected.key]={nextAction:item.nextAction || '',minutes:item.estimatedMinutes || '',startTime:item.startTime || ''};
  if(!saveDailyRecord({kind:'focus',date:day,taskKeys:[...keys,expected.key],plans,budgetMinutes:previous?.budgetMinutes || null},message))return false;
  renderCardsOnly({force:true});
  [...elements.boardGrid.querySelectorAll('.daily-focus-step')].find(step=>step.dataset.focusKey===expected.key)?.querySelector('.daily-step-tools button')?.focus({preventScroll:true});return true;
}
function renderDailySuggestions(root,all,selected,light) {
  if(selected.length>=3 || light && selected.length)return;
  const day=getTodayKey(),boardId=state.activeBoardId;
  if(dailySession().focusDrafts?.[day]){root.append(planningButton('Resume next-step draft',openDailyFocus,'pencil'));return;}
  const projected=all.map(dailySuggestionProjection),suggestions=LifeMomentum.suggest(projected,{today:day,selected,limit:light?1:3-selected.length});
  if(!suggestions.length)return;
  const section=planningNode(selected.length?'details':'section','daily-suggestions');
  section.append(planningNode(selected.length?'summary':'h4','',selected.length?'Choose another step':'A place to start'));
  const list=planningNode('ul','daily-suggestion-list'),message=planningNode('p','daily-message');message.setAttribute('role','status');
  for(const suggestion of suggestions){
    const row=planningNode('li'),copy=planningNode('span','daily-suggestion-copy');copy.append(planningNode('strong','',suggestion.title),planningNode('small','',suggestion.area+' · '+suggestion.reason));
    const expected=projected.find(item=>item.key===suggestion.key),button=planningButton('',()=>chooseDailySuggestion(boardId,day,expected,message));
    button.className='daily-suggestion-choice';button.setAttribute('aria-label','Choose for today: '+suggestion.title);
    const icon=planningNode('span','daily-suggestion-add');icon.dataset.icon='plus';icon.setAttribute('aria-hidden','true');
    button.replaceChildren(copy,icon);row.append(button);list.append(row);
  }
  section.append(list,message);root.append(section);
}
function dailyUpcoming(start,end='9999-12-31') {
  const activities=calendarActivities().filter(({activity:a})=>a.allDay?a.endDate>=start && a.startDate<=end:LifePlanning.localInput(a.endAt || a.startAt).slice(0,10)>=start && LifePlanning.localInput(a.startAt).slice(0,10)<=end)
    .map(({activity:a})=>({title:a.title,date:a.allDay?(a.startDate<start?start:a.startDate):LifePlanning.localInput(a.startAt).slice(0,10),detail:'Activity · '+formatActivityTiming(a)}));
  const tasks=getWorkspaceTaskItems().filter(t=>!t.done && t.status!=='parked' && LifePlanner.validDate(t.dateKey) && t.dateKey>=start && t.dateKey<=end)
    .map(t=>({title:t.title,date:t.dateKey,detail:'Task · '+formatPlannerDate(t.dateKey)}));
  return [...activities,...tasks].sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
function openDailyStart(item,plan={}) {
  const dialog=dailyDialog(item.title),session=dailySession(),key=dailyFocusKey(item),boardId=state.activeBoardId,day=getTodayKey(),mode=state.ui.workspaceMode,ownerId=state.cloudOwnerId || '',restoreId=readRestoreGuard().id || '';
  dialog.classList.add('daily-start-dialog');
  const snapshot=task=>task.sourceKind==='card'?task.base:LifePlanner.ensure(task.card).find(t=>t.id===task.taskId);
  const expected=LifeStateMerge.copy(snapshot(item));let busy=false,recorded=null,completionFeedback=null;
  const current=()=>dialog.open && dialog.isConnected && !dialog.hidden && dialog.getClientRects().length>0 && document.getElementById('dailyDialog')===dialog && boardId===state.activeBoardId && day===getTodayKey() && state.ui.workspaceMode===mode && dailySession()===session && (state.cloudOwnerId || '')===ownerId && (readRestoreGuard().id || '')===restoreId;
  const lookup=()=>{
    if(!current())return null;
    const matches=getWorkspaceTaskItems().filter(task=>dailyFocusKey(task)===key);
    return matches.length===1 && (matches[0].sourceKind!=='card' || matches[0].editable) && !dailySuggestionProjection(matches[0]).blocked?matches[0]:null;
  };
  const liveTask=()=>{const task=lookup();return task && LifeStateMerge.equal(snapshot(task),recorded || expected)?task:null;};
  const nextAction=plan.nextAction || item.nextAction || '';
  if(nextAction && nextAction!==item.title)dialog.append(planningNode('p','daily-next-action',nextAction));
  if(plan.startTime)dialog.append(planningNode('small','daily-muted','Planned start · '+plan.startTime));
  const display=planningNode('output','daily-focus-clock'),status=planningNode('p','daily-muted'),choices=planningNode('div','daily-start-choices'),actions=planningNode('div','daily-actions'),message=planningNode('p','daily-message daily-start-message');
  display.setAttribute('aria-label','Focus time remaining');display.setAttribute('aria-live','off');status.setAttribute('role','status');message.setAttribute('role','status');choices.setAttribute('role','group');choices.setAttribute('aria-label','Start a focus session');
  const remaining=timer=>dailyFocusTimerState(timer).remainingMs || 0;
  const canAct=()=>{
    if(busy || !current())return false;
    if(recorded){message.textContent='Completion is awaiting device confirmation. Retry completion saving before changing the session.';return false;}
    const task=liveTask();
    if(!task){message.textContent='This task, board or day changed. Reopen Start before continuing.';return false;}
    if(task.done){message.textContent='This task is already completed. It has not been reopened.';return false;}
    return true;
  };
  const commitTimer=next=>{
    const hadTimer=Object.hasOwn(session,'focusTimer'),before=session.focusTimer;
    if(next===undefined)delete session.focusTimer;else session.focusTimer=next;
    const saved=saveDailyDraft(boardId);
    if(!saved){if(hadTimer)session.focusTimer=before;else delete session.focusTimer;}
    message.textContent=saved?'':'Timer change was not saved. The previous session is kept; please retry.';
    render();refreshDailyFocusSession();return saved;
  };
  const start=minutes=>{
    if(!canAct())return;
    if(!Number.isInteger(minutes) || minutes<1 || minutes>180){message.textContent='Use whole minutes between 1 and 180.';return;}
    if(dailyFocusTimerState(session.focusTimer).phase==='invalid'){message.textContent='The saved timer needs review. It has been kept unchanged.';return;}
    if(remaining(session.focusTimer)>0){message.textContent='A timer is already active. Pause, resume or reset it before starting again.';return;}
    commitTimer({key,endAt:Date.now()+minutes*60000});
  };
  const presetButtons=[5,15,25].map(minutes=>planningButton('Start '+minutes+' minutes',()=>start(minutes),'play'));choices.append(...presetButtons);
  const custom=planningNode('details','daily-start-custom'),customRow=planningNode('div','daily-actions'),minutes=planningInput('number','',()=>{});
  minutes.min='1';minutes.max='180';minutes.step='1';minutes.inputMode='numeric';
  const customStart=planningButton('Start custom session',()=>start(minutes.value===''?NaN:Number(minutes.value)),'play');customRow.append(planningField('Custom minutes',minutes),customStart);custom.append(planningNode('summary','','Custom duration'),customRow);
  const pause=planningIcon('Pause timer',()=>{
    if(!canAct())return;const timer=session.focusTimer;if(timer?.key!==key || !timer.endAt || !remaining(timer))return;
    const next={...timer,remaining:remaining(timer)};delete next.endAt;commitTimer(next);
  },'pause');
  const resume=planningIcon('Resume timer',()=>{
    if(!canAct())return;const timer=session.focusTimer;if(timer?.key!==key || timer.endAt || !remaining(timer))return;
    commitTimer({...timer,endAt:Date.now()+timer.remaining});
  },'play');
  const reset=planningIcon('Reset timer',()=>{if(!canAct() || session.focusTimer?.key!==key || dailyFocusTimerState(session.focusTimer).phase==='invalid')return;commitTimer(undefined);},'rotate-ccw');
  const render=()=>{
    if(!current())return;
    const timer=session.focusTimer?.key===key?session.focusTimer:null,ms=remaining(timer),seconds=Math.ceil(ms/1000),valid=Boolean(liveTask()),invalid=dailyFocusTimerState(session.focusTimer).phase==='invalid',active=remaining(session.focusTimer)>0;
    const text=recorded?'Completion pending':invalid?'Timer needs review':timer?(seconds?String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):'Session finished'):'Ready to begin';
    const stateText=!valid?'Task changed - reopen Start':recorded?'Task stays completed while saving is retried':invalid?'Saved timer needs review':timer?ms?(timer.endAt?'Running':'Paused'):'Timer finished - task stays open until marked done':active?'Another task has an active timer':'';
    if(display.textContent!==text)display.textContent=text;
    display.classList.toggle('is-idle',Boolean(recorded) || !timer || !ms);
    if(status.textContent!==stateText)status.textContent=stateText;
    if(busy)dialog.setAttribute('aria-busy','true');else dialog.removeAttribute('aria-busy');
    minutes.disabled=busy || Boolean(recorded);
    for(const button of [...presetButtons,customStart])button.disabled=busy || Boolean(recorded) || !valid || invalid || active || item.done;
    pause.hidden=!timer || !timer.endAt || !ms;resume.hidden=!timer || Boolean(timer.endAt) || !ms;
    pause.disabled=resume.disabled=reset.disabled=busy || Boolean(recorded) || !valid || invalid || !timer || item.done;
    complete.disabled=busy || !valid;
    const label=recorded?'Retry completion save':'Mark done';if(complete.getAttribute('aria-label')!==label){complete.setAttribute('aria-label',label);complete.querySelector('span').textContent=label;}
  };
  actions.append(pause,resume,reset);dialog.append(display,status,choices,custom,actions,message);
  const complete=planningButton('Mark done',async()=>{
    if(busy || !current())return;
    if(recorded && !liveTask()){message.textContent='The recorded completion changed elsewhere. It has been kept; reopen the task to review it.';return;}
    if(!recorded && !canAct())return;
    busy=true;render();
    try{
      if(!recorded){
        if(item.sourceKind==='card'){
          if(!await confirmParentTaskCompletion(expected,true))return;
          if(!liveTask())throw new Error('This task, board, day or account changed. Reopen Start before completing.');
          const transaction=saveCardTaskChange(item.ref,expected,{done:true},day);completionFeedback=()=>showCardTaskUndo(transaction);
        }else{
          const task=LifePlanner.ensure(resolveLiveCard(item.card)).find(t=>t.id===item.taskId);
          if(!LifeStateMerge.equal(task,expected))throw new Error('This task changed elsewhere. Reopen the current task before completing.');
          if(task.done)throw new Error('This task is already completed. It has not been reopened.');
          if(!await togglePlannerTaskDone({...item,dateKey:day},{canCommit:()=>Boolean(liveTask()),onFeedback:feedback=>completionFeedback=feedback})){
            if(!lastLocalSaveOk)message.textContent='Completion was not saved. Please retry.';
            else if(!liveTask())message.textContent='This task, board, day or account changed. Reopen Start before completing.';
            return;
          }
        }
        const saved=lookup();if(!saved?.done)throw new Error('The task or account changed. Reopen the task to review its completion.');recorded=LifeStateMerge.copy(snapshot(saved));
      }
      render();message.dataset.state='saving';message.textContent='Confirming completion save...';
      let confirmed=false;try{confirmed=await flushDeviceWrites();}catch{/* Retain the same completion for explicit retry. */}
      if(!current()){
        if(dialog.open && dialog.isConnected && !dialog.hidden && document.getElementById('dailyDialog')===dialog)message.textContent='This task, board, day or account changed. Your recorded completion has been kept; reopen the task.';
        return;
      }
      if(!liveTask()){message.textContent='The recorded completion changed elsewhere. Both versions have been kept; reopen the task to review it.';return;}
      if(confirmed!==true){message.textContent='Device save is not confirmed. Your completion is kept here; please retry.';return;}
      const feedback=completionFeedback;completionFeedback=null;dialog.close();renderCardsOnly({force:true});feedback?.();
    }catch(error){message.textContent=error.message;}
    finally{busy=false;dialog.removeAttribute('aria-busy');message.dataset.state='error';render();}
  },'check');complete.classList.add('daily-completion-button');actions.append(complete);
  render();const interval=setInterval(render,500);dialog.addEventListener('close',()=>{clearInterval(interval);refreshDailyFocusSession();},{once:true});
}
function openDailyStepOptions(item) {
  const boardId=state.activeBoardId,day=getTodayKey(),mode=state.ui.workspaceMode,session=dailySession(),key=dailyFocusKey(item),dialog=dailyDialog('Next-step options'),menu=planningNode('div','daily-menu'),message=planningNode('p','daily-message');
  dialog.classList.add('daily-step-options');message.setAttribute('role','status');dialog.append(planningNode('p','daily-step-option-title',item.title),menu,message);
  const raw=task=>task.sourceKind==='card'?task.base:LifePlanner.ensure(task.card).find(t=>t.id===task.taskId);
  const expected=LifeStateMerge.copy(raw(item)),projection=dailySuggestionProjection(item),baseline=LifeStateMerge.copy(latestDailyRecord('focus',day) || null);
  const history=()=>dailyRecords().filter(record=>record.kind==='focus' && record.date===day).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const beforeHistory=LifeStateMerge.copy(history()),keys=dailyFocusKeys(day,getWorkspaceTaskItems());
  const current=()=>dialog.open && dialog.isConnected && !dialog.hidden && document.getElementById('dailyDialog')===dialog && state.activeBoardId===boardId && getTodayKey()===day && state.ui.workspaceMode===mode && dailySession()===session;
  const live=()=>{
    if(!current())throw new Error('The board, day or options changed. Reopen the task options.');
    const matches=getWorkspaceTaskItems().filter(task=>dailyFocusKey(task)===key);
    if(matches.length!==1 || !LifeStateMerge.equal(raw(matches[0]),expected) || !LifeStateMerge.equal(dailySuggestionProjection(matches[0]),projection) || projection.blocked || !projection.editable)throw new Error('Task changed or moved. Reopen its options.');
    return matches[0];
  };
  const attempt=action=>{try{action();}catch(error){message.textContent=error.message;}};
  menu.append(planningButton('Continue',()=>attempt(()=>{const task=live();dialog.close();openDailyStart(task,baseline?.plans?.[key] || {});}), 'play'));
  if(Array.isArray(keys) && keys.includes(key))menu.append(planningButton("Remove from today's plan",()=>attempt(()=>{
    live();
    if(session.focusDrafts?.[day])throw new Error('Your next-step draft is kept. Finish it in Choose before changing the saved plan.');
    if(!LifeStateMerge.equal(history(),beforeHistory))throw new Error('The plan changed in another tab. Reopen its options before changing it.');
    if(!baseline || keys.filter(value=>value===key).length!==1 || baseline.plans!==undefined && (!baseline.plans || typeof baseline.plans!=='object' || Array.isArray(baseline.plans)))throw new Error('The saved plan needs review. Original information was kept.');
    const plans=LifeStateMerge.copy(baseline.plans || {});delete plans[key];
    if(!saveDailyRecord({...LifeStateMerge.copy(baseline),taskKeys:keys.filter(value=>value!==key),plans},message))return;
    const afterHistory=LifeStateMerge.copy(history());dialog.close();renderCardsOnly({force:true});
    const undo=()=>{
      try{
        if(state.activeBoardId!==boardId || getTodayKey()!==day || state.ui.workspaceMode!=='today' || document.querySelector('dialog[open]') || dailySession()!==session || session.focusDrafts?.[day] || !LifeStateMerge.equal(history(),afterHistory))throw new Error('The view, board, day or plan changed. Undo was not applied.');
        const available=getWorkspaceTaskItems();if(keys.some(value=>available.filter(task=>dailyFocusKey(task)===value).length!==1))throw new Error('An original task moved. Undo was not applied.');
        if(!saveDailyRecord(LifeStateMerge.copy(baseline))){setSaveStatus('Undo was not saved. The current plan is kept; retry.','error');showUndoToast({message:'Undo was not saved. Retry Undo.',onUndo:undo});return;}
        clearUndoToast();renderCardsOnly({force:true});
      }catch(error){clearUndoToast();setSaveStatus(error.message,'error');}
    };
    showUndoToast({message:"Removed from today's plan. Task kept in All tasks.",onUndo:undo});
  }),'x'));
  if(item.sourceKind==='card'){menu.append(planningButton('Edit / plan task',()=>attempt(()=>{const task=live();dialog.close();openCardTaskEditor(task);}), 'pencil'));return;}
  const apply=updates=>{
    const currentTask=live(),card=currentTask.card,tasks=LifePlanner.ensure(card),task=tasks.find(task=>task.id===item.taskId),before=LifeStateMerge.copy(task);
    LifePlanner.change(card,task.id,updates);LifePlanner.project(card);
    if(!saveState()){tasks.splice(tasks.findIndex(task=>task.id===item.taskId),1,before);LifePlanner.project(card);syncActiveBoard({touchBoard:false});throw new Error('Not saved. Please retry.');}
    dialog.close();renderCardsOnly({force:true});
  };
  const statuses=planningNode('div','daily-actions');
  for(const [label,status] of [['Waiting','waiting'],['Park','parked']])statuses.append(planningButton(label,()=>attempt(()=>apply({status})),'pause'));
  menu.append(statuses);
  const date=planningInput('date',item.dateKey || day,()=>{});menu.append(planningField('New planned day',date),planningButton('Reschedule',()=>attempt(()=>{
    if(!LifePlanner.validDate(date.value))throw new Error('Choose a valid planned day. The task is unchanged.');apply({dateKey:date.value});
  }),'calendar'));
}
function openTaskHistory(item) {
  closeCardActionMenus();const dialog=dailyDialog('Task history · '+item.title);
  let record;
  try {
    if(item.sourceKind==='card'){
      const board={id:state.activeBoardId,cards:[...state.cards,...getArchivedCards()]};
      const matches=LifeTaskRepository.collect(board,{includeArchived:true}).filter(row=>LifeStateMerge.equal(row.ref,item.ref));
      if(matches.length===1)record=matches[0].base;
    }else record=LifePlanner.ensure(resolveLiveCard(item.card)).find(t=>t.id===item.taskId);
  }catch(error){dialog.append(planningNode('p','daily-message',error.message));return;}
  if(!record){dialog.append(planningNode('p','daily-message','Task changed elsewhere. Reopen its history.'));return;}
  const events=dailyHistoryEvents(item.sourceKind==='card'?record.taskCompletionEvents:record.completionEvents).map(e=>item.sourceKind==='card'?{...e,completedOn:e.on,completedAt:e.at}:e);
  if(!events.length)dialog.append(planningNode('p','daily-muted',record.done?'Completed · '+(item.completedOn || record.completedOn || 'Date not recorded'):'No completion actions recorded.'));
  for(const event of events.slice().sort((a,b)=>b.recordedAt-a.recordedAt)){
    const row=planningNode('section','daily-history-row');row.append(planningNode('strong','',(event.done?'Completed · '+(LifePlanner.validDate(event.completedOn)?event.completedOn:'Date not recorded'):'Reopened')+(event.excludedAt?' · Excluded after comparison':'')),planningNode('p','daily-muted',dailyHistoryTimestamp(event.recordedAt)?'Recorded '+formatRecordDateTime(event.recordedAt):'Recording time not recorded'));
    if(dailyHistoryTimestamp(event.completedAt))row.append(planningNode('small','',formatRecordDateTime(event.completedAt)));dialog.append(row);
  }
}
function dailyHistoryEvents(value) {return Array.isArray(value)?value.filter(e=>e && typeof e==='object' && typeof e.done==='boolean'):[];}
function dailyHistoryTimestamp(value) {return typeof value==='number' && value>0 && Number.isFinite(new Date(value).getTime());}
function dailyWeekStart(day) {return LifePlanning.shift(day,-((new Date(day+'T12:00:00').getDay()+6)%7));}
function dailyTaskCompletionPending(cardId,taskId,sourceKind) {
  return (state.syncConflicts || []).some(conflict=>{
    const p=conflict.segments || [];
    return p[0]==='boards' && p[1]===state.activeBoardId && p[3]===cardId && (sourceKind==='card'?conflict.kind==='task-completion' && (p.length===5 || p[5]===taskId):conflict.kind==='planner-task' && p[5]===taskId);
  });
}
function dailyCompletedTasks(start,end) {
  const rows=[];
  const add=(task,key,events)=>{
    const known=events.filter(e=>!e.excludedAt && LifePlanner.validDate(e.completedOn) && dailyHistoryTimestamp(e.completedAt) && e.completedOn>=start && e.completedOn<=end);
    for(const day of new Set(known.map(e=>e.completedOn))){const event=known.filter(e=>e.completedOn===day).sort((a,b)=>b.completedAt-a.completedAt)[0];rows.push({...task,...event,reportKey:key+':'+day});}
  };
  for(const card of getPlannerSourceCards())for(const task of LifePlanner.ensure(card).filter(t=>!t.deletedAt && !dailyTaskCompletionPending(card.id,t.id,'planner')))add({...task,card,taskId:task.id},JSON.stringify([card.id,task.id]),[
    ...dailyHistoryEvents(task.completionEvents).filter(e=>e.done),...(task.done && task.completedOn?[{completedOn:task.completedOn,completedAt:task.completedAt}]:[])]);
  const board={id:state.activeBoardId,cards:[...state.cards,...getArchivedCards()]};
  for(const item of LifeTaskRepository.collect(board,{includeArchived:true})){
    if(dailyTaskCompletionPending(item.ref.cardId,item.ref.itemId,'card'))continue;
    const target=item.base;
    add(item,JSON.stringify(item.ref),[...dailyHistoryEvents(target?.taskCompletionEvents).filter(e=>e.done && !e.excludedAt).map(e=>({completedOn:e.on,completedAt:e.at})),...(item.done && item.completedOn?[{completedOn:item.completedOn,completedAt:item.completedAt}]:[])]);
  }
  return rows;
}
function dailyReviewFacts(start,end) {
  const tasks=dailyCompletedTasks(start,end);
  const changes=currentCoachingPrograms().flatMap(program=>LifeCoaching.activeEntries(program,end).filter(e=>e.date>=start).map(entry=>({program,entry})));
  const next=LifePlanning.shift(end,1),until=LifePlanning.shift(end,7);
  const upcoming=dailyUpcoming(next,until);
  return {tasks,changes,upcoming};
}
function dailyFollowThrough(start,end) {
  const focuses=dailyRecords().filter(e=>e.kind==='focus' && e.date>=start && e.date<=end),days=[...new Set(focuses.map(e=>e.date))];
  return days.map(day=>{const versions=focuses.filter(e=>e.date===day).sort((a,b)=>a.recordedAt-b.recordedAt || a.id.localeCompare(b.id)),keys=versions[0].taskKeys || [],completed=dailyCompletedTasks(day,day);
    return {date:day,total:keys.length,done:keys.filter(key=>completed.some(t=>dailyFocusKey(t)===key)).length,revised:!LifeStateMerge.equal(keys,versions.at(-1).taskKeys)};});
}
function renderProgressHome() {
  const root=planningNode('section','progress-home'),today=getTodayKey();
  const view=dailySession().progressView==='goals'?'goals':'overview';
  const nav=planningNode('nav','progress-section-nav');nav.setAttribute('aria-label','Progress sections');
  for(const [key,label] of [['overview','Overview'],['goals','Goals & check-ins']]){
    const button=planningButton(label,()=>showProgressSection(key));button.setAttribute('aria-pressed',String(view===key));button.setAttribute('aria-controls',key==='overview'?'progressOverview':'progressGoals');nav.append(button);
  }
  root.append(nav);
  const overview=planningNode('div','progress-overview');overview.id='progressOverview';overview.hidden=view!=='overview';root.append(overview);
  renderMomentumProgress(overview);
  for(const program of currentCoachingPrograms()){
    const routine=LifeCoaching.metrics(program).some(m=>m.kind==='weekly');if(!routine)continue;
    const section=planningNode('details','momentum-routine-history'),weeks=LifeCoaching.latestWeeks(program,today),recent=Array.from({length:4},(_,i)=>LifePlanning.shift(LifeCoaching.weekStart(program,[today,program.endDate].sort()[0]),-7*i)).filter(day=>day>=program.startDate).reverse();
    section.append(planningNode('summary','','Routine history · '+program.title));
    const list=planningNode('div','progress-routine-weeks');
    for(const date of recent){const record=weeks.find(w=>w.date===date),row=planningNode('div','progress-routine-week');row.append(planningNode('strong','',formatPlannerOriginDate(date)),planningNode('small','',record?'Recorded':'Not recorded'));
      for(const [key,label] of [['exercise','Exercise'],['rest','Rest'],['personal','Personal time'],['reflection','Reflection']])row.append(planningNode('span',record?.[key]?'routine-recorded':'routine-unreported',(record?record[key]?'✓ ':'○ ':'— ')+label));list.append(row);
    }section.append(list);overview.append(section);
  }
  elements.boardGrid.append(root);
}
function showProgressSection(view) {
  if(!['overview','goals'].includes(view))return;
  if(isProtectedTextEditActive())document.activeElement?.blur();
  dailySession().progressView=view;saveDailyDraft();renderCardsOnly({force:true});
}
function appendDailyReviewFacts(root,start,end) {
  const {tasks,changes,upcoming}=dailyReviewFacts(start,end);
  const section=(label,lines)=>{const node=dailySection(label);for(const text of lines)node.append(planningNode('p','',text));if(!lines.length)node.append(planningNode('p','daily-muted','No records in this period.'));root.append(node);};
  section('Completed',tasks.map(t=>formatPlannerOriginDate(t.completedOn)+' · '+t.title));
  section('Priority updates',changes.map(({program,entry})=>entry.date+' · '+coachingEntryLabel(program,entry)+(entry.value!==undefined?' · '+entry.value:entry.entity?' · '+entry.entity:'')));
  section('Next seven days',upcoming.map(item=>item.title+' · '+item.detail));
  section('Chosen actions',dailyFollowThrough(start,end).sort((a,b)=>a.date.localeCompare(b.date)).map(row=>row.date+' · '+row.done+' / '+row.total+' original choices completed'+(row.revised?' · Plan revised':'')));
}
function openDailyReview(requestedWeek) {
  const dialog=dailyDialog('Weekly review'),session=dailySession(),boardId=state.activeBoardId,today=getTodayKey(),mode=state.ui.workspaceMode,ownerId=state.cloudOwnerId || '',restoreId=readRestoreGuard().id || '';dialog.classList.add('daily-review-dialog');
  const candidate=typeof requestedWeek==='string'?requestedWeek:session.reviewWeek;
  const week=LifePlanner.validDate(candidate) && candidate<=today?dailyWeekStart(candidate):dailyWeekStart(today);session.reviewWeek=week;
  const end=[LifePlanning.shift(week,6),today].sort()[0],message=planningNode('p','daily-message daily-review-message');message.setAttribute('role','status');
  let busy=false,recorded=null,cleanupPending=false,submittedDraft=null;
  const feedback=(text,kind='error')=>{message.textContent=text;message.dataset.state=kind;};
  const current=()=>dialog.open && dialog.isConnected && !dialog.hidden && dialog.getClientRects().length>0 && document.getElementById('dailyDialog')===dialog && boardId===state.activeBoardId && today===getTodayKey() && state.ui.workspaceMode===mode && dailySession()===session && session.reviewWeek===week && (state.cloudOwnerId || '')===ownerId && (readRestoreGuard().id || '')===restoreId;
  const canApply=()=>{
    if(busy)return false;
    if(boardId!==state.activeBoardId){feedback('The board changed. Your draft is kept on its original board; reopen the review there.');return false;}
    if(!current()){
      if(dialog.open && dialog.isConnected && !dialog.hidden && document.getElementById('dailyDialog')===dialog)feedback('This review, day or account changed. Your draft is kept; reopen the review.');
      return false;
    }
    if(session.reviews!==drafts || Object.hasOwn(drafts,week) && drafts[week]!==draft){feedback('Your draft changed elsewhere. It has been kept; reopen the review.');return false;}
    return true;
  };
  const nav=planningNode('div','daily-actions');
  const change=amount=>{
    if(!canApply() || cleanupPending)return;
    const target=LifePlanning.shift(week,amount);if(!LifePlanner.validDate(target) || target>today || !keepDraft())return;
    session.reviewWeek=target;
    if(!saveDailyDraft(boardId,{silent:true})){session.reviewWeek=week;feedback('Week change was not saved. Your current draft is kept; please retry.');return;}
    dialog.close();openDailyReview(target);
  };
  const next=planningIcon('Next week',()=>change(7),'chevron-right');next.disabled=LifePlanning.shift(week,7)>today;
  nav.append(planningIcon('Previous week',()=>change(-7),'chevron-left'),planningNode('strong','','Calendar week · '+week+' - '+end),next);dialog.append(nav);
  const facts=momentumWeek(week),overview=planningNode('dl','daily-review-overview');
  for(const [label,value] of [['Tasks completed',facts.total],['Days with a chosen plan',facts.plannedDays],['Days with writing',facts.writingDays]]){
    const item=planningNode('div');item.append(planningNode('dt','',label),planningNode('dd','',String(value)));overview.append(item);
  }dialog.append(overview);
  const previous=latestDailyRecord('review',week),drafts=session.reviews ||= {},draft=drafts[week] ||= {mattered:previous?.mattered || '',easier:previous?.easier || ''};
  const form=planningNode('form','daily-form'),inputs=[];
  const keepDraft=()=>{
    if(!canApply() || cleanupPending)return false;
    drafts[week]=draft;
    const kept=saveDailyDraft(boardId);retryDraft.hidden=kept;
    feedback(kept?'Draft saved on this tab.':'Draft not saved on this tab. Keep this page open and retry.',kept?'kept':'error');return kept;
  };
  for(const [key,label] of [['mattered','What mattered?'],['easier','What would make next week easier?']]){
    const input=planningNode('textarea');input.rows=3;input.value=draft[key];input.oninput=()=>{if(!canApply() || cleanupPending)return;draft[key]=input.value;draft.changed=true;keepDraft();};inputs.push(input);form.append(planningField(label,input));
  }
  const save=planningButton('Keep reflection',null,'check');save.type='submit';
  const retryDraft=planningButton('Retry reflection draft',()=>keepDraft(),'rotate-ccw');retryDraft.hidden=true;
  const retryCleanup=planningButton('Retry reflection draft cleanup',()=>{if(canApply())finish();},'rotate-ccw');retryCleanup.hidden=true;
  const actions=planningNode('div','daily-actions');actions.append(save,retryDraft,retryCleanup);form.append(message,actions);dialog.append(form);
  const refreshControls=()=>{
    if(busy)form.setAttribute('aria-busy','true');else form.removeAttribute('aria-busy');
    for(const input of inputs)input.disabled=busy || cleanupPending;
    save.disabled=busy || cleanupPending;retryDraft.disabled=busy;retryCleanup.disabled=busy;
    for(const button of nav.querySelectorAll('button'))button.disabled=busy || cleanupPending || button===next && LifePlanning.shift(week,7)>today;
  };
  const evidence=planningNode('details','daily-review-evidence');evidence.append(planningNode('summary','','Review task and priority details'));appendDailyReviewFacts(evidence,week,end);dialog.append(evidence);
  const history=planningNode('details','daily-review-history');
  const renderHistory=()=>{
    const records=dailyRecords().filter(e=>e.kind==='review' && e.date===week).sort((a,b)=>b.recordedAt-a.recordedAt);
    history.replaceChildren(planningNode('summary','','Reflection history ('+records.length+')'));
    records.forEach(e=>history.append(planningNode('small','',formatRecordDateTime(e.recordedAt)),planningNode('p','',e.mattered),planningNode('p','',e.easier)));
  };renderHistory();dialog.append(history);
  const recordedCurrent=()=>{
    const matches=dailyRecords().filter(record=>record.id===recorded?.id);
    return matches.length===1 && LifeStateMerge.equal(matches[0],recorded);
  };
  const draftCurrent=()=>session.reviews===drafts && (!Object.hasOwn(drafts,week) || drafts[week]===draft) && LifeStateMerge.equal(draft,submittedDraft);
  const finish=()=>{
    if(!current())return;
    if(!recordedCurrent() || !draftCurrent()){feedback('Your reflection or draft changed elsewhere. Both have been kept; reopen the review.');return;}
    const hadDraft=Object.hasOwn(drafts,week),kept=drafts[week];delete drafts[week];
    if(!saveDailyDraft(boardId,{silent:true})){
      if(hadDraft)drafts[week]=kept;
      cleanupPending=true;retryCleanup.hidden=false;retryDraft.hidden=true;
      feedback('Your reflection is saved on this device, but its draft could not be cleared. Keep this page open and retry.','attention');
    }else{
      cleanupPending=false;retryCleanup.hidden=true;retryDraft.hidden=true;
      delete draft.changed;
      feedback('Saved on this device. Earlier reflections are kept.','kept');
    }
    renderHistory();refreshControls();
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(!canApply() || cleanupPending)return;
    if(!draft.mattered.trim()&&!draft.easier.trim()){feedback('Write a thought to keep.');return;}
    submittedDraft=LifeStateMerge.copy(draft);busy=true;refreshControls();feedback('Confirming device save...','saving');
    try{
      const retrying=recorded?.mattered===draft.mattered && recorded?.easier===draft.easier;
      if(retrying){
        if(!recordedCurrent()){feedback('Your recorded reflection changed elsewhere. Your draft is kept; reopen the review.');return;}
      }else{
        const latest=latestDailyRecord('review',week);
        if(latest?.mattered!==draft.mattered || latest?.easier!==draft.easier){
          if(!saveDailyRecord({kind:'review',date:week,mattered:draft.mattered,easier:draft.easier},message)){feedback('Not saved. Your draft is kept; please retry.');return;}
        }
        recorded=LifeStateMerge.copy(latestDailyRecord('review',week));
      }
      renderHistory();
      let confirmed=false;try{confirmed=await flushDeviceWrites();}catch{/* Keep the same record and full draft for an explicit retry. */}
      if(!current()){
        if(dialog.open && dialog.isConnected && !dialog.hidden && document.getElementById('dailyDialog')===dialog)feedback('This review, board or day changed. Your draft is kept; reopen the review.');
        return;
      }
      if(!draftCurrent() || !recordedCurrent()){feedback('Your reflection or draft changed elsewhere. Both have been kept; reopen the review.');return;}
      if(confirmed!==true){feedback('Device save is not confirmed. Your reflection and draft are kept; please retry.');return;}
      finish();
    }finally{busy=false;refreshControls();}
  };
  dialog.append(planningButton('Download weekly summary',()=>{
    if(!canApply())return;
    const report=createReportDocument('Weekly review',state.board.name+' · '+week+' - '+end);appendDailyReviewFacts(report,week,end);
    const saved=latestDailyRecord('review',week);if(saved){report.append(planningNode('h3','','What mattered?'),planningNode('p','',saved.mattered),planningNode('h3','','What would make next week easier?'),planningNode('p','',saved.easier));}
    downloadTextFile('life-os-week-'+week+'.html','<!doctype html><meta charset="utf-8"><title>Life OS weekly review</title><style>body{max-width:800px;margin:32px auto;padding:16px;font:16px/1.6 system-ui}p{white-space:pre-wrap;overflow-wrap:anywhere}button{display:none}section{margin:24px 0}</style>'+report.outerHTML,'text/html;charset=utf-8');
  },'download'));
  if(draft.changed){
    let persisted;try{persisted=JSON.parse(sessionStorage.getItem(LifeStorageScope.key('life-os-daily:'+boardId)) || '{}').reviews?.[week];}catch{}
    const kept=LifeStateMerge.equal(persisted,draft);retryDraft.hidden=kept;
    feedback(kept?'Draft saved on this tab.':'Draft not saved on this tab. Keep this page open and retry.',kept?'kept':'error');
  }
}
function dailyReadableRecords(board) {
  const records=dailyRecords(board),reviews=records.filter(e=>e.kind==='review'),focuses=records.filter(e=>e.kind==='focus');
  const cards=[...(board.cards || []),...(board.archivedCards || [])],tasks=[...cards.filter(c=>c.type==='planner').flatMap(card=>LifePlanner.ensure(LifeStateMerge.copy(card)).map(t=>({...t,card,taskId:t.id}))),...LifeTaskRepository.collect({id:board.id,cards},{includeArchived:true})];
  const plans=focuses.map(record=>'<div class="entry"><h3>'+escapeHtml(record.date)+'</h3><p>Recorded '+escapeHtml(formatRecordDateTime(record.recordedAt))+(record.budgetMinutes?' · Available '+escapeHtml(record.budgetMinutes)+' minutes':'')+'</p><ul class="clean">'+(record.taskKeys || []).map(key=>{
    const task=tasks.find(t=>dailyFocusKey(t)===key),plan=record.plans?.[key] || {};
    return renderReadableItem(task?.title || 'Task unavailable (removed or moved)',false,[plan.nextAction,plan.minutes?'Estimate: '+plan.minutes+' minutes':'',plan.startTime?'Start: '+plan.startTime:''].filter(Boolean).join('\n'));
  }).join('')+'</ul></div>').join('');
  return (plans?'<section><h2>Chosen next-step plans</h2>'+plans+'</section>':'')+(reviews.length?'<section><h2>Weekly reflections</h2>'+reviews.map(e=>'<h3>'+escapeHtml(e.date)+'</h3><p>Recorded '+escapeHtml(formatRecordDateTime(e.recordedAt))+'</p><h4>What mattered?</h4><p style="white-space:pre-wrap">'+escapeHtml(e.mattered)+'</p><h4>What would make next week easier?</h4><p style="white-space:pre-wrap">'+escapeHtml(e.easier)+'</p>').join('')+'</section>':'');
}

function taskGoalOptions() {
  const options=[['','No goal link']];
  for(const program of currentCoachingPrograms())for(const priority of program.priorities)for(const kr of priority.krs)
    options.push([JSON.stringify([program.id,priority.id,kr.id]),priority.title+' / '+kr.title]);
  return options;
}
function taskGoalValue(task) {return task.coachingProgramId?JSON.stringify([task.coachingProgramId,task.coachingPriorityId,task.coachingKrId || '']):'';}
function taskGoalFields(draft) {
  const [coachingProgramId='',coachingPriorityId='',coachingKrId='']=draft.goalLink?JSON.parse(draft.goalLink):[];
  if(draft.minutes && (!Number.isInteger(Number(draft.minutes)) || Number(draft.minutes)<1 || Number(draft.minutes)>1440))throw new Error('Use estimated minutes between 1 and 1440.');
  return {coachingProgramId,coachingPriorityId,coachingKrId,followUp:draft.followUp || '',intent:draft.intent || 'task',estimatedMinutes:Number(draft.minutes) || 0,nextAction:draft.nextAction || '',startTime:draft.startTime || ''};
}
function appendDailyTaskFields(grid,draft,canApply) {
  const update=(key,value)=>{if(canApply())draft[key]=value;};
  const options=taskGoalOptions();if(draft.goalLink && !options.some(([key])=>key===draft.goalLink))options.push([draft.goalLink,'Existing priority link']);
  const day=getTodayKey(),current=()=>grid.isConnected && !document.hidden && !grid.closest('[hidden],[inert]') && !document.querySelector('dialog[open]') && canApply();
  const followUp=planningInput('date',draft.followUp,value=>{if(!current())return;draft.followUp=value;refreshFollowUp();});
  followUp.setAttribute('aria-label','Follow-up date');
  const quick=planningCaptureDates(followUp,day,current,'Follow-up quick dates'),notice=planningNode('small','daily-muted');notice.setAttribute('role','status');
  const refreshFollowUp=()=>{
    const invalid=draft.followUp!=='' && draft.followUp!=null && !LifePlanner.validDate(draft.followUp);
    const message=invalid?'The saved follow-up date needs review. Choose a date or clear it.':'';
    followUp.setCustomValidity(message);notice.textContent=message;notice.hidden=!invalid;
    for(const button of quick.children)button.setAttribute('aria-pressed',String(button.dataset.date===draft.followUp));
  };
  const field=planningNode('div','task-follow-up-field');
  field.append(planningField('Follow-up date',planningOptionalDate(followUp,'Clear follow-up date',()=>{draft.followUp='';refreshFollowUp();},current)),quick,notice);refreshFollowUp();
  grid.append(planningField('Contributes to',planningSelect(options,draft.goalLink,value=>update('goalLink',value))),
    field,
    planningField('Task kind',planningSelect([['task','Task'],['experience','Experience to try']],draft.intent,value=>update('intent',value))));
  const minutes=planningInput('number',draft.minutes,value=>update('minutes',value));minutes.min=1;minutes.max=1440;minutes.step=1;
  grid.append(planningField('Next action (optional)',planningInput('text',draft.nextAction,value=>update('nextAction',value))),planningField('Estimated minutes (optional)',minutes),planningField('Start time (optional)',planningInput('time',draft.startTime,value=>update('startTime',value))));
}
