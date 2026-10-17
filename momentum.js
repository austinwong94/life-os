/* Read-only performance projections. Original task and writing records stay canonical. */
(function(root){
  'use strict';
  const valid=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const shift=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  function summarize({start,today,completions=[],plans=[],writing=[]}){
    if(!valid(start) || !valid(today))throw new Error('A valid week and current day are required.');
    const end=shift(start,6),until=end<today?end:today,seen=new Set();
    const tasks=completions.filter(row=>{
      if(!valid(row.completedOn) || row.completedOn<start || row.completedOn>until || typeof row.reportKey!=='string' || seen.has(row.reportKey))return false;
      seen.add(row.reportKey);return true;
    });
    const days=Array.from({length:7},(_,i)=>{
      const date=shift(start,i),plan=plans.find(row=>row.date===date),planned=Number.isInteger(plan?.total)&&plan.total>0?plan.total:0;
      return {date,future:date>today,count:tasks.filter(t=>t.completedOn===date).length,
        writing:writing.some(row=>row.dateKey===date && ['diary','sidenote'].includes(row.type) && [row.body,row.sentence].some(value=>typeof value==='string' && value.trim())),
        planned,followed:Number.isInteger(plan?.done)&&plan.done>=0?Math.min(plan.done,planned):0};
    });
    const past=days.filter(day=>!day.future),chosen=past.reduce((n,d)=>n+d.planned,0),followed=past.reduce((n,d)=>n+d.followed,0);
    const groups=new Map();for(const task of tasks){const area=[task.area,task.card?.category,task.group].find(value=>typeof value==='string' && value.trim()) || 'Unsorted';groups.set(area,(groups.get(area)||0)+1);}
    return {start,end,until,days,tasks,total:tasks.length,chosen,followed,percent:chosen?Math.round(followed/chosen*100):null,
      plannedDays:past.filter(d=>d.planned>0).length,writingDays:past.filter(d=>d.writing).length,
      areas:[...groups].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name))};
  }
  function suggest(items,{today,selected=[],limit=3}={}) {
    if(!valid(today))throw new Error('A valid day is required.');
    const frequencies=new Map();for(const item of items)frequencies.set(item.key,(frequencies.get(item.key)||0)+1);
    const orderDate=item=>valid(item.deadline)?item.deadline:valid(item.dateKey)?item.dateKey:'9999';
    return items.filter(item=>typeof item.key==='string' && frequencies.get(item.key)===1 && !selected.includes(item.key) && !item.done && !item.blocked && item.editable!==false &&
      !['waiting','parked'].includes(item.status) && (!item.dateKey || valid(item.dateKey) && item.dateKey<=today)).map(item=>{
      let rank=6,reason='Undated task';
      if(item.dateKey===today){rank=0;reason='Planned for today';}
      else if(valid(item.deadline) && item.deadline<=today){rank=1;reason='Deadline '+item.deadline;}
      else if(item.priority==='high'){rank=2;reason='You marked this important';}
      else if(item.status==='doing'){rank=3;reason='Already in progress';}
      else if(item.coachingProgramId){rank=4;reason='Linked to your priorities';}
      else if(valid(item.dateKey)){rank=5;reason='Planned '+item.dateKey;}
      return {...item,rank,reason};
    }).sort((a,b)=>a.rank-b.rank || orderDate(a).localeCompare(orderDate(b)) || a.key.localeCompare(b.key))
      .slice(0,Math.max(0,Math.min(3,Number.isInteger(limit)?limit:3)));
  }
  const api=Object.freeze({valid,shift,summarize,suggest});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeMomentum=api;
})(typeof window==='undefined'?globalThis:window);

