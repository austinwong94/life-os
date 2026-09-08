const conflictReviewDrafts=new Map();
let quickBoardPickerSignature='';

function renderQuickBoardPicker() {
  const trigger=document.getElementById('boardSwitcherButton');
  if (!trigger) return;
  document.getElementById('boardSwitcherName').textContent=state.board.name;
  trigger.setAttribute('aria-label','Switch board, current: '+state.board.name);
  const menu=document.getElementById('boardSwitcherMenu');
  if (!menu) return;
  const signature=JSON.stringify([state.activeBoardId,state.boards.map(board=>[board.id,board.name])]);
  if (signature===quickBoardPickerSignature) return;
  quickBoardPickerSignature=signature;
  const focusedId=menu.contains(document.activeElement)?document.activeElement.dataset.boardId:null;
  menu.replaceChildren();
  for (const board of state.boards) {
    const option=document.createElement('button');option.type='button';option.className='board-choice';option.dataset.boardId=board.id;
    option.setAttribute('role','menuitemradio');option.setAttribute('aria-checked',String(board.id===state.activeBoardId));option.tabIndex=-1;
    const name=document.createElement('span');name.textContent=board.name;
    const mark=document.createElement('span');mark.className='board-choice-mark';mark.setAttribute('aria-hidden','true');mark.innerHTML=ICONS.check;
    option.append(name,mark);menu.append(option);
  }
  const manage=document.createElement('button');manage.type='button';manage.className='board-picker-manage';manage.dataset.manageBoards='';manage.setAttribute('role','menuitem');manage.tabIndex=-1;manage.textContent='Manage boards';menu.append(manage);
  if (focusedId && !menu.hidden) (Array.from(menu.querySelectorAll('[data-board-id]')).find(button=>button.dataset.boardId===focusedId) || menu.firstElementChild)?.focus();
}

function initializeQuickBoardPicker() {
  const trigger=document.getElementById('boardSwitcherButton');
  const menu=document.createElement('div');menu.id='boardSwitcherMenu';menu.className='board-switcher-menu';menu.hidden=true;
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','Boards');document.body.append(menu);renderQuickBoardPicker();
  let query='',typedAt=0;
  const options=()=>[...menu.querySelectorAll('[role=menuitemradio],[role=menuitem]')];
  const close=(restoreFocus=false)=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');query='';if(restoreFocus)trigger.focus({preventScroll:true});};
  const open=(last=false)=>{
    renderQuickBoardPicker();const rect=trigger.getBoundingClientRect(),margin=12;
    const width=Math.min(Math.max(rect.width,280),360,window.innerWidth-margin*2);
    const bottomNavigation=window.matchMedia('(max-width: 980px)').matches?(document.querySelector('.sidebar')?.getBoundingClientRect().height || 0):0;
    const below=window.innerHeight-bottomNavigation-rect.bottom-margin-6,above=rect.top-margin-6;
    menu.style.width=width+'px';menu.style.left=Math.max(margin,Math.min(rect.left,window.innerWidth-width-margin))+'px';
    menu.style.maxHeight=Math.max(44,Math.min(420,below>=180 || below>=above?below:above))+'px';
    menu.style.top=below>=180 || below>=above?rect.bottom+6+'px':'auto';
    menu.style.bottom=below>=180 || below>=above?'auto':window.innerHeight-rect.top+6+'px';
    menu.hidden=false;trigger.setAttribute('aria-expanded','true');
    (last?options().at(-1):menu.querySelector('[aria-checked=true]') || options()[0])?.focus({preventScroll:true});
    document.activeElement?.scrollIntoView({block:'nearest'});
  };
  trigger.onclick=()=>menu.hidden?open():close();
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(event.key==='ArrowUp');}});
  menu.addEventListener('click',event=>{
    const option=event.target.closest('button');if(!option)return;
    close(true);
    if(option.hasAttribute('data-manage-boards')){openSettingsModal();return;}
    if(option.dataset.boardId!==state.activeBoardId && state.boards.some(board=>board.id===option.dataset.boardId))switchBoard(option.dataset.boardId);
  });
  menu.addEventListener('keydown',event=>{
    const buttons=options(),index=buttons.indexOf(document.activeElement);let next=-1;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close(true);return;}
    if(event.key==='ArrowDown')next=(index+1)%buttons.length;
    if(event.key==='ArrowUp')next=(index-1+buttons.length)%buttons.length;
    if(event.key==='Home')next=0;
    if(event.key==='End')next=buttons.length-1;
    if(event.key.length===1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key!==' '){
      query=Date.now()-typedAt>700?'':query;query+=event.key.toLocaleLowerCase();typedAt=Date.now();
      next=buttons.findIndex(button=>button.textContent.toLocaleLowerCase().startsWith(query));
    }
    if(next>=0){event.preventDefault();buttons[next].focus();}
  });
  document.addEventListener('click',event=>{if(!menu.hidden && !menu.contains(event.target) && !trigger.contains(event.target))close();});
  document.addEventListener('focusin',event=>{if(!menu.hidden && !menu.contains(event.target) && !trigger.contains(event.target))close();});
  window.addEventListener('resize',()=>close());
  document.addEventListener('scroll',event=>{if(!menu.hidden && !menu.contains(event.target))close();},{capture:true,passive:true});
}

