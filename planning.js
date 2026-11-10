(function (root) {
  "use strict";
  const areas = ["Culturely", "MascotRun", "Sunrise Villa", "Lovely Paradise", "Fitness", "Personal"];
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const shift = (day, count) => { const date = new Date(day+"T12:00:00"); date.setDate(date.getDate()+count); return dateKey(date); };
  function captureDateChoices(today) {
    if(!LifePlanner.validDate(today))throw new Error('A valid local day is required.');
    return [['Today',today],['Tomorrow',shift(today,1)],['In 7 days',shift(today,7)]].filter(([,day])=>LifePlanner.validDate(day));
  }
  function localInput(iso) {
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? dateKey(date)+"T"+String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0") : "";
  }
  function changeActivityStart(draft, value) {
    const follows = draft.endDateFollowsStart ?? (!draft.endDate || draft.endDate === draft.startDate);
    return {...draft, startDate:value, endDate:follows && LifePlanner.validDate(value) ? value : draft.endDate, endDateFollowsStart:follows};
  }
  function activityFromDraft(draft) {
    const title = String(draft.title || "").trim();
    if (!title) throw new Error("Enter an activity name.");
    if (!LifePlanner.validDate(draft.startDate) || !LifePlanner.validDate(draft.endDate)) throw new Error("Choose valid start and end dates.");
    const activity = {title, area:String(draft.area || ""), allDay:Boolean(draft.allDay), startDate:draft.startDate, endDate:draft.endDate,
      location:String(draft.location || "").trim(), url:String(draft.url || "").trim(), notes:String(draft.notes || ""), timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
    if (activity.url) {
      let url; try { url = new URL(activity.url); } catch { throw new Error("Use a full https:// meeting link."); }
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use a secure https:// meeting link without a username or password.");
    }
    if (activity.allDay) {
      if (activity.endDate < activity.startDate) throw new Error("End date must be on or after the start date.");
    } else {
      for (const part of ["start", "end"]) {
        if (!/^\d{2}:\d{2}$/.test(draft[part+"Time"])) throw new Error("Choose start and end times.");
        const input = draft[part+"Date"]+"T"+draft[part+"Time"], date = new Date(input);
        if (!Number.isFinite(date.getTime()) || localInput(date.toISOString()) !== input) throw new Error("That time does not exist in your time zone. Choose another time.");
        activity[part+"At"] = date.toISOString();
      }
      if (activity.endAt <= activity.startAt) throw new Error("End time must be after the start time.");
    }
    return activity;
  }
  function occursOn(activity, day) {
    if (activity.allDay) return activity.startDate <= day && activity.endDate >= day;
    const start = new Date(day+"T00:00:00").getTime(), end = new Date(shift(day,1)+"T00:00:00").getTime();
    const from = Date.parse(activity.startAt), to = Date.parse(activity.endAt || activity.startAt);
    return from < end && (to > start || (to === from && from >= start));
  }
  function googleLink(activity) {
    const stamp = iso => new Date(iso).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
    const dates = activity.allDay ? activity.startDate.replaceAll("-","")+"/"+shift(activity.endDate,1).replaceAll("-","")
      : stamp(activity.startAt)+"/"+stamp(activity.endAt || activity.startAt);
    const url = new URL("https://calendar.google.com/calendar/render");
    url.search = new URLSearchParams({action:"TEMPLATE",text:activity.title,dates,location:activity.location || "",details:[activity.notes,activity.url].filter(Boolean).join("\n")}).toString();
    return url.href;
  }
  const taskEditKeys=['title','dateKey','area','project','status','deadline','notes','priority','goalLink','followUp','intent','minutes','nextAction','startTime'];
  const taskEditValues=draft=>Object.fromEntries(taskEditKeys.map(key=>[key,draft?.[key]]));
  const taskEditChanged=draft=>!draft?.initial || JSON.stringify(taskEditValues(draft))!==JSON.stringify(taskEditValues(draft.initial));
  function validTaskEditDraft(draft,boardId){
    try{
      if(!draft || Array.isArray(draft) || draft.version!==1 || typeof draft.key!=='string')return false;
      const key=JSON.parse(draft.key);
      if(!Array.isArray(key) || key.length!==3 || key.some(value=>typeof value!=='string' || !value) || key[0]!==boardId)return false;
      if(!draft.ref || draft.ref.kind!=='planner' || draft.ref.boardId!==key[0] || draft.ref.cardId!==key[1] || draft.ref.itemId!==key[2])return false;
      if(!draft.base || Array.isArray(draft.base) || draft.base.id!==key[2] || !draft.initial || typeof draft.initial!=='object' || Array.isArray(draft.initial))return false;
      return taskEditKeys.filter(key=>!['minutes','followUp'].includes(key)).every(key=>Object.hasOwn(draft,key) && typeof draft[key]==='string' && Object.hasOwn(draft.initial,key) && typeof draft.initial[key]==='string') &&
        ['string','number'].includes(typeof draft.minutes) && ['string','number'].includes(typeof draft.initial.minutes);
    }catch{return false;}
  }
  function validCardTaskEditDraft(draft,boardId){
    const ref=draft?.ref,base=draft?.base;
    return Boolean(typeof boardId==='string' && boardId.trim() && draft && !Array.isArray(draft) && (draft.version===undefined || draft.version===1) && ref && !Array.isArray(ref) && ref.boardId===boardId && typeof ref.cardId==='string' && ref.cardId.trim() && ['checklist','daily','single'].includes(ref.kind) &&
      (draft.version===undefined || draft.key===JSON.stringify([ref.boardId,ref.cardId,ref.kind,ref.itemId])) &&
      base && typeof base==='object' && !Array.isArray(base) && (ref.kind==='single'?ref.itemId===null:typeof ref.itemId==='string' && ref.itemId.trim() && base.id===ref.itemId) &&
      typeof draft.title==='string' && typeof draft.sourceTitle==='string' && typeof draft.completedOn==='string');
  }
  const api = {areas,dateKey,shift,captureDateChoices,localInput,changeActivityStart,activityFromDraft,occursOn,googleLink,taskEditValues,taskEditChanged,validTaskEditDraft,validCardTaskEditDraft};
  root.LifePlanning = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

// Drafts and view preferences are board-scoped and tab-local. They never enter
// the cloud snapshot or replace canonical task/activity records while typing.
const planningSessions = new Map();
const planningSessionFaults = new Set();
function planningSession() {
  if (!planningSessions.has(state.activeBoardId)) {
    let saved = {};try{saved=JSON.parse(sessionStorage.getItem(LifeStorageScope.key("life-os-planning:"+state.activeBoardId)) || '{}');if(!saved || typeof saved!=='object' || Array.isArray(saved))throw new Error('Unreadable planning session');}catch{saved={};planningSessionFaults.add(state.activeBoardId);}
    planningSessions.set(state.activeBoardId, {view:"today",area:"*",search:"",day:getTodayKey(),calendarMode:innerWidth<=700?"agenda":"month",...saved});
  }
  return planningSessions.get(state.activeBoardId);
}
function savePlanningSession() {
  if(planningSessionFaults.has(state.activeBoardId)){setSaveStatus('Planning draft storage needs review. Its stored copy has been kept.','error');return false;}
  try { sessionStorage.setItem(LifeStorageScope.key("life-os-planning:"+state.activeBoardId),JSON.stringify(planningSession()));return true; }
  catch { setSaveStatus("Draft kept in this tab - draft storage unavailable", "error");return false; }
}
function planningNode(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
}
function planningButton(label, action, icon) {
  const button = planningNode("button", "planning-button"); button.type = "button"; if(label)button.setAttribute("aria-label",label);
  if (icon) button.innerHTML = ICONS[icon] || "";
  button.append(planningNode("span", "", label)); button.onclick = action; return button;
}
function planningIcon(label, action, icon) {
  const button = planningButton(label, action, icon); button.classList.add("planning-icon"); button.title = label; button.setAttribute("aria-label",label); return button;
}
function planningField(label, input) {
  const field = planningNode("label", "planning-field"); field.append(planningNode("span", "", label), input); if(input.matches("input,select,textarea"))input.setAttribute("aria-label",label); return field;
}
function planningInput(type, value, onInput) {
  const input = document.createElement("input"); input.type = type; input.value = value || ""; input.oninput = () => onInput(input.value); return input;
}
function planningOptionalDate(input,label,onClear,canApply=()=>true) {
  const group=planningNode("div","planning-optional-date");
  group.append(input,planningIcon(label,event=>{
    event.preventDefault();
    if(!canApply())return;
    // Recreate the native date editor's internal segments as well as its value.
    // WebKit can otherwise keep stale segments after the value becomes empty.
    input.type="text";input.value="";input.type="date";onClear();
  },"x"));return group;
}
function planningCaptureDates(input,today,canApply,label='Quick dates') {
  const root=planningNode('div','planning-date-choices');root.setAttribute('role','group');root.setAttribute('aria-label',label);
  for(const [label,value] of LifePlanning.captureDateChoices(today)){
    const button=planningButton(label,()=>{
      if(!root.isConnected || !input.isConnected || root.hidden || root.closest('details')?.open===false || root.closest('dialog')?.open===false || getTodayKey()!==today || !canApply())return;
      input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
    });button.title=formatReadableDateKey(value);button.dataset.date=value;root.append(button);
  }
  return root;
}
function planningSelect(options, value, onChange) {
  const select = document.createElement("select");
  options.forEach(([key,label]) => {const option = document.createElement("option"); option.value = key; option.textContent = label; select.append(option);});
  select.value = value; select.onchange = () => onChange(select.value); return select;
}
function taskAreaOptions(extra = "") {
  const values = new Set([...LifePlanning.areas, ...getWorkspaceTaskItems().map(item=>item.group), ...state.cards.map(card=>card.activity?.area), extra]);
  return [["","Unsorted"], ...[...values].filter(Boolean).map(value=>[value,value])];
}
function workspaceTaskBoard() {return {id:state.activeBoardId,cards:state.cards};}
function taskSubtaskRef(item) {
  return item.sourceKind==='card' ? {...item.ref} : {boardId:item.boardId || state.activeBoardId,cardId:item.card.id,kind:'planner',itemId:item.taskId};
}
function resolveSubtaskParent(ref) {
  if(ref.boardId!==state.activeBoardId)throw new Error('This checklist belongs to another board. Your draft was kept.');
  if(ref.kind!=='planner'){const {card,item}=LifeTaskRepository.resolve(workspaceTaskBoard(),ref);return {card,target:item || card};}
  const cards=getPlannerSourceCards().filter(card=>card.id===ref.cardId);
  const tasks=cards.length===1 ? LifePlanner.ensure(cards[0]).filter(task=>task.id===ref.itemId && LifePlanner.active(task)) : [];
  if(tasks.length!==1)throw new Error('The parent task moved or was archived. Your draft was kept.');
  return {card:cards[0],target:tasks[0]};
}
function subtaskKey(ref) {return JSON.stringify([ref.boardId,ref.cardId,ref.kind,ref.itemId]);}
function saveSubtaskChange(ref,command,expected,day,prepare) {
  const {card,target}=resolveSubtaskParent(ref),oldTime=target.updatedAt;
  const transaction=LifeSubtasks.change(target,command,expected,{day});
  if(ref.kind==='planner'){target.updatedAt=Date.now();LifePlanner.project(card);}
  try{
    if(prepare && !prepare(transaction))throw new Error('Draft storage is unavailable. The checklist is unchanged; keep this tab open and retry.');
    if(!saveState())throw new Error('Not saved yet. Your draft is kept; please retry.');
  }catch(error){
    LifeSubtasks.restore(target,transaction);
    if(oldTime===undefined)delete target.updatedAt;else target.updatedAt=oldTime;
    if(ref.kind==='planner')LifePlanner.project(card);
    syncActiveBoard({touchBoard:false});
    throw error;
  }
  showUndoToast({message:command.type==='remove'?'Subtask removed.':'Checklist saved.',onUndo:()=>{
    try{
      const live=resolveSubtaskParent(ref),before=LifeStateMerge.copy(live.target.subtasks);
      LifeSubtasks.restore(live.target,transaction);
      if(ref.kind==='planner')LifePlanner.project(live.card);
      if(!saveState()){live.target.subtasks=before;if(ref.kind==='planner')LifePlanner.project(live.card);syncActiveBoard({touchBoard:false});throw new Error('Undo was not saved. The checklist is unchanged.');}
      clearUndoToast();renderCardsOnly({force:true});
    }catch(error){clearUndoToast();setSaveStatus(error.message,'error');}
  }});
  return transaction;
}
function openTaskSubtasks(item) {
  const ref=taskSubtaskRef(item);
  try{resolveSubtaskParent(ref);}catch(error){setSaveStatus(error.message,'error');return;}
  const key=subtaskKey(ref);(planningSession().subtaskOpen ||= {})[key]=true;
  savePlanningSession();renderCardsOnly({force:true});
}
function captureTaskControlFocus(element=document.activeElement) {
  const taskRef=element?.closest('.planner-linked-item')?.dataset.taskRef;
  const control=element?.matches('.planner-linked-check')?'.planner-linked-check':element?.matches('.planner-linked-copy')?'.planner-linked-copy':null;
  const viewId=element?.closest('.task-card')?.dataset.id || '';
  return taskRef && control ? {taskRef,control,viewId} : null;
}
function restoreTaskControlFocus(key) {
  if(!key || document.querySelector('dialog[open]'))return;
  const target=[...elements.boardGrid.querySelectorAll('.planner-linked-item')].find(row=>row.dataset.taskRef===key.taskRef && (row.closest('.task-card')?.dataset.id || '')===key.viewId)?.querySelector(key.control);
  if(target && target.getClientRects().length && !target.closest('[hidden], [inert]'))target.focus({preventScroll:true});
}
function confirmTaskAction(title,message,actionLabel,{danger=false}={}) {
  if(document.getElementById('taskConfirmationDialog'))return Promise.resolve(false);
  return new Promise(resolve=>{
    const previous=document.activeElement,dialog=planningNode('dialog','daily-dialog task-confirmation');dialog.id='taskConfirmationDialog';
    const focus=captureTaskControlFocus(previous);
    dialog.setAttribute('aria-labelledby','taskConfirmationTitle');dialog.setAttribute('aria-describedby','taskConfirmationMessage');
    const heading=planningNode('h2','',title);heading.id='taskConfirmationTitle';const copy=planningNode('p','',message);copy.id='taskConfirmationMessage';
    const actions=planningNode('div','daily-actions'),cancel=planningButton('Cancel',()=>dialog.close('cancelled'));
    const confirm=planningButton(actionLabel,()=>dialog.close('confirmed'),danger?'trash-2':'check');confirm.classList.add(danger?'is-danger':'is-primary');actions.append(cancel,confirm);dialog.append(heading,copy,actions);
    dialog.addEventListener('close',()=>{
      dialog.remove();
      const restore=()=>{if(previous?.isConnected)previous.focus({preventScroll:true});else restoreTaskControlFocus(focus);};
      restore();
      // WebKit can restore its own native-dialog focus after the close event.
      requestAnimationFrame(()=>{if(document.activeElement===document.body)restore();});
      resolve(dialog.returnValue==='confirmed');
    },{once:true});
    document.body.append(dialog);dialog.showModal();cancel.focus();
  });
}
async function confirmParentTaskCompletion(target,done) {
  if(!done)return true;
  try{
    const remaining=LifeSubtasks.active(target).filter(child=>!child.done).length;
    return !remaining || await confirmTaskAction('Complete this task?',`${remaining} subtask${remaining===1?' is':'s are'} still unfinished.\n\nThe checklist will be kept unchanged. Nothing will be deleted or automatically ticked.`,'Complete task');
  }catch(error){setSaveStatus(error.message,'error');return false;}
}
function planningControlCurrent(node,ref,session) {
  return node.isConnected && !document.hidden && !node.closest('[hidden],[inert]') && node.getClientRects().length>0 && state.activeBoardId===ref.boardId && (session===undefined || planningSessions.get(ref.boardId)===session);
}
function subtaskDraftMap(session,key) {
  if(!Object.hasOwn(session,key))session[key]={};
  const map=session[key];
  if(!map || typeof map!=='object' || Array.isArray(map))throw new Error('This checklist draft needs review. Its stored copy was kept.');
  return map;
}
function openSubtaskEditor(ref,child,day) {
  let live,session,drafts;
  try{live=LifeSubtasks.active(resolveSubtaskParent(ref).target).find(item=>item.id===child.id);if(!live)throw new Error('This subtask is no longer available.');session=planningSession();drafts=subtaskDraftMap(session,'subtaskDrafts');}
  catch(error){setSaveStatus(error.message,'error');return;}
  const key=subtaskKey(ref)+':'+child.id;
  const draft=drafts[key] ||= {title:live.title,base:LifeStateMerge.copy(live)};
  if(typeof draft.title!=='string' || draft.base?.id!==child.id){setSaveStatus('This subtask draft needs review. Its stored copy was kept.','error');return;}
  const dialog=dailyDialog('Edit subtask'),form=planningNode('form','daily-form'),message=planningNode('p','planning-message');message.setAttribute('role','status');
  dialog.classList.add('subtask-editor');let busy=false;
  const current=()=>!busy && dialog.open && planningControlCurrent(dialog,ref,session) && drafts[key]===draft && [...document.querySelectorAll('dialog[open]')].at(-1)===dialog;
  const status=planningNode('small','subtask-draft-status');status.setAttribute('aria-live','polite');
  const persist=()=>{const ok=savePlanningSession();status.textContent=ok?'Draft kept in this tab':'Memory only. Keep this tab open.';return ok;};
  const input=planningInput('text',draft.title,value=>{if(!current())return;draft.title=value;persist();});input.required=true;
  form.append(planningField('Subtask name',input));
  const completion=LifeTaskRepository.knownCompletion(live);
  if(completion){const date=planningNode('p','daily-task-source','Completed '+formatReadableDateKey(completion.on));date.title=formatRecordDateTime(completion.at)+' · Recorded '+formatRecordDateTime(completion.recordedAt);form.append(date);}
  const save=planningButton('Save subtask',null,'check');save.type='submit';save.classList.add('is-primary');
  const discard=()=>{
    delete drafts[key];
    if(!savePlanningSession()){drafts[key]=draft;message.textContent='Draft was not discarded. Its stored copy was kept; please retry.';return false;}
    return true;
  };
  const finish=command=>{
    if(!current())return;
    try{
      const source=LifeSubtasks.records(resolveSubtaskParent(ref).target).find(item=>item.id===child.id);
      // An interrupted UI cleanup must not repeat a successful source change.
      const acknowledged=draft.after && LifeStateMerge.equal(source,draft.after);
      const sameAction=acknowledged && draft.action===command.type && (command.type!=='rename' || command.title.trim()===draft.after.title);
      if(!sameAction){
        if(acknowledged)draft.base=LifeStateMerge.copy(source);
        saveSubtaskChange(ref,command,draft.base,day,transaction=>{draft.after=LifeStateMerge.copy(transaction.after);draft.action=command.type;return persist();});
      }
      if(!discard()){message.textContent='Subtask saved. Draft cleanup needs retry; Save will not repeat the change.';return;}
      dialog.close();renderCardsOnly({force:true});
    }
    catch(error){message.textContent=error.message;}
  };
  form.onsubmit=event=>{event.preventDefault();finish({type:'rename',id:child.id,title:input.value});};
  const remove=planningButton('Delete subtask',async()=>{
    if(!current())return;
    busy=true;let confirmed=false;
    try{confirmed=await confirmTaskAction('Delete this subtask?',`"${live.title}"\n\nOnly this subtask will be removed. The parent task and other subtasks will be kept.`,'Delete subtask',{danger:true});}
    finally{busy=false;}
    if(confirmed)finish({type:'remove',id:child.id});
  },'trash-2');remove.classList.add('is-danger');
  const actions=planningNode('div','subtask-editor-actions');
  actions.append(status,planningIcon('Discard draft',()=>{if(current() && discard())dialog.close();},'x'),save);
  form.append(message,actions,remove);dialog.append(form);persist();input.focus();
}
function renderTaskSubtasks(item,{offerEmpty=false}={}) {
  const ref=taskSubtaskRef(item),key=subtaskKey(ref),session=planningSession(),details=planningNode('details','task-subtasks');
  let children,drafts,pendingAdds;
  try{children=LifeSubtasks.active(resolveSubtaskParent(ref).target);drafts=subtaskDraftMap(session,'subtaskDrafts');pendingAdds=subtaskDraftMap(session,'subtaskPendingAdds');}catch(error){return planningNode('p','planning-message',error.message);}
  const opens=session.subtaskOpen ||= {},draftKey='add:'+key;
  const current=()=>planningControlCurrent(details,ref,session) && !document.querySelector('dialog[open]');
  const usable=()=>current() && details.open;
  details.dataset.owner=key;details.open=Boolean(opens[key]);details.hidden=!offerEmpty && !children.length && !details.open && !drafts[draftKey];
  const summary=planningNode('summary'),count=children.filter(child=>child.done).length;
  summary.append(planningNode('span','','Subtasks'),planningNode('span','subtask-progress',children.length?`${count}/${children.length} · ${Math.round(count/children.length*100)}%`:''));details.append(summary);
  summary.addEventListener('click',event=>{if(!current()){event.preventDefault();return;}opens[key]=!details.open;savePlanningSession();});
  details.addEventListener('toggle',()=>{if(current()){opens[key]=details.open;savePlanningSession();}});
  const list=planningNode('div','subtask-list');
  for(const child of children){
    const row=planningNode('div','subtask-row'),label=planningNode('label','subtask-label'),check=planningNode('input');check.type='checkbox';check.checked=child.done;check.setAttribute('aria-label',`${child.done?'Reopen':'Complete'} subtask: ${child.title}`);
    const text=planningNode('span','subtask-title',child.title);text.classList.toggle('is-done',child.done);label.append(check,text);
    const completion=LifeTaskRepository.knownCompletion(child);if(completion)text.title='Completed '+formatReadableDateKey(completion.on)+' · '+formatRecordDateTime(completion.at);
    const error=planningNode('p','planning-message');error.setAttribute('role','status');
    check.onchange=()=>{if(!usable()){check.checked=child.done;return;}try{saveSubtaskChange(ref,{type:'complete',id:child.id},child,item.dateKey || getTodayKey());renderCardsOnly({force:true});}catch(e){check.checked=child.done;error.textContent=e.message;}};
    row.append(label,planningIcon('Subtask options: '+child.title,()=>{if(usable())openSubtaskEditor(ref,child,item.dateKey || getTodayKey());},'more-vertical'),error);list.append(row);
  }
  const form=planningNode('form','subtask-add'),input=planningNode('input');input.type='text';input.placeholder='Add a subtask';input.setAttribute('aria-label','Add a subtask to '+item.title);input.value=drafts[draftKey] || '';
  input.oninput=()=>{if(!usable())return;drafts[draftKey]=input.value;savePlanningSession();};
  const button=planningIcon('Add subtask',null,'plus');button.type='submit';const error=planningNode('p','planning-message');error.setAttribute('role','status');
  const discard=planningIcon('Discard subtask draft',()=>{
    if(!usable())return;
    const pending=pendingAdds[key],text=drafts[draftKey];delete drafts[draftKey];delete pendingAdds[key];
    if(!savePlanningSession()){if(text!==undefined)drafts[draftKey]=text;if(pending)pendingAdds[key]=pending;error.textContent='Draft was not discarded. Please retry.';return;}
    renderCardsOnly({force:true});
  },'x');
  discard.hidden=!input.value && !pendingAdds[key];
  input.addEventListener('input',()=>{if(usable())discard.hidden=!input.value && !pendingAdds[key];});
  form.append(input,button,discard,error);form.onsubmit=event=>{
    event.preventDefault();if(!usable() || !input.value.trim())return;
    try{
      let pending=pendingAdds[key];
      if(pending){
        if(typeof pending.id!=='string' || pending.after?.id!==pending.id || typeof pending.after?.title!=='string')throw new Error('This subtask draft needs review. Its stored copy was kept.');
        const saved=LifeSubtasks.records(resolveSubtaskParent(ref).target).find(child=>child.id===pending.id);
        if(saved){
          if(!LifeStateMerge.equal(saved,pending.after))throw new Error('This step was already added and later changed. Review it or discard this draft; no duplicate was added.');
          const same=input.value.trim()===pending.after.title,text=drafts[draftKey];
          delete pendingAdds[key];if(same)delete drafts[draftKey];
          if(!savePlanningSession()){pendingAdds[key]=pending;if(text!==undefined)drafts[draftKey]=text;throw new Error('Subtask saved. Draft cleanup needs retry; no duplicate was added.');}
          if(same){renderCardsOnly({force:true});return;}
          pending=null;
        }
      }
      const id=pending?.id || createId();
      // Keep the exact intended record before staging its canonical save.
      saveSubtaskChange(ref,{type:'add',id,title:input.value},null,item.dateKey || getTodayKey(),transaction=>{
        pendingAdds[key]={id,after:LifeStateMerge.copy(transaction.after)};return savePlanningSession();
      });
      pending=pendingAdds[key];const text=drafts[draftKey];delete drafts[draftKey];delete pendingAdds[key];opens[key]=true;
      if(!savePlanningSession()){drafts[draftKey]=text;pendingAdds[key]=pending;discard.hidden=false;error.textContent='Subtask saved. Draft cleanup needs retry; no duplicate was added.';return;}
      renderCardsOnly({force:true});
      requestAnimationFrame(()=>{if(document.activeElement===document.body){const next=[...document.querySelectorAll('.task-subtasks')].find(node=>node.dataset.owner===key);next?.querySelector('.subtask-add input')?.focus({preventScroll:true});}});
    }
    catch(e){error.textContent=e.message;}
  };details.append(list,form);return details;
}
function getWorkspaceTaskItems() {
  return [...getPlannerSourceItems(),...LifeTaskRepository.collect(workspaceTaskBoard())];
}
function saveCardTaskChange(ref,base,updates,day=getTodayKey(),prepare) {
  const transaction=LifeTaskRepository.change(workspaceTaskBoard(),ref,base,updates,{day});
  try{
    if(prepare && !prepare(transaction))throw new Error('Draft storage is unavailable. The task is unchanged; keep this tab open and retry.');
    if(!saveState())throw new Error("Not saved yet. Your draft is kept; try again when device saving is available.");
  }catch(error){
    LifeTaskRepository.restore(workspaceTaskBoard(),transaction);
    syncActiveBoard({touchBoard:false});
    throw error;
  }
  return transaction;
}
function showCardTaskUndo(transaction) {
  showUndoToast({message:"Task updated in its source card.",onUndo:()=>{
    try{
      const undo=LifeTaskRepository.restore(workspaceTaskBoard(),transaction);
      if(!saveState()){
        LifeTaskRepository.restore(workspaceTaskBoard(),undo);syncActiveBoard({touchBoard:false});
        throw new Error("Undo was not saved. The task is unchanged.");
      }
      clearUndoToast();renderCardsOnly({force:true});
    }catch(error){clearUndoToast();setSaveStatus(error.message,"error");}
  }});
}
function openCardTaskSource(ref) {
  const matches=state.cards.filter(card=>card.id===ref.cardId);
  if(ref.boardId!==state.activeBoardId || matches.length!==1 || !matches[0].id){setSaveStatus("The source card is no longer available on this board.","error");return;}
  document.getElementById('dailyDialog')?.close();setWorkspaceMode('board');startEditingCard(ref.cardId);
}
function openCardTaskEditor(item) {
  if(item?.ref?.boardId!==undefined && item.ref.boardId!==state.activeBoardId)return;
  const session=planningSession();
  if(item && !item.editable)return;
  if(Object.hasOwn(session,'cardTaskDraft') && !LifePlanning.validCardTaskEditDraft(session.cardTaskDraft,state.activeBoardId)){setSaveStatus('This task draft needs review. Its stored copy was kept.','error');return;}
  if(item && session.cardTaskDraft && !LifeStateMerge.equal(session.cardTaskDraft.ref,item.ref)){
    setSaveStatus("Finish or discard the open task draft before editing another task.","error");
    return;
  }else if(item && !session.cardTaskDraft){
    try{
      LifeTaskRepository.resolve(workspaceTaskBoard(),item.ref);
      const fresh=LifeTaskRepository.collect(workspaceTaskBoard()).find(task=>task.editable && LifeStateMerge.equal(task.ref,item.ref));
      if(!fresh)throw new Error('The source task is no longer available.');
      session.cardTaskDraft={version:1,key:subtaskKey(fresh.ref),ref:LifeStateMerge.copy(fresh.ref),base:LifeStateMerge.copy(fresh.base),title:fresh.title,sourceTitle:fresh.sourceTitle,completedOn:fresh.completedOn || ''};
    }catch(error){setSaveStatus(error.message,'error');return;}
  }
  const draft=session.cardTaskDraft;if(!draft)return;
  if(!LifePlanning.validCardTaskEditDraft(draft,state.activeBoardId)){setSaveStatus('This task draft needs review. Its stored copy was kept.','error');return;}
  const dialog=dailyDialog('Edit card task'),form=planningNode('form','card-task-editor');
  dialog.classList.add('card-task-dialog');
  const current=()=>dialog.open && planningControlCurrent(dialog,draft.ref,session) && session.cardTaskDraft===draft && [...document.querySelectorAll('dialog[open]')].at(-1)===dialog;
  const status=planningNode('small','card-task-draft-status');status.setAttribute('aria-live','polite');
  const persist=()=>{const ok=savePlanningSession();status.textContent=ok?'Draft kept in this tab':'Memory only. Keep this tab open.';return ok;};
  const name=planningInput('text',draft.title,value=>{if(current()){draft.title=value;persist();}});name.required=true;
  const message=planningNode('p','planning-message');message.setAttribute('role','status');
  const discard=()=>{
    delete session.cardTaskDraft;
    if(!savePlanningSession()){session.cardTaskDraft=draft;message.textContent='Draft was not discarded. Its stored copy was kept; please retry.';return false;}
    return true;
  };
  const actions=planningNode('div','card-task-editor-actions'),save=planningButton('Save task',null,'check');save.type='submit';save.classList.add('is-primary');
  actions.append(status,planningIcon('Discard draft',()=>{if(current() && discard()){dialog.close();renderCardsOnly({force:true});}},'x'),save);
  form.append(planningNode('p','daily-muted',draft.sourceTitle),planningField('Task name',name));
  let date;
  if(draft.base.done){date=planningInput('date',draft.completedOn,value=>{if(current()){draft.completedOn=value;persist();}});date.max=getTodayKey();form.append(planningField('Completion date (optional)',date));}
  if(draft.completedOn && (!LifeTaskRepository.validDate(draft.completedOn) || draft.completedOn>getTodayKey()))message.textContent='Completion date needs review. Choose a past or current date; the saved task is unchanged.';
  form.append(message,actions,planningButton('Edit source card',()=>{if(current())openCardTaskSource(draft.ref);},'pencil'));
  form.onsubmit=event=>{
    event.preventDefault();if(!current())return;
    draft.title=name.value;
    if(draft.completedOn && !LifeTaskRepository.validDate(draft.completedOn) && !date?.value){persist();message.textContent='Choose a valid completion date. The saved task is unchanged.';return;}
    if(date)draft.completedOn=date.value;
    try{
      const source=LifeTaskRepository.collect(workspaceTaskBoard()).find(task=>task.editable && LifeStateMerge.equal(task.ref,draft.ref));
      const updates={title:draft.title.trim(),...(draft.completedOn?{completedOn:draft.completedOn}:{})};
      // A retained post-save receipt permits cleanup, not a repeated source write.
      const acknowledged=draft.after && source && LifeStateMerge.equal(source.base,draft.after);
      const sameChange=acknowledged && LifeStateMerge.equal(updates,draft.savedValues);
      let transaction;
      if(!sameChange){
        if(acknowledged)draft.base=LifeStateMerge.copy(source.base);
        transaction=saveCardTaskChange(draft.ref,draft.base,updates,getTodayKey(),change=>{draft.after=LifeStateMerge.copy(change.after);draft.savedValues=LifeStateMerge.copy(updates);return persist();});
      }
      if(!discard()){message.textContent='Task saved. Draft cleanup needs retry; Save will not repeat the change.';return;}
      dialog.close();renderCardsOnly({force:true});if(transaction)showCardTaskUndo(transaction);
    }catch(error){message.textContent=error.message;}
  };
  dialog.append(form);persist();name.focus();
}
function renderWorkspaceTaskItem(item) {
  if(item.sourceKind!=="card")return renderPlannerLinkedItem(item);
  const row=planningNode('div','planner-linked-item card-source-task');row.classList.toggle('is-done',item.done);
  const current=()=>planningControlCurrent(row,item.ref) && !document.querySelector('dialog[open]');
  row.dataset.taskRef=subtaskKey(taskSubtaskRef(item));
  row.dataset.sourceCard=item.ref.cardId || '';row.dataset.sourceTask=item.ref.itemId || '';
  const check=planningInput('checkbox','',()=>{});check.className='planner-linked-check';check.checked=item.done;check.disabled=!item.editable;
  const label=`${item.done?'Mark open':'Mark done'}: ${item.title}`;check.setAttribute('aria-label',label);
  const main=planningNode('div','planner-linked-main'),meta=planningNode('div','planner-linked-meta');
  const source=item.sourceLabel+(item.ref.kind==='single'?'':' · '+item.sourceTitle);
  meta.append(planningNode('span','task-source-label',source),planningNode('span','task-area',item.group || 'Unsorted'));
  if(item.done){const done=planningNode('span','planner-linked-completed','Done · '+(item.completedOn?formatPlannerOriginDate(item.completedOn):'Date not recorded'));if(item.completedAt)done.title=formatRecordDateTime(item.completedAt);meta.append(done);}
  if(!item.editable)meta.append(planningNode('span','task-status','Edit in source card'));
  const title=planningNode('button','planner-linked-copy',item.title);title.type='button';title.disabled=!item.editable;title.setAttribute('aria-label',label);
  const message=planningNode('p','planning-message');message.setAttribute('role','status');
  const toggle=async event=>{
    if(!current()){check.checked=item.done;return;}
    event.currentTarget.focus({preventScroll:true});
    check.checked=item.done;
    if(!await confirmParentTaskCompletion(item.base,!item.done))return;
    if(!current())return;
    try{
      const transaction=saveCardTaskChange(item.ref,item.base,{done:!item.done},item.dateKey || getTodayKey());
      renderCardsOnly({force:true});showCardTaskUndo(transaction);
    }catch(error){check.checked=item.done;message.textContent=error.message;}
  };check.onchange=toggle;title.onclick=toggle;
  const actions=planningNode('div','planner-linked-actions');
  actions.append(planningIcon('Task options: '+item.title,()=>{
    if(!current())return;
    const dialog=dailyDialog('Task options'),menu=planningNode('div','daily-menu');
    const menuCurrent=()=>dialog.open && planningControlCurrent(row,item.ref) && [...document.querySelectorAll('dialog[open]')].at(-1)===dialog;
    const edit=planningButton('Edit task',()=>{if(menuCurrent()){dialog.close();openCardTaskEditor(item);}},'pencil');edit.disabled=!item.editable;
    const subtasks=planningButton('Subtasks',()=>{if(menuCurrent()){dialog.close();openTaskSubtasks(item);}},'list');subtasks.disabled=!item.editable;
    menu.append(subtasks,edit,planningButton('Edit source card',()=>{if(menuCurrent())openCardTaskSource(item.ref);},'pencil'),planningButton('Completion history',()=>{if(menuCurrent()){dialog.close();openTaskHistory(item);}},'calendar'));dialog.append(menu);
  },'more-vertical'));
  main.append(meta,title,message);row.append(check,main,actions);
  if(item.editable){const subtasks=renderTaskSubtasks(item);row.append(subtasks);row.classList.toggle('has-subtasks',!subtasks.hidden && subtasks.matches('details'));}return row;
}
function getTaskEditMetadata(item) {
  const task = LifePlanner.ensure(resolveLiveCard(item.card)).find(task=>task.id===item.taskId);
  return {area:task?.area ?? item.group ?? getPlannerGroup(item.card), project:task?.project || "", status:task?.status || "todo",
    deadline:task?.deadline || "", notes:task?.notes || "", priority:task?.priority || "normal", goalLink:taskGoalValue(task || {}), followUp:task?.followUp ?? '', intent:task?.intent || 'task', minutes:task?.estimatedMinutes || '',nextAction:task?.nextAction || '',startTime:task?.startTime || '',base:LifeStateMerge.copy(task)};
}
function appendTaskMetadata(meta, item) {
  if (!item.workspaceTask && item.area === undefined) return;
  const area = item.area ?? item.group;
  meta.append(planningNode("span", "task-area", area || "Unsorted"));
  if (item.project) meta.append(planningNode("span", "task-project", item.project));
  if (!item.done && ["doing","waiting"].includes(item.status)) meta.append(planningNode("span", "task-status", item.status === "doing" ? "Doing" : "Waiting"));
  if (!item.done && item.deadline) meta.append(planningNode("span", "task-deadline"+(item.deadline<getTodayKey()?" is-late":""), "Due "+formatPlannerOriginDate(item.deadline)));
  if (!item.done && item.followUp) meta.append(planningNode('span','task-follow-up',LifePlanner.validDate(item.followUp)?'Follow up '+formatPlannerOriginDate(item.followUp):'Follow-up date needs review'));
  if (item.status==='parked') meta.append(planningNode('span','task-status','Parked'));
  if (item.coachingProgramId) {
    const program=currentCoachingPrograms().find(p=>p.id===item.coachingProgramId),priority=program?.priorities.find(p=>p.id===item.coachingPriorityId),kr=priority?.krs.find(k=>k.id===item.coachingKrId);
    meta.append(planningNode('span','task-goal',kr?.title || priority?.title || 'Linked priority'));
  }
}
function appendTaskEditFields(form, draft,canApply) {
  const grid = planningNode("div", "task-edit-details");
  const update=(key,value)=>{if(canApply())draft[key]=value;};
  const deadline=planningInput("date",draft.deadline,value=>update('deadline',value));deadline.setAttribute("aria-label","Deadline (optional)");
  grid.append(planningField("Area",planningSelect(taskAreaOptions(draft.area),draft.area,value=>update('area',value))),
    planningField("Status",planningSelect([["todo","To do"],["doing","Doing"],["waiting","Waiting"],["parked","Parked"]],draft.status,value=>update('status',value))),
    planningField("Project",planningInput("text",draft.project,value=>update('project',value))),
    planningField("Deadline (optional)",planningOptionalDate(deadline,"Clear deadline",()=>update('deadline',''),canApply)),
    planningField("Priority",planningSelect(Object.entries(PRIORITY_META).map(([key,meta])=>[key,meta.label]),draft.priority,value=>update('priority',value))));
  const notes = planningNode("textarea"); notes.value = draft.notes; notes.rows = 3; notes.oninput = () => update('notes',notes.value);
  grid.append(planningField("Task notes",notes)); appendDailyTaskFields(grid,draft,canApply); form.append(grid);
}
function renderPlanningWorkspace(mode) {
  const root = planningNode("section", "planning-workspace"); root.setAttribute("aria-label",mode==="tasks"?"Tasks":"Calendar");
  if(mode==="calendar")root.classList.add("calendar-workspace");
  elements.boardGrid.append(root);
  const nav=planningNode('nav','plan-view-switch');nav.setAttribute('aria-label','Planning view');
  for(const [key,label] of [['tasks','Tasks'],['calendar','Calendar']]){const button=planningButton(label,()=>setWorkspaceMode(key));button.id='plan'+label+'Button';button.setAttribute('aria-pressed',String(mode===key));nav.append(button);}
  const heading=planningNode('header','plan-workspace-heading');heading.append(planningNode('h2','','Plan'),nav);root.append(heading);
  if (mode === "tasks") renderTasksWorkspace(root); else renderCalendarWorkspace(root);
}
function planningRefresh() { savePlanningSession(); renderCardsOnly({force:true}); }
function renderPlanningAreaFilter() {
  const session = planningSession();
  return planningField("Filter by area",planningSelect([["*","All areas"],...taskAreaOptions(session.area==="*"?"":session.area)],session.area,value=>{session.area=value;planningRefresh();}));
}
function renderPlanningDateNavigation(day, change) {
  const nav = planningNode("div", "planning-date-nav");
  const date = planningInput("date",day,value=>{if(LifePlanner.validDate(value))change(value);}); date.setAttribute("aria-label","Selected day");
  nav.append(planningIcon("Previous day",()=>change(LifePlanning.shift(day,-1)),"chevron-left"), date,
    planningIcon("Next day",()=>change(LifePlanning.shift(day,1)),"chevron-right"));
  if (day !== getTodayKey()) nav.append(planningButton("Today",()=>change(getTodayKey())));
  return nav;
}
function renderTasksWorkspace(root) {
  const session = planningSession(),boardId=state.activeBoardId;
  root.classList.add("task-workspace");
  const results = planningNode("div","task-results");
  const search = planningInput("search",session.search,value=>{
    session.search=value;
    if(value.trim()){session.searchExpanded=true;header.classList.add("is-search-open");searchToggle.setAttribute("aria-expanded","true");}
    savePlanningSession();renderTaskResults(results);resume.hidden=!session.plannerTaskDraft || !!results.querySelector('.planner-linked-edit-form');
  });
  search.placeholder = "Search tasks and projects"; search.setAttribute("aria-label","Search tasks and projects"); search.className="planning-search";
  const header = planningNode("header","planning-heading task-heading");
  const searchToggle = planningIcon("Search tasks",()=>{
    // Never conceal a filter that is still limiting the visible task list.
    session.searchExpanded = !session.searchExpanded || Boolean(session.search.trim());
    header.classList.toggle("is-search-open",session.searchExpanded);
    searchToggle.setAttribute("aria-expanded",String(session.searchExpanded));
    savePlanningSession();if(session.searchExpanded)search.focus();
  },"search");
  session.searchExpanded = Boolean(session.searchExpanded || session.search.trim());
  searchToggle.classList.add("task-search-toggle");searchToggle.setAttribute("aria-expanded",String(session.searchExpanded));
  search.id="taskWorkspaceSearch";searchToggle.setAttribute("aria-controls",search.id);
  header.classList.toggle("is-search-open",session.searchExpanded);
  const resume=planningButton('Task draft',()=>{if(root.isConnected && !document.hidden && !document.querySelector('dialog[open]') && state.activeBoardId===boardId && planningSession()===session)openPlannerTaskDraft();},'pencil');resume.classList.add('planner-draft-resume');
  header.append(planningNode("h2","","Tasks"),renderPlanningAreaFilter(),searchToggle,search,resume); root.append(header);
  const toolbar = planningNode("div","task-toolbar");
  const tabs = planningNode("div","planning-tabs"); tabs.setAttribute("role","group");tabs.setAttribute("aria-label","Task view");
  for (const [key,label] of [["today","Today"],["upcoming","Upcoming"],["all","All tasks"],["completed","Completed"]]) {
    const button=planningButton(label,()=>{session.view=key;planningRefresh();});button.setAttribute("aria-pressed",String(session.view===key));tabs.append(button);
    if(['all','completed'].includes(key)){
      button.setAttribute('aria-label',label);
      const full=button.querySelector('span');full.classList.add('task-view-label-full');
      button.append(planningNode('span','task-view-label-short',key==='all'?'All':'Done'));
    }
  }
  tabs.append(planningIcon('More task views',()=>{
    const dialog=dailyDialog('Task views'),menu=planningNode('div','daily-menu');
    for(const [key,label] of [['waiting','Waiting on'],['parked','Parked'],['experiences','Experiences']]){
      const button=planningButton(label,()=>{session.view=key;dialog.close();planningRefresh();});button.setAttribute('aria-pressed',String(session.view===key));menu.append(button);
    }dialog.append(menu);
  },'more-vertical'));
  toolbar.append(tabs);
  if (session.view==="today") toolbar.append(renderPlanningDateNavigation(session.day,value=>{session.day=value;if(session.capture&&!session.capture.title.trim())session.capture.dateKey=value;planningRefresh();}));
  root.append(toolbar);
  root.append(renderTaskCapture());
  root.append(results); renderTaskResults(results);
  resume.hidden=!session.plannerTaskDraft || !!results.querySelector('.planner-linked-edit-form');
}
function renderTaskCapture() {
  const session = planningSession(),boardId=state.activeBoardId,today=getTodayKey();
  const draft = session.capture ||= {title:"",area:session.lastArea || "",dateKey:session.view==="today"?session.day:""};
  const form = planningNode("form","task-capture");
  const current=()=>form.isConnected && state.activeBoardId===boardId && state.ui.workspaceMode==='tasks' && planningSession()===session && session.capture===draft;
  const title = planningInput("text",draft.title,value=>{if(!current())return;draft.title=value;savePlanningSession();}); title.placeholder="Add a task";title.required=true;title.setAttribute("aria-label","New task");
  const add = planningIcon("Add task",null,"plus"); add.type="submit";add.classList.add("is-primary","task-capture-submit");
  const main = planningNode("div","task-capture-main");main.append(title);
  const options = planningNode("div","task-capture-options");
  const details=planningNode('details','task-capture-details'),summary=planningNode('summary');summary.setAttribute('aria-label','Task area and date');
  const updateSummary=()=>{summary.textContent=(draft.area || 'Unsorted')+' · '+(draft.dateKey?formatPlannerOriginDate(draft.dateKey):'No date');};
  details.open=Boolean(session.captureOptionsExpanded);details.append(summary,options);updateSummary();
  summary.addEventListener('click',event=>{event.preventDefault();if(!current())return;details.open=!details.open;session.captureOptionsExpanded=details.open;savePlanningSession();});
  details.addEventListener('toggle',()=>{if(!current())return;session.captureOptionsExpanded=details.open;savePlanningSession();});
  const date=planningInput("date",draft.dateKey,value=>{if(!current())return;draft.dateKey=value;updateSummary();savePlanningSession();});date.setAttribute("aria-label","Planned day (optional)");
  const dateField=planningNode('div','planning-date-field');dateField.append(planningField("Planned day (optional)",planningOptionalDate(date,"Clear planned day",()=>{if(!current())return;draft.dateKey="";updateSummary();savePlanningSession();})),planningCaptureDates(date,today,current));
  options.append(planningField("Area",planningSelect(taskAreaOptions(draft.area),draft.area,value=>{if(!current())return;draft.area=value;updateSummary();savePlanningSession();})),dateField);
  const status=planningNode("p","planning-message");status.setAttribute("role","status");form.append(main,details,add,status);
  form.onsubmit = event => {
    event.preventDefault();
    if(!current() || getTodayKey()!==today){status.textContent='The board, view or day changed. Reopen this capture. Your draft is kept.';return;}
    if (!title.value.trim() || (draft.dateKey && !LifePlanner.validDate(draft.dateKey))) return;
    draft.pendingTaskId ||= createId();
    const source = getPlannerSourceCards().find(card=>LifePlanner.ensure(card).some(task=>task.id===draft.pendingTaskId)) || getPlannerWriteSourceCard({category:draft.area || "Unsorted"},draft.dateKey);
    let task=LifePlanner.ensure(source).find(task=>task.id===draft.pendingTaskId);
    if(task && draft.pendingBase && !LifeStateMerge.equal(task,draft.pendingBase)) {status.textContent="This task changed after the save attempt. Your draft is kept; review the task before retrying.";return;}
    task ||= LifePlanner.add(source,draft.dateKey,title.value,draft.pendingTaskId); if(!task)return;
    LifePlanner.change(source,task.id,{title:title.value.trim(),dateKey:draft.dateKey,area:draft.area,status:"todo",project:"",deadline:"",notes:""});LifePlanner.project(source);
    draft.pendingBase=LifeStateMerge.copy(task);savePlanningSession();
    if(!saveState()){status.textContent="Not saved yet. Your draft is kept; try again when device saving is available.";return;}
    session.lastArea=draft.area;session.capture={area:draft.area,dateKey:draft.dateKey,title:""};session.captureOptionsExpanded=false;
    // Keep the newly captured item visible without silently changing its date.
    if ((session.area!=="*" && session.area!==draft.area)) session.area="*";
    if (session.view==="completed" || !draft.dateKey || (session.view==="today" && draft.dateKey>session.day) || (session.view==="upcoming" && draft.dateKey<getTodayKey())) session.view="all";
    session.search="";savePlanningSession();renderCardsOnly({force:true});
    elements.boardGrid.querySelector('[aria-label="New task"]')?.focus({preventScroll:true});
  };
  return form;
}
function renderTaskResults(root) {
  root.replaceChildren();const session=planningSession();
  // Old card checklists have no completion-day history. Keep date-based views
  // on canonical planner records instead of guessing dates for those items.
  const source=['all','completed'].includes(session.view)?getWorkspaceTaskItems():getPlannerSourceItems();
  const all=source.filter(item=>session.area==="*" || item.group===session.area);
  let items=session.view==="today"?[...getPlannerItemsForSelectedDay(all,session.day),...LifeTaskRepository.collect(workspaceTaskBoard()).filter(t=>t.done && t.completedOn===session.day && (session.area==='*' || t.group===session.area))]:all;
  if(session.view==="upcoming")items=items.filter(item=>!item.done&&item.status!=='parked'&&item.dateKey>=getTodayKey());
  if(session.view==="waiting")items=items.filter(item=>!item.done&&item.status==='waiting');
  if(session.view==="parked")items=items.filter(item=>!item.done&&item.status==='parked');
  if(session.view==="experiences")items=items.filter(item=>item.intent==='experience');
  if(session.view==="completed")items=items.filter(item=>item.done);
  const query=session.search.trim().toLocaleLowerCase();
  if(query)items=items.filter(item=>[item.title,item.project,item.notes,item.group,item.sourceTitle].some(value=>String(value||"").toLocaleLowerCase().includes(query)));
  const followUpOrder=item=>LifePlanner.validDate(item.followUp)?item.followUp:'9999';
  items=items.slice().sort((a,b)=>session.view==="waiting"?followUpOrder(a).localeCompare(followUpOrder(b))||a.title.localeCompare(b.title):session.view==="completed"?(b.completedOn||"").localeCompare(a.completedOn||"")||a.title.localeCompare(b.title)
    :Number(a.done)-Number(b.done)||(a.scheduledDate||a.dateKey||"9999").localeCompare(b.scheduledDate||b.dateKey||"9999")||a.title.localeCompare(b.title));
  const count=planningNode("p","planning-count",`${items.length} ${items.length===1?"task":"tasks"}`);count.setAttribute("role","status");
  const extraLabel={waiting:'Waiting on',parked:'Parked',experiences:'Experiences'}[session.view];if(extraLabel)count.textContent=extraLabel+' · '+count.textContent;
  const heading=planningNode("div","task-results-heading"),columns=planningNode("div","column-picker");
  columns.setAttribute("role","group");columns.setAttribute("aria-label","Task columns");columns.append(planningNode("span","","Columns"));
  const selected=[1,2,3].includes(Number(session.columns))?Number(session.columns):1;
  root.dataset.columns=String(selected);
  for(const value of [1,2,3]){
    const button=planningNode("button","",String(value));button.type="button";
    button.setAttribute("aria-label",`${value} task ${value===1?"column":"columns"}`);
    button.setAttribute("aria-pressed",String(value===selected));
    button.title=`${value} ${value===1?"column":"columns"}; fewer on narrow screens`;
    button.onclick=()=>{
      // Change presentation in place so an open task editor keeps every keystroke.
      session.columns=value;root.dataset.columns=String(value);savePlanningSession();
      columns.querySelectorAll("button").forEach(item=>item.setAttribute("aria-pressed",String(item===button)));
    };
    columns.append(button);
  }
  heading.append(count,columns);root.append(heading);
  if(session.cardTaskDraft){const boardId=state.activeBoardId;root.append(planningButton('Continue task draft',()=>{if(planningControlCurrent(root,{boardId},session) && !document.querySelector('dialog[open]'))openCardTaskEditor();},'pencil'));}
  if(!items.length){root.append(planningNode("p","planning-empty",query?"No matching tasks.":"No tasks in this view."));return;}
  const list=planningNode("div","workspace-task-list");root.append(list);
  items.forEach(item=>{
    const day=session.view==="today"?session.day:getTodayKey();
    const row=renderWorkspaceTaskItem({...item,workspaceTask:true,undated:!(item.scheduledDate??item.dateKey),scheduledDate:item.scheduledDate??item.dateKey,dateKey:day});
    if(item.priority && item.priority!=="normal")row.style.borderLeftColor=PRIORITY_META[item.priority]?.color || "";
    list.append(row);
  });
}

function calendarActivities(includeArchived=false) {
  const cards=includeArchived?getArchivedCards():state.cards;
  return cards.filter(card=>card.type==="event").flatMap(card=>{
    if(card.activity)return [{card,activity:card.activity}];
    if(!Number.isFinite(Date.parse(card.targetAt)))return [];
    return [{card,activity:{title:card.title,area:card.category,allDay:false,startAt:card.targetAt,endAt:card.targetAt,notes:card.description || "",location:"",url:""},legacy:true}];
  });
}
function calendarPlannerTasks() {
  const session=planningSession();
  return getPlannerSourceItems().filter(item=>LifePlanner.validDate(item.dateKey) && (session.area==="*" || item.group===session.area));
}
function renderCalendarWorkspace(root) {
  const session=planningSession();
  const header=planningNode("header","planning-heading");header.append(planningNode("h2","","Calendar"),planningButton("Add activity",()=>openActivityEditor(),"plus"));root.append(header);
  if(session.activityDraft){root.append(planningNode("p","calendar-timezone",Intl.DateTimeFormat().resolvedOptions().timeZone),renderActivityEditor());return;}
  const toolbar=planningNode("div","calendar-toolbar"); toolbar.append(renderPlanningAreaFilter());
  const tabs=planningNode("div","planning-tabs");tabs.setAttribute("role","group");tabs.setAttribute("aria-label","Calendar view");
  for(const [key,label] of [["month","Month"],["week","Week"],["agenda","Agenda"]]){
    const button=planningButton(label,()=>{session.calendarMode=key;planningRefresh();});button.setAttribute("aria-pressed",String(session.calendarMode===key));tabs.append(button);
  }
  toolbar.append(tabs);root.append(toolbar);
  const nav=planningNode("div","calendar-period");
  const changePeriod=delta=>{
    if(session.calendarMode==="month") {const date=new Date(session.day.slice(0,7)+"-01T12:00:00");date.setMonth(date.getMonth()+delta);session.day=LifePlanning.dateKey(date);}
    else session.day=LifePlanning.shift(session.day,delta*(session.calendarMode==="week"?7:1));planningRefresh();
  };
  const period=planningNode("div","calendar-period-title");period.setAttribute("role","group");period.setAttribute("aria-label","Calendar period");
  period.append(planningIcon("Previous period",()=>changePeriod(-1),"chevron-left"),planningNode("h3","",new Date(session.day+"T12:00:00").toLocaleDateString(undefined,{month:"long",year:"numeric"})),planningIcon("Next period",()=>changePeriod(1),"chevron-right"));
  nav.append(period,planningButton("Today",()=>{session.day=getTodayKey();planningRefresh();}));if(session.calendarMode!=="agenda")root.append(nav);
  const timezone=planningNode("p","calendar-timezone",Intl.DateTimeFormat().resolvedOptions().timeZone);root.append(timezone);
  const items=calendarActivities().filter(({activity})=>session.area==="*"||activity.area===session.area);
  const tasks=calendarPlannerTasks();
  if(session.calendarMode==="month") {
    renderCalendarMonth(root,items,tasks);
    renderAgenda(root,items,[session.day],tasks);
  } else if(session.calendarMode==="week") {
    const weekday=(new Date(session.day+"T12:00:00").getDay()+6)%7;
    renderAgenda(root,items,Array.from({length:7},(_,i)=>LifePlanning.shift(session.day,i-weekday)),tasks);
  } else {
    root.append(renderPlanningDateNavigation(session.day,value=>{session.day=value;planningRefresh();}));
    // One row per activity, including multi-day events already in progress.
    const upcoming=items.filter(({activity})=>activity.allDay?activity.endDate>=session.day:Date.parse(activity.endAt||activity.startAt)>=new Date(session.day+"T00:00:00").getTime());
    const futureTasks=tasks.filter(item=>item.dateKey>=session.day);
    const activityDay=item=>{const day=activitySortKey(item.activity).slice(0,10);return day<session.day?session.day:day;};
    const days=[...new Set([...upcoming.map(activityDay),...futureTasks.map(item=>item.dateKey)])].sort();
    if(!days.length)root.append(planningNode("p","planning-empty","No upcoming activities or dated tasks."));
    const list=planningNode("div","activity-list");root.append(list);
    days.forEach(day=>list.append(renderCalendarAgendaDay(day,upcoming.filter(item=>activityDay(item)===day),futureTasks.filter(item=>item.dateKey===day))));
  }
  root.append(renderGoogleCalendarPanel());
}
function activitySortKey(activity) {return activity.allDay?activity.startDate:LifePlanning.localInput(activity.startAt);}
function renderCalendarMonth(root,items,tasks=[]) {
  const session=planningSession(),grid=planningNode("div","calendar-month");grid.setAttribute("role","group");grid.setAttribute("aria-label","Month dates");
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(day=>grid.append(planningNode("span","calendar-weekday",day)));
  const first=session.day.slice(0,7)+"-01",offset=(new Date(first+"T12:00:00").getDay()+6)%7;
  for(let i=0;i<42;i++){
    const day=LifePlanning.shift(first,i-offset),matches=items.filter(({activity})=>LifePlanning.occursOn(activity,day)),datedTasks=tasks.filter(item=>item.dateKey===day);
    const button=planningButton("",()=>{session.day=day;planningRefresh();});button.className="calendar-day";
    button.replaceChildren(planningNode("span","",String(Number(day.slice(-2)))));
    button.setAttribute("aria-label",`${day}, ${matches.length} activities, ${datedTasks.length} tasks`);button.setAttribute("aria-pressed",String(day===session.day));
    if(day===getTodayKey())button.setAttribute("aria-current","date");if(day.slice(0,7)!==first.slice(0,7))button.classList.add("outside-month");
    const counts=planningNode("span","calendar-counts");
    for(const [count,kind,icon] of [[matches.length,"activities","calendar"],[datedTasks.length,"tasks","check"]])if(count){
      const badge=planningNode("small","calendar-count calendar-count-"+kind);badge.title=`${count} ${kind}`;
      const symbol=planningNode("span");symbol.innerHTML=ICONS[icon];symbol.setAttribute("aria-hidden","true");badge.append(symbol,planningNode("span","",String(count)));counts.append(badge);
    }
    button.append(counts);grid.append(button);
  }
  root.append(grid);
}
function renderAgenda(root,items,days,tasks=[]) {
  const list=planningNode("div","activity-list");root.append(list);
  days.forEach(day=>{
    list.append(renderCalendarAgendaDay(day,items.filter(({activity})=>LifePlanning.occursOn(activity,day)),tasks.filter(item=>item.dateKey===day)));
  });
}
function renderCalendarAgendaDay(day,activities,tasks) {
  const section=planningNode("section","agenda-day");section.dataset.day=day;section.append(planningNode("h3","",formatPlannerDate(day)));
  if(!activities.length&&!tasks.length)section.append(planningNode("p","planning-empty","No activities or dated tasks."));
  if(activities.length){
    section.append(planningNode("h4","calendar-group-title","Activities"));
    activities.slice().sort((a,b)=>activitySortKey(a.activity).localeCompare(activitySortKey(b.activity))).forEach(item=>section.append(renderActivityRow(item)));
  }
  if(tasks.length){
    section.append(planningNode("h4","calendar-group-title","Planner tasks"));
    const list=planningNode("div","workspace-task-list calendar-task-list");list.setAttribute("aria-label","Planner tasks for "+day);
    // Read canonical tasks, never materialize a second calendar activity or carryover copy.
    tasks.forEach(item=>list.append(renderPlannerLinkedItem({...item,workspaceTask:true,scheduledDate:item.dateKey,dateKey:day})));
    section.append(list);
  }
  return section;
}
function formatActivityTiming(activity) {
  if(activity.allDay)return `${activity.startDate}${activity.endDate!==activity.startDate?" to "+activity.endDate:""} - All day`;
  const format=iso=>new Date(iso).toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
  return format(activity.startAt)+(activity.endAt!==activity.startAt?" to "+format(activity.endAt):"");
}
function renderActivityRow(item) {
  const {activity,card}=item,row=planningNode("article","activity-row");
  const copy=planningNode("div","activity-copy");copy.append(planningNode("span","task-area",activity.area||"Unsorted"),planningNode("h4","",activity.title),planningNode("p","",formatActivityTiming(activity)));
  if(activity.location)copy.append(planningNode("p","",activity.location));
  if(activity.notes){const notes=planningNode("details","activity-notes");notes.append(planningNode("summary","","Notes"),planningNode("p","",activity.notes));copy.append(notes);}
  if(activity.url){try{const url=new URL(activity.url);if(url.protocol==="https:"&&!url.username&&!url.password){const link=planningNode("a","","Meeting link");link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";copy.append(link);}}catch{}}
  const actions=planningNode("div","activity-actions");
  actions.append(planningIcon("Edit activity: "+activity.title,()=>openActivityEditor(item),"pencil"));
  const google=planningButton("Add to Google Calendar",()=>{
    if(!confirm("This creates a separate Google event, not a synced event. Repeating it can create duplicates. Create a copy anyway?"))return;
    window.open(LifePlanning.googleLink(activity),"_blank","noopener,noreferrer");
  },"external-link");
  const details=planningNode("details","activity-more");details.append(planningNode("summary","","More"),google,
    planningButton("Archive",()=>{if(confirm(`Archive "${activity.title}"? You can restore it from Archive.`))archiveCard(card.id);},"archive"));
  actions.append(details);row.append(copy,actions);return row;
}
function openActivityEditor(item) {
  const session=planningSession();
  if(session.activityDraft){planningRefresh();return;}
  const a=item?.activity,start=a?.startAt?LifePlanning.localInput(a.startAt):"",end=a?.endAt?LifePlanning.localInput(a.endAt):"";
  session.activityDraft={id:item?.card.id || "",base:item?LifeStateMerge.copy(item.card.activity || {targetAt:item.card.targetAt,title:item.card.title,description:item.card.description}):null,
    title:a?.title || "",area:a?.area || session.lastArea || "",allDay:a?.allDay || false,startDate:a?.allDay?a.startDate:start.slice(0,10)||session.day,
    endDate:a?.allDay?a.endDate:end.slice(0,10)||session.day,startTime:start.slice(11)||"09:00",endTime:end.slice(11)||"10:00",location:a?.location||"",url:a?.url||"",notes:a?.notes||""};
  planningRefresh();elements.boardGrid.querySelector('[aria-label="Activity name"]')?.focus();
}
function renderActivityEditor() {
  const session=planningSession(),draft=session.activityDraft,form=planningNode("form","activity-editor");
  form.append(planningNode("h3","",draft.id?"Edit activity":"New activity"));
  const field=(label,type,key)=>planningField(label,planningInput(type,draft[key],value=>{draft[key]=value;savePlanningSession();}));
  const name=field("Activity name","text","title");name.querySelector("input").required=true;form.append(name);
  form.append(planningField("Activity area",planningSelect(taskAreaOptions(draft.area),draft.area,value=>{draft.area=value;savePlanningSession();})));
  const allDay=planningInput("checkbox","",()=>{});allDay.checked=draft.allDay;allDay.onchange=()=>{draft.allDay=allDay.checked;planningRefresh();};form.append(planningField("All day",allDay));
  const endDate=planningInput("date",draft.endDate,value=>{draft.endDate=value;draft.endDateFollowsStart=!value||value===draft.startDate;savePlanningSession();});
  endDate.min=LifePlanner.validDate(draft.startDate)?draft.startDate:"";
  const startDate=planningInput("date",draft.startDate,value=>{
    Object.assign(draft,LifePlanning.changeActivityStart(draft,value));endDate.value=draft.endDate;endDate.min=LifePlanner.validDate(value)?value:"";savePlanningSession();
  });
  const dates=planningNode("div","activity-dates");dates.append(planningField("Start date",startDate),planningField("End date",endDate));
  if(!draft.allDay)dates.append(field("Start time","time","startTime"),field("End time","time","endTime"));form.append(dates);
  form.append(field("Location","text","location"),field("Meeting link","url","url"));
  const notes=planningNode("textarea");notes.rows=4;notes.value=draft.notes;notes.oninput=()=>{draft.notes=notes.value;savePlanningSession();};form.append(planningField("Activity notes",notes));
  const message=planningNode("p","planning-message");message.setAttribute("role","alert");form.append(message);
  const actions=planningNode("div","activity-editor-actions"),save=planningButton("Save activity",null,"check");save.type="submit";save.classList.add("is-primary");
  actions.append(save,planningButton("Cancel",()=>{if(!draft.title.trim()||confirm("Discard this activity draft?")){delete session.activityDraft;planningRefresh();}},"x"));form.append(actions);
  form.onsubmit=event=>{
    event.preventDefault();
    try{
      const activity=LifePlanning.activityFromDraft(draft);
      let card=draft.id?state.cards.find(card=>card.id===draft.id):null;
      if(draft.id&&((!card && (!draft.pendingNew || getArchivedCards().some(card=>card.id===draft.id))) || (card && !LifeStateMerge.equal(draft.base,card.activity || {targetAt:card.targetAt,title:card.title,description:card.description}))))throw new Error("This activity changed in another tab. Your draft is kept. Cancel and reopen to review the latest version.");
      const targetAt=activity.allDay?new Date(activity.startDate+"T12:00:00").toISOString():activity.startAt;
      if(!card){card=makeCard({type:"event",title:activity.title,category:activity.area||"Unsorted",timerMode:"date",targetAt});card.id=draft.id || card.id;card.calendarOnly=true;state.cards.push(card);draft.pendingNew=true;}
      Object.assign(card,{activity,title:activity.title,category:activity.area||"Unsorted",targetAt,updatedAt:Date.now()});
      draft.id=card.id;draft.base=LifeStateMerge.copy(activity);savePlanningSession();
      if(!saveState())throw new Error("Not saved yet. Your activity draft is kept; try again when device saving is available.");
      session.lastArea=draft.area;session.day=activity.allDay?activity.startDate:LifePlanning.localInput(activity.startAt).slice(0,10);session.area="*";
      delete session.activityDraft;savePlanningSession();renderCardsOnly({force:true});
    }catch(error){message.textContent=error.message;}
  };
  return form;
}
function renderReadableActivity(activity) {
  return renderReadableKeyValues("Activity",[["Name",activity.title],["Area",activity.area],["When",formatActivityTiming(activity)],["Recorded time zone",activity.timezone],["Location",activity.location],["Meeting link",activity.url],["Notes",activity.notes]]);
}

function renderActivityConflictForm(conflict,onSaved) {
  return renderRecordConflictForm(conflict,onSaved,{
    noun:"activity",currentLabel:"Current activity",scope:"activity",className:"activity-conflict-form",
    inspect:LifeStateMerge.inspectActivityConflict,
    render:activity=>{
      const version=planningNode("div","planner-conflict-version");version.append(planningNode("h4","",activity.title));
      for(const text of [activity.area,formatActivityTiming(activity),activity.timezone,activity.location,activity.url,activity.notes])if(text)version.append(planningNode("p","",text));return version;
    },
    apply:(conflict,expected,selected)=>applyConflictChoice(conflict,expected,selected,LifeStateMerge.resolveActivityConflict),
    introduction:"Choose one complete activity version. Its dates, location and notes stay together.",
    unavailable:"This activity moved or has incomplete dates. Its recovery copies have been kept; no times were guessed."
  });
}
