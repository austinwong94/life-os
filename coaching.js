(function (root) {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value+"T00:00:00Z").toISOString().slice(0,10) === value;
  const shift = (date, days) => new Date(Date.parse(date+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
  const days = (a,b) => Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000);
  const safeId = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !["__proto__","constructor","prototype"].includes(value);
  const text = value => typeof value === "string";
  const unique = rows => Array.isArray(rows) && rows.every(row=>row && safeId(row.id)) && new Set(rows.map(row=>row.id)).size === rows.length;
  const kinds = ["number","milestone","count","unique","initiated","streak","weekly"];
  function metrics(program) { return program.priorities.flatMap(p=>p.krs.flatMap(kr=>kr.metrics.map(m=>({...m,priorityId:p.id,krId:kr.id})))); }
  function validate(program) {
    const fail = message => {throw new Error(message);};
    if (!program || program.schemaVersion!==1 || !safeId(program.id) || !text(program.title) || !program.title.trim()) fail("Choose a valid Life OS priorities programme.");
    if (!validDate(program.startDate) || !validDate(program.endDate) || program.endDate<program.startDate) fail("Programme dates are invalid.");
    if (!unique(program.priorities) || !program.priorities.length || program.priorities.length>12) fail("Priorities need unique IDs.");
    for (const priority of program.priorities) {
      if (!text(priority.title) || !text(priority.objective) || !unique(priority.krs)) fail("A priority is incomplete.");
      for (const kr of priority.krs) {
        if (!text(kr.title) || !text(kr.description) || !unique(kr.metrics)) fail("A key result is incomplete.");
        for (const metric of kr.metrics) {
          if (!kinds.includes(metric.kind) || !text(metric.label) || !text(metric.unit) || !Number.isFinite(metric.target) || metric.target<=0) fail("A progress measure is invalid.");
          if (metric.dueDate && (!validDate(metric.dueDate) || metric.dueDate<program.startDate || metric.dueDate>program.endDate)) fail("A milestone falls outside this programme.");
          if(metric.pacePlan && (!Array.isArray(metric.pacePlan) || metric.pacePlan.some((p,i,rows)=>!validDate(p.date) || p.date<program.startDate || p.date>(metric.dueDate || program.endDate) || !Number.isFinite(p.value) || p.value<0 || p.value>metric.target || i>0 && (p.date<=rows[i-1].date || p.value<rows[i-1].value))))fail('Checkpoints must have increasing dates and non-decreasing values within the target.');
          if (["count","unique","initiated","streak"].includes(metric.kind) && !safeId(metric.source)) fail("An activity measure needs a source.");
          if (metric.kind==="streak" && (!Number.isInteger(metric.perMonth) || metric.perMonth<1 || !Number.isInteger(metric.months) || metric.months<1)) fail("A consistency measure is invalid.");
        }
      }
    }
    const measures=metrics(program);
    if (new Set(measures.map(m=>m.id)).size!==measures.length) fail("Measure IDs must be unique across priorities.");
    if (!unique(program.activities) || program.activities.some(a=>!text(a.label) || !program.priorities.some(p=>p.id===a.priorityId) || (a.entityLabel!==undefined && !text(a.entityLabel)))) fail("Activity definitions are invalid.");
    if (measures.some(m=>m.source && !program.activities.some(a=>a.id===m.source))) fail("A measure refers to an unknown activity.");
    if (!unique(program.checkins) || program.checkins.some(c=>!validDate(c.date) || c.date<program.startDate || c.date>program.endDate)) fail("Check-in dates are invalid.");
    if (new Set(program.checkins.map(c=>c.date)).size!==program.checkins.length) fail("Check-in dates must be different.");
    if (!unique(program.entries || [])) fail("Progress records need unique IDs.");
    // Reject unsafe object keys at every depth before admitting an imported file.
    const inspect=value=>{if(value && typeof value==="object")for(const key of Object.keys(value)){if(["__proto__","constructor","prototype"].includes(key))fail("Unsafe programme file.");inspect(value[key]);}};
    inspect(program);
    for (const entry of program.entries || []) validateEntry(program,entry,"9999-12-31");
    return copy(program);
  }
  function weekStart(program,date) { return shift(program.startDate,Math.floor(days(program.startDate,date)/7)*7); }
  function validateEntry(program,entry,today) {
    if (!safeId(entry.id) || !validDate(entry.date) || entry.date<program.startDate || entry.date>program.endDate || !Number.isFinite(entry.recordedAt) || entry.recordedAt<0 || !text(entry.note)) throw new Error("Choose a date within the programme and a valid record.");
    if (entry.kind!=="checkin" && entry.date>today) throw new Error("Future plans belong in Next actions. Log progress only after it happens.");
    if (entry.kind==="measurement") {
      const metric=metrics(program).find(m=>m.id===entry.metricId);
      if (!metric || !["number","milestone"].includes(metric.kind) || !Number.isFinite(entry.value) || entry.value<0 || (metric.kind==="milestone" && ![0,1].includes(entry.value))) throw new Error("Enter a valid non-negative progress value.");
    } else if(entry.kind==="activity") {
      const measures=metrics(program).filter(m=>m.source===entry.source);
      if (!measures.length || !text(entry.entity) || !text(entry.note) || typeof entry.initiated!=="boolean" || typeof entry.reciprocal!=="boolean") throw new Error("Choose a valid activity.");
      if (measures.some(m=>["unique","streak"].includes(m.kind)) && !entry.entity.trim()) throw new Error("Enter an activity name or a private nickname to track consistency.");
      if (!entry.note.trim() && !entry.entity.trim()) throw new Error("Add an activity name or a short note about what happened.");
    } else if(entry.kind==="week") {
      if(entry.date!==weekStart(program,entry.date) || !["exercise","rest","personal","reflection"].every(k=>typeof entry[k]==="boolean")) throw new Error("Choose a valid programme week.");
      if(entry.changedField && !["exercise","rest","personal","reflection"].includes(entry.changedField)) throw new Error("Unknown weekly checkbox.");
    } else if(entry.kind==="reflection") {
      const priority=program.priorities.find(p=>p.id===entry.priorityId);
      if(!priority?.krs.some(kr=>kr.id===entry.krId) || !entry.note.trim()) throw new Error("Choose a goal and write a thought to keep.");
    } else if(entry.kind==="checkin") {
      const session=program.checkins.find(c=>c.id===entry.sessionId);
      if (!session || session.date!==entry.date || typeof entry.held!=="boolean" || !["wins","obstacles","support","commitment"].every(k=>text(entry[k])) || (entry.held && entry.date>today)) throw new Error("A future check-in can be prepared, but not marked attended yet.");
    } else throw new Error("Unknown progress record.");
    return copy(entry);
  }
  function activeEntries(program,asOf) { return (program.entries || []).filter(e=>!e.voidedAt && e.date<=asOf && e.date>=program.startDate && e.date<=program.endDate); }
  function latest(entries) { return [...entries].sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt-a.recordedAt||b.id.localeCompare(a.id))[0]; }
  function latestWeeks(program,asOf) {
    const map=new Map();
    for(const entry of activeEntries(program,asOf).filter(e=>e.kind==="week").sort((a,b)=>a.recordedAt-b.recordedAt||a.id.localeCompare(b.id))) {
      const previous=map.get(entry.date);
      // Checkbox records change just one field; concurrent ticks must not undo
      // another tab's check or replace its written weekly reflection.
      map.set(entry.date,entry.changedField?{date:entry.date,exercise:false,rest:false,personal:false,reflection:false,note:"",...previous,[entry.changedField]:entry[entry.changedField],recordedAt:entry.recordedAt}:entry);
    }
    return [...map.values()];
  }
  function monthOrdinal(date) {const [year,month]=date.split("-").map(Number);return year*12+month-1;}
  function streaks(entries,metric,asOf) {
    const people=new Map();
    for(const e of entries) {
      if(metric.reciprocal && !e.reciprocal)continue;
      const entity=e.entity.trim().replace(/\s+/g," ").toLocaleLowerCase();if(!entity)continue;
      if(!people.has(entity))people.set(entity,new Map());const months=people.get(entity),month=monthOrdinal(e.date);months.set(month,(months.get(month)||0)+1);
    }
    return [...people].map(([entity,months])=>{
      let longest=0,current=0,last=-1;
      for(const month of [...months.keys()].filter(m=>months.get(m)>=metric.perMonth).sort((a,b)=>a-b)){current=month===last+1?current+1:1;longest=Math.max(longest,current);last=month;}
      return {entity,months:longest,thisMonth:months.get(monthOrdinal(asOf)) || 0,qualified:longest>=metric.months};
    });
  }
  function progress(program,metric,asOf) {
    const records=activeEntries(program,asOf);let value=0,recorded=false,details=[],last;
    if(["number","milestone"].includes(metric.kind)) {
      last=latest(records.filter(e=>e.kind==="measurement" && e.metricId===metric.id));recorded=Boolean(last);value=last?.value || 0;
    } else if(metric.kind==="weekly") {
      const weeks=latestWeeks(program,asOf);recorded=weeks.length>0;value=weeks.filter(e=>["exercise","rest","personal","reflection"].every(k=>e[k])).length;
    } else {
      const entries=records.filter(e=>e.kind==="activity" && e.source===metric.source);recorded=entries.length>0;
      if(metric.kind==="streak"){details=streaks(entries,metric,asOf);value=details.filter(e=>e.qualified).length;}
      else if(metric.kind==="initiated")value=entries.filter(e=>e.initiated).length;
      else if(metric.kind==="unique")value=new Set(entries.map(e=>e.entity.trim().replace(/\s+/g," ").toLocaleLowerCase()).filter(Boolean)).size;
      else value=entries.length;
    }
    const met=recorded && value>=metric.target,due=metric.dueDate || program.endDate;
    return {value,recorded,met,details,last,percent:Math.min(100,Math.round(value/metric.target*100)),status:met?"Target met":!recorded?"Not recorded":asOf>due?"Review needed":"In progress"};
  }
  function nextCheckin(program,today) {return [...program.checkins].sort((a,b)=>a.date.localeCompare(b.date)).find(c=>c.date>=today && !latest((program.entries || []).filter(e=>!e.voidedAt && e.kind==="checkin" && e.sessionId===c.id))?.held);}
  function overdueCheckins(program,today) {return program.checkins.filter(c=>c.date<today && !latest((program.entries || []).filter(e=>!e.voidedAt && e.kind==='checkin' && e.sessionId===c.id))?.held).sort((a,b)=>a.date.localeCompare(b.date));}
  function pace(program,metric,asOf) {
    const result=progress(program,metric,asOf),checkpoint=(metric.pacePlan || []).filter(p=>p.date<=asOf).at(-1);
    const due=metric.dueDate || program.endDate,expected=checkpoint?.value ?? (asOf>=due?metric.target:null);
    return {expected,checkpoint:checkpoint?.date || (expected!==null?due:''),status:!result.recorded?'Not recorded':result.met?'Target met':expected===null?'No checkpoint due':result.value>=expected?'Checkpoint met':'Below planned checkpoint'};
  }
  function completion(program,measures,asOf) {
    const core=measures.filter(m=>!m.stretch),results=core.map(m=>progress(program,m,asOf));
    const recorded=results.filter(r=>r.recorded).length;
    return {percent:recorded?Math.round(results.reduce((sum,r,i)=>sum+Math.min(1,r.value/core[i].target),0)/core.length*100):null,recorded,total:core.length,met:results.filter(r=>r.met).length};
  }
  function outcomeSnapshot(program,asOf) {
    if(!validDate(asOf))throw new Error('Choose a valid progress date.');
    validate(program);
    const records=activeEntries(program,asOf);
    return {programId:program.id,title:program.title,asOf,priorities:program.priorities.map(priority=>{
      const measures=priority.krs.flatMap(kr=>kr.metrics);
      const goals=priority.krs.map(kr=>({id:kr.id,title:kr.title,metrics:kr.metrics.filter(m=>!m.stretch).map(metric=>{
        const result=progress(program,metric,asOf),checkpoint=pace(program,metric,asOf);
        const updates=records.filter(entry=>['number','milestone'].includes(metric.kind)?entry.kind==='measurement' && entry.metricId===metric.id:
          metric.kind==='weekly'?entry.kind==='week':entry.kind==='activity' && entry.source===metric.source);
        return {id:metric.id,label:metric.label,unit:metric.unit,target:metric.target,kind:metric.kind,
          value:result.value,recorded:result.recorded,met:result.met,pace:checkpoint,lastDate:latest(updates)?.date || ''};
      })}));
      const rows=goals.flatMap(goal=>goal.metrics);
      return {id:priority.id,title:priority.title,goals,...completion(program,measures,asOf),
        belowCheckpoint:rows.filter(row=>row.pace.status==='Below planned checkpoint').length,
        missingCheckpoint:rows.filter(row=>!row.recorded && row.pace.expected!==null).length};
    })};
  }
  const api={validate,validateEntry,metrics,weekStart,latestWeeks,progress,completion,outcomeSnapshot,nextCheckin,overdueCheckins,pace,validDate,shift,days,latest,activeEntries,copy};
  root.LifeCoaching=api;if(typeof module!=="undefined" && module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);

const coachingSessions=new Map();
function coachingSession() {
  const id=state.activeBoardId;
  if(!coachingSessions.has(id)){let saved={};try{saved=JSON.parse(sessionStorage.getItem(LifeStorageScope.key("life-os-coaching:"+id))||"{}");}catch{}coachingSessions.set(id,{tab:"overview",...saved,pickingFile:false});}
  return coachingSessions.get(id);
}
function saveCoachingDraft() {
  const label=document.querySelector('.coaching-draft-status');
  try{sessionStorage.setItem(LifeStorageScope.key("life-os-coaching:"+state.activeBoardId),JSON.stringify(coachingSession()));if(label)label.textContent="Draft saved in this tab · Not yet synced";return true;}
  catch{if(label)label.textContent="Draft only in memory · Storage unavailable";setSaveStatus("Priorities draft is only in memory - device storage unavailable","error");return false;}
}
function coachingProgramsForBoard(board) {
  const store=(board.archivedCards || []).find(c=>c.coachingStore===true);
  const stored=store?.coachingPrograms || board.coachingPrograms;
  return Array.isArray(stored)?stored:[];
}
function currentCoachingPrograms() {const board=state.boards.find(b=>b.id===state.activeBoardId);return board?coachingProgramsForBoard({...board,archivedCards:getArchivedCards()}):[];}
function coachingProgram() {const list=currentCoachingPrograms();return list.find(p=>p.id===coachingSession().programId)||list[0];}
function coachingStore() {
  let store=getArchivedCards().find(c=>c.coachingStore===true);
  if(!store){
    // Older releases preserve additional fields on known card records. Their
    // board normalizer drops new top-level fields, so the programme lives here.
    const programmes=LifeCoaching.copy(currentCoachingPrograms());
    store={...makeCard({type:'planner',title:'Priorities records',category:'Priorities'}),id:'coaching-store-'+state.activeBoardId,plannerSourceOnly:true,coachingStore:true,coachingPrograms:programmes,archivedAt:Date.now()};
    state.archivedCards=[...getArchivedCards(),store];
  }return store;
}
function writableCoachingProgram() {const id=coachingProgram()?.id;return coachingStore().coachingPrograms.find(p=>p.id===id);}
function refreshCoaching() {saveCoachingDraft();renderCardsOnly({force:true});}
function coachingQuickKey(key) {return coachingProgram().id+":"+key;}
function coachingQuickDraft(key) {return coachingSession().quickDrafts?.[coachingQuickKey(key)] || {};}
function coachingQuickInput(input,key,field) {
  const session=coachingSession();
  input.oninput=()=>{session.quickDrafts ||= {};session.quickDrafts[coachingQuickKey(key)]={...coachingQuickDraft(key),[field]:input.value};const saved=saveCoachingDraft();const status=input.closest('form')?.querySelector('.coaching-quick-draft-status');if(status)status.textContent=saved?'Draft saved in this tab · Not yet synced':'Draft only in memory · Storage unavailable';};
  return input;
}
function clearCoachingQuickDraft(key) {delete (coachingSession().quickDrafts || {})[coachingQuickKey(key)];saveCoachingDraft();}
function coachingRecordNow(fields,message) {
  const program=writableCoachingProgram();
  const entry={id:createId(),recordedAt:program.entries.reduce((time,e)=>Math.max(time,e.recordedAt+1),Date.now()),note:"",...fields};
  try {
    LifeCoaching.validateEntry(program,entry,getTodayKey());program.entries.push(entry);
    if(!saveState())throw new Error("Not saved. Your writing is kept here; please try again.");
    coachingSession().notice="Saved on this device";return true;
  } catch(error) {
    const live=writableCoachingProgram();live.entries=live.entries.filter(e=>e.id!==entry.id);syncActiveBoard({touchBoard:false});
    message.textContent=error.message;return false;
  }
}
function coachingFeedback() {const node=coachingText("p","","coaching-message");node.setAttribute("role","alert");return node;}
function coachingDisclosure(title,key,open=false) {
  const details=planningNode("details","coaching-disclosure"),session=coachingSession(),recordKey=coachingQuickKey(key);
  details.append(coachingText("summary",title));details.open=session.disclosures?.[recordKey] ?? open;
  details.ontoggle=()=>{session.disclosures ||= {};session.disclosures[recordKey]=details.open;saveCoachingDraft();};return details;
}
function coachingProgressMeter(program,measures,label) {
  const result=LifeCoaching.completion(program,measures,getTodayKey()),box=planningNode("div","coaching-progress-meter");
  const value=coachingText("strong",result.percent===null?"Not recorded":result.percent+"%","coaching-percent");
  if(result.percent===null)value.classList.add('is-unreported');
  value.title="Recorded target completion, not a pace forecast. Core targets are equally weighted; unreported targets contribute no recorded progress. Stretch targets are excluded.";
  const bar=document.createElement("progress");bar.max=100;bar.value=result.percent || 0;bar.setAttribute("aria-label",label+" completion");
  box.append(value,bar,coachingText("small",result.recorded+" / "+result.total+" targets updated","coaching-muted"));return box;
}
function renderCoachingQuickWeek(root,program) {
  const today=getTodayKey(),date=LifeCoaching.weekStart(program,today),valid=date>=program.startDate && today<=program.endDate;
  const previous=LifeCoaching.latestWeeks(program,today).find(e=>e.date===date) || {};
  const section=planningNode("div","coaching-quick-week"),message=coachingFeedback();
  section.append(coachingText("strong",valid?"Programme week":"Weekly routine"),coachingText("small",valid?coachingDate(date)+" - "+coachingDate([LifeCoaching.shift(date,6),program.endDate].sort()[0]):"Choose a programme week in Weekly","coaching-muted"));
  const count=["exercise","rest","personal","reflection"].filter(key=>previous[key]).length;
  section.append(coachingText('small',count+' / 4 recorded','coaching-week-count'));
  const checks=planningNode("div","coaching-week-checks");
  for(const [key,label] of [["exercise","Exercise"],["rest","Rest"],["personal","Time for me"],["reflection","Reflection"]]) {
    const input=document.createElement("input");input.type="checkbox";input.checked=Boolean(previous[key]);input.disabled=!valid;input.setAttribute("aria-label","Programme week: "+label);
    const row=planningNode("label","coaching-tick");row.append(input,coachingText("span",label));
    input.onchange=()=>{
      const current=LifeCoaching.latestWeeks(coachingProgram(),today).find(e=>e.date===date) || {};
      const fields={kind:"week",date,note:current.note || "",...Object.fromEntries(["exercise","rest","personal","reflection"].map(k=>[k,Boolean(current[k])])),changedField:key,[key]:input.checked};
      if(coachingRecordNow(fields,message))refreshCoaching();else input.checked=!input.checked;
    };checks.append(row);
  }
  section.append(checks,message);root.append(section);
}
function renderCoachingQuickMetric(root,program,metric) {
  const result=LifeCoaching.progress(program,metric,getTodayKey()),row=planningNode("div","coaching-measure"),message=coachingFeedback();
  if(metric.kind==="milestone") {
    const label=planningNode("label","coaching-tick coaching-milestone"),check=document.createElement("input");check.type="checkbox";check.checked=result.met;check.setAttribute("aria-label",metric.label);
    check.onchange=()=>{if(coachingRecordNow({kind:"measurement",metricId:metric.id,date:[getTodayKey(),program.endDate].sort()[0],value:check.checked?1:0},message))refreshCoaching();else check.checked=!check.checked;};
    label.append(check,coachingText("span",metric.label));row.append(label);
  } else if(metric.kind==="number") {
    const key="metric:"+metric.id,draft=coachingQuickDraft(key),form=planningNode("form","coaching-number-form");
    const input=coachingQuickInput(document.createElement("input"),key,"value");input.type="number";input.min="0";input.step=metric.unit==="RM"?"0.01":"1";input.required=true;input.value=draft.value ?? (result.recorded?result.value:"");input.placeholder="0";
    const field=planningField(metric.label,input),actions=planningNode("div","coaching-number-entry"),save=planningIcon("Save "+metric.label,null,"check");save.type="submit";
    field.lastChild.remove();actions.append(input,coachingText("span","/ "+metric.target+" "+metric.unit,"coaching-target"),save);field.append(actions);form.append(field);
    form.onsubmit=event=>{event.preventDefault();if(coachingRecordNow({kind:"measurement",metricId:metric.id,date:[getTodayKey(),program.endDate].sort()[0],value:Number(input.value)},message)){clearCoachingQuickDraft(key);refreshCoaching();}};row.append(form);
  } else {
    row.append(coachingText("strong",metric.label),coachingText("span",(result.recorded?result.value:"-")+" / "+metric.target+" "+metric.unit,"coaching-value"));
    for(const streak of result.details)row.append(coachingText("small",streak.entity+": "+streak.thisMonth+" / "+metric.perMonth+" this month · "+streak.months+" / "+metric.months+" qualifying months","coaching-muted"));
  }
  if(metric.dueDate)row.append(coachingText("small","Due "+coachingDate(metric.dueDate),"coaching-muted"));
  if(metric.stretchTarget)row.append(coachingText('small','Stretch: '+metric.stretchTarget+' '+metric.unit,'coaching-muted'));
  const detail=coachingDisclosure("Details & past dates","metric-details:"+metric.id);
  if(metric.definition)detail.append(coachingText("p",metric.definition,"coaching-muted"));
  if(["number","milestone"].includes(metric.kind))detail.append(planningButton("Update "+metric.label,()=>startCoachingDraft({kind:"measurement",metricId:metric.id,value:result.last?.value ?? (metric.kind==="milestone"?0:""),date:[program.endDate,getTodayKey()].sort()[0],note:""}),"pencil"));
  row.append(detail,message);root.append(row);
}
function renderCoachingGoalThought(root,program,priority,kr) {
  const key="thought:"+priority.id+":"+kr.id,draft=coachingQuickDraft(key);
  const notes=(program.entries || []).filter(e=>e.kind==="reflection" && e.priorityId===priority.id && e.krId===kr.id && !e.voidedAt);
  const details=coachingDisclosure("My thoughts"+(notes.length?" ("+notes.length+")":""),key,Boolean(draft.note));
  const form=planningNode("form","coaching-thought-form"),input=coachingQuickInput(document.createElement("textarea"),key,"note");input.value=draft.note || "";input.placeholder="How did it go? What helped, or felt difficult?";input.required=true;
  form.append(planningField("My thoughts: "+kr.title,input),coachingText('small',draft.note?'Draft in this tab · Not yet synced':'','coaching-quick-draft-status coaching-muted'));
  const save=planningButton("Keep thought",null,"check");save.type="submit";const message=coachingFeedback();form.append(save,message);
  form.onsubmit=event=>{event.preventDefault();if(coachingRecordNow({kind:"reflection",priorityId:priority.id,krId:kr.id,date:[getTodayKey(),program.endDate].sort()[0],note:input.value},message)){clearCoachingQuickDraft(key);refreshCoaching();}};
  details.append(form);
  for(const note of [...notes].reverse()){const saved=planningNode("div","coaching-saved-thought");saved.append(coachingText("small",coachingDate(note.date),"coaching-muted"),coachingText("p",note.note,"coaching-note"));details.append(saved);}root.append(details);
}
function toggleCoachingRecord(entry,message) {
  const live=writableCoachingProgram().entries.find(e=>e.id===entry.id);if(!live)return;
  const before=live.voidedAt;live.voidedAt=live.voidedAt?0:Date.now();
  if(saveState()){coachingSession().notice=live.voidedAt?"Step unchecked. History kept.":"Step restored";refreshCoaching();return true;}
  live.voidedAt=before;syncActiveBoard({touchBoard:false});message.textContent="Not saved. Please try again.";return false;
}
function renderCoachingActivity(root,program,activity) {
  const key="activity:"+activity.id,draft=coachingQuickDraft(key),form=planningNode("form","coaching-activity-capture"),message=coachingFeedback();
  const field=activity.entityLabel?"entity":"note",input=coachingQuickInput(document.createElement("input"),key,field);input.type="text";input.required=true;input.value=draft[field] || "";input.placeholder=activity.entityLabel || "What did you do?";
  const label=planningField(activity.entityLabel || activity.label,input),line=planningNode("div","coaching-capture-line"),save=planningIcon("Record "+activity.label,null,"check");save.type="submit";save.classList.add("is-primary");
  label.lastChild.remove();line.append(input,save);label.append(line);form.append(label);
  const flags={};
  for(const [flag,text] of [["initiated","I initiated this"],["reciprocal","Mutual effort"]])if(activity[flag]){
    const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=Boolean(draft[flag]);checkbox.setAttribute("aria-label",text);
    checkbox.onchange=()=>{const session=coachingSession();session.quickDrafts ||= {};session.quickDrafts[coachingQuickKey(key)]={...coachingQuickDraft(key),[flag]:checkbox.checked};saveCoachingDraft();};
    const row=planningNode("label","coaching-tick");row.append(checkbox,coachingText("span",text));form.append(row);flags[flag]=checkbox;
  }
  const more=coachingDisclosure("Date & note","activity-options:"+activity.id),date=coachingQuickInput(document.createElement("input"),key,"date");date.type="date";date.required=true;date.min=program.startDate;date.max=[getTodayKey(),program.endDate].sort()[0];date.value=draft.date || date.max;more.append(planningField("Date: "+activity.label,date));
  let note;
  if(activity.entityLabel){note=coachingQuickInput(document.createElement("textarea"),key,"note");note.value=draft.note || "";more.append(planningField("How did it go? (optional)",note));}
  more.append(planningButton("Log "+activity.label,()=>startCoachingDraft({kind:"activity",source:activity.id,date:date.value,entity:"",note:"",initiated:false,reciprocal:false}),"pencil"));
  form.append(more,message);
  form.onsubmit=event=>{event.preventDefault();const values={kind:"activity",source:activity.id,date:date.value,entity:field==="entity"?input.value:"",note:field==="note"?input.value:note?.value || "",initiated:Boolean(flags.initiated?.checked),reciprocal:Boolean(flags.reciprocal?.checked)};
    if(coachingRecordNow(values,message)){clearCoachingQuickDraft(key);coachingSession().notice="Step recorded. A little progress counts.";refreshCoaching();}};root.append(form);
  const entries=(program.entries || []).filter(e=>e.kind==="activity" && e.source===activity.id).sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt-a.recordedAt);
  const list=coachingDisclosure("Recorded steps ("+entries.filter(e=>!e.voidedAt).length+")","activity-list:"+activity.id,true);
  for(const entry of entries){const row=planningNode("label","coaching-action"),check=document.createElement("input");check.type="checkbox";check.checked=!entry.voidedAt;check.setAttribute("aria-label",(entry.voidedAt?"Restore step: ":"Recorded step: ")+(entry.entity || entry.note));
    const error=coachingFeedback();check.onchange=()=>{if(!toggleCoachingRecord(entry,error))check.checked=!check.checked;};row.append(check,coachingText("span",entry.entity || entry.note),coachingText("small",coachingDate(entry.date)+(entry.voidedAt?" · Unchecked":"")));list.append(row);
    if(entry.entity && entry.note)list.append(coachingText("p",entry.note,"coaching-note"));list.append(error);
  }
  if(entries.length)root.append(list);
}
function coachingText(tag,text,className="") {return planningNode(tag,className,text);}
function coachingDate(date) {return new Date(date+"T12:00:00").toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});}
function coachingDraftField(form,label,key,type="text",options={}) {
  const draft=coachingSession().draft;
  const input=type==="textarea"?document.createElement("textarea"):document.createElement("input");
  if(type!=="textarea")input.type=type;else input.rows=4;
  input.value=draft[key] ?? "";
  Object.assign(input,options);
  input.oninput=()=>{draft[key]=input.value;saveCoachingDraft();};form.append(planningField(label,input));return input;
}
function coachingCheck(form,label,key) {
  const draft=coachingSession().draft,input=document.createElement("input");input.type="checkbox";input.checked=Boolean(draft[key]);input.onchange=()=>{draft[key]=input.checked;saveCoachingDraft();};
  const row=planningField(label,input);row.classList.add("coaching-check");form.append(row);return input;
}
function startCoachingDraft(draft) {
  const session=coachingSession();if(session.draft && !confirm("Replace the unsaved priorities draft? Cancel keeps it. Saved records will not change."))return;
  session.draft={...draft,programId:coachingProgram()?.id};session.draftClosed=false;refreshCoaching();
  const editor=elements.boardGrid.querySelector('.coaching-editor');editor?.scrollIntoView({block:'start'});editor?.querySelector('input,select,textarea')?.focus({preventScroll:true});
}
function commitCoachingEntry(form) {
  const session=coachingSession(),draft=session.draft,program=writableCoachingProgram(),message=form.querySelector('[role="alert"]');
  try {
    if(!program || draft.programId!==program.id)throw new Error("This draft belongs to another programme. Select that programme first.");
    draft.pendingId ||= createId();saveCoachingDraft();
    const entry={...LifeCoaching.copy(draft),id:draft.pendingId,recordedAt:Date.now(),note:String(draft.note || "")};delete entry.pendingId;delete entry.programId;
    if(entry.kind==="measurement")entry.value=draft.value===""?NaN:Number(draft.value);
    LifeCoaching.validateEntry(program,entry,getTodayKey());
    const existing=program.entries.find(e=>e.id===entry.id);
    if(existing){const content=e=>Object.fromEntries(Object.entries(e).filter(([k])=>k!=="recordedAt"));if(!LifeStateMerge.equal(content(existing),content(entry)))throw new Error("The earlier save attempt already has a different record. Your draft is kept. Review History before replacing it.");}
    else program.entries.push(entry);
    if(!saveState())throw new Error("Not saved on device. Your draft is kept; retry when storage is available.");
    delete session.draft;refreshCoaching();
  }catch(error){message.textContent=error.message;}
}
function renderCoachingEditor(root) {
  const draft=coachingSession().draft,program=coachingProgram();if(!draft || !program || draft.programId!==program.id)return;
  const form=planningNode("form","coaching-editor"),heading={activity:"Log an experience",measurement:"Update a measure",week:"Weekly reflection",checkin:"Coaching check-in",action:"Next action"}[draft.kind]||"Progress";
  form.append(coachingText("h3",heading),coachingText("p","Draft in this tab · Not yet synced","coaching-draft-status coaching-muted"));
  if(draft.kind==="measurement") {
    const metric=LifeCoaching.metrics(program).find(m=>m.id===draft.metricId);form.append(coachingText("p",metric?.label||"Measure"));
    if(metric?.definition)form.append(coachingText("p",metric.definition,"coaching-muted"));
    if(metric?.kind==="milestone")form.append(planningField("Milestone",planningSelect([["0","Not yet"],["1","Achieved"]],String(draft.value),value=>{draft.value=value;saveCoachingDraft();})));
    else coachingDraftField(form,"Total to date"+(metric?.unit?" ("+metric.unit+")":""),"value","number",{min:"0",step:metric?.unit==="RM"?"0.01":"1",required:true});
  }
  if(draft.kind==="activity") {
    const source=program.activities.find(a=>a.id===draft.source);form.append(coachingText("p",source?.label||"Activity"));
    if(source?.definition)form.append(coachingText("p",source.definition,"coaching-muted"));
    if(source?.entityLabel)coachingDraftField(form,source.entityLabel,"entity","text",{required:true});
    if(source?.initiated)coachingCheck(form,"I initiated this","initiated");
    if(source?.reciprocal)coachingCheck(form,"There was mutual effort and I could be myself","reciprocal");
  }
  if(draft.kind==="week") {
    const weeks=[];for(let date=program.startDate;date<=program.endDate && date<=getTodayKey();date=LifeCoaching.shift(date,7))weeks.push([date,coachingDate(date)+" - "+coachingDate([LifeCoaching.shift(date,6),program.endDate].sort()[0])]);
    form.append(planningField("Week beginning",planningSelect(weeks,draft.date,value=>{draft.date=value;const previous=LifeCoaching.latestWeeks(program,getTodayKey()).find(e=>e.date===value);for(const key of ["exercise","rest","personal","reflection"])draft[key]=Boolean(previous?.[key]);draft.note=previous?.note || "";refreshCoaching();})));
    for(const [key,label] of [["exercise","Regular exercise"],["rest","Proper rest"],["personal","Personal time"],["reflection","Weekly reflection"]])coachingCheck(form,label,key);
  } else if(draft.kind==="checkin") {
    form.append(coachingText("p",coachingDate(draft.date)));
    for(const [key,label] of [["wins","What moved forward?"],["obstacles","What got in the way?"],["support","What support do I need?"],["commitment","What will I do before the next session?"]])coachingDraftField(form,label,key,"textarea");
    const held=coachingCheck(form,"Session attended","held");held.disabled=draft.date>getTodayKey();
  } else coachingDraftField(form,draft.kind==="action"?"Planned day":"Date","date","date",{required:true,min:program.startDate,max:draft.kind==="action"?program.endDate:[program.endDate,getTodayKey()].sort()[0]});
  if(draft.kind==="action"){
    coachingDraftField(form,"Next action","title","text",{required:true});
    draft.area ||= program.priorities.find(p=>p.id===draft.priorityId)?.area || "Personal";
    form.append(planningField("Area",planningSelect(taskAreaOptions(draft.area),draft.area,value=>{draft.area=value;saveCoachingDraft();})));
    const priority=program.priorities.find(p=>p.id===draft.priorityId);
    form.append(planningField('Contributes to',planningSelect([['','Priority overall'],...(priority?.krs || []).map(kr=>[kr.id,kr.title])],draft.krId || '',value=>{draft.krId=value;saveCoachingDraft();})));
  }
  else if(draft.kind!=="checkin")coachingDraftField(form,draft.kind==="week"?"Reflection and one adjustment":"Evidence or notes","note","textarea",{required:draft.kind==="activity" && !program.activities.find(a=>a.id===draft.source)?.entityLabel});
  const message=coachingText("p","","coaching-message");message.setAttribute("role","alert");
  const actions=planningNode("div","coaching-editor-actions"),save=planningButton("Save "+(draft.kind==="action"?"action":"record"),null,"check");save.type="submit";save.classList.add("is-primary");
  actions.append(save,planningButton("Keep draft and close",()=>{coachingSession().draftClosed=true;refreshCoaching();}),planningButton("Discard draft",()=>{if(confirm("Discard this unsaved draft? Saved records are not affected.")){delete coachingSession().draft;refreshCoaching();}}));
  form.append(message,actions);form.onsubmit=event=>{event.preventDefault();if(draft.kind==="action")commitCoachingAction(form);else commitCoachingEntry(form);};root.append(form);
}
function commitCoachingAction(form) {
  const draft=coachingSession().draft,program=coachingProgram(),message=form.querySelector('[role="alert"]');
  try{
    if(!draft.title.trim() || !LifeCoaching.validDate(draft.date) || draft.date<program.startDate || draft.date>program.endDate)throw new Error("Enter an action and a date within the programme.");
    draft.pendingId ||= createId();saveCoachingDraft();
    const priority=program.priorities.find(p=>p.id===draft.priorityId),area=draft.area || priority.area || "Personal";
    const source=getPlannerSourceCards().find(c=>LifePlanner.ensure(c).some(t=>t.id===draft.pendingId)) || getPlannerWriteSourceCard({category:area},draft.date);
    const task=LifePlanner.ensure(source).find(t=>t.id===draft.pendingId) || LifePlanner.add(source,draft.date,draft.title,draft.pendingId);
    if(draft.krId && !priority.krs.some(kr=>kr.id===draft.krId))throw new Error('That goal is no longer available. Choose a current goal.');
    LifePlanner.change(source,task.id,{area,project:program.title,coachingProgramId:program.id,coachingPriorityId:priority.id,coachingKrId:draft.krId || ''});LifePlanner.project(source);
    if(!saveState())throw new Error("Not saved on device. Your draft is kept.");
    delete coachingSession().draft;refreshCoaching();
  }catch(error){message.textContent=error.message;}
}
function coachingEntryLabel(program,entry) {
  if(entry.kind==='reflection')return 'My thoughts: '+(program.priorities.find(p=>p.id===entry.priorityId)?.krs.find(kr=>kr.id===entry.krId)?.title || 'Goal');
  return LifeCoaching.metrics(program).find(m=>m.id===entry.metricId)?.label || program.activities?.find(a=>a.id===entry.source)?.label || (entry.kind==='week'?'Weekly reflection':'Coaching check-in');
}
function coachingReport(program) {
  const esc=escapeHtml,today=getTodayKey();
  try{LifeCoaching.validate(program);}catch{return '<section><h2>Priorities record needs review</h2><pre style="white-space:pre-wrap">'+esc(JSON.stringify(program,null,2))+'</pre></section>';}
  const objectives=program.priorities.map(p=>'<h3>'+esc(p.title)+'</h3><p>'+esc(p.objective)+'</p>'+p.krs.map(kr=>'<h4>'+esc(kr.title)+'</h4><p>'+esc(kr.description)+'</p><ul>'+kr.metrics.map(m=>{const s=LifeCoaching.progress(program,m,today);return '<li>'+esc(m.label)+': '+esc(s.recorded?s.value+' / '+m.target+' '+m.unit:'Not recorded')+(m.stretch?' (stretch)':'')+'</li>';}).join('')+'</ul>').join('')).join('');
  const records=[...(program.entries || [])].sort((a,b)=>a.date.localeCompare(b.date)||a.recordedAt-b.recordedAt).map(e=>{
    const weekly=e.kind==='week'?(e.changedField?[e.changedField]:['exercise','rest','personal','reflection']).map(k=>k+': '+(e[k]?'yes':'not marked')).join(', '):'';
    return '<section><h4>'+esc(coachingDate(e.date)+' - '+(e.voidedAt?'Excluded: ':'')+coachingEntryLabel(program,e))+'</h4><p style="white-space:pre-wrap">'+esc([e.value!==undefined?'Value: '+e.value:'',e.entity,weekly,e.kind==='activity'?'Initiated: '+e.initiated+'; reciprocal: '+e.reciprocal:'',e.kind==='checkin'?'Attended: '+e.held:'',e.note,...['wins','obstacles','support','commitment'].filter(k=>e[k]).map(k=>k+': '+e[k]),'Recorded: '+new Date(e.recordedAt).toISOString()].filter(Boolean).join('\n'))+'</p></section>';
  }).join('');
  return '<section class="coaching-export"><h2>'+esc(program.title)+'</h2><p>'+esc(coachingDate(program.startDate)+' to '+coachingDate(program.endDate))+'</p>'+objectives+'<h3>Check-ins</h3><ul>'+program.checkins.map(c=>'<li>'+esc(coachingDate(c.date))+'</li>').join('')+'</ul><h3>Saved records</h3>'+records+'</section>';
}
function downloadCoachingReport() {
  const program=coachingProgram();downloadTextFile('life-os-priorities-'+getTodayKey()+'.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Priorities review</title><style>body{font:16px/1.6 system-ui;color:#21332c;max-width:850px;margin:32px auto;padding:20px}h2{font-size:26px}h3{border-top:1px solid #ddd;padding-top:20px}p,li{overflow-wrap:anywhere}section{break-inside:avoid}</style>'+coachingReport(program)+'</html>','text/html;charset=utf-8');
}
function importCoachingProgram(program) {
  const validated=LifeCoaching.validate(program);
  if(currentCoachingPrograms().some(p=>p.id===validated.id))throw new Error("This programme already exists on this board. Nothing was replaced.");
  coachingStore().coachingPrograms.push(validated);
  if(!saveState())throw new Error("Programme is kept in memory, but device saving failed. Keep your source file and retry saving.");
  coachingSession().programId=validated.id;delete coachingSession().importDraft;refreshCoaching();
}
function renderCoachingImport(root) {
  const section=planningNode("section","coaching-import"),file=document.createElement("input");file.type="file";file.accept=".json,application/json";file.setAttribute("aria-label","Import priorities programme");
  const message=coachingText("p","");message.setAttribute("role","alert");
  file.onclick=()=>{coachingSession().pickingFile=true;};
  file.addEventListener('cancel',()=>{coachingSession().pickingFile=false;});
  file.onchange=async()=>{try{if(!file.files[0])return;if(file.files[0].size>2_000_000)throw new Error("Programme file exceeds 2 MB.");const programme=LifeCoaching.validate(JSON.parse(await file.files[0].text()));coachingSession().importDraft=programme;refreshCoaching();}catch(e){message.textContent=e.message;}finally{coachingSession().pickingFile=false;}};
  section.append(coachingText("h3","Add a priorities programme"),file,message);
  const draft=coachingSession().importDraft;
  if(draft){section.append(coachingText("h4",draft.title),coachingText("p",coachingDate(draft.startDate)+" to "+coachingDate(draft.endDate)),coachingText("p",draft.priorities.length+" priorities · "+draft.checkins.length+" check-ins · "+(draft.entries || []).length+" saved records"));
    section.append(planningField("Programme start date",planningInput("date",draft.startDate,value=>{draft.startDate=value;saveCoachingDraft();})),planningField("Programme end date",planningInput("date",draft.endDate,value=>{draft.endDate=value;saveCoachingDraft();})));
    section.append(planningButton("Add programme to this board",()=>{try{importCoachingProgram(draft);}catch(e){message.textContent=e.message;}},"plus"));}
  root.append(section);
}
function addCoachingCalendar() {
  const program=coachingProgram();
  for(const session of program.checkins){const id='coaching-'+program.id+'-'+session.id;
    if([...state.cards,...getArchivedCards()].some(c=>c.id===id))continue;
    const activity=LifePlanning.activityFromDraft({title:'Coaching check-in',area:'Personal',allDay:true,startDate:session.date,endDate:session.date,notes:program.title});
    state.cards.push({...makeCard({type:'event',title:activity.title}),id,activity,calendarOnly:true});
  }
  if(saveState())refreshCoaching();
}
function renderCoachingWorkspace() {
  const root=planningNode("section","coaching-workspace");root.id='progressGoals';root.hidden=dailySession().progressView!=='goals';root.setAttribute("aria-label","Priorities");elements.boardGrid.append(root);
  const program=coachingProgram(),session=coachingSession(),header=planningNode("header","coaching-heading");header.append(coachingText("h2",program?.title || "Priorities"));root.append(header);
  if(!program){renderCoachingImport(root);return;}
  try{LifeCoaching.validate(program);}catch(error){root.append(coachingText("p","This programme needs review. Its saved records are preserved. "+error.message));return;}
  header.append(coachingText("p",coachingDate(program.startDate)+" - "+coachingDate(program.endDate),"coaching-muted"));
  const programs=currentCoachingPrograms();
  if(programs.length>1)header.append(planningField("Programme",planningSelect(programs.map(p=>[p.id,p.title]),program.id,value=>{session.programId=value;refreshCoaching();})));
  const tools=planningNode("div","coaching-tools");tools.append(planningIcon("Download priorities review",downloadCoachingReport,"download"));header.append(tools);
  const next=LifeCoaching.nextCheckin(program,getTodayKey()),band=planningNode("div","coaching-next-checkin");
  const overdue=LifeCoaching.overdueCheckins(program,getTodayKey());
  if(overdue.length){const review=planningNode('div','coaching-overdue-checkin');review.append(coachingText('strong','Check-in needs an update · '+coachingDate(overdue[0].date)),planningButton('Update check-in',()=>openCoachingCheckin(overdue[0]),'pencil'));root.append(review);}
  band.append(coachingText("strong",next?"Next check-in: "+coachingDate(next.date):"Programme review"),coachingText("span",next?LifeCoaching.days(getTodayKey(),next.date)+" days away":"No future check-ins"));
  if(next)band.append(planningButton("Prepare check-in",()=>{session.tab="checkins";openCoachingCheckin(next);},"pencil"));
  if(session.tab!=="overview")root.append(band);
  const tabs=planningNode("div","coaching-tabs");tabs.setAttribute("role","group");tabs.setAttribute("aria-label","Priorities view");
  for(const [key,label] of [["overview","Targets"],["weekly","Weekly"],["checkins","Check-ins"],["history","History"]]){const button=planningButton(label,()=>{session.tab=key;refreshCoaching();});button.setAttribute("aria-pressed",String(session.tab===key));tabs.append(button);}root.append(tabs);
  const feedback=coachingText("p",session.notice || "","coaching-save-feedback");feedback.setAttribute("role","status");root.append(feedback);
  if(session.draft){if(session.draftClosed || session.draft.programId!==program.id)root.append(planningButton("Resume saved draft",()=>{session.programId=session.draft.programId;session.draftClosed=false;refreshCoaching();},"pencil"));else renderCoachingEditor(root);}
  if(session.tab==="weekly")renderCoachingWeekly(root,program);
  else if(session.tab==="checkins")renderCoachingCheckins(root,program);
  else if(session.tab==="history")renderCoachingHistory(root,program);
  else renderCoachingOverview(root,program);
  if(session.tab==="overview")root.append(band);
  const more=planningNode("details","coaching-programme-details");more.append(coachingText("summary","Programme details"));
  if(program.timingNote)more.append(coachingText("p",program.timingNote));
  more.append(planningButton("Add check-ins to calendar",addCoachingCalendar,"calendar"));renderCoachingImport(more);root.append(more);
}
function renderCoachingOverview(root,program) {
  const session=coachingSession(),priority=program.priorities.find(p=>p.id===session.priorityId) || program.priorities[0];
  const choices=planningNode("nav","coaching-priority-choices");choices.setAttribute("aria-label","Choose a priority");
  for(const [index,item] of program.priorities.entries()){
    const choice=planningButton("",()=>{session.priorityId=item.id;refreshCoaching();});choice.classList.add("coaching-priority-choice");choice.dataset.priority=String(index%3);choice.setAttribute("aria-label","Focus on "+item.title);choice.setAttribute("aria-pressed",String(item.id===priority.id));
    choice.append(coachingText("small","PRIORITY "+(index+1),"coaching-eyebrow"),coachingText("strong",item.title));
    const result=LifeCoaching.completion(program,item.krs.flatMap(kr=>kr.metrics),getTodayKey());choice.append(coachingText("span",result.percent===null?"Not recorded yet":result.percent+"% recorded completion","coaching-muted"));
    const meter=planningNode('progress','coaching-choice-meter');meter.max=100;meter.value=result.percent || 0;meter.setAttribute('aria-label',item.title+': '+(result.percent===null?'Not recorded':result.percent+'% recorded completion'));choice.append(meter,coachingText('small',result.recorded+' / '+result.total+' targets updated','coaching-choice-coverage'));choices.append(choice);
  }root.append(choices);
  const selected=planningNode("section","coaching-focus");selected.dataset.priority=String(program.priorities.indexOf(priority)%3);
  const heading=planningNode("div","coaching-focus-heading");
  const purpose=coachingDisclosure("Why this matters","purpose:"+priority.id);purpose.append(coachingText("p",priority.objective,"coaching-objective"));heading.append(purpose);
  const grid=planningNode("div","coaching-goals");
  for(const [index,kr] of priority.krs.entries()){
    const article=planningNode("article","coaching-goal");article.dataset.kr=kr.id;article.append(coachingText("small","GOAL "+(index+1),"coaching-eyebrow"),coachingText("h4",kr.title),coachingProgressMeter(program,kr.metrics,kr.title));
    if(kr.metrics.some(m=>m.kind==="weekly"))renderCoachingQuickWeek(article,program);
    for(const metric of kr.metrics.filter(m=>!m.stretch)){
      renderCoachingQuickMetric(article,program,metric);
      const pace=LifeCoaching.pace(program,metric,getTodayKey()),line=planningNode('div','coaching-pace');line.append(coachingText('small',pace.status+(pace.expected!==null?' · '+pace.expected+' '+metric.unit+' planned by '+coachingDate(pace.checkpoint):'')),planningButton('Plan checkpoints: '+metric.label,()=>openCoachingPace(program,metric),'calendar'));article.append(line);
    }
    const sources=new Set(kr.metrics.map(m=>m.source).filter(Boolean));
    for(const activity of program.activities.filter(a=>sources.has(a.id)))renderCoachingActivity(article,program,activity);
    const stretch=kr.metrics.filter(m=>m.stretch);
    if(stretch.length){const more=coachingDisclosure("Stretch goals","stretch:"+kr.id);for(const metric of stretch)renderCoachingQuickMetric(more,program,metric);article.append(more);}
    renderCoachingGoalThought(article,program,priority,kr);grid.append(article);
  }
  selected.append(grid,heading);
  const actions=getPlannerSourceCards().flatMap(card=>LifePlanner.ensure(card).filter(t=>t.coachingProgramId===program.id && t.coachingPriorityId===priority.id && !t.archivedAt && !t.deletedAt).map(task=>({card,task})));
  const actionSection=planningNode("section","coaching-next-actions");actionSection.append(coachingText("h4","My next small steps"));
  for(const item of actions.filter(t=>!t.task.done))actionSection.append(renderCoachingAction(item));
  const completed=actions.filter(t=>t.task.done);
  if(completed.length){const history=planningNode("details","coaching-completed");history.append(coachingText("summary","Completed actions ("+completed.length+")"));for(const item of completed)history.append(renderCoachingAction(item));actionSection.append(history);}
  actionSection.append(planningButton("Add next action",()=>startCoachingDraft({kind:"action",priorityId:priority.id,title:"",date:[program.endDate,getTodayKey()].sort()[0]}),"plus"));selected.append(actionSection);root.append(selected);
}
function openCoachingPace(program,metric) {
  const dialog=dailyDialog('Checkpoints · '+metric.label),session=coachingSession(),key=program.id+':'+metric.id;
  session.paceDrafts ||= {};const draft=session.paceDrafts[key] ||= {base:LifeCoaching.copy(metric),rows:LifeCoaching.copy(metric.pacePlan || [])};
  const form=planningNode('form','daily-form'),list=planningNode('div','coaching-checkpoint-list'),message=planningNode('p','daily-message');message.setAttribute('role','status');
  const render=()=>{list.replaceChildren();draft.rows.forEach((row,index)=>{const fields=planningNode('div','coaching-checkpoint-row'),date=planningInput('date',row.date,value=>{row.date=value;saveCoachingDraft();}),value=planningInput('number',row.value===0?'0':row.value,val=>{row.value=val;saveCoachingDraft();});date.min=program.startDate;date.max=metric.dueDate || program.endDate;value.min=0;value.max=metric.target;fields.append(planningField('Checkpoint '+(index+1)+' date',date),planningField('Checkpoint '+(index+1)+' '+metric.unit,value),planningIcon('Remove checkpoint '+(index+1),()=>{draft.rows.splice(index,1);saveCoachingDraft();render();},'trash-2'));list.append(fields);});};
  const save=planningButton('Save checkpoints',null,'check');save.type='submit';form.append(list,planningButton('Add checkpoint',()=>{draft.rows.push({date:'',value:''});saveCoachingDraft();render();},'plus'),message,save);
  form.onsubmit=event=>{event.preventDefault();const current=writableCoachingProgram(),live=current?.priorities.flatMap(p=>p.krs.flatMap(k=>k.metrics)).find(m=>m.id===metric.id);
    if(current?.id!==program.id || !live || !LifeStateMerge.equal(live,draft.base)){message.textContent='This target changed elsewhere. Your draft is kept.';return;}
    const before=LifeCoaching.copy(live),rows=draft.rows.map(r=>({date:r.date,value:r.value===''?NaN:Number(r.value)})).sort((a,b)=>a.date.localeCompare(b.date));
    try{live.pacePlan=rows;LifeCoaching.validate(current);if(!saveState())throw new Error('Not saved. Your draft is kept.');delete session.paceDrafts[key];saveCoachingDraft();dialog.close();renderCardsOnly({force:true});}
    catch(error){for(const key of Object.keys(live))delete live[key];Object.assign(live,before);syncActiveBoard({touchBoard:false});message.textContent=error.message;}
  };dialog.append(form);render();
}
function renderCoachingAction({card,task}) {
  const row=planningNode("label","coaching-action"),check=document.createElement("input");check.type="checkbox";check.checked=task.done;check.setAttribute("aria-label",(task.done?"Reopen action: ":"Complete action: ")+task.title);
  const message=coachingFeedback();
  check.onchange=()=>{const source=getPlannerSourceCards().find(c=>c.id===card.id),live=source && LifePlanner.ensure(source).find(t=>t.id===task.id);
    if(live && live.done!==check.checked){
      const before=LifeCoaching.copy(live);LifePlanner.complete(source,task.id,getTodayKey());LifePlanner.project(source);
      if(saveState()){coachingSession().notice=check.checked?'Small step completed.':'Step reopened.';refreshCoaching();}
      else {const tasks=LifePlanner.ensure(source);tasks.splice(tasks.findIndex(t=>t.id===task.id),1,before);LifePlanner.project(source);syncActiveBoard({touchBoard:false});check.checked=before.done;message.textContent='Not saved. Please try again.';}
    }};
  const date=task.done?task.completedOn:task.dateKey;
  row.append(check,coachingText("span",task.title),coachingText("small",(task.done?"Completed ":"")+(LifeCoaching.validDate(date)?coachingDate(date):"No date")),message);return row;
}
function renderCoachingWeekly(root,program) {
  const weeks=LifeCoaching.latestWeeks(program,getTodayKey()),head=planningNode("div","coaching-section-heading");head.append(coachingText("h3","A week worth noticing"));
  head.append(planningButton("Reflect on a week",()=>{const date=LifeCoaching.weekStart(program,[program.endDate,getTodayKey()].sort()[0]),previous=weeks.find(e=>e.date===date);startCoachingDraft({kind:"week",date,note:previous?.note || "",...Object.fromEntries(["exercise","rest","personal","reflection"].map(k=>[k,Boolean(previous?.[k])]))});},"pencil"));root.append(head);
  if(!weeks.length)root.append(coachingText("p","No weekly reviews recorded yet.","coaching-muted"));
  for(const week of [...weeks].sort((a,b)=>b.date.localeCompare(a.date))){const row=planningNode("article","coaching-week");row.append(coachingText("h4",coachingDate(week.date)),coachingText("p",["exercise","rest","personal","reflection"].map(k=>k+": "+(week[k]?"yes":"not marked")).join(" · ")),coachingText("p",week.note,"coaching-note"));root.append(row);}
}
function openCoachingCheckin(checkin) {
  const program=coachingProgram(),previous=LifeCoaching.latest((program.entries || []).filter(e=>e.kind==="checkin" && e.sessionId===checkin.id && !e.voidedAt));
  startCoachingDraft({kind:"checkin",sessionId:checkin.id,date:checkin.date,note:"",held:Boolean(previous?.held),...Object.fromEntries(["wins","obstacles","support","commitment"].map(k=>[k,previous?.[k]||""]))});
}
function renderCoachingCheckins(root,program) {
  const list=planningNode("div","coaching-checkins");
  for(const [index,checkin] of [...program.checkins].sort((a,b)=>a.date.localeCompare(b.date)).entries()){
    const latest=LifeCoaching.latest((program.entries || []).filter(e=>e.kind==="checkin" && e.sessionId===checkin.id && !e.voidedAt)),row=planningNode("article","coaching-checkin");
    row.append(coachingText("span","CHECK-IN "+(index+1),"coaching-eyebrow"),coachingText("h3",coachingDate(checkin.date)),coachingText("p",latest?.held?"Attended":latest?"Preparation saved":checkin.date<getTodayKey()?"Not recorded":"Upcoming"));
    if(latest)for(const [key,label] of [["wins","Progress"],["obstacles","Obstacles"],["support","Support"],["commitment","Next commitment"]])if(latest[key]){row.append(coachingText("h4",label),coachingText("p",latest[key],"coaching-note"));}
    row.append(planningButton(latest?"Review notes":"Prepare",()=>openCoachingCheckin(checkin),"pencil"));list.append(row);
  }root.append(list);
}
function renderCoachingHistory(root,program) {
  const entries=[...(program.entries || [])].sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt-a.recordedAt);
  if(!entries.length)root.append(coachingText("p","No progress records yet.","coaching-muted"));
  for(const entry of entries){const row=planningNode("article","coaching-history-row"),title=coachingEntryLabel(program,entry);
    const weekly=entry.kind==='week'?(entry.changedField?[entry.changedField]:['exercise','rest','personal','reflection']).map(key=>key+': '+(entry[key]?'checked':'not checked')).join(' · '):'';
    row.append(coachingText("h4",title),coachingText("small",coachingDate(entry.date)+(entry.voidedAt?" · Excluded":"")),coachingText("p",[entry.entity,entry.value!==undefined?String(entry.value):"",weekly,entry.note,...["wins","obstacles","support","commitment"].filter(k=>entry[k]).map(k=>entry[k])].filter(Boolean).join("\n"),"coaching-note"));
    const message=coachingFeedback();row.append(planningButton(entry.voidedAt?"Restore record":"Exclude record",()=>toggleCoachingRecord(entry,message),entry.voidedAt?"rotate-ccw":"archive"),message);root.append(row);
  }
}
