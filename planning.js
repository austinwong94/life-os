(function (root) {
  "use strict";
  const areas = ["Culturely", "MascotRun", "Sunrise Villa", "Lovely Paradise", "Fitness", "Personal"];
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const shift = (day, count) => { const date = new Date(day+"T12:00:00"); date.setDate(date.getDate()+count); return dateKey(date); };
  function localInput(iso) {
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? dateKey(date)+"T"+String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0") : "";
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
  const api = {areas,dateKey,shift,localInput,activityFromDraft,occursOn,googleLink};
  root.LifePlanning = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

// Drafts and view preferences are board-scoped and tab-local. They never enter
// the cloud snapshot or replace canonical task/activity records while typing.
const planningSessions = new Map();
function planningSession() {
  if (!planningSessions.has(state.activeBoardId)) {
    let saved = {}; try { saved = JSON.parse(sessionStorage.getItem("life-os-planning:"+state.activeBoardId) || "{}"); } catch {}
    planningSessions.set(state.activeBoardId, {view:"today",area:"*",search:"",day:getTodayKey(),calendarMode:innerWidth<=700?"agenda":"month",...saved});
  }
  return planningSessions.get(state.activeBoardId);
}
function savePlanningSession() {
  try { sessionStorage.setItem("life-os-planning:"+state.activeBoardId,JSON.stringify(planningSession())); }
  catch { setSaveStatus("Draft kept in this tab - draft storage unavailable", "error"); }
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
function planningOptionalDate(input,label,onClear) {
  const group=planningNode("div","planning-optional-date");
  group.append(input,planningIcon(label,event=>{
    event.preventDefault();
    // Recreate the native date editor's internal segments as well as its value.
    // WebKit can otherwise keep stale segments after the value becomes empty.
    input.type="text";input.value="";input.type="date";onClear();
  },"x"));return group;
}
function planningSelect(options, value, onChange) {
  const select = document.createElement("select");
  options.forEach(([key,label]) => {const option = document.createElement("option"); option.value = key; option.textContent = label; select.append(option);});
  select.value = value; select.onchange = () => onChange(select.value); return select;
}
function taskAreaOptions(extra = "") {
  const values = new Set([...LifePlanning.areas, ...getPlannerSourceItems().map(item=>item.group), ...state.cards.map(card=>card.activity?.area), extra]);
  return [["","Unsorted"], ...[...values].filter(Boolean).map(value=>[value,value])];
}
function getTaskEditMetadata(item) {
  const task = LifePlanner.ensure(resolveLiveCard(item.card)).find(task=>task.id===item.taskId);
  return {area:task?.area ?? item.group ?? getPlannerGroup(item.card), project:task?.project || "", status:task?.status || "todo",
    deadline:task?.deadline || "", notes:task?.notes || "", priority:task?.priority || "normal", base:LifeStateMerge.copy(task)};
}
function appendTaskMetadata(meta, item) {
  if (!item.workspaceTask && item.area === undefined) return;
  const area = item.area ?? item.group;
  meta.append(planningNode("span", "task-area", area || "Unsorted"));
  if (item.project) meta.append(planningNode("span", "task-project", item.project));
  if (!item.done && ["doing","waiting"].includes(item.status)) meta.append(planningNode("span", "task-status", item.status === "doing" ? "Doing" : "Waiting"));
  if (!item.done && item.deadline) meta.append(planningNode("span", "task-deadline"+(item.deadline<getTodayKey()?" is-late":""), "Due "+formatPlannerOriginDate(item.deadline)));
}
function appendTaskEditFields(form, draft) {
  const grid = planningNode("div", "task-edit-details");
  grid.append(planningField("Area",planningSelect(taskAreaOptions(draft.area),draft.area,value=>draft.area=value)),
    planningField("Status",planningSelect([["todo","To do"],["doing","Doing"],["waiting","Waiting"]],draft.status,value=>draft.status=value)),
    planningField("Project",planningInput("text",draft.project,value=>draft.project=value)),
    planningField("Deadline (optional)",planningInput("date",draft.deadline,value=>draft.deadline=value)),
    planningField("Priority",planningSelect(Object.entries(PRIORITY_META).map(([key,meta])=>[key,meta.label]),draft.priority,value=>draft.priority=value)));
  const notes = planningNode("textarea"); notes.value = draft.notes; notes.rows = 3; notes.oninput = () => draft.notes=notes.value;
  grid.append(planningField("Task notes",notes)); form.append(grid);
}
function renderPlanningWorkspace(mode) {
  const root = planningNode("section", "planning-workspace"); root.setAttribute("aria-label",mode==="tasks"?"Tasks":"Calendar");
  elements.boardGrid.append(root);
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
  const session = planningSession();
  const header = planningNode("header","planning-heading"); header.append(planningNode("h2","","Tasks"),renderPlanningAreaFilter()); root.append(header);
  const tabs = planningNode("div","planning-tabs"); tabs.setAttribute("role","group");tabs.setAttribute("aria-label","Task view");
  for (const [key,label] of [["today","Today"],["upcoming","Upcoming"],["all","All tasks"],["completed","Completed"]]) {
    const button=planningButton(label,()=>{session.view=key;planningRefresh();});button.setAttribute("aria-pressed",String(session.view===key));tabs.append(button);
  }
  root.append(tabs);
  if (session.view==="today") root.append(renderPlanningDateNavigation(session.day,value=>{session.day=value;if(session.capture&&!session.capture.title.trim())session.capture.dateKey=value;planningRefresh();}));
  root.append(renderTaskCapture());
  const search = planningInput("search",session.search,value=>{session.search=value;savePlanningSession();renderTaskResults(results);});
  search.placeholder = "Search tasks and projects"; search.setAttribute("aria-label","Search tasks and projects"); search.className="planning-search";root.append(search);
  const results = planningNode("div","task-results"); root.append(results); renderTaskResults(results);
}
function renderTaskCapture() {
  const session = planningSession();
  const draft = session.capture ||= {title:"",area:session.lastArea || "",dateKey:session.view==="today"?session.day:""};
  const form = planningNode("form","task-capture");
  const title = planningInput("text",draft.title,value=>{draft.title=value;savePlanningSession();}); title.placeholder="Add a task";title.required=true;title.setAttribute("aria-label","New task");
  const add = planningButton("Add task",null,"plus"); add.type="submit";add.classList.add("is-primary");
  const main = planningNode("div","task-capture-main");main.append(title,add);
  const options = planningNode("div","task-capture-options");
  const date=planningInput("date",draft.dateKey,value=>{draft.dateKey=value;savePlanningSession();});date.setAttribute("aria-label","Planned day (optional)");
  options.append(planningField("Area",planningSelect(taskAreaOptions(draft.area),draft.area,value=>{draft.area=value;savePlanningSession();})),
    planningField("Planned day (optional)",planningOptionalDate(date,"Clear planned day",()=>{draft.dateKey="";savePlanningSession();})));
  const status=planningNode("p","planning-message");status.setAttribute("role","status");form.append(main,options,status);
  form.onsubmit = event => {
    event.preventDefault();
    if (!title.value.trim() || (draft.dateKey && !LifePlanner.validDate(draft.dateKey))) return;
    const source = getPlannerWriteSourceCard({category:draft.area || "Unsorted"},draft.dateKey);
    const task = LifePlanner.add(source,draft.dateKey,title.value,createId()); if(!task)return;
    LifePlanner.change(source,task.id,{area:draft.area,status:"todo",project:"",deadline:"",notes:""});LifePlanner.project(source);
    session.lastArea=draft.area;session.capture={...draft,title:""};
    // Keep the newly captured item visible without silently changing its date.
    if ((session.area!=="*" && session.area!==draft.area)) session.area="*";
    if (session.view==="completed" || !draft.dateKey || (session.view==="today" && draft.dateKey>session.day) || (session.view==="upcoming" && draft.dateKey<getTodayKey())) session.view="all";
    session.search="";savePlanningSession();saveState();renderCardsOnly({force:true});
    elements.boardGrid.querySelector('[aria-label="New task"]')?.focus({preventScroll:true});
  };
  return form;
}
function renderTaskResults(root) {
  root.replaceChildren();const session=planningSession();
  const all=getPlannerSourceItems().filter(item=>session.area==="*" || item.group===session.area);
  let items=session.view==="today"?getPlannerItemsForSelectedDay(all,session.day):all;
  if(session.view==="upcoming")items=items.filter(item=>!item.done&&item.dateKey>=getTodayKey());
  if(session.view==="completed")items=items.filter(item=>item.done);
  const query=session.search.trim().toLocaleLowerCase();
  if(query)items=items.filter(item=>[item.title,item.project,item.notes,item.group].some(value=>String(value||"").toLocaleLowerCase().includes(query)));
  items=items.slice().sort((a,b)=>session.view==="completed"?(b.completedOn||"").localeCompare(a.completedOn||"")||a.title.localeCompare(b.title)
    :Number(a.done)-Number(b.done)||(a.scheduledDate||a.dateKey||"9999").localeCompare(b.scheduledDate||b.dateKey||"9999")||a.title.localeCompare(b.title));
  const count=planningNode("p","planning-count",`${items.length} ${items.length===1?"task":"tasks"}`);count.setAttribute("role","status");root.append(count);
  if(!items.length){root.append(planningNode("p","planning-empty",query?"No matching tasks.":"No tasks in this view."));return;}
  const list=planningNode("div","workspace-task-list");root.append(list);
  items.forEach(item=>{
    const day=session.view==="today"?session.day:getTodayKey();
    const row=renderPlannerLinkedItem({...item,workspaceTask:true,undated:!(item.scheduledDate??item.dateKey),scheduledDate:item.scheduledDate??item.dateKey,dateKey:day});
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
  nav.append(planningIcon("Previous period",()=>changePeriod(-1),"chevron-left"),planningNode("h3","",new Date(session.day+"T12:00:00").toLocaleDateString(undefined,{month:"long",year:"numeric"})),planningIcon("Next period",()=>changePeriod(1),"chevron-right"),planningButton("Today",()=>{session.day=getTodayKey();planningRefresh();}));if(session.calendarMode!=="agenda")root.append(nav);
  const timezone=planningNode("p","calendar-timezone",Intl.DateTimeFormat().resolvedOptions().timeZone);root.append(timezone);
  const items=calendarActivities().filter(({activity})=>session.area==="*"||activity.area===session.area);
  if(session.calendarMode==="month") {
    renderCalendarMonth(root,items);
    renderAgenda(root,items,[session.day]);
  } else if(session.calendarMode==="week") {
    const weekday=(new Date(session.day+"T12:00:00").getDay()+6)%7;
    renderAgenda(root,items,Array.from({length:7},(_,i)=>LifePlanning.shift(session.day,i-weekday)));
  } else {
    root.append(renderPlanningDateNavigation(session.day,value=>{session.day=value;planningRefresh();}));
    // One row per activity, including multi-day events already in progress.
    const upcoming=items.filter(({activity})=>activity.allDay?activity.endDate>=session.day:Date.parse(activity.endAt||activity.startAt)>=new Date(session.day+"T00:00:00").getTime());
    upcoming.sort((a,b)=>activitySortKey(a.activity).localeCompare(activitySortKey(b.activity)));
    if(!upcoming.length)root.append(planningNode("p","planning-empty","No upcoming activities."));
    const list=planningNode("div","activity-list");root.append(list);upcoming.forEach(item=>list.append(renderActivityRow(item)));
  }
  const google=planningNode("details","calendar-connection");google.append(planningNode("summary","","Google Calendar - not connected"));
  google.append(planningNode("p","","Live Google sync is not configured. Add to Google Calendar opens a separate event for you to review and save; later edits do not sync."));root.append(google);
}
function activitySortKey(activity) {return activity.allDay?activity.startDate:LifePlanning.localInput(activity.startAt);}
function renderCalendarMonth(root,items) {
  const session=planningSession(),grid=planningNode("div","calendar-month");grid.setAttribute("role","group");grid.setAttribute("aria-label","Month dates");
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(day=>grid.append(planningNode("span","calendar-weekday",day)));
  const first=session.day.slice(0,7)+"-01",offset=(new Date(first+"T12:00:00").getDay()+6)%7;
  for(let i=0;i<42;i++){
    const day=LifePlanning.shift(first,i-offset),matches=items.filter(({activity})=>LifePlanning.occursOn(activity,day));
    const button=planningButton("",()=>{session.day=day;planningRefresh();});button.className="calendar-day";
    button.replaceChildren(planningNode("span","",String(Number(day.slice(-2)))));
    button.setAttribute("aria-label",`${day}, ${matches.length} activities`);button.setAttribute("aria-pressed",String(day===session.day));
    if(day===getTodayKey())button.setAttribute("aria-current","date");if(day.slice(0,7)!==first.slice(0,7))button.classList.add("outside-month");
    if(matches.length)button.append(planningNode("small","",`${matches.length}`));grid.append(button);
  }
  root.append(grid);
}
function renderAgenda(root,items,days) {
  const list=planningNode("div","activity-list");root.append(list);
  days.forEach(day=>{
    const section=planningNode("section","agenda-day");section.append(planningNode("h3","",formatPlannerDate(day)));
    const matches=items.filter(({activity})=>LifePlanning.occursOn(activity,day)).sort((a,b)=>activitySortKey(a.activity).localeCompare(activitySortKey(b.activity)));
    if(!matches.length)section.append(planningNode("p","planning-empty","No activities."));
    matches.forEach(item=>section.append(renderActivityRow(item)));list.append(section);
  });
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
  const google=planningButton("Add to Google Calendar",()=>window.open(LifePlanning.googleLink(activity),"_blank","noopener,noreferrer"),"external-link");
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
  const dates=planningNode("div","activity-dates");dates.append(field("Start date","date","startDate"),field("End date","date","endDate"));
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
      if(draft.id&&(!card||!LifeStateMerge.equal(draft.base,card.activity || {targetAt:card.targetAt,title:card.title,description:card.description})))throw new Error("This activity changed in another tab. Your draft is kept. Cancel and reopen to review the latest version.");
      const targetAt=activity.allDay?new Date(activity.startDate+"T12:00:00").toISOString():activity.startAt;
      if(!card){card=makeCard({type:"event",title:activity.title,category:activity.area||"Unsorted",timerMode:"date",targetAt});card.calendarOnly=true;state.cards.push(card);}
      Object.assign(card,{activity,title:activity.title,category:activity.area||"Unsorted",targetAt,updatedAt:Date.now()});
      session.lastArea=draft.area;session.day=activity.allDay?activity.startDate:LifePlanning.localInput(activity.startAt).slice(0,10);session.area="*";
      delete session.activityDraft;savePlanningSession();saveState();renderCardsOnly({force:true});
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