function resolveLiveCard(card) {
  return state.cards.find(item => item.id === card.id) || getArchivedCards().find(item => item.id === card.id) || card;
}

function reconcileActiveBoard() {
  const board = state.boards.find(item => item.id === state.activeBoardId);
  if (!board) return;
  const previous = new Map(state.cards.map(card => [card.id, card]));
  state.cards = board.cards.map(card => {
    const live = previous.get(card.id);
    if (live) return reconcileRecord(live, card);
    return card;
  });
  state.archivedCards = reconcileRecord(state.archivedCards || [], board.archivedCards || []);
  state.board = {...state.board, name: board.name, visibility: board.visibility, layout: board.layout, columnCount: board.columnCount, savedLayout: board.savedLayout};
}

function reconcileRecord(current, incoming) {
  if (current === incoming) return current;
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const keyed = new Map(current.filter(item=>item && typeof item==='object' && item.id).map(item=>[item.id,item]));
    const next = incoming.map((item,index)=>reconcileRecord(item?.id ? keyed.get(item.id) : current[index],item));
    current.splice(0,current.length,...next);
    return current;
  }
  if (current && incoming && typeof current==='object' && typeof incoming==='object' && !Array.isArray(current) && !Array.isArray(incoming)) {
    for (const key of Object.keys(current)) if (!Object.hasOwn(incoming,key)) delete current[key];
    for (const key of Object.keys(incoming)) {
      if (['__proto__','prototype','constructor'].includes(key)) continue;
      current[key]=reconcileRecord(current[key],incoming[key]);
    }
    return current;
  }
  return incoming;
}

function setSaveStatus(message, kind = "local") {
  const label = document.getElementById("savedState");
  const header = document.getElementById("headerSaveStatus");
  if (label) {
    label.textContent = message;
    label.classList.toggle("is-sync-error", kind === "error");
    label.classList.toggle("is-saving", kind === "saving");
  }
  if (header) {header.textContent = (PREVIEW_MODE ? "Preview · " : "") + message; header.dataset.status = kind;}
}

function rememberCloudBase(snapshot, ownerId) {
  cloudMergeBase = {ownerId, state: JSON.parse(JSON.stringify(snapshot))};
  writeLocalJson("life-os-cloud-base-v2", cloudMergeBase, {silent: true});
}

function isValidBackup(parsed) {
  const data = parsed?.state || parsed;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const validCard = card => card && typeof card === "object" && typeof card.id === "string" && card.id && typeof card.type === "string" && Object.hasOwn(TYPE_META, card.type) &&
    (!card.plannerTasks || (Array.isArray(card.plannerTasks) && card.plannerTasks.every(task => task && typeof task.id === 'string' && task.id && typeof task.title === 'string') && new Set(card.plannerTasks.map(task => task.id)).size === card.plannerTasks.length));
  const uniqueCards = cards => cards.every(validCard) && new Set(cards.map(card => card.id)).size === cards.length;
  if (Array.isArray(data.boards) && data.boards.length) {
    const ids = new Set();
    return data.boards.every(board => {
      if (!board || typeof board.id !== "string" || !board.id || ids.has(board.id) || !Array.isArray(board.cards)) return false;
      ids.add(board.id);
      if (board.archivedCards && !Array.isArray(board.archivedCards)) return false;
      return uniqueCards([...board.cards, ...(board.archivedCards || [])]);
    });
  }
  return Array.isArray(data.cards) && (!data.archivedCards || Array.isArray(data.archivedCards)) && uniqueCards([...data.cards, ...(data.archivedCards || [])]);
}

function restorePlannerTask(cardId, taskId) {
  const card = getPlannerSourceCards().find(item => item.id === cardId);
  if (!card) return;
  LifePlanner.change(card, taskId, {archivedAt: 0, deletedAt: 0});
  LifePlanner.project(card);
  saveState(); renderCardsOnly({force: true}); renderRecordsModal();
}

function renderArchivedPlannerTasks() {
  const search = String(elements.recordsSearch.value || "").toLowerCase();
  const filters = getArchiveFilters();
  const items = getPlannerSourceCards().flatMap(card => LifePlanner.ensure(card)
    .filter(task => task.archivedAt || task.deletedAt).map(task => ({card, task})))
    .filter(({task}) => !search || task.title.toLowerCase().includes(search))
    .filter(({card,task}) => (filters.type==='all' || filters.type==='planner') && (filters.area==='all' || card.category===filters.area) && matchesArchiveDateFilter({archivedAt:task.deletedAt || task.archivedAt},filters.date))
    .sort((a, b) => (b.task.deletedAt || b.task.archivedAt) - (a.task.deletedAt || a.task.archivedAt));
  if (!items.length) return null;
  const section = document.createElement("section");
  section.className = "archived-task-section";
  const heading = document.createElement("h3"); heading.textContent = "Planner tasks";
  section.append(heading);
  items.forEach(({card, task}) => {
    const row = document.createElement("div"); row.className = "archived-task-row";
    const copy = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = task.title;
    const detail = document.createElement("small");
    detail.textContent = task.dateKey + " · " + (task.deletedAt ? "Removed" : "Archived") + " · " + (task.done ? "Completed " + (task.completedOn || "(date unknown)") : "Unfinished");
    copy.append(title, detail);
    const restore = document.createElement("button"); restore.type = "button"; restore.className = "secondary-action";
    restore.textContent = "Restore"; restore.addEventListener("click", () => restorePlannerTask(card.id, task.id));
    row.append(copy, restore); section.append(row);
  });
  return section;
}