function momentumWeek(start=dailyWeekStart(getTodayKey())) {
  const today=getTodayKey(),end=[LifeMomentum.shift(start,6),today].sort()[0];
  return LifeMomentum.summarize({start,today,completions:dailyCompletedTasks(start,end),plans:dailyFollowThrough(start,end),
    writing:LifeRecords.collect({id:state.activeBoardId,cards:state.cards,archivedCards:getArchivedCards()})});
}
function momentumMetric(label,value,detail,tone='blue') {
  const metric=planningNode('div','progress-measure momentum-metric');metric.dataset.tone=tone;
  metric.append(planningNode('small','',label),planningNode('strong',value==='Not recorded'?'is-unreported':'',value),planningNode('span','momentum-detail',detail));return metric;
}
function momentumChart(data,compact=false) {
  const figure=planningNode('figure','momentum-chart'+(compact?' is-compact':''));
  figure.classList.toggle('is-empty',!data.total);
  const caption=planningNode('figcaption');caption.append(planningNode('strong','','Your week in motion'),planningNode('small','','Recorded task completions'));
  const list=planningNode('ol','momentum-bars'),max=Math.max(1,...data.days.map(day=>day.count));
  for(const day of data.days){
    const row=planningNode('li');row.classList.toggle('is-today',day.date===getTodayKey());row.classList.toggle('is-future',day.future);row.classList.toggle('is-zero',!day.count);
    const date=new Date(day.date+'T12:00:00'),label=date.toLocaleDateString(undefined,{weekday:'short'});
    row.setAttribute('aria-label',formatPlannerDate(day.date)+': '+(day.future?'Not yet':day.count+' recorded completions'));
    row.title=formatPlannerDate(day.date)+' · '+(day.future?'Not yet':day.count+' recorded completions');
    const track=planningNode('div','momentum-bar-track'),bar=planningNode('span','momentum-bar');bar.style.height=(day.count/max*100)+'%';track.append(bar);
    row.append(planningNode('strong','momentum-bar-value',day.future?'–':String(day.count)),track,planningNode('span','momentum-bar-day',label));list.append(row);
  }
  figure.append(caption,list);
  if(!data.total)figure.append(planningNode('p','momentum-chart-empty','No completions recorded in this week.'));
  return figure;
}
function openMomentumCompletions(start,end) {
  const dialog=dailyDialog('Completed · '+formatPlannerOriginDate(start)+(end!==start?' – '+formatPlannerOriginDate(end):''));
  const tasks=dailyCompletedTasks(start,end).sort((a,b)=>b.completedOn.localeCompare(a.completedOn) || b.completedAt-a.completedAt);
  if(!tasks.length)dialog.append(planningNode('p','daily-muted','No dated completions recorded in this period.'));
  const list=planningNode('ul','momentum-wins');
  for(const task of tasks){const item=planningNode('li');item.append(planningNode('span','momentum-win-mark','✓'),planningNode('strong','',task.title),planningNode('time','',formatPlannerOriginDate(task.completedOn)));list.append(item);}
  dialog.append(list);
}
function openMomentumProgress(start=dailyWeekStart(getTodayKey())) {
  dailySession().progressWeek=start;saveDailyDraft();setWorkspaceMode('priorities');
}
function renderMomentumToday(root,light=false) {
  const data=momentumWeek(),today=getTodayKey(),completed=data.days.find(day=>day.date===today)?.count || 0;
  const strip=planningNode('section','momentum-today');strip.setAttribute('aria-label','Today at a glance');
  const metrics=planningNode('div','momentum-today-metrics');
  const add=(label,value,detail,tone,action)=>{
    const button=planningButton('',action);button.className='momentum-stat-button';button.dataset.tone=tone;
    button.setAttribute('aria-label',label+': '+value);button.append(momentumMetric(label,String(value),detail,tone));metrics.append(button);
  };
  add('Completed today',completed,completed?'A step forward, recorded':'Room for your first step','green',()=>openMomentumCompletions(today,today));
  if(!light){
    add('Completed this week',data.total,'Monday to today','blue',()=>openMomentumProgress());
    add('Days with writing',data.writingDays,'Diary or notes this week','coral',()=>setWorkspaceMode('records'));
  }
  strip.append(metrics);
  if(!light)strip.append(momentumChart(data,true));root.append(strip);
}
async function openMomentumPriority(boardId,programId,priorityId,plan=false) {
  if(state.activeBoardId!==boardId)return;
  const program=currentCoachingPrograms().find(row=>row.id===programId);
  if(!program?.priorities.some(row=>row.id===priorityId))return;
  const session=coachingSession();session.programId=programId;session.priorityId=priorityId;session.tab='overview';
  dailySession().progressView='goals';saveDailyDraft();
  // Navigate to the original editors; keep every open editor and quick-entry draft.
  refreshCoaching();
  await flushDeviceWrites();
  requestAnimationFrame(()=>{
    if(state.activeBoardId!==boardId || state.ui.workspaceMode!=='priorities' || coachingProgram()?.id!==programId || coachingSession().priorityId!==priorityId)return;
    const focus=elements.boardGrid.querySelector('.coaching-focus');
    const input=[...(focus?.querySelectorAll('input:not([type=checkbox]),textarea,select') || [])].find(node=>!node.disabled && node.getClientRects().length);
    const target=plan?elements.boardGrid.querySelector('.coaching-next-actions > button:last-child'):input || focus?.querySelector('h4');
    if(target){if(target.tagName==='H4')target.tabIndex=-1;target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}
  });
}
function renderMomentumOutcomes(root,asOf) {
  const program=coachingProgram();if(!program)return;
  let snapshot;
  try{snapshot=LifeCoaching.outcomeSnapshot(program,asOf);}
  catch{root.append(planningNode('p','daily-muted','Your priority records need review. They are preserved in the programme below.'));return;}
  const section=planningNode('section','momentum-outcomes');section.setAttribute('aria-label','Your priorities at a glance');
  const heading=planningNode('header','momentum-outcomes-head');heading.append(planningNode('h3','','What matters to you'),
    planningNode('p','daily-muted',snapshot.title+' · Cumulative through '+coachingDate(asOf)));section.append(heading);
  if((state.syncConflicts || []).some(row=>row.segments?.[0]==='boards' && row.segments[1]===state.activeBoardId)){
    section.append(planningNode('p','momentum-outcome-warning','This board has unresolved comparisons. These are this device\'s recorded results, not verified cloud totals.'));
  }
  const grid=planningNode('div','momentum-outcome-grid'),boardId=state.activeBoardId;
  for(const [index,priority] of snapshot.priorities.entries()){
    const article=planningNode('article','momentum-outcome');article.dataset.tone=['green','coral','blue'][index%3];article.dataset.priorityId=priority.id;
    article.append(planningNode('small','momentum-eyebrow','PRIORITY '+(index+1)),planningNode('h4','',priority.title));
    const value=planningNode('strong','momentum-outcome-value',priority.percent===null?'Not recorded':priority.percent+'%');
    article.append(value,planningNode('span','daily-muted',priority.percent===null?'No outcome updates yet':'Recorded target completion'));
    const meter=planningNode('progress');meter.max=100;meter.value=priority.percent || 0;meter.setAttribute('aria-label',priority.title+': '+(priority.percent===null?'Not recorded':priority.percent+'% recorded target completion'));article.append(meter);
    article.append(planningNode('p','momentum-outcome-coverage',priority.recorded+' / '+priority.total+' targets updated · '+priority.met+' met'));
    const status=planningNode('p','momentum-outcome-status');
    if(priority.belowCheckpoint || priority.missingCheckpoint){status.classList.add('needs-review');status.textContent=[priority.belowCheckpoint?priority.belowCheckpoint+' below planned checkpoint':'',priority.missingCheckpoint?priority.missingCheckpoint+' checkpoint updates missing':''].filter(Boolean).join(' · ');}
    else status.textContent=priority.recorded?'Review the results, not just your task count.':'An update can start with where you are now.';
    article.append(status);
    const details=planningNode('details','momentum-outcome-targets');details.append(planningNode('summary','','View targets ('+priority.total+')'));
    for(const goal of priority.goals){
      if(!goal.metrics.length)continue;
      const group=planningNode('section');group.append(planningNode('h5','',goal.title));
      for(const metric of goal.metrics){
        const row=planningNode('div','momentum-outcome-target');row.dataset.metricId=metric.id;
        row.append(planningNode('strong','',metric.label),planningNode('span','',metric.recorded?metric.value+' / '+metric.target+' '+metric.unit:'Not recorded · Target '+metric.target+' '+metric.unit));
        row.append(planningNode('small','daily-muted',metric.pace.status+(metric.pace.expected!==null?' · '+metric.pace.expected+' '+metric.unit+' by '+coachingDate(metric.pace.checkpoint):'')));
        if(metric.lastDate)row.append(planningNode('small','daily-muted','Latest effective date: '+coachingDate(metric.lastDate)));group.append(row);
      }details.append(group);
    }article.append(details);
    const actions=planningNode('div','momentum-outcome-actions');
    const update=planningButton('Update progress',()=>openMomentumPriority(boardId,snapshot.programId,priority.id),'pencil');update.setAttribute('aria-label','Update progress: '+priority.title);
    const plan=planningButton('Plan a step',()=>openMomentumPriority(boardId,snapshot.programId,priority.id,true),'plus');plan.setAttribute('aria-label','Plan a step: '+priority.title);
    actions.append(update,plan);article.append(actions);grid.append(article);
  }
  section.append(grid,planningNode('p','momentum-data-note','Core targets are equally weighted; unreported targets contribute no recorded progress. Stretch targets are excluded. This is not a life score or a pace forecast. Task ticks do not update these outcomes.'));
  if(asOf<getTodayKey())section.append(planningNode('p','daily-muted','This snapshot uses effective dates, including later corrections. Update progress and Plan a step open your current programme, not this historical snapshot.'));
  root.append(section);
}
function renderMomentumProgress(root) {
  const session=dailySession(),today=getTodayKey(),current=dailyWeekStart(today);
  const start=LifeMomentum.valid(session.progressWeek) && session.progressWeek<=current?dailyWeekStart(session.progressWeek):current,data=momentumWeek(start);
  const heading=planningNode('header','momentum-progress-head'),copy=planningNode('div');
  copy.append(planningNode('p','momentum-eyebrow',start===current?'THIS WEEK':'WEEKLY OVERVIEW'),planningNode('h2','','Your progress'),planningNode('p','daily-muted','Small steps. A clearer picture.'));
  const controls=planningNode('div','momentum-period');
  const change=date=>{session.progressWeek=date;saveDailyDraft();renderCardsOnly({force:true});};
  const next=planningIcon('Next progress week',()=>change(LifeMomentum.shift(start,7)),'chevron-right');next.disabled=start>=current;
  const label=planningNode('span','',formatPlannerOriginDate(start)+' – '+formatPlannerOriginDate(data.end));
  label.title=start+' – '+data.end;label.setAttribute('aria-label','Week '+start+' to '+data.end);
  controls.append(planningIcon('Previous progress week',()=>change(LifeMomentum.shift(start,-7)),'chevron-left'),label,next);
  if(start!==current)controls.append(planningButton('This week',()=>change(current)));
  const headerTools=planningNode('div','momentum-header-tools');
  const plan=planningButton('Plan today',()=>setWorkspaceMode('today'),'plus');plan.classList.add('is-primary');
  headerTools.append(controls,plan);heading.append(copy,headerTools);root.append(heading);
  const measures=planningNode('div','progress-measures momentum-measures');
  const addMeasure=(label,value,detail,tone,name,action)=>{
    const button=planningButton('',action);button.className='momentum-stat-button';button.setAttribute('aria-label',name);
    button.append(momentumMetric(label,value,detail,tone));measures.append(button);
  };
  addMeasure('Tasks completed',String(data.total),'Recorded in this period','green','View completed tasks: '+data.total,()=>openMomentumCompletions(start,data.until));
  addMeasure('Chosen steps',data.percent===null?'Not recorded':data.percent+'%',data.chosen?data.followed+' / '+data.chosen+' completed':'Choose your next steps in Today','blue','Open today\'s next steps',()=>setWorkspaceMode('today'));
  addMeasure('Days with writing',String(data.writingDays),'Diary or notes · this board','coral','Open saved writing',()=>setWorkspaceMode('records'));
  root.append(measures);
  if(dailyFollowThrough(start,data.until).some(a=>a.revised))root.append(planningNode('small','daily-muted','Revised plans retain their original choices in these totals.'));
  const analysis=planningNode('div','momentum-analysis');analysis.append(momentumChart(data));
  const areas=dailySection('Where you made progress');areas.classList.add('momentum-areas');
  if(!data.areas.length)areas.append(planningNode('p','daily-muted','Your completed tasks will appear here, grouped by area.'));
  for(const [i,area] of data.areas.entries()){
    const row=planningNode('div','momentum-area');row.dataset.tone=['blue','coral','green','amber'][i%4];
    const text=planningNode('div');text.append(planningNode('span','',area.name),planningNode('strong','',String(area.count)));
    const meter=planningNode('progress');meter.max=data.total;meter.value=area.count;meter.setAttribute('aria-label',area.name+': '+area.count+' of '+data.total+' recorded completions');row.append(text,meter);areas.append(row);
  }analysis.append(areas);root.append(analysis);
  renderMomentumOutcomes(root,data.until);
  if(!coachingProgram()){
    const empty=planningNode('section','momentum-priorities-empty');
    empty.append(planningNode('h3','','Your longer-term priorities'),planningButton('Add priorities programme',()=>showProgressSection('goals'),'plus'));root.append(empty);
  }
  const bottom=planningNode('div','momentum-review');
  const wins=dailySection('Small wins count',planningButton('View completions',()=>openMomentumCompletions(start,data.until),'check'));
  const list=planningNode('ul','momentum-wins');
  for(const task of data.tasks.slice().sort((a,b)=>b.completedOn.localeCompare(a.completedOn) || b.completedAt-a.completedAt).slice(0,5)){
    const row=planningNode('li');row.append(planningNode('span','momentum-win-mark','✓'),planningNode('strong','',task.title),planningNode('time','',formatPlannerOriginDate(task.completedOn)));list.append(row);
  }
  if(!data.total){
    wins.append(planningNode('p','daily-muted','No completed tasks in this week yet.'),planningButton('Choose a next step',()=>setWorkspaceMode('today'),'plus'));
  }
  wins.append(list);bottom.append(wins);
  const reflection=dailySection('Weekly reflection');reflection.classList.add('momentum-reflection');
  reflection.append(planningNode('p','','What helped this week? What would make next week feel a little easier?'));
  const tools=planningNode('div','daily-actions');tools.append(planningButton('Weekly review',()=>openDailyReview(start),'pencil'),planningButton('Reports',openReportsModal,'bar-chart'));reflection.append(tools);bottom.append(reflection);root.append(bottom);
  const method=planningNode('details','momentum-method');method.append(planningNode('summary','','About these numbers'),planningNode('p','momentum-data-note','This board only. Task counts exclude subtasks and use recorded completion dates, including archived history. Reopened tasks keep their history; missing dates and unresolved completion conflicts are not counted.'));root.append(method);
}
