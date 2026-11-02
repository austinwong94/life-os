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
  function weightReading(entry){
      if(entry===undefined)return null;
      if(!entry || typeof entry!=='object' || Array.isArray(entry) || entry.metrics!==undefined && (!entry.metrics || typeof entry.metrics!=='object' || Array.isArray(entry.metrics)))return false;
      const value=entry.metrics?.weightKg;
      if(value===undefined || value===null || value==='')return null;
      return ['string','number'].includes(typeof value) && /^\d+(?:\.\d{1,2})?$/.test(String(value)) && Number(value)>0 && Number.isSafeInteger(Math.round(Number(value)*100))?Number(value):false;
  }
  function weightSummary(card,date){
    const empty={needsReview:false,today:null,previous:null},entries=card?.fitnessEntries;
    if(card?.type!=='fitness' || card.archivedAt || !validDay(date) || entries!==undefined && (!entries || typeof entries!=='object' || Array.isArray(entries)))return {...empty,needsReview:true};
    const current=weightReading(entries?.[date]);
    if(current===false)return {...empty,needsReview:true};
    const previous=Object.keys(entries || {}).filter(day=>validDay(day) && day<date).sort().reverse().find(day=>{const n=weightReading(entries[day]);return n!==null && n!==false;});
    return {...empty,today:current===null?null:{date,kg:current},previous:previous?{date:previous,kg:weightReading(entries[previous])}:null};
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
  function recent(cards,date,selected={},options={}){
    if(!validDay(date))return [];
    const available=Array.isArray(cards)?cards:[],food=root.LifeFoodDaily || (typeof require==='function'?require('./food-daily.js'):null),model=daily(available,date,selected,options);
    const source=type=>model[type].status==='ready'?available.find(c=>c.id===model[type].cardId):null,foodCard=source('food'),fitnessCard=source('fitness');
    return food.progress(foodCard || {},date).map(day=>{
      const foodStatus=model.food.status,fitnessStatus=model.fitness.status,water=foodStatus==='ready'?food.waterSummary(foodCard.foodEntries?.[day.date]):null,training=fitnessStatus==='ready'?trainingDay(fitnessCard.fitnessEntries?.[day.date]):null,weight=fitnessStatus==='ready'?weightReading(fitnessCard.fitnessEntries?.[day.date]):null;
      return {date:day.date,food:foodStatus==='ready'?{status:'ready',entries:day.entries}:{status:foodStatus},training:fitnessStatus==='ready'?{status:training.review?'review':'ready',hasEntry:training.hasEntry,checkedSets:training.checkedSets,exerciseEntries:training.exerciseEntries,activityEntries:training.activityEntries}:{status:fitnessStatus},water:water?water.needsReview?{status:'review'}:{status:'ready',totalMl:water.totalMl}:{status:foodStatus},weight:fitnessStatus==='ready'?weight===false?{status:'review'}:{status:'ready',kg:weight}:{status:fitnessStatus}};
    });
  }
  function trainingWeek(cards,date,options={}){
    const review={status:'review',recordedDays:null};
    if(!Array.isArray(cards) || !validDay(date))return review;
    const sources=cards.filter(c=>c?.type==='fitness' && !c.archivedAt);
    if(!sources.length)return {status:'empty',recordedDays:null};
    const food=root.LifeFoodDaily || (typeof require==='function'?require('./food-daily.js'):null),dates=food.progress({},date).map(d=>d.date),recorded=new Set();
    for(const card of sources){
      if(typeof card.id!=='string' || !card.id || cards.filter(c=>c?.id===card.id).length!==1)return review;
      if((options.conflicts || []).some(c=>{const p=c?.segments || [];return p[0]==='boards' && p[1]===options.boardId && ['cards','archivedCards'].includes(p[2]) && p[3]===card.id;}))return review;
      const entries=card.fitnessEntries;
      if(entries!==undefined && (!entries || typeof entries!=='object' || Array.isArray(entries)))return review;
      for(const day of dates){const result=trainingDay(entries?.[day]);if(result.review)return review;if(result.hasEntry)recorded.add(day);}
    }
    return {status:'ready',recordedDays:recorded.size};
  }
  function recentSummary(days){
    const review={status:'review',recordedDays:null},statuses=['ready','empty','choose','unavailable','review'];
    if(!Array.isArray(days) || days.length!==7 || days.some(d=>!validDay(d?.date)) || new Set(days.map(d=>d.date)).size!==7)return review;
    const cells=days.flatMap(d=>[d.food,d.training,d.water,d.weight]);
    if(cells.some(c=>!c || !statuses.includes(c.status)) || cells.some(c=>c.status==='review'))return review;
    for(const status of ['unavailable','choose'])if(cells.some(c=>c.status===status))return {status,recordedDays:null};
    if(days.some(d=>d.food.status==='ready' && (!Number.isInteger(d.food.entries) || d.food.entries<0) || d.training.status==='ready' && typeof d.training.hasEntry!=='boolean' || d.water.status==='ready' && (!Number.isFinite(d.water.totalMl) || d.water.totalMl<0) || d.weight.status==='ready' && d.weight.kg!==null && (!Number.isFinite(d.weight.kg) || d.weight.kg<=0)))return review;
    const recordedDays=days.filter(d=>d.food.status==='ready' && d.food.entries>0 || d.training.status==='ready' && d.training.hasEntry || d.water.status==='ready' && d.water.totalMl>0 || d.weight.status==='ready' && d.weight.kg!==null).length;
    return {status:'ready',recordedDays};
  }
  const api=Object.freeze({sessions,previous,validDay,trainingDay,weightSummary,daily,recent,trainingWeek,recentSummary});
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
  const foodScope=node=>()=>{
    if(!node.isConnected || node.closest('dialog')?.open===false || state.activeBoardId!==boardId || state.ui.workspaceMode!=='today' || getTodayKey()!==date)throw Error('This day or board changed. Reopen Today.');
    const fresh=LifeHealth.daily(state.cards,date,session.sources,{boardId,conflicts:state.syncConflicts}).food;
    if(fresh.status!=='ready' || fresh.cardId!==model.food.cardId)throw Error('This food source changed. Reopen Today before recording.');
    return LifeFoodDaily.resolve({id:boardId,cards:state.cards},model.food.cardId,'food',state.syncConflicts);
  };
  section.append(notice);
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
    if(type==='food' && data.status==='ready'){
      const meals=planningNode('section','daily-health-meals');meals.setAttribute('aria-label','Usual meals today');meals.append(planningNode('h3','','Usual meals'),LifeFoodDailyUI.usualMeals(state.cards.find(c=>c.id===data.cardId),date,{compact:true,scope:foodScope,onCreate:()=>button.click()}));section.append(meals);
    }
  }
  if(model.fitness.status==='ready'){
    const cardId=model.fitness.cardId,card=state.cards.find(c=>c.id===cardId),weight=LifeHealth.weightSummary(card,date);
    const row=planningNode('div','daily-health-row daily-health-weight'),copy=planningNode('div','daily-health-copy');copy.append(planningNode('strong','','Weight'));
    copy.append(planningNode('span','daily-health-count',weight.needsReview?'Weight record needs review':weight.today?weight.today.kg.toFixed(2)+' kg':'Not recorded today'));
    if(weight.previous && !weight.needsReview)copy.append(planningNode('small','daily-health-week','Previous: '+weight.previous.kg.toFixed(2)+' kg · '+formatReadableDateKey(weight.previous.date)));
    const scope=node=>()=>{
      if(!node.isConnected || node.closest('dialog')?.open===false || state.activeBoardId!==boardId || state.ui.workspaceMode!=='today' || getTodayKey()!==date)throw Error('This day or board changed. Reopen Today.');
      const fresh=LifeHealth.daily(state.cards,date,session.sources,{boardId,conflicts:state.syncConflicts}).fitness;
      if(fresh.status!=='ready' || fresh.cardId!==cardId)throw Error('This weight source changed. Reopen Today before recording.');
      return LifeFoodDaily.resolve({id:boardId,cards:state.cards},cardId,'fitness',state.syncConflicts);
    };
    const button=planningButton(weight.today?'Edit weight':'Record weight',()=>{try{LifeFoodDailyUI.openWeight(scope(row)(),date,{scope,fitnessId:cardId,returnFocusId:button.id});}catch(error){fail(error);}},'bar-chart');
    button.id='today-weight-'+encodeURIComponent(JSON.stringify([boardId,cardId,date]));button.disabled=weight.needsReview;if(button.disabled)button.title='The original weight record needs review.';
    row.append(copy,button);section.append(row);
  }
  if(model.food.status==='ready'){
    const cardId=model.food.cardId,card=state.cards.find(c=>c.id===cardId);
    const water=LifeFoodDailyUI.water(card,date,{compact:true,scope:foodScope});water.classList.add('daily-health-water');section.append(water);
  }
  if(!dailySession().light && (model.food.sources.length || model.fitness.sources.length))section.append(renderDailyHealthRecent(boardId,date,session));
  return section;
}
function renderDailyHealthRecent(boardId,date,session){
  const days=LifeHealth.recent(state.cards,date,session.sources,{boardId,conflicts:state.syncConflicts}),details=planningNode('details','daily-health-recent'),summary=planningNode('summary');
  const total=LifeHealth.recentSummary(days),caption={review:'Some records need review',choose:'Choose your logs',unavailable:'Log unavailable'}[total.status] || total.recordedDays+' day'+(total.recordedDays===1?'':'s')+' with entries';
  summary.append(planningNode('span','','Your last 7 days'),planningNode('small','',caption));
  summary.id='today-health-recent-'+encodeURIComponent(boardId);details.open=Boolean(session.recentOpen);details.append(summary);
  bindHealthDisclosure(details,()=>Boolean(session.recentOpen),open=>{session.recentOpen=open;});
  const list=planningNode('ol','daily-health-days');list.setAttribute('aria-label','Health entries over the last seven days');
  const unavailable={empty:'No log',choose:'Choose a log',unavailable:'Log unavailable',review:'Needs review'};
  for(const day of days){
    const item=planningNode('li','daily-health-day'),time=planningNode('time'),local=dateKeyToLocalDate(day.date),metrics=planningNode('dl');time.append(planningNode('span','',local.toLocaleDateString(undefined,{weekday:'short'})),planningNode('span','',local.toLocaleDateString(undefined,{month:'short',day:'numeric'})));time.dateTime=day.date;time.title=formatReadableDateKey(day.date);if(day.date===date)time.setAttribute('aria-current','date');item.dataset.date=day.date;
    const field=(label,data,value,recorded)=>{const cell=planningNode('div');cell.append(planningNode('dt','',label),planningNode('dd',data.status==='ready' && recorded?'is-recorded':'',data.status==='ready'?value:unavailable[data.status] || 'Needs review'));metrics.append(cell);};
    field('Food',day.food,day.food.entries?day.food.entries+' entr'+(day.food.entries===1?'y':'ies'):'Not recorded',day.food.entries>0);
    const training=day.training,parts=[...(training.checkedSets?[training.checkedSets+' set'+(training.checkedSets===1?'':'s')]:[]),...(training.exerciseEntries?[training.exerciseEntries+' exercise entr'+(training.exerciseEntries===1?'y':'ies')]:[]),...(training.activityEntries?[training.activityEntries+' activit'+(training.activityEntries===1?'y':'ies')]:[])];
    field('Training',training,parts.join(' · ') || 'Not recorded',training.hasEntry);
    field('Water',day.water,day.water.totalMl?day.water.totalMl+' mL':'Not recorded',day.water.totalMl>0);
    field('Weight',day.weight,day.weight.kg===null?'Not recorded':day.weight.kg?.toFixed(2)+' kg',day.weight.kg!==null);
    item.append(time,metrics);list.append(item);
  }
  details.append(list);return details;
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
  const week=LifeHealth.trainingWeek(cards,today,{boardId,conflicts:state.syncConflicts});
  const summary=planningNode('div','health-week-summary');
  if(week.status==='ready'){
    const copy=planningNode('span','',(week.recordedDays===1?'day':'days')+' with exercise entries in the last 7 days');copy.append(planningNode('small','health-week-scope','Across this board'));summary.append(planningNode('strong','',String(week.recordedDays)),copy);
  }
  else summary.append(planningNode('span','','Workout records need review'));
  if(session.view!=='food' && week.status!=='empty')root.append(summary);
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