function openRecovery() {
  closeOtherOverlays();
  let modal = document.getElementById("recoveryModal");
  if (modal) modal.remove();
  modal = document.createElement("div"); modal.id = "recoveryModal"; modal.className = "modal-backdrop";
  const dialog = document.createElement("section"); dialog.className = "recovery-dialog";
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-labelledby", "recoveryTitle");
  const header = document.createElement("header"); header.className = "modal-header";
  const title = document.createElement("h2"); title.id = "recoveryTitle"; title.textContent = "Recovery copies";
  const close = document.createElement("button"); close.type = "button"; close.className = "icon-button"; close.innerHTML = ICONS.x;
  close.setAttribute("aria-label", "Close recovery"); close.onclick = () => {modal.remove(); syncModalOpenState(); document.getElementById("headerSaveStatus").focus();};
  header.append(title, close); dialog.append(header);
  const body = document.createElement("div"); body.className = "recovery-body";
  const review = renderConflictReview();
  if (review) body.append(review);
  const copies = readLocalJsonValue(CLOUD_RECOVERY_KEY, []);
  const info = document.createElement("p");
  info.textContent = copies.length ? "Saved before a restore, deletion, or conflicting edit. Restoring keeps cloud sync paused." : "No recovery copies yet. Your current information can be downloaded in Settings.";
  body.append(info);
  const current = document.createElement("button"); current.className = "secondary-action"; current.textContent = "Download current information";
  current.onclick = exportReadableDataArchive; body.append(current);
  current.disabled = corruptLocalStateDetected;
  let preUpgrade = null;
  try {preUpgrade=localStorage.getItem(PRE_UPGRADE_KEY);} catch {}
  if (preUpgrade) {
    const original=document.createElement("button"); original.className="secondary-action"; original.textContent="Download untouched pre-upgrade backup";
    original.onclick=()=>downloadTextFile("life-os-before-upgrade.json",preUpgrade,"application/json"); body.append(original);
  }
  copies.forEach(copy => {
    const row = document.createElement("div"); row.className = "recovery-row";
    const title = document.createElement("strong"); title.textContent = formatRecordDateTime(copy.savedAt);
    const reason = document.createElement("small"); reason.textContent = String(copy.reason || "Recovery").replaceAll("-", " ");
    const download = document.createElement("button"); download.className = "secondary-action"; download.textContent = "Read / download";
    download.onclick = () => typeof copy.rawState === 'string' ? downloadTextFile('life-os-original-storage.txt', copy.rawState, 'text/plain') : downloadTextFile("life-os-recovery.html", buildReadableDataArchive(copy.state), "text/html;charset=utf-8");
    if (typeof copy.rawState === 'string') download.textContent = 'Download original storage';
    const restore = document.createElement("button"); restore.className = "secondary-action"; restore.textContent = "Restore this device";
    restore.disabled = typeof copy.rawState === 'string';
    restore.onclick = async () => {if (await importBoardBackup(new File([JSON.stringify(copy.state)], "recovery.json", {type: "application/json"}))) { modal.remove(); syncModalOpenState(); }};
    row.append(title, reason, download, restore); body.append(row);
  });
  if (corruptLocalStateDetected) {
    const damaged = document.createElement("button"); damaged.className = "secondary-action"; damaged.textContent = "Download original storage";
    damaged.onclick = () => {
      try {downloadTextFile("life-os-original-storage.txt", localStorage.getItem(STORAGE_KEY) || "", "text/plain");}
      catch {setSaveStatus("Browser storage is blocked", "error");}
    };
    body.append(damaged);
  }
  dialog.append(body); modal.append(dialog); document.body.append(modal); syncModalOpenState(); close.focus();
  modal.addEventListener("keydown", event => {
    if (event.key === "Escape") {event.stopPropagation(); close.click();}
    if (event.key === "Tab") {
      const controls = [...dialog.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), summary")].filter(node=>node.getClientRects().length);
      const first=controls[0], last=controls.at(-1);
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
    }
  });
}

function getConflictLabel(conflict) {
  const segments=conflict.segments || [];
  const board=state.boards.find(item=>item.id===segments[1]);
  const card=[...(board?.cards || []),...(board?.archivedCards || [])].find(item=>item.id===segments[3]);
  const task=segments[4]==='plannerTasks'?card?.plannerTasks?.find(item=>item.id===segments[5]):null;
  const labels={name:'Name',title:'Title',description:'Notes',thoughts:'Diary thoughts',sentence:'One sentence',text:'Note',note:'Notes',quoteAuthor:'Author'};
  const date=segments.find(part=>/^\d{4}-\d{2}-\d{2}$/.test(part)) || task?.dateKey;
  if (conflict.kind==='health-record') {
    const types={'food-item':'Logged food','food-definition':'Food library','food-target':'Nutrition target','fitness-exercise':'Exercise','fitness-part':'Workout','body-metrics':'Body measurements'};
    const meal=card?.foodEntries?.[segments[5]]?.meals?.find(meal=>meal.id===segments[7]);
    return [board?.name || 'Saved board',card?.title,date || (segments[4]==='foodTargets'?segments[5]:''),meal?.name,types[conflict.recordType]].filter(Boolean).join(' / ');
  }
  return [board?.name || 'Saved record',task?.title || card?.title,date,labels[segments.at(-1)] || 'Record change'].filter(Boolean).join(' / ');
}

