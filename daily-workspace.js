const LIFE_OS_BUILD = '2026.10.14-persistent-github';
const dailySessions = new Map();
let deviceSavedAt = 0;
let publishedReleaseCheckAt=0,publishedReleaseCheckInFlight=false;

function loadedReleaseId() {
  const script=[...document.scripts].find(script=>new URL(script.src || location.href).pathname.endsWith('/daily-workspace.js'));
  const id=script?new URL(script.src).searchParams.get('v'):'';
  return /^[a-f0-9]{16}$/.test(id || '')?id:'';
}
function canApplyPublishedUpdate() {
  try{return lastLocalSaveOk && !corruptLocalStateDetected && !isUserEditingCriticalDraft() && !hasUnsubmittedDraftText() && LifeDeviceStore.pending().length===0;}
  catch{return false;}
}
async function applyPublishedUpdate() {
  await flushDeviceWrites();
  if(!canApplyPublishedUpdate()){
    const message=document.getElementById('releaseUpdateMessage');
    if(message)message.textContent='Finish or save your open draft before updating. Your writing has not been changed.';
    return false;
  }
  // Conflicts are stored records, not permission to discard either version.
  window.location.reload();return true;
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
    notice.append(message,planningButton('Update now',applyPublishedUpdate,'rotate-ccw'));
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
function saveDailyDraft() {
  try { sessionStorage.setItem(LifeStorageScope.key('life-os-daily:'+state.activeBoardId), JSON.stringify(dailySession())); return true; }
  catch { setSaveStatus('Draft only in memory - storage unavailable', 'error'); return false; }
}
function dailyRecords(board) {
  const cards = board ? board.archivedCards || [] : getArchivedCards();
  return cards.filter(c=>c.dailyWorkspaceStore).flatMap(c=>c.workspaceRecords || []);
}
function latestDailyRecord(kind, date) {
  return dailyRecords().filter(e=>e.kind===kind && e.date===date).sort((a,b)=>b.recordedAt-a.recordedAt || b.id.localeCompare(a.id))[0];
}
function dailyFocusKey(task) {return JSON.stringify([task.card.id,task.taskId]);}
function dailyFocusKeys(day,items) {
  const record=latestDailyRecord('focus',day);
  if(record?.taskKeys)return record.taskKeys;
  // Only unambiguous old references may be displayed; never pick by title.
  return (record?.taskIds || []).flatMap(id=>{const matches=items.filter(t=>t.taskId===id);return matches.length===1?[dailyFocusKey(matches[0])]:[];});
}
function saveDailyRecord(fields, message) {
  let store = getArchivedCards().find(c=>c.dailyWorkspaceStore);
  if (!store) {
    // A known, non-planner container survives older board normalizers without
    // being selected by an older client's planner writer. Records are immutable.
    store = {id:'daily-workspace-'+state.activeBoardId, type:'single', title:'Daily workspace records', category:'Personal',
      plannerSourceOnly:true, dailyWorkspaceStore:true,
      archivedAt:1, createdAt:1, workspaceRecords:[]};
    state.archivedCards = [...getArchivedCards(), store];
  }
  const record = {...fields, id:createId(), recordedAt:Math.max(Date.now(), ...store.workspaceRecords.map(e=>e.recordedAt+1))};
  store.workspaceRecords.push(record);
  if (saveState()) return true;
  const live = getArchivedCards().find(c=>c.id===store.id);
  live.workspaceRecords = live.workspaceRecords.filter(e=>e.id!==record.id);
  syncActiveBoard({touchBoard:false});
  if (message) message.textContent='Not saved. Your draft is kept; please retry.';
  return false;
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
  document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected && !document.querySelector('dialog[open]'))previous.focus({preventScroll:true});},{once:true});dialog.showModal();return dialog;
}
function openDailyMore() {
  const dialog=dailyDialog('More'),list=planningNode('div','daily-menu');
  for(const [label,icon,action] of [
    ['Capture','plus',openDailyCapture],['My board','layout-grid',()=>setWorkspaceMode('board')],['Priorities','check',()=>setWorkspaceMode('priorities')],
    ['Money','bar-chart',()=>setWorkspaceMode('money')],['Weekly review','bar-chart',openDailyReview],['Archive','archive',openRecordsModal],['Reports','bar-chart',openReportsModal],
    ['Settings','settings',openSettingsModal],['Saving & version','check',openSaveDetails]
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
  document.getElementById('headerSaveStatus').title=(PREVIEW_MODE?'Preview':'Build')+' '+LIFE_OS_BUILD+' · Saving details';
  renderDailyNavigation();
  initializePublishedUpdates();
}
function renderDailyNavigation() {
  for(const mode of ['today','tasks','calendar'])document.getElementById('mobile'+mode[0].toUpperCase()+mode.slice(1)+'Button')?.setAttribute('aria-pressed',String(state.ui.workspaceMode===mode));
  document.getElementById('mobileTasksButton')?.setAttribute('aria-pressed',String(['tasks','calendar'].includes(state.ui.workspaceMode)));
  document.getElementById('mobileBoardButton')?.setAttribute('aria-pressed',String(state.ui.workspaceMode==='board'));
  document.getElementById('mobileProgressButton')?.setAttribute('aria-pressed',String(state.ui.workspaceMode==='priorities'));
  document.getElementById('mobileMoreButton')?.setAttribute('aria-pressed','false');
  document.getElementById('mobileCalendarButton')?.setAttribute('aria-pressed','false');
}
function openSaveDetails() {
  const dialog=dailyDialog('Saving & version'),details=planningNode('dl','daily-save-details');dialog.append(details);
  const render=()=>{
    details.replaceChildren();const add=(label,text)=>details.append(planningNode('dt','',label),planningNode('dd','',text));
    add('Build',LIFE_OS_BUILD);add('Environment',PREVIEW_MODE?'Separate preview records - cloud disabled':location.hostname==='127.0.0.1'||location.hostname==='localhost'?'Local development':'This website');
    add('Device',corruptLocalStateDetected?'Recovery required':lastLocalSaveOk?'Saved on this device':'Saving failed - export your writing');
    add('Last device write',deviceSavedAt?formatRecordDateTime(deviceSavedAt):'No write recorded in this tab yet');
    let pending;try{pending=LifeDeviceStore.pending().length;}catch{}
    add('Pending device copies',pending===undefined?'Unable to read':String(pending));
    try{
      const storage=LifeDeviceStore.diagnostics(),mb=bytes=>(bytes/1048576).toFixed(2)+' MB';
      add('Browser storage used (estimate)',mb(storage.totalBytes));
      add('Pending copy storage',mb(storage.pendingBytes));
      if(lastDeviceSaveError)add('Last device save issue',deviceSaveFailureReason()+' '+formatRecordDateTime(lastDeviceSaveError.at));
    }catch{add('Browser storage','Access unavailable');}
    const signedIn=Boolean(cloudSession?.user?.id);
    add('Cloud',PREVIEW_MODE?'Disabled in preview':!signedIn?'Not signed in':/Cloud session expired|Sign-in failed:|Sign-in could not be saved/.test(cloudStatusMessage || '')?'Sign-in needed':cloudConflictPending?'Paused - review conflicting changes':isRestoreSyncPaused()?'Paused after restore':!navigator.onLine?'Offline':cloudPushInFlight?'Syncing':cloudSaveEnabled?'Automatic sync enabled (not a save receipt)':'Sync paused');
    add('Last known cloud version',getKnownCloudUpdatedAt()?formatRecordDateTime(getKnownCloudUpdatedAt()):'No cloud version confirmed');
    if(signedIn && cloudMergeBase?.ownerId===cloudSession.user.id){
      const local=getStateForStorage(),base=cloudMergeBase.state;
      const ids=new Set([...(local.boards || []).map(b=>b.id),...(base.boards || []).map(b=>b.id)]);
      const count=[...ids].filter(id=>!LifeStateMerge.equal(local.boards.find(b=>b.id===id),base.boards.find(b=>b.id===id))).length;
      add('Boards changed since cloud comparison',String(count));
    }
    add('Changes needing review',String(state.syncConflicts?.length || 0));
  };render();const timer=setInterval(render,1500);dialog.addEventListener('close',()=>clearInterval(timer),{once:true});
  const actions=planningNode('div','daily-actions');
  actions.append(planningButton('Download my information',exportReadableDataArchive,'download'),planningButton('Recovery',()=>{dialog.close();openRecovery();},'archive'),planningButton('Cloud settings',()=>{dialog.close();openSettingsModal();},'settings'));
  if(PREVIEW_MODE){
    const link=planningNode('a','planning-button','Open saved workspace'),url=new URL(location.href);
    url.searchParams.delete('preview');url.hash='';link.href=url.href;actions.append(link);
  }
  dialog.append(actions);
}
function openDailyCapture() {
  const session=dailySession(),draft=session.capture ||= {kind:'task',text:'',date:getTodayKey(),area:''};
  const dialog=dailyDialog('Capture'),form=planningNode('form','daily-form'),message=planningNode('p','daily-message');message.setAttribute('role','status');
  const kind=planningSelect([['task','Task'],['note','Quick note'],['experience','Experience to try']],draft.kind,value=>{draft.kind=value;saveDailyDraft();});
  const text=planningNode('textarea');text.rows=3;text.required=true;text.value=draft.text;text.oninput=()=>{draft.text=text.value;message.textContent=saveDailyDraft()?'Draft kept in this tab':'Draft only in memory - storage unavailable';};
  const date=planningInput('date',draft.date,value=>{draft.date=value;saveDailyDraft();});
  date.setAttribute('aria-label','Date (optional for tasks)');
  form.append(planningField('Capture as',kind),planningField('What is on your mind?',text),planningField('Date (optional for tasks)',planningOptionalDate(date,'Clear capture date',()=>{draft.date='';saveDailyDraft();})),
    planningField('Area',planningSelect(taskAreaOptions(draft.area),draft.area,value=>{draft.area=value;saveDailyDraft();})));
  const save=planningButton('Save capture',null,'check');save.type='submit';save.classList.add('is-primary');
  form.append(message,save,planningButton('Add a card instead',()=>{dialog.close();openCardComposer();},'layout-grid'));
  form.onsubmit=event=>{
    event.preventDefault();if(!draft.text.trim() || (draft.date && !LifePlanner.validDate(draft.date)))return;
    if(draft.pendingKind && draft.pendingKind!==draft.kind){message.textContent='Retry the original capture type before changing it.';return;}
    draft.pendingId ||= createId();draft.pendingKind=draft.kind;saveDailyDraft();
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
    saveDailyDraft();if(!saveState()){message.textContent='Not saved. Your draft is kept; please retry.';return;}
    delete session.capture;saveDailyDraft();dialog.close();renderCardsOnly({force:true});
  };dialog.append(form);text.focus();
}
function renderDailyHome() {
  const root=elements.boardGrid,session=dailySession(),day=getTodayKey();
  const head=planningNode('header','daily-head'),copy=planningNode('div');copy.append(planningNode('h2','','Today, at your pace'),planningNode('p','',formatPlannerDate(day)));
  const actions=planningNode('div','daily-actions');
  const light=planningButton('Lighter day',()=>{session.light=!session.light;saveDailyDraft();renderCardsOnly({force:true});});light.setAttribute('aria-pressed',String(session.light));
  actions.append(light,planningIcon('Customize Today',openDailyPreferences,'settings'),planningButton('Capture',openDailyCapture,'plus'));
  head.append(copy,actions);root.append(head);
  const columns=planningNode('div','daily-columns');root.append(columns);
  const context=planningNode('div','daily-context');
  const all=getWorkspaceTaskItems(),focusIds=dailyFocusKeys(day,all);
  const focus=dailySection('My next step',planningButton('Choose',openDailyFocus,'pencil'));
  const selected=focusIds.map(key=>all.find(t=>dailyFocusKey(t)===key)).filter(Boolean),visible=session.light?selected.slice(0,1):selected;
  focus.classList.add('daily-focus-section');
  if(visible.length){
    const completed=visible.filter(item=>item.done).length;
    const progress=planningNode('div','daily-focus-progress');
    const label=planningNode('span','',`${completed} of ${visible.length} next steps complete`);
    const meter=planningNode('progress');meter.max=visible.length;meter.value=completed;meter.setAttribute('aria-label','Chosen next steps complete');
    progress.append(label,meter);focus.append(progress);
  }else focus.querySelector('.planning-button').classList.add('is-primary');
  for(const item of visible){
    const step=planningNode('div','daily-focus-step');step.append(renderWorkspaceTaskItem({...item,workspaceTask:true,undated:!item.dateKey,scheduledDate:item.dateKey,dateKey:day}));focus.append(step);
    if(item.done)continue;
    const plan=latestDailyRecord('focus',day)?.plans?.[dailyFocusKey(item)] || {},tools=planningNode('div','daily-step-tools');
    tools.append(planningNode('span','daily-muted',plan.nextAction || item.nextAction || ''),planningButton('Start',()=>openDailyStart(item,plan),'play'),planningIcon('Next-step options: '+item.title,()=>openDailyStepOptions(item),'more-vertical'));step.append(tools);
  }
  const records=dailyRecords().filter(e=>e.kind==='focus' && e.date===day),original=records.slice().sort((a,b)=>a.recordedAt-b.recordedAt)[0];
  if(original && !LifeStateMerge.equal(original.taskKeys,focusIds))focus.append(planningNode('small','daily-muted','Plan revised. Your original choices remain in the weekly review.'));
  const plans=latestDailyRecord('focus',day)?.plans || {},budget=latestDailyRecord('focus',day)?.budgetMinutes;
  const minutes=visible.reduce((sum,t)=>sum+(Number(plans[dailyFocusKey(t)]?.minutes || t.estimatedMinutes)||0),0);
  if(minutes)focus.append(planningNode('small','daily-capacity',`${minutes} minutes estimated${budget?' / '+budget+' available':''}${budget && minutes>budget?' · Consider a lighter plan':''}`));
  if(!visible.length)focus.append(planningNode('p','daily-muted','Choose one thing for today. Your other tasks are still on your board.'));
  const overview=planningNode('div','daily-actions daily-focus-footer');
  overview.append(planningButton('All tasks ('+all.length+')',()=>{planningSession().view='all';planningSession().area='*';planningSession().search='';savePlanningSession();setWorkspaceMode('tasks');}),
    planningButton('My board',()=>setWorkspaceMode('board')));focus.append(overview);columns.append(focus);
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
  const grid=planningNode('div','today-cards daily-journals');
  for(const type of ['diary','sidenote']){
    if(session.sections[type]===false)continue;
    const cards=state.cards.filter(c=>c.type===type),card=cards.find(c=>c.id===session.cardChoices?.[type]) || cards[0];
    if(card)grid.append(renderCard(card));
    else grid.append(planningButton(type==='diary'?'Add a diary':'Add quick notes',()=>{openCardComposer();setFormType(type);renderConditionalFields();},'plus'));
  }root.append(grid,context,done);
}
function openDailyPreferences() {
  const dialog=dailyDialog('Customize Today'),session=dailySession();
  for(const [key,label] of [['agenda','Upcoming activities'],['routine','Priority progress'],['diary','Diary'],['sidenote','Quick notes']]){
    const row=planningNode('label','daily-check'),check=planningInput('checkbox','',()=>{});check.checked=session.sections[key]!==false;
    check.onchange=()=>{session.sections[key]=check.checked;saveDailyDraft();renderCardsOnly({force:true});};row.append(check,planningNode('span','',label));dialog.append(row);
    if(['diary','sidenote'].includes(key)){
      const cards=state.cards.filter(c=>c.type===key);
      if(cards.length>1)dialog.append(planningField(label+' card',planningSelect(cards.map(c=>[c.id,c.title]),session.cardChoices?.[key] || cards[0].id,value=>{session.cardChoices ||= {};session.cardChoices[key]=value;saveDailyDraft();renderCardsOnly({force:true});})));
    }
  }
}
function openDailyFocus() {
  const dialog=dailyDialog('Choose up to three next steps'),day=getTodayKey(),items=getWorkspaceTaskItems().filter(item=>item.sourceKind!=='card' || item.editable),session=dailySession();
  session.focusDrafts ||= {};const previous=session.focusDrafts[day] || latestDailyRecord('focus',day),selected=new Set((previous?.taskKeys || dailyFocusKeys(day,items)).filter(key=>items.some(t=>dailyFocusKey(t)===key))),plans=LifeStateMerge.copy(previous?.plans || {});
  const keepDraft=()=>{session.focusDrafts[day]={taskKeys:[...selected],plans,budgetMinutes:budget.value};saveDailyDraft();};
  const budget=planningInput('number',previous?.budgetMinutes || '',()=>keepDraft());budget.min=1;budget.max=1440;budget.step=1;
  dialog.append(planningField('Available minutes (optional)',budget));
  const message=planningNode('p','daily-message');message.setAttribute('role','status');
  const search=planningInput('search','',()=>{});search.placeholder='Find a task';search.setAttribute('aria-label','Find a next step');dialog.append(search);
  const list=planningNode('div','daily-focus-options');dialog.append(list);
  items.filter(t=>!t.done || selected.has(dailyFocusKey(t))).forEach(t=>{
    const key=dailyFocusKey(t),row=planningNode('label','daily-check'),check=planningInput('checkbox','',()=>{});check.checked=selected.has(key);check.setAttribute('aria-label',t.title);row.dataset.search=[t.title,t.sourceTitle,t.group].filter(Boolean).join(' ').toLocaleLowerCase();
    check.onchange=()=>{if(check.checked && selected.size>=3){check.checked=false;message.textContent='Three selected. Uncheck one to choose another.';return;}check.checked?selected.add(key):selected.delete(key);message.textContent='';keepDraft();};
    const copy=planningNode('span','',t.title);if(t.sourceKind==='card')copy.append(planningNode('small','daily-task-source',t.sourceLabel+' · '+t.sourceTitle));row.append(check,copy);
    const wrapper=planningNode('div','daily-choice');wrapper.dataset.search=row.dataset.search;
    const more=planningNode('details','daily-step-plan');more.append(planningNode('summary','','Plan this step'));
    const plan=plans[key] ||= {nextAction:t.nextAction || '',minutes:t.estimatedMinutes || '',startTime:t.startTime || ''};
    const minutes=planningInput('number',plan.minutes,value=>{plan.minutes=value;keepDraft();});minutes.min=1;minutes.max=1440;minutes.step=1;
    more.append(planningField('Next action: '+t.title,planningInput('text',plan.nextAction,value=>{plan.nextAction=value;keepDraft();})),planningField('Estimated minutes: '+t.title,minutes),planningField('Start time: '+t.title,planningInput('time',plan.startTime,value=>{plan.startTime=value;keepDraft();})));
    wrapper.append(row,more);list.append(wrapper);
  });search.oninput=()=>list.querySelectorAll('.daily-choice').forEach(row=>row.hidden=!row.dataset.search.includes(search.value.toLocaleLowerCase()));
  dialog.append(message,planningButton('Keep next steps',()=>{
    const validMinutes=value=>value==='' || Number.isInteger(Number(value)) && Number(value)>0 && Number(value)<=1440;
    if(!validMinutes(budget.value) || [...selected].some(key=>!validMinutes(plans[key].minutes))){message.textContent='Use whole minutes between 1 and 1440.';return;}
    if(saveDailyRecord({kind:'focus',date:day,taskKeys:[...selected],plans:Object.fromEntries([...selected].map(key=>[key,plans[key]])),budgetMinutes:budget.value?Number(budget.value):null},message)){delete session.focusDrafts[day];saveDailyDraft();dialog.close();renderCardsOnly({force:true});}
  },'check'));
}
function dailyUpcoming(start,end='9999-12-31') {
  const activities=calendarActivities().filter(({activity:a})=>a.allDay?a.endDate>=start && a.startDate<=end:LifePlanning.localInput(a.endAt || a.startAt).slice(0,10)>=start && LifePlanning.localInput(a.startAt).slice(0,10)<=end)
    .map(({activity:a})=>({title:a.title,date:a.allDay?(a.startDate<start?start:a.startDate):LifePlanning.localInput(a.startAt).slice(0,10),detail:'Activity · '+formatActivityTiming(a)}));
  const tasks=getWorkspaceTaskItems().filter(t=>!t.done && t.status!=='parked' && LifePlanner.validDate(t.dateKey) && t.dateKey>=start && t.dateKey<=end)
    .map(t=>({title:t.title,date:t.dateKey,detail:'Task · '+formatPlannerDate(t.dateKey)}));
  return [...activities,...tasks].sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
function openDailyStart(item,plan={}) {
  const dialog=dailyDialog(item.title),session=dailySession(),key=dailyFocusKey(item);
  const expected=item.sourceKind==='card'?null:LifeStateMerge.copy(LifePlanner.ensure(resolveLiveCard(item.card)).find(t=>t.id===item.taskId));
  dialog.append(planningNode('p','daily-next-action',plan.nextAction || item.nextAction || item.title));
  if(plan.startTime)dialog.append(planningNode('small','daily-muted','Planned start · '+plan.startTime));
  const display=planningNode('output','daily-focus-clock'),actions=planningNode('div','daily-actions'),message=planningNode('p','daily-message');message.setAttribute('role','status');dialog.append(display,actions,message);
  const render=()=>{const timer=session.focusTimer?.key===key?session.focusTimer:null,seconds=timer?Math.max(0,Math.ceil((timer.endAt?timer.endAt-Date.now():timer.remaining)/1000)):0;display.textContent=timer?(seconds?String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):'Session finished'):'Ready to begin';};
  actions.append(planningButton('Start 5 minutes',()=>{session.focusTimer={key,endAt:Date.now()+300000};saveDailyDraft();render();},'play'),planningButton('Pause / resume',()=>{const timer=session.focusTimer;if(timer?.key!==key)return;if(timer.endAt){timer.remaining=Math.max(0,timer.endAt-Date.now());delete timer.endAt;}else{timer.endAt=Date.now()+timer.remaining;delete timer.remaining;}saveDailyDraft();render();},'pause'));
  const complete=planningButton('Mark done',async()=>{
    complete.disabled=true;
    try{
      if(item.sourceKind==='card'){
        if(!await confirmParentTaskCompletion(item.base,true))return;
        saveCardTaskChange(item.ref,item.base,{done:true});
      }else{
        const task=LifePlanner.ensure(resolveLiveCard(item.card)).find(t=>t.id===item.taskId);
        if(!LifeStateMerge.equal(task,expected))throw new Error('This task changed elsewhere. Reopen the current task before completing.');
        if(task.done)throw new Error('This task is already completed. It has not been reopened.');
        if(!await togglePlannerTaskDone({...item,dateKey:getTodayKey()})){
          message.textContent=lastLocalSaveOk?'':'Completion was not saved. Please retry.';return;
        }
      }
      dialog.close();renderCardsOnly({force:true});
    }catch(error){message.textContent=error.message;}
    finally{complete.disabled=false;}
  },'check');actions.append(complete);
  render();const interval=setInterval(render,500);dialog.addEventListener('close',()=>clearInterval(interval),{once:true});
}
function openDailyStepOptions(item) {
  const dialog=dailyDialog('Next-step options'),menu=planningNode('div','daily-menu');dialog.append(menu);
  menu.append(planningButton('Continue',()=>{dialog.close();openDailyStart(item);},'play'));
  if(item.sourceKind==='card'){menu.append(planningButton('Edit / plan task',()=>{dialog.close();openCardTaskEditor(item);},'pencil'));return;}
  const expected=LifeStateMerge.copy(LifePlanner.ensure(resolveLiveCard(item.card)).find(t=>t.id===item.taskId));
  const apply=updates=>{const card=resolveLiveCard(item.card),tasks=LifePlanner.ensure(card),task=tasks.find(t=>t.id===item.taskId);if(!task || !LifeStateMerge.equal(task,expected))throw new Error('Task changed elsewhere. Reopen its options.');const before=LifeStateMerge.copy(task);LifePlanner.change(card,task.id,updates);LifePlanner.project(card);if(!saveState()){tasks.splice(tasks.findIndex(t=>t.id===task.id),1,before);LifePlanner.project(card);syncActiveBoard({touchBoard:false});throw new Error('Not saved. Please retry.');}dialog.close();renderCardsOnly({force:true});};
  for(const [label,status] of [['Waiting','waiting'],['Park','parked']])menu.append(planningButton(label,()=>{try{apply({status});}catch(error){dialog.append(planningNode('p','daily-message',error.message));}}));
  const date=planningInput('date',item.dateKey || getTodayKey(),()=>{});menu.append(planningField('New planned day',date),planningButton('Reschedule',()=>{if(LifePlanner.validDate(date.value))try{apply({dateKey:date.value});}catch(error){dialog.append(planningNode('p','daily-message',error.message));}}));
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
  const root=planningNode('section','progress-home'),today=getTodayKey(),week=dailyWeekStart(today),actions=dailyFollowThrough(week,today),tasks=dailyCompletedTasks(week,today);
  root.append(planningNode('h2','','Progress'),planningNode('p','daily-muted',formatPlannerOriginDate(week)+' - '+formatPlannerOriginDate(today)));
  const measures=planningNode('div','progress-measures');
  for(const [label,value] of [['Original chosen actions',actions.length?actions.reduce((n,r)=>n+r.done,0)+' / '+actions.reduce((n,r)=>n+r.total,0)+' completed':'Not recorded'],['Dated task completions',String(tasks.length)],['Days with a chosen plan',String(actions.length)]]){
    const metric=planningNode('div','progress-measure');metric.append(planningNode('small','',label),planningNode('strong','',value));measures.append(metric);
  }root.append(measures);
  if(actions.some(a=>a.revised))root.append(planningNode('small','daily-muted','Revised plans retain their original choices in these totals.'));
  const tools=planningNode('div','daily-actions');tools.append(planningButton('Weekly review',openDailyReview,'pencil'),planningButton('Reports',openReportsModal,'bar-chart'));root.append(tools);
  for(const program of currentCoachingPrograms()){
    const routine=LifeCoaching.metrics(program).some(m=>m.kind==='weekly');if(!routine)continue;
    const section=dailySection('Sustainable routine · '+program.title),weeks=LifeCoaching.latestWeeks(program,today),recent=Array.from({length:4},(_,i)=>LifePlanning.shift(LifeCoaching.weekStart(program,[today,program.endDate].sort()[0]),-7*i)).filter(day=>day>=program.startDate).reverse();
    const list=planningNode('div','progress-routine-weeks');
    for(const date of recent){const record=weeks.find(w=>w.date===date),row=planningNode('div','progress-routine-week');row.append(planningNode('strong','',formatPlannerOriginDate(date)),planningNode('small','',record?'Recorded':'Not recorded'));
      for(const [key,label] of [['exercise','Exercise'],['rest','Rest'],['personal','Personal time'],['reflection','Reflection']])row.append(planningNode('span',record?.[key]?'routine-recorded':'routine-unreported',(record?record[key]?'✓ ':'○ ':'— ')+label));list.append(row);
    }section.append(list);root.append(section);
  }
  elements.boardGrid.append(root);
}
function appendDailyReviewFacts(root,start,end) {
  const {tasks,changes,upcoming}=dailyReviewFacts(start,end);
  const section=(label,lines)=>{const node=dailySection(label);for(const text of lines)node.append(planningNode('p','',text));if(!lines.length)node.append(planningNode('p','daily-muted','No records in this period.'));root.append(node);};
  section('Completed',tasks.map(t=>formatPlannerOriginDate(t.completedOn)+' · '+t.title));
  section('Priority updates',changes.map(({program,entry})=>entry.date+' · '+coachingEntryLabel(program,entry)+(entry.value!==undefined?' · '+entry.value:entry.entity?' · '+entry.entity:'')));
  section('Next seven days',upcoming.map(item=>item.title+' · '+item.detail));
  section('Chosen actions',dailyFollowThrough(start,end).sort((a,b)=>a.date.localeCompare(b.date)).map(row=>row.date+' · '+row.done+' / '+row.total+' original choices completed'+(row.revised?' · Plan revised':'')));
}
function openDailyReview() {
  const dialog=dailyDialog('Weekly review'),session=dailySession();
  const week=session.reviewWeek || dailyWeekStart(getTodayKey());session.reviewWeek=week;
  const end=[LifePlanning.shift(week,6),getTodayKey()].sort()[0];
  const nav=planningNode('div','daily-actions');
  const change=amount=>{session.reviewWeek=LifePlanning.shift(week,amount);saveDailyDraft();dialog.close();openDailyReview();};
  const next=planningIcon('Next week',()=>change(7),'chevron-right');next.disabled=LifePlanning.shift(week,7)>getTodayKey();
  nav.append(planningIcon('Previous week',()=>change(-7),'chevron-left'),planningNode('strong','','Calendar week · '+week+' - '+end),next);dialog.append(nav);
  appendDailyReviewFacts(dialog,week,end);
  const previous=latestDailyRecord('review',week),drafts=session.reviews ||= {},draft=drafts[week] ||= {mattered:previous?.mattered || '',easier:previous?.easier || ''};
  const form=planningNode('form','daily-form'),message=planningNode('p','daily-message');message.setAttribute('role','status');
  for(const [key,label] of [['mattered','What mattered?'],['easier','What would make next week easier?']]){
    const input=planningNode('textarea');input.rows=3;input.value=draft[key];input.oninput=()=>{draft[key]=input.value;draft.changed=true;drafts[week]=draft;message.textContent=saveDailyDraft()?'Draft kept in this tab':'Draft only in memory - storage unavailable';};form.append(planningField(label,input));
  }
  const save=planningButton('Keep reflection',null,'check');save.type='submit';form.append(message,save);
  form.onsubmit=event=>{event.preventDefault();if(!draft.mattered.trim()&&!draft.easier.trim()){message.textContent='Write a thought to keep.';return;}
    if(saveDailyRecord({kind:'review',date:week,mattered:draft.mattered,easier:draft.easier},message)){delete drafts[week];saveDailyDraft();message.textContent='Saved on this device. Earlier reflections are kept.';}};
  dialog.append(form);
  const history=planningNode('details','daily-review-history');history.append(planningNode('summary','','Saved reflections'));
  dailyRecords().filter(e=>e.kind==='review' && e.date===week).sort((a,b)=>b.recordedAt-a.recordedAt).forEach(e=>{history.append(planningNode('small','',formatRecordDateTime(e.recordedAt)),planningNode('p','',e.mattered),planningNode('p','',e.easier));});dialog.append(history);
  dialog.append(planningButton('Download weekly summary',()=>{
    const report=createReportDocument('Weekly review',state.board.name+' · '+week+' - '+end);appendDailyReviewFacts(report,week,end);
    const saved=latestDailyRecord('review',week);if(saved){report.append(planningNode('h3','','What mattered?'),planningNode('p','',saved.mattered),planningNode('h3','','What would make next week easier?'),planningNode('p','',saved.easier));}
    downloadTextFile('life-os-week-'+week+'.html','<!doctype html><meta charset="utf-8"><title>Life OS weekly review</title><style>body{max-width:800px;margin:32px auto;padding:16px;font:16px/1.6 system-ui}p{white-space:pre-wrap;overflow-wrap:anywhere}button{display:none}section{margin:24px 0}</style>'+report.outerHTML,'text/html;charset=utf-8');
  },'download'));
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
function appendDailyTaskFields(grid,draft) {
  const options=taskGoalOptions();if(draft.goalLink && !options.some(([key])=>key===draft.goalLink))options.push([draft.goalLink,'Existing priority link']);
  const followUp=planningInput('date',draft.followUp,value=>draft.followUp=value);
  followUp.setAttribute('aria-label','Follow-up date');
  grid.append(planningField('Contributes to',planningSelect(options,draft.goalLink,value=>draft.goalLink=value)),
    planningField('Follow-up date',planningOptionalDate(followUp,'Clear follow-up date',()=>draft.followUp='')),
    planningField('Task kind',planningSelect([['task','Task'],['experience','Experience to try']],draft.intent,value=>draft.intent=value)));
  const minutes=planningInput('number',draft.minutes,value=>draft.minutes=value);minutes.min=1;minutes.max=1440;minutes.step=1;
  grid.append(planningField('Next action (optional)',planningInput('text',draft.nextAction,value=>draft.nextAction=value)),planningField('Estimated minutes (optional)',minutes),planningField('Start time (optional)',planningInput('time',draft.startTime,value=>draft.startTime=value)));
}
