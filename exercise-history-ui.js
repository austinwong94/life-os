function openHealthHistoryEntry(ref,session) {
  const matches=state.cards.filter(card=>card.id===ref.cardId);
  const entry=matches[0]?.fitnessEntries?.[ref.date];
  if(state.activeBoardId!==ref.boardId || typeof ref.cardId!=='string' || !ref.cardId.trim() || matches.length!==1 || matches[0].type!=='fitness' || matches[0].archivedAt || !LifeExerciseHistory.validDay(ref.date) || !Object.hasOwn(matches[0].fitnessEntries || {},ref.date) || !entry || typeof entry!=='object' || Array.isArray(entry) || !entry.parts || typeof entry.parts!=='object' || Array.isArray(entry.parts)) {
    setSaveStatus('This workout changed or moved. Reopen Training history.','notice');return false;
  }
  matches[0].activeFitnessDate=ref.date;session.sources.fitness=ref.cardId;session.view='workout';renderCardsOnly({force:true});return true;
}
function renderExerciseTrend(result,view,ref,session,prefix) {
  const figure=planningNode('figure','health-lift-trend'),heading=planningNode('header','health-lift-trend-head');
  const title=planningNode('h3','','Last checked set · load (kg)');title.id=prefix+'-trend-title';figure.setAttribute('aria-labelledby',title.id);heading.append(title);figure.append(heading);
  view.trendRange=['6','12','all'].includes(view.trendRange)?view.trendRange:'6';
  const model=LifeExerciseHistory.trend(result,{limit:view.trendRange==='all'?0:Number(view.trendRange)});
  const range=planningSelect([['6','Latest 6 recorded days'],['12','Latest 12 recorded days'],['all','All recorded days']],view.trendRange,value=>{view.trendRange=value;renderCardsOnly({force:true});});range.id=prefix+'-trend-range';heading.append(planningField('Recorded days',range));
  if(model.paused){figure.append(planningNode('p','health-lift-entry-status','Chart paused · records need review.'));return figure;}
  if(!model.points.length){figure.append(planningNode('p','health-lift-entry-status','No checked sets to chart.'));return figure;}
  figure.append(planningNode('figcaption','health-lift-entry-status',model.points.length+' of '+model.total+' recorded days'+(model.reviewDays?' · '+model.reviewDays+' '+(model.reviewDays===1?'entry needs':'entries need')+' review':'')));
  const plot=planningNode('div','health-lift-trend-grid'),axis=planningNode('div','health-lift-trend-axis');axis.setAttribute('aria-hidden','true');axis.append(planningNode('span','',model.top+' kg'),planningNode('span','','0 kg'));plot.append(axis);
  const scroll=planningNode('div','health-lift-trend-scroll'),canvas=planningNode('div','health-lift-trend-canvas');canvas.style.setProperty('--trend-count',String(model.points.length));scroll.append(canvas);plot.append(scroll);figure.append(plot);
  const graph=planningNode('div','health-lift-trend-plot'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',model.points.map((point,index)=>((index+.5)/model.points.length*100)+','+(100-point.weightKg/model.top*100)).join(' '));svg.append(line);graph.append(svg);canvas.append(graph);
  const dates=planningNode('div','health-lift-trend-dates');canvas.append(dates);
  for(const [index,point]of model.points.entries()){
    const dot=planningNode('span','health-lift-trend-dot');dot.style.left=((index+.5)/model.points.length*100)+'%';dot.style.bottom=(point.weightKg/model.top*100)+'%';dot.setAttribute('aria-hidden','true');graph.append(dot);
    const label=formatReadableDateKey(point.date),button=planningButton('',()=>openHealthHistoryEntry({...ref,date:point.date},session));button.classList.add('health-lift-trend-day');button.id=prefix+'-trend-'+point.date;button.dataset.date=point.date;button.title=label+' · '+point.weightKg+' kg / '+point.reps+' reps';button.setAttribute('aria-label','Open '+button.title);
    button.replaceChildren(planningNode('span','',dateKeyToLocalDate(point.date).toLocaleDateString(undefined,{day:'numeric',month:'short'})),planningNode('strong','',point.weightKg+' kg'),planningNode('span','',point.reps+' reps'));dates.append(button);
  }
  const navigation=planningNode('div','health-lift-trend-nav');navigation.setAttribute('role','group');navigation.setAttribute('aria-label','Chart navigation');heading.append(navigation);
  const earlier=planningIcon('Earlier recorded days',()=>move(-1),'chevron-left'),later=planningIcon('Later recorded days',()=>move(1),'chevron-right');
  for(const [button,label,key]of [[earlier,'Earlier recorded days','earlier'],[later,'Later recorded days','later']]){button.id=prefix+'-trend-'+key;button.title=label;button.setAttribute('aria-label',label);navigation.append(button);}
  view.trendScroll ??= new Map();const key=JSON.stringify([ref.boardId,ref.cardId,view.key,view.trendRange]),saved=view.trendScroll.get(key) || 0;let interacted=false,initialized=false;
  function sync(){earlier.disabled=scroll.scrollLeft<=1;later.disabled=scroll.scrollLeft+scroll.clientWidth>=scroll.scrollWidth-1;}
  function move(direction){interacted=true;scroll.scrollLeft+=direction*Math.max(64,scroll.clientWidth*.8);view.trendScroll.set(key,scroll.scrollLeft);sync();}
  for(const event of ['pointerdown','wheel','focusin','keydown'])scroll.addEventListener(event,()=>{interacted=true;});
  scroll.addEventListener('scroll',()=>{if(initialized || interacted)view.trendScroll.set(key,scroll.scrollLeft);sync();});earlier.disabled=true;later.disabled=true;
  requestAnimationFrame(()=>{if(!scroll.isConnected)return;if(!interacted)scroll.scrollLeft=saved;initialized=true;sync();});
  return figure;
}
function renderExerciseHistory(cards,session) {
  session.exerciseHistory ??= {open:false,cardId:'',key:''};
  const view=session.exerciseHistory,boardId=state.activeBoardId,prefix='health-lifts-'+encodeURIComponent(JSON.stringify(boardId));
  const details=planningNode('details','health-lift-history'),summary=planningNode('summary','','Exercise history');summary.id=prefix+'-summary';details.open=view.open;details.append(summary);
  summary.addEventListener('click',event=>{event.preventDefault();view.open=!view.open;renderCardsOnly({force:true});});
  if(!view.open)return details;
  const sources=cards.filter(card=>card.type==='fitness' && !card.archivedAt && typeof card.id==='string' && card.id.trim() && cards.filter(item=>item.id===card.id).length===1);
  if(!sources.length){details.append(planningNode('p','planning-empty','No unambiguous Fitness Log on this board.'));return details;}
  const card=sources.find(card=>card.id===view.cardId) || sources[0];view.cardId=card.id;
  const controls=planningNode('div','health-lift-controls');
  if(sources.length>1) {
    const select=planningSelect(sources.map(card=>[card.id,card.title]),card.id,id=>{view.cardId=id;view.key='';renderCardsOnly({force:true});});select.id=prefix+'-source';controls.append(planningField('Workout log',select));
  }else controls.append(planningNode('p','health-lift-source',card.title));
  const choices=LifeExerciseHistory.choices(card),selected=choices.find(item=>item.key===view.key) || choices[0];
  details.append(controls);
  if(!selected){details.append(planningNode('p','planning-empty','No named strength exercises recorded in this log.'));return details;}
  view.key=selected.key;
  const partLabel=key=>FITNESS_PARTS.find(part=>part.key===key)?.label || key;
  const select=planningSelect(choices.map(item=>[item.key,partLabel(item.partKey)+' - '+item.label]),selected.key,key=>{view.key=key;renderCardsOnly({force:true});});select.id=prefix+'-exercise';controls.append(planningField('Exercise',select));
  details.append(planningNode('h3','health-lift-name',partLabel(selected.partKey)+' - '+selected.label));
  const reviewPending=(state.syncConflicts || []).some(conflict=>{const p=conflict.segments || [];return p[0]==='boards' && p[1]===boardId && ['cards','archivedCards'].includes(p[2]) && p[3]===card.id;});
  const result=LifeExerciseHistory.history(card,selected,{through:getTodayKey(),reviewPending});
  const totals=planningNode('p','health-lift-total',reviewPending?'Current version - comparison paused while this log has unresolved versions.':result.completedSets+' checked '+(result.completedSets===1?'set':'sets')+' across '+result.completedDays+' recorded '+(result.completedDays===1?'day':'days'));
  if(reviewPending)totals.setAttribute('role','status');details.append(totals);
  const value=text=>typeof text==='string' || typeof text==='number'?String(text):'';
  const measurement=set=>[(value(set.weightKg)!==''?value(set.weightKg)+' kg':'Weight not entered'),(value(set.reps)!==''?value(set.reps)+' reps':'Reps not entered')].join(' / ');
  if(result.latest.length) {
    const comparison=planningNode('dl','health-lift-comparison');
    result.latest.forEach((item,index)=>{const group=planningNode('div','');group.append(planningNode('dt','',index?'Previous day - last checked set':'Latest day - last checked set'),planningNode('dd','',measurement(item.set)),planningNode('dd','health-lift-date',formatReadableDateKey(item.date)));comparison.append(group);});details.append(comparison);
  }
  details.append(renderExerciseTrend(result,view,{boardId,cardId:card.id},session,prefix));
  const list=planningNode('div','health-lift-entries');list.setAttribute('aria-label','Exercise records');details.append(list);
  for(const row of result.rows) {
    const entry=planningNode('article','health-lift-entry'),heading=planningNode('header','health-lift-entry-heading');entry.dataset.date=row.date;entry.dataset.mode=row.mode;
    const button=planningButton(formatReadableDateKey(row.date),()=>openHealthHistoryEntry({boardId,cardId:card.id,date:row.date},session),'chevron-right');button.id=prefix+'-date-'+row.date;button.title='Open original workout';button.classList.add('health-lift-open');heading.append(button);
    const status=row.mode==='summary'?'Summary entry - not individually checked':row.mode==='ambiguous'?'Multiple or unidentified entries - review original':row.mode==='unrecognized'?'Unrecognized exercise record':row.completed+'/'+row.active+' checked sets';
    heading.append(planningNode('span','health-lift-entry-status',status));entry.append(heading);
    if(row.future)entry.append(planningNode('p','health-lift-entry-status','Future date - excluded from comparisons'));
    if(row.mode==='summary') {
      const old=row.summary;entry.append(planningNode('p','health-lift-summary',[value(old.sets)!==''?value(old.sets)+' sets':'Sets not entered',measurement(old),value(old.rpe)!==''?'RPE '+value(old.rpe):''].filter(Boolean).join(' / ')));
    }
    if(row.mode==='sets') {
      if(!row.sets.length)entry.append(planningNode('p','health-lift-entry-status','No individual sets recorded.'));
      else {
        const table=document.createElement('table');table.className='health-lift-table';
        const caption=document.createElement('caption');caption.textContent='Recorded sets - '+formatReadableDateKey(row.date);table.append(caption);
        const head=document.createElement('thead'),header=document.createElement('tr');for(const label of ['Set','Measurements','State']){const cell=document.createElement('th');cell.scope='col';cell.textContent=label;header.append(cell);}head.append(header);table.append(head);
        const body=document.createElement('tbody');
        for(const set of row.sets){const tr=document.createElement('tr'),number=document.createElement('th');number.scope='row';number.textContent=String(set.number);tr.append(number);const measures=document.createElement('td');measures.textContent=measurement(set)+(value(set.rpe)!==''?' / RPE '+value(set.rpe):'');const stateCell=document.createElement('td');stateCell.textContent=set.removedAt?'Removed':set.done?'Checked':'Draft';tr.append(measures,stateCell);body.append(tr);}table.append(body);entry.append(table);
      }
    }
    list.append(entry);
  }
  return details;
}
window.LifeExerciseHistoryUI=Object.freeze({ready:true});