function renderConflictReview() {
  if (!state.syncConflicts?.length) return null;
  const section=document.createElement('section');section.className='conflict-review';
  const heading=document.createElement('h3');heading.textContent='Review changes';
  const status=document.createElement('p');status.className='conflict-review-status';status.textContent=state.syncConflicts.length+' unresolved';status.setAttribute('aria-live','polite');
  section.append(heading,status);
  for(const conflict of state.syncConflicts) {
    const row=document.createElement('article');row.className='conflict-item';
    const title=document.createElement('h4');title.textContent=getConflictLabel(conflict);row.append(title);
    if (conflict.kind==='health-record') {
      row.classList.add('health-conflict-item');
      row.append(renderHealthConflictForm(conflict,()=>{
        row.replaceChildren(title);
        const done=document.createElement('p');done.textContent='Health version saved. The previous versions remain in Recovery copies.';row.append(done);
        status.textContent=state.syncConflicts.length?state.syncConflicts.length+' unresolved':'All changes reviewed';
      }));
      section.append(row);continue;
    }
    if (conflict.kind==='planner-task') {
      row.classList.add('planner-conflict-item');
      row.append(renderPlannerConflictForm(conflict,()=>{
        row.replaceChildren(title);
        const done=document.createElement('p');done.textContent='Task version saved. The previous versions remain in Recovery copies.';row.append(done);
        status.textContent=state.syncConflicts.length?state.syncConflicts.length+' unresolved':'All changes reviewed';
      }));
      section.append(row);continue;
    }
    let inspection=LifeStateMerge.inspectTextConflict(getStateForStorage(),conflict);
    const message=document.createElement('p');message.className='conflict-message';message.setAttribute('role','status');
    if (!inspection.editable) {
      message.textContent='This record needs a full recovery copy. Text-only changes cannot safely restore a deletion, date, or measurement.';
      row.append(message);section.append(row);continue;
    }
    let expected=inspection.current;
    const form=document.createElement('form');form.className='conflict-form';
    const choices=document.createElement('fieldset');choices.className='conflict-choices';
    const legend=document.createElement('legend');legend.textContent='Version to keep';choices.append(legend);
    const values=[];
    const addChoice=(label,value)=>{
      if(values.some(item=>item.value===value))return;
      const option=document.createElement('label');option.className='conflict-option';
      const radio=document.createElement('input');radio.type='radio';radio.name='choice';radio.value=String(values.length);
      const name=document.createElement('strong');name.textContent=label;
      const text=document.createElement('div');text.className='conflict-text';text.textContent=value || '(Empty)';
      option.append(radio,name,text);choices.append(option);values.push({value,radio,text});
    };
    addChoice('Current entry',expected);
    addChoice(conflict.source==='cloud'?'This device at conflict':'Captured version 1',conflict.local);
    addChoice(conflict.source==='cloud'?'Cloud version at conflict':'Other tab version',conflict.remote);
    const customLabel=document.createElement('label');customLabel.className='conflict-combine';
    const customRadio=document.createElement('input');customRadio.type='radio';customRadio.name='choice';customRadio.value='custom';
    customLabel.append(customRadio,document.createTextNode('Combine or edit'));
    const draftKey='life-os-conflict-draft:'+conflict.id;
    let draft=conflictReviewDrafts.get(conflict.id);
    try {draft=sessionStorage.getItem(draftKey) ?? draft;} catch {}
    const custom=document.createElement('textarea');custom.className='conflict-custom';custom.value=draft ?? expected;custom.rows=6;custom.hidden=draft===undefined;custom.setAttribute('aria-label','Combined version');
    customRadio.checked=draft!==undefined;
    const actions=document.createElement('div');actions.className='conflict-actions';
    const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary-action';refresh.textContent='Refresh comparison';
    const save=document.createElement('button');save.type='submit';save.className='primary-action';save.textContent='Save choice';save.disabled=draft===undefined;
    custom.addEventListener('input',()=>{
      conflictReviewDrafts.set(conflict.id,custom.value);
      try{sessionStorage.setItem(draftKey,custom.value);}catch{message.textContent='This combined draft is only in memory. Keep this tab open until your choice is saved.';}
    });
    refresh.onclick=async()=>{
      if(!await flushDeviceWrites()){message.textContent='Saving needs attention. Your combined draft is unchanged.';return;}
      if(!state.syncConflicts.some(item=>item.id===conflict.id)){message.textContent='This change has already been reviewed in another tab.';save.disabled=true;return;}
      inspection=LifeStateMerge.inspectTextConflict(getStateForStorage(),conflict);
      if(!inspection.editable){message.textContent='This record is no longer available as a text entry.';save.disabled=true;return;}
      expected=inspection.current;values[0].value=expected;values[0].text.textContent=expected || '(Empty)';
      message.textContent='Current entry refreshed. Your combined draft is unchanged.';
    };
    form.addEventListener('change',event=>{if(!event.target.matches('input[type="radio"]'))return;custom.hidden=!customRadio.checked;save.disabled=false;if(customRadio.checked)custom.focus();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();const selected=form.querySelector('input[name="choice"]:checked');if(!selected)return;
      save.disabled=true;refresh.disabled=true;
      try {
        await applyConflictTextChoice(conflict,expected,selected.value==='custom'?custom.value:values[Number(selected.value)].value);
        conflictReviewDrafts.delete(conflict.id);try{sessionStorage.removeItem(draftKey);}catch{}
        row.replaceChildren(title);const done=document.createElement('p');done.textContent='Choice saved. The previous versions remain in Recovery copies.';row.append(done);
        status.textContent=state.syncConflicts.length?state.syncConflicts.length+' unresolved':'All changes reviewed';
      } catch(error){message.textContent=error.message;save.disabled=false;refresh.disabled=false;}
    });
    actions.append(refresh,save);form.append(choices,customLabel,custom,message,actions);row.append(form);section.append(row);
  }
  return section;
}

