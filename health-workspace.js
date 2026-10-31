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
  const api=Object.freeze({sessions,previous,validDay});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeHealth=api;
})(typeof window==='undefined'?globalThis:window);

const healthSessions=new Map();
function renderHealthWorkspace() {
  const root=elements.boardGrid;
  if(!healthSessions.has(state.activeBoardId))healthSessions.set(state.activeBoardId,{view:'workout',cardId:'',partPickers:new Map()});
  const session=healthSessions.get(state.activeBoardId),head=planningNode('header','health-workspace-head');
  head.append(planningNode('h1','', 'Health'),planningButton('Reports',openReportsModal,'bar-chart'));
  root.append(head);
  const tabs=planningNode('nav','health-workspace-tabs');tabs.setAttribute('aria-label','Health views');
  for(const [key,label] of [['workout','Workout'],['food','Food'],['history','Training history']]){
    const button=planningButton(label,()=>{if(isProtectedTextEditActive())document.activeElement?.blur();session.view=key;renderCardsOnly({force:true});});
    button.setAttribute('aria-pressed',String(session.view===key));tabs.append(button);
  }
  root.append(tabs);
  const cards=state.cards.filter(card=>!card.archivedAt),workouts=LifeHealth.sessions(cards),today=getTodayKey();
  const start=getTodayKey(addDays(dateKeyToLocalDate(today),-6));
  const days=new Set(workouts.filter(row=>row.date>=start && row.date<=today).map(row=>row.date));
  const summary=planningNode('div','health-week-summary');
  summary.append(planningNode('strong','',String(days.size)),planningNode('span','',(days.size===1?'day':'days')+' with workout entries in the last 7 days'));
  root.append(summary);
  if(session.view==='history') {
    const list=planningNode('section','health-history');list.setAttribute('aria-label','Training history');root.append(list);
    if(!workouts.length)list.append(planningNode('p','planning-empty','No workouts recorded on this board yet.'));
    for(const row of workouts){
      const parts=Object.entries(row.entry.parts || {}).filter(([,part])=>part?.active).map(([key])=>FITNESS_PARTS.find(part=>part.key===key)?.label || key);
      const item=planningButton(formatReadableDateKey(row.date)+' · '+parts.join(', '),()=>{
        const card=state.cards.find(card=>card.id===row.cardId);if(!card)return;
        card.activeFitnessDate=row.date;session.cardId=card.id;session.view='workout';renderCardsOnly({force:true});
      },'chevron-right');item.classList.add('health-history-row');list.append(item);
    }
    return;
  }
  const type=session.view==='food'?'food':'fitness',sources=cards.filter(card=>card.type===type);
  if(!sources.length){root.append(planningNode('p','planning-empty',type==='fitness'?'No Fitness Log on this board yet.':'No Food Tracker on this board yet.'),planningButton('Add '+(type==='fitness'?'Fitness Log':'Food Tracker'),()=>openCardComposer(),'plus'));return;}
  const card=sources.find(card=>card.id===session.cardId) || sources[0];session.cardId=card.id;
  if(sources.length>1)root.append(planningField('Log',planningSelect(sources.map(card=>[card.id,card.title]),card.id,id=>{if(isProtectedTextEditActive())document.activeElement?.blur();session.cardId=id;renderCardsOnly({force:true});})));
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
  editor.append(planningNode('h2','',card.title),log);
  root.append(editor);
}
