(function(root) {
  'use strict';
  const strength=['chest','back','shoulders','arms','abs','legs'];
  const validDay=day=>typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day+'T12:00:00Z')) && new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
  function sessions(cards) {
    return (cards || []).filter(card=>card?.type==='fitness' && !card.archivedAt).flatMap(card=>Object.entries(card.fitnessEntries || {}).filter(([day,entry])=>validDay(day) && Object.values(entry?.parts || {}).some(part=>part?.active)).map(([date,entry])=>({cardId:card.id,title:card.title,date,entry}))).sort((a,b)=>b.date.localeCompare(a.date));
  }
  function previous(card,date,partKey,name) {
    if(!validDay(date) || !strength.includes(partKey) || typeof name!=='string')return null;
    const key=name.trim().toLocaleLowerCase();
    for(const session of sessions([card]).filter(row=>row.date<date)) {
      const part=session.entry.parts?.[partKey];if(part?.active!==true || !Array.isArray(part.exercises))continue;
      const matches=part.exercises.filter(exercise=>typeof exercise?.name==='string' && exercise.name.trim().toLocaleLowerCase()===key);
      if(matches.length>1)return null;
      if(matches.length===1)return {date:session.date,exercise:matches[0]};
    }
    return null;
  }
  function trainingDay(entry){
    let checkedSets=0,exerciseEntries=0,activityEntries=0,review=false;
    if(entry!==undefined && (!entry || typeof entry!=='object' || Array.isArray(entry) || entry.parts!==undefined && (!entry.parts || typeof entry.parts!=='object' || Array.isArray(entry.parts))))return {checkedSets,exerciseEntries,activityEntries,review:true,hasEntry:false};
    const sets=root.LifeFitnessSets || (typeof require==='function'?require('./fitness-sets.js'):null);
    for(const key of strength){
      const part=entry?.parts?.[key];if(part?.active!==true)continue;
      if(!Array.isArray(part.exercises)){review=true;continue;}
      const ids=new Set();
      for(const exercise of part.exercises){
        if(!exercise || typeof exercise.id!=='string' || ids.has(exercise.id)){review=true;continue;}ids.add(exercise.id);
        const result=sets.stats(exercise);
        if(result.mode==='unrecognized'){review=true;continue;}
        if(result.mode==='sets'){checkedSets+=result.completed;continue;}
        const reps=exercise.reps,hasReps=typeof reps==='number'?Number.isFinite(reps) && reps>0:typeof reps==='string' && reps.trim()!=='' && (!Number.isFinite(Number(reps)) || Number(reps)>0);
        if(typeof exercise.name==='string' && exercise.name.trim() && Number(exercise.sets)>0 && hasReps)exerciseEntries++;
      }
    }
    const positive=value=>['string','number'].includes(typeof value) && String(value).trim()!=='' && Number.isFinite(Number(value)) && Number(value)>0;
    const running=entry?.parts?.running;if(running?.active===true && (positive(running.distanceKm) || positive(running.durationMinutes)))activityEntries++;
    for(const key of ['mobility','other']){const part=entry?.parts?.[key];if(part?.active===true && positive(part.durationMinutes))activityEntries++;}
    return {checkedSets,exerciseEntries,activityEntries,review,hasEntry:checkedSets+exerciseEntries+activityEntries>0};
  }
  function daily(cards,date,selected={},options={}){
    const available=Array.isArray(cards)?cards:[],food=root.LifeFoodDaily || (typeof require==='function'?require('./food-daily.js'):null);
    const dates=food.progress({},date).map(row=>row.date),result={};
    for(const type of ['food','fitness']){
      const sources=available.filter(c=>c?.type===type && !c.archivedAt),requested=selected[type],card=requested?sources.find(c=>c.id===requested):sources.length===1?sources[0]:null;
      const row={sources:sources.map(c=>({id:c.id,title:c.title})),status:!validDay(date)?'review':!sources.length?'empty':!card?requested?'unavailable':'choose':'ready'};result[type]=row;
      if(row.status!=='ready')continue;
      row.cardId=card.id;row.title=card.title;
      if(available.filter(c=>c?.id===card.id).length!==1 || (options.conflicts || []).some(c=>{const p=c.segments || [];return p[0]==='boards' && p[1]===options.boardId && ['cards','archivedCards'].includes(p[2]) && p[3]===card.id;})){row.status='review';continue;}
      const store=card[type==='food'?'foodEntries':'fitnessEntries'];if(store!==undefined && (!store || typeof store!=='object' || Array.isArray(store))){row.status='review';continue;}
      if(type==='food'){
        const entries=dates.filter(day=>Object.hasOwn(card.foodEntries || {},day)).map(day=>card.foodEntries[day]);
        if(entries.some(e=>!e || !Array.isArray(e.meals) || e.meals.some(m=>!m || typeof m.id!=='string' || !Array.isArray(m.items)) || new Set(e.meals.map(m=>m.id)).size!==e.meals.length)){row.status='review';continue;}
        const days=food.progress(card,date);Object.assign(row,days.at(-1),{recordedDays:days.filter(d=>d.entries>0).length});
        const times=(card.foodEntries?.[date]?.meals || []).filter(m=>m.items.some(i=>Number(i?.amount)>0) && food.validTiming(m.timing) && m.timing.eatenTime).map(m=>m.timing.eatenTime).sort();row.lastTime=times.at(-1) || '';
      }else{
        const days=dates.map(day=>trainingDay(card.fitnessEntries?.[day]));
        if(days.some(d=>d.review)){row.status='review';continue;}
        Object.assign(row,days.at(-1),{recordedDays:days.filter(d=>d.hasEntry).length});
      }
    }
    return result;
  }
  const api=Object.freeze({sessions,previous,validDay,trainingDay,daily});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeHealth=api;
})(typeof window==='undefined'?globalThis:window);