async function applyConflictTextChoice(conflict,expected,text) {
  return applyConflictChoice(conflict,expected,text,LifeStateMerge.resolveTextConflict);
}

async function applyPlannerTaskChoice(conflict,expected,task) {
  return applyConflictChoice(conflict,expected,task,LifeStateMerge.resolvePlannerTaskConflict);
}

async function applyConflictChoice(conflict,expected,choice,resolve) {
  if(corruptLocalStateDetected || !lastLocalSaveOk || !await flushDeviceWrites()) throw new Error('Saving needs attention. Download your current writing before reviewing changes.');
  await LifeDeviceStore.locked(()=>{
    if(LifeDeviceStore.pending().length)throw new Error('Another edit is still saving. Try Save choice again.');
    if(conflict.source==='cloud' && cloudSession?.user?.id!==conflict.ownerId)throw new Error('Sign in to the account that created this cloud comparison.');
    const saved=readStoredStateSnapshot();if(!saved)throw new Error('The saved copy could not be read. Nothing was replaced.');
    const next=resolve(saved,conflict,expected,choice);
    if (conflict.kind==='planner-task') {
      const board=next.boards.find(board=>board.id===conflict.segments[1]);
      const source=board[conflict.segments[2]].find(card=>card.id===conflict.segments[3]);
      LifePlanner.project(source);
    }
    if(!saveCloudRecoveryPoint('before-conflict-resolution',saved))throw new Error('The recovery copy could not be saved. Nothing was replaced.');
    if(!writeLocalJson(STORAGE_KEY,next,{silent:true}))throw new Error('The choice could not be saved. The original entry remains unchanged.');
  });
  await flushDeviceWrites();
  if(!state.syncConflicts.length){setSaveStatus(cloudSaveEnabled?'Saved on device, checking cloud':'Saved on device',cloudSaveEnabled?'saving':'local');queueCloudSave({immediate:true});}
}

function renderPlannerTaskVersion(task) {
  const copy=document.createElement('div');copy.className='planner-conflict-version';
  const title=document.createElement('p');title.className='planner-conflict-title';title.textContent=task.title;
  const dates=document.createElement('dl');
  const dateLabel=value=>value?dateKeyToLocalDate(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Not completed';
  const add=(target,label,value)=>{
    const term=document.createElement('dt'),detail=document.createElement('dd');
    term.textContent=label;detail.textContent=value;target.append(term,detail);
  };
  add(dates,'On board',task.deletedAt?'Removed':task.archivedAt?'Archived':'Visible');
  add(dates,'Status',task.done?'Completed':'Incomplete');
  add(dates,'Planned',dateLabel(task.dateKey));
  add(dates,'Completed',dateLabel(task.completedOn));
  const history=document.createElement('details');history.className='planner-conflict-history';
  const summary=document.createElement('summary');summary.textContent='Full timestamps';
  const details=document.createElement('dl');
  add(details,'Originally planned',dateLabel(task.originalDateKey));
  for (const [label,key] of [['Created','createdAt'],['Edited','updatedAt'],['Completion time','completedAt'],['Completion recorded','completionRecordedAt'],['Archived','archivedAt'],['Removed','deletedAt']]) {
    add(details,label,task[key]?new Date(task[key]).toLocaleString(undefined,{
      year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,timeZoneName:'short'
    }):'Not recorded');
  }
  history.append(summary,details);copy.append(title,dates,history);return copy;
}

function renderPlannerConflictForm(conflict,onSaved) {
  return renderRecordConflictForm(conflict,onSaved,{
    noun:'task',currentLabel:'Current task',scope:'task',className:'planner-conflict-form',
    inspect:LifeStateMerge.inspectPlannerTaskConflict,render:renderPlannerTaskVersion,apply:applyPlannerTaskChoice,
    introduction:'Choose one complete task version. Its dates, completion and archive status stay together. Other tasks are unchanged.',
    unavailable:'This task has missing or ambiguous history, or its source moved. Keep the recovery copy for review; no task dates or completion were guessed.'
  });
}

function renderHealthVersion(record,conflict) {
  const content=document.createElement('div');content.className='planner-conflict-version health-conflict-version';
  const title=document.createElement('p');title.className='planner-conflict-title';title.textContent=record.name || (conflict.recordType==='body-metrics'?'Body measurements':conflict.recordType==='food-target'?'Daily target':getFitnessPartMeta(conflict.segments[7]).label);
  const values=document.createElement('dl');
  const add=(label,value)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;values.append(dt,dd);};
  const number=(value,unit='')=>value===''?'Not recorded':String(value)+(unit?' '+unit:'');
  if (['food-item','food-definition','food-target'].includes(conflict.recordType)) {
    const totals=conflict.recordType==='food-item'?calculateFoodItem({foodLibrary:[]},record):record;
    if (conflict.recordType==='food-item') {
      add('Amount',number(record.amount,record.unit==='g'?'g':record.amount===1?'serving':'servings'));
    }
    if (conflict.recordType!=='food-target') add('Per serving',record.servingUnit+' = '+record.servingGrams+' g');
    if (conflict.recordType==='food-item') add('Values below','For this logged amount');
    else if (conflict.recordType==='food-definition') add('Values below','Per serving');
    for (const key of FOOD_NUTRIENT_KEYS) {
      const meta=FOOD_NUTRIENT_META[key];
      add(meta.label,number(Number(totals[key].toFixed(meta.decimals)),meta.unit));
    }
    if (record.source) add('Source',record.source);
  } else if (conflict.recordType==='fitness-exercise') {
    for (const [label,key,unit] of [['Sets','sets',''],['Reps','reps',''],['Weight','weightKg','kg'],['Effort (RPE)','rpe','/10']]) add(label,number(record[key],unit));
  } else if (conflict.recordType==='body-metrics') {
    for (const field of FITNESS_METRIC_FIELDS) add(field.label,number(record[field.key],field.suffix));
  } else {
    add('Logged',record.active?'Yes':'No');
    if (conflict.segments[7]==='running') {add('Distance',number(record.distanceKm,'km'));add('Effort',record.intensity);}
    else add('Activity',record.area);
    add('Duration',number(record.durationMinutes,'min'));
  }
  content.append(title,values);
  if (record.notes) {const notes=document.createElement('p');notes.className='health-conflict-notes';notes.textContent=record.notes;content.append(notes);}
  return content;
}

function renderHealthConflictForm(conflict,onSaved) {
  return renderRecordConflictForm(conflict,onSaved,{
    noun:'health',currentLabel:'Current entry',scope:'entry',className:'health-conflict-form',
    inspect:LifeStateMerge.inspectHealthConflict,render:record=>renderHealthVersion(record,conflict),
    apply:(conflict,expected,selected)=>applyConflictChoice(conflict,expected,selected,LifeStateMerge.resolveHealthConflict),
    introduction:'Keep one recorded version. Other foods, workouts, dates and boards are unchanged.',
    unavailable:'This health record is missing, moved or incomplete. Keep the recovery copy for review; no measurements or nutrition values were guessed.'
  });
}

function renderRecordConflictForm(conflict,onSaved,options) {
  const form=document.createElement('form');form.className='record-conflict-form '+options.className;
  let inspection=options.inspect(getStateForStorage(),conflict);
  const message=document.createElement('p');message.className='conflict-message';message.setAttribute('role','status');
  if (!inspection.editable) {
    message.textContent=options.unavailable;
    form.append(message);return form;
  }
  let expected=inspection.current,values=[],busy=false;
  const introduction=document.createElement('p');introduction.className='planner-conflict-intro';
  introduction.textContent=options.introduction;
  const choices=document.createElement('fieldset');choices.className='conflict-choices';
  const legend=document.createElement('legend');legend.textContent=(options.noun==='task'?'Task':'Health')+' version to keep';
  const consent=document.createElement('label');consent.className='planner-conflict-consent';
  const agree=document.createElement('input');agree.type='checkbox';
  consent.append(agree,document.createTextNode('Apply this version to this '+options.scope+' only.'));
  const actions=document.createElement('div');actions.className='conflict-actions';
  const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary-action';refresh.textContent='Refresh comparison';
  const save=document.createElement('button');save.type='submit';save.className='primary-action';save.textContent='Save '+options.noun+' version';save.disabled=true;
  const updateButton=()=>{save.disabled=busy || !agree.checked || !choices.querySelector('input:checked');};
  const renderChoices=()=>{
    choices.replaceChildren(legend);values=[];agree.checked=false;save.disabled=true;
    for (const [label,task] of [[options.currentLabel,expected],[conflict.source==='cloud'?'This device at conflict':'Captured version 1',conflict.local],[conflict.source==='cloud'?'Cloud version at conflict':'Other tab version',conflict.remote]]) {
      if (values.some(value=>LifeStateMerge.equal(value,task))) continue;
      const option=document.createElement('label');option.className='conflict-option';
      const radio=document.createElement('input');radio.type='radio';radio.name='record-version';radio.value=String(values.length);radio.setAttribute('aria-label',label);
      const name=document.createElement('strong');name.textContent=label;
      option.append(radio,name,options.render(task));choices.append(option);values.push(task);
      radio.onchange=()=>{agree.checked=false;updateButton();};
    }
  };
  renderChoices();agree.onchange=updateButton;
  refresh.onclick=async()=>{
    if (busy) return;
    if (!await flushDeviceWrites()) {message.textContent='Saving needs attention. No record was changed.';return;}
    const live=state.syncConflicts.find(item=>item.id===conflict.id);
    inspection=options.inspect(getStateForStorage(),conflict);
    if (!live || !LifeStateMerge.equal(live,conflict) || !inspection.editable) {
      choices.disabled=agree.disabled=true;save.disabled=true;
      message.textContent='This comparison changed or was reviewed elsewhere. Reopen Recovery to see the current changes.';return;
    }
    expected=inspection.current;renderChoices();message.textContent='Current '+options.scope+' refreshed. Select and confirm a version again.';
  };
  form.onsubmit=async event=>{
    event.preventDefault();const selected=choices.querySelector('input:checked');
    if (busy || !selected || !agree.checked) return;
    const chosen=values[Number(selected.value)];busy=true;save.disabled=refresh.disabled=choices.disabled=agree.disabled=true;
    try {await options.apply(conflict,expected,chosen);onSaved();}
    catch(error) {message.textContent=error.message || 'The record could not be saved. No version was discarded.';}
    finally {busy=false;refresh.disabled=choices.disabled=agree.disabled=false;updateButton();}
  };
  actions.append(refresh,save);form.append(introduction,choices,consent,message,actions);return form;
}