const healthSessions=new Map();
function readHealthView(boardId){try{const value=sessionStorage.getItem(LifeStorageScope.key('life-os-health-view:'+boardId));return ['workout','food','history'].includes(value)?value:'workout';}catch{return 'workout';}}
function saveHealthView(boardId,value){try{sessionStorage.setItem(LifeStorageScope.key('life-os-health-view:'+boardId),value);}catch{/* The current view still works when optional tab preferences cannot be saved. */}}
function healthSession(boardId=state.activeBoardId){
  if(!healthSessions.has(boardId))healthSessions.set(boardId,{view:readHealthView(boardId),sources:{fitness:'',food:''},partPickers:new Map()});
  return healthSessions.get(boardId);
}
function renderDailyHealth(){
  const boardId=state.activeBoardId,date=getTodayKey(),session=healthSession(),model=LifeHealth.daily(state.cards,date,session.sources,{boardId,conflicts:state.syncConflicts});
  const section=dailySection('Food & movement');section.classList.add('daily-health');section.setAttribute('aria-label','Food and movement today');
  const notice=planningNode('p','daily-message');notice.setAttribute('role','status');
  const fail=error=>{notice.textContent=error.message;setSaveStatus(error.message,'notice');};
  const current=()=>{
    if(state.activeBoardId!==boardId || state.ui.workspaceMode!=='today' || getTodayKey()!==date || !section.isConnected)throw Error('This day or board changed. Reopen Today.');
    return LifeHealth.daily(state.cards,date,session.sources,{boardId,conflicts:state.syncConflicts});
  };
  for(const [type,title,label,icon]of [['food','Meals','Food log','utensils'],['fitness','Training','Workout log','dumbbell']]){
    const data=model[type],row=planningNode('div','daily-health-row'),copy=planningNode('div','daily-health-copy');copy.append(planningNode('strong','',title));
    let status={empty:'No log on this board',choose:'Choose a log',unavailable:'Previous log unavailable',review:'Log needs review'}[data.status];
    if(data.status==='ready'){
      if(type==='food')status=[data.meals+' meal'+(data.meals===1?'':'s'),...(data.snacks?[data.snacks+' snack'+(data.snacks===1?'':'s')]:[]),...(data.drinks?[data.drinks+' drink'+(data.drinks===1?'':'s')]:[])].join(' · ');
      else status=[...(data.checkedSets?[data.checkedSets+' checked set'+(data.checkedSets===1?'':'s')]:[]),...(data.exerciseEntries?[data.exerciseEntries+' exercise entr'+(data.exerciseEntries===1?'y':'ies')]:[]),...(data.activityEntries?[data.activityEntries+' activity entr'+(data.activityEntries===1?'y':'ies')]:[])].join(' · ') || 'No exercise entries today';
    }
    copy.append(planningNode('span','daily-health-count',status));
    if(data.status==='ready' && !dailySession().light){
      let detail=data.recordedDays+' of the last 7 days recorded';if(type==='food' && data.lastTime)detail+=' · Latest meal time '+data.lastTime;
      copy.append(planningNode('small','daily-health-week',detail));
    }
    const button=planningButton(data.status==='empty'?'Add '+(type==='food'?'food':'workout')+' log':'Log '+(type==='food'?'food':'workout'),()=>{
      try{
        const fresh=current()[type];
        if(fresh.status!==data.status || fresh.cardId!==data.cardId)throw Error('This health source changed. Reopen Today before recording.');
        if(isProtectedTextEditActive())document.activeElement?.blur();
        if(lastLocalSaveOk===false)throw Error('Device save needs attention. Keep this view open and save your writing before leaving.');
        if(data.status==='empty'){openHealthLogComposer(type);return;}
        if(fresh.status!=='ready')throw Error('Choose a unique log without unresolved changes before recording.');
        const matches=state.cards.filter(c=>c.id===fresh.cardId);if(matches.length!==1 || matches[0].type!==type || matches[0].archivedAt)throw Error('This log changed or moved. Reopen Today.');
        const view=type==='food'?'food':'workout';session.view=view;session.sources[type]=fresh.cardId;
        matches[0][type==='food'?'activeFoodDate':'activeFitnessDate']=date;
        setWorkspaceMode('health');saveHealthView(boardId,view);
      }catch(error){fail(error);}
    },data.status==='empty'?'plus':icon);
    button.disabled=!['ready','empty'].includes(data.status);if(button.disabled)button.title=status;
    row.append(copy,button);
    if(data.sources.length>1 || data.status==='unavailable'){
      const choices=[...new Map(data.sources.map(c=>[c.id,[c.id,c.title || label]])).values()];
      const select=planningSelect([['','Choose a log'],...choices],data.cardId || '',id=>{
        try{const fresh=current()[type];if(!fresh.sources.some(c=>c.id===id))throw Error('Choose an available log.');session.sources[type]=id;const next=renderDailyHealth();section.replaceWith(next);next.querySelector('[aria-label="'+label+'"]')?.focus({preventScroll:true});}catch(error){select.value=data.cardId || '';fail(error);}
      });
      row.append(planningField(label,select));
    }
    section.append(row);
  }
  section.append(notice);return section;
}
function openHealthLogComposer(type) {
  if(draftTouched || editingCardId){
    openCardComposer();
    setSaveStatus('Your existing card draft is still open. Finish or cancel it before adding another log.','notice');
    return;
  }
  resetFormState();setFormType(type);openCardComposer();
}
function renderHealthWorkspace() {
  const root=elements.boardGrid,boardId=state.activeBoardId;
  const session=healthSession(),head=planningNode('header','health-workspace-head');
  head.append(planningNode('h1','', 'Health'),planningButton('Reports',openReportsModal,'bar-chart'));
  root.append(head);
  const tabs=planningNode('nav','health-workspace-tabs');tabs.setAttribute('aria-label','Health views');
  for(const [key,label] of [['workout','Workout'],['food','Food'],['history','Training history']]){
    const button=planningButton(label,()=>{if(!tabs.isConnected || state.activeBoardId!==boardId || state.ui.workspaceMode!=='health' || !canLeaveHealthDateDraft())return;if(isProtectedTextEditActive())document.activeElement?.blur();session.view=key;saveHealthView(boardId,key);renderCardsOnly({force:true});});
    button.setAttribute('aria-pressed',String(session.view===key));tabs.append(button);
  }
  root.append(tabs);
  const cards=state.cards.filter(card=>!card.archivedAt),workouts=LifeHealth.sessions(cards),today=getTodayKey();
  const start=getTodayKey(addDays(dateKeyToLocalDate(today),-6));
  const days=new Set(workouts.filter(row=>row.date>=start && row.date<=today).map(row=>row.date));
  const summary=planningNode('div','health-week-summary');
  summary.append(planningNode('strong','',String(days.size)),planningNode('span','',(days.size===1?'day':'days')+' with workout entries in the last 7 days'));
  if(session.view!=='food')root.append(summary);
  if(session.view==='history') {
    root.append(renderExerciseHistory(cards,session));
    const list=planningNode('section','health-history');list.setAttribute('aria-label','Training history');root.append(list);
    if(!workouts.length)list.append(planningNode('p','planning-empty','No workouts recorded on this board yet.'));
    for(const row of workouts){
      const parts=Object.entries(row.entry.parts || {}).filter(([,part])=>part?.active).map(([key])=>FITNESS_PARTS.find(part=>part.key===key)?.label || key);
      const item=planningButton(formatReadableDateKey(row.date)+' · '+parts.join(', '),()=>{
        openHealthHistoryEntry({boardId,cardId:row.cardId,date:row.date},session);
      },'chevron-right');item.classList.add('health-history-row');list.append(item);
    }
    return;
  }
  const type=session.view==='food'?'food':'fitness',sources=cards.filter(card=>card.type===type);
  if(!sources.length){root.append(planningNode('p','planning-empty',type==='fitness'?'No Fitness Log on this board yet.':'No Food Tracker on this board yet.'),planningButton('Add '+(type==='fitness'?'Fitness Log':'Food Tracker'),()=>openHealthLogComposer(type),'plus'));return;}
  const card=sources.find(card=>card.id===session.sources[type]) || sources[0];session.sources[type]=card.id;
  if(sources.length>1){const select=planningSelect(sources.map(card=>[card.id,card.title]),card.id,id=>{if(!select.isConnected || state.activeBoardId!==boardId || state.ui.workspaceMode!=='health')return;if(!canLeaveHealthDateDraft()){select.value=card.id;return;}if(isProtectedTextEditActive())document.activeElement?.blur();session.sources[type]=id;renderCardsOnly({force:true});});root.append(planningField('Log',select));}
  if(state.cards.filter(item=>item.id===card.id).length!==1){root.append(planningNode('p','planning-empty','This log has a duplicate identity. Editing is paused to protect both copies.'));return;}
  const editor=planningNode('section','health-workspace-editor task-card');editor.dataset.id=card.id;
  const log=type==='fitness'?renderFitnessLog(card):renderFoodTracker(card);
  if(type==='fitness'){
    const parts=log.querySelector('.fitness-parts'),picker=planningNode('details','health-part-picker'),options=planningNode('div','health-part-options');
    const summary=planningNode('summary','','Add workout part');summary.id='health-part-picker-'+card.id;picker.append(summary,options);
    for(const button of [...parts.children])if(!button.classList.contains('is-active'))options.append(button);
    if(options.children.length){
      const key=JSON.stringify([card.id,getActiveFitnessDate(card)]);
      picker.open=session.partPickers.get(key) ?? !parts.children.length;
      // Remember disclosure state before an asynchronous device commit can redraw it.
      summary.addEventListener('click',event=>{event.preventDefault();picker.open=!picker.open;session.partPickers.set(key,picker.open);});
      picker.addEventListener('toggle',()=>{if(picker.isConnected)session.partPickers.set(key,picker.open);});
      parts.append(picker);
    }
  }
  if(type==='fitness')editor.append(LifeWorkoutRestUI.render());
  editor.append(planningNode('h2','',card.title),log);
  root.append(editor);
}