function initializeExperience() {
  initializeQuickBoardPicker();
  mountResponsiveComposer();
  restoreTabBoardSelection();
  LifeDeviceStore.configure(commitDeviceWrites);
  if (!corruptLocalStateDetected) flushDeviceWrites();
  cloudConflictPending = Boolean(state.syncConflicts?.length);
  cloudMergeBase = readLocalJsonValue("life-os-cloud-base-v2", null);
  if (isRestoreSyncPaused()) {cloudSaveEnabled = false; window.clearTimeout(cloudSaveTimer);}
  const status = document.getElementById("headerSaveStatus");
  status.onclick = () => cloudConflictPending || corruptLocalStateDetected ? openRecovery() : openSettingsModal();
  const observer = new MutationObserver(() => {
    status.textContent = (PREVIEW_MODE ? "Preview · " : "") + elements.savedState.textContent;
    status.dataset.status = elements.savedState.classList.contains("is-sync-error") ? "error" : elements.savedState.classList.contains("is-saving") ? "saving" : "local";
  });
  observer.observe(elements.savedState, {childList: true, characterData: true, attributes: true, subtree: true});
  document.getElementById("recoveryButton").onclick = openRecovery;
  document.getElementById("boardModeButton").onclick = () => setWorkspaceMode("board");
  document.getElementById("todayModeButton").onclick = () => setWorkspaceMode("today");
  document.getElementById("weeklyReviewButton").onclick = () => {activeReportType = "progress"; openReportsModal();};
  elements.visibilityControl.closest(".field").hidden = true;
  elements.visibilityLabel.textContent = "Personal board";
  document.querySelector(".board-tools-field").removeAttribute("hidden");
  elements.boardPanel.append(document.querySelector(".board-tools-field"));
  if (window.matchMedia("(max-width: 700px)").matches) state.ui.controlsOpen = false;
  renderBoardMeta();
  renderCardsOnly({force:true});
  document.getElementById("railTemplatesButton").hidden = true;
  const templates = document.createElement("button"); templates.type = "button"; templates.className = "secondary-action"; templates.textContent = "Browse board templates";
  templates.onclick = () => openTemplateModal(); elements.boardPanel.append(templates);
  setSaveStatus(corruptLocalStateDetected ? "Recovery needed - original protected" : cloudConflictPending ? "Changes need review" : isRestoreSyncPaused() ? "Restored on device - cloud paused" : cloudSession ? "Saved on device - checking cloud" : "Saved on device", corruptLocalStateDetected || cloudConflictPending ? "error" : "local");
  window.addEventListener("online", () => {if (cloudSaveEnabled) queueCloudSave({immediate: true});});
  window.addEventListener("offline", () => setSaveStatus(lastLocalSaveOk ? "Offline - saved on device" : "Offline - export your draft", lastLocalSaveOk ? "local" : "error"));
}

function mountResponsiveComposer() {
  // A filtered/fixed navigation bar must not become the modal's containing block.
  document.body.append(elements.cardComposerPanel);
  const preview = document.createElement("details");
  preview.className = "composer-inline-preview";
  const summary = document.createElement("summary");
  summary.textContent = "Preview card";
  preview.append(summary);
  elements.form.querySelector(".form-actions").before(preview);
  const compact = window.matchMedia("(max-width: 1100px)");
  const placePreview = () => {
    preview.hidden = !compact.matches;
    (compact.matches ? preview : document.body).append(elements.boardPreviewPanel);
  };
  placePreview();
  compact.addEventListener("change", placePreview);
}

function restoreTabBoardSelection() {
  try {
    const preferred=sessionStorage.getItem("life-os-active-board");
    if (state.boards.some(board=>board.id===preferred)) applyBoardToState(state,preferred);
    sessionStorage.setItem("life-os-active-board",state.activeBoardId);
  } catch {}
}

function setWorkspaceMode(mode) {
  if (isProtectedTextEditActive()) document.activeElement?.blur();
  state.ui.workspaceMode = mode === "today" ? "today" : "board";
  state.activeFilter = "all"; state.focusFilter = "all"; state.searchQuery = ""; state.activeCategories = [];
  renderCardsOnly({force: true}); renderBoardMeta(); saveState({touch: false, skipCloud: true});
}

function renderTodaySpace() {
  const root = elements.boardGrid;
  const head = document.createElement("header"); head.className = "today-intro";
  const title = document.createElement("h2"); title.textContent = "Today, at your pace";
  const text = document.createElement("p"); text.textContent = "One next step. A note worth keeping. Room to begin again.";
  head.append(title, text); root.append(head);
  const wanted = ["planlist", "diary", "sidenote"];
  const grid = document.createElement("div"); grid.className = "today-cards";
  wanted.forEach(type => {
    const card = state.cards.find(card => card.type === type && (type !== "planlist" || card.plannerView === "today"));
    if (card) {grid.append(renderCard(card)); return;}
    const add = document.createElement("button"); add.className = "today-add-card secondary-action";
    add.innerHTML = ICONS.plus;
    const label = document.createElement("span"); label.textContent = type === "planlist" ? "Add today's planner" : type === "diary" ? "Add a diary" : "Add quick notes";
    add.append(label); add.onclick = () => {openCardComposer(); setFormType(type); if (type === "planlist") elements.plannerViewMode.value = "today"; renderConditionalFields();};
    grid.append(add);
  });
  root.append(grid);
}

function renderProgressReport(range) {
  const report = createReportDocument("Life review", range.label + " · " + state.board.name);
  const tasks = getPlannerSourceCards().flatMap(card => LifePlanner.ensure(card)).filter(task => task.done && !task.deletedAt && isDateInReportRange(task.completedOn, range));
  const diary = collectDiaryReportEntries(range);
  const notes = collectSideNoteReportEntries(range);
  const summary = document.createElement("p");
  summary.textContent = tasks.length + " tasks completed · " + diary.length + " diary entries · " + notes.length + " notes captured";
  report.append(summary);
  const message = document.createElement("p"); message.textContent = "Unrecorded days are gaps in the record, not a measure of your effort."; report.append(message);
  const list = document.createElement("div");
  tasks.sort((a,b) => b.completedOn.localeCompare(a.completedOn)).forEach(task => {
    const row = document.createElement("p"); row.textContent = task.completedOn + " · " + task.title; list.append(row);
  });
  if (!tasks.length) {const empty = document.createElement("p"); empty.textContent = "No completed planner tasks recorded in this period."; list.append(empty);}
  report.append(list); return report;
}

function commitDeviceWrites(entries) {
  if (corruptLocalStateDetected) return false;
  let saved = readStoredStateSnapshot() || localMergeBase;
  const hadTrackedConflicts=Boolean(state.syncConflicts?.length || saved.syncConflicts?.length);
  let resolutions={...(saved.conflictResolutions || {})};
  let conflicts=LifeStateMerge.registerConflicts(saved.syncConflicts || [],resolutions,createId);
  for (const item of entries) {
    if (LifeDeviceStore.isApplied(saved,item)) continue;
    const {entry}=item;
    const result = LifeStateMerge.merge(entry.base, entry.state, saved);
    if (result.conflicts.length && !saveCloudRecoveryPoint("concurrent-edit", saved)) return false;
    resolutions={...resolutions,...(entry.state.conflictResolutions || {})};
    conflicts=LifeStateMerge.registerConflicts([...conflicts,...(entry.state.syncConflicts || []),...result.conflicts.map(item=>({...item,source:'device',recordedAt:Date.now()}))],resolutions,createId);
    saved = {...entry.state, boards:result.boards, deletedBoardIds:result.deletedBoardIds,deviceWriteHeads:LifeDeviceStore.appliedHeads(saved,item)};
  }
  const conflictMetadataChanged=!LifeStateMerge.equal(saved.syncConflicts || [],conflicts) || !LifeStateMerge.equal(saved.conflictResolutions || {},resolutions);
  saved.syncConflicts=conflicts;saved.conflictResolutions=resolutions;
  if ((entries.length || conflictMetadataChanged) && !writeLocalJson(STORAGE_KEY, saved, {silent:true})) {
    setSaveStatus("Pending copy saved - main storage full", "error");
    return false;
  }
  // All edits from this JS context were staged synchronously before acquiring
  // the lock. Reconcile from the committed queue, not from an older input copy.
  // A quota failure leaves an unstaged draft in memory. Never reconcile it away.
  const visible = lastLocalSaveOk ? saved : LifeStateMerge.merge(localMergeBase,state,saved);
  state.boards = visible.boards.map(createBoardRecord);
  state.deletedBoardIds = visible.deletedBoardIds || {};
  state.deviceWriteHeads = saved.deviceWriteHeads || {};
  state.syncConflicts=conflicts;state.conflictResolutions=resolutions;
  if (!state.boards.some(board=>board.id===state.activeBoardId)) applyBoardToState(state,state.boards[0]?.id);
  else reconcileActiveBoard();
  syncActiveBoard({touchBoard:false});
  localMergeBase = lastLocalSaveOk ? getStateForStorage() : JSON.parse(JSON.stringify(saved));
  if (conflicts.length) {
    cloudConflictPending = true;
    setSaveStatus("Changes need review", "error");
  } else if(hadTrackedConflicts)cloudConflictPending=false;
  renderBoardMeta();
  renderBoardSwitcher();
  if (!isUserEditingCriticalDraft()) renderCardsOnly();
  return true;
}

async function flushDeviceWrites() {
  try {return await LifeDeviceStore.flush() !== false && lastLocalSaveOk;}
  catch(error) {setSaveStatus("Pending copy kept - saving needs attention", "error"); renderCloudStatus(error.message); return false;}
}
