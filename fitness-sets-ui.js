const fitnessSetDisclosures=new Map();
function fitnessSetDisclosure(key,label,initial=false){
  const details=document.createElement('details'),summary=document.createElement('summary');details.className='fitness-set-disclosure';summary.textContent=label;summary.id='fitness-set-disclosure-'+key;
  details.open=fitnessSetDisclosures.get(key) ?? initial;
  summary.addEventListener('click',event=>{event.preventDefault();details.open=!details.open;fitnessSetDisclosures.set(key,details.open);});details.append(summary);return details;
}
function applyFitnessSetChange(ref,command,message){
  try{
    const after=LifeFitnessSets.change({id:state.activeBoardId,cards:state.cards},ref,command,{createId,conflicts:state.syncConflicts});
    const target=fitnessExerciseTarget({id:ref.cardId},ref.date,ref.partKey,ref.exerciseId,ref.boardId);
    if(!target)throw new Error('This exercise moved. Reopen the workout.');
    const saved=updateFitnessEntry(target.card,ref.date,entry=>{entry.parts[ref.partKey].exercises[target.index]=after;});
    message.textContent=saved===false?'Not saved on this device yet. Keep this tab open and retry saving.':'';
    return after;
  }catch(error){message.textContent=error.message;return null;}
}
function openFitnessSetLog(card,date,partKey,exercise){
  const ref={boardId:state.activeBoardId,cardId:card.id,date,partKey,exerciseId:exercise.id},expected=LifeFitnessSets.copy(exercise);
  const dialog=dailyDialog('Log individual sets');
  dialog.append(planningNode('p','',formatReadableDateKey(date)+' · '+exercise.name));
  dialog.append(planningNode('p','', 'Your summary entry stays stored. New sets start blank; only sets you tick count as completed.'));
  const message=planningNode('p','fitness-set-message');message.setAttribute('role','status');
  const actions=planningNode('div','fitness-exercise-actions');
  actions.append(planningButton('Cancel',()=>dialog.close()),planningButton('Start set log',()=>{
    if(applyFitnessSetChange(ref,{type:'enable',expected},message)){dialog.close();renderCardsOnly({force:true});}
  },'plus'));dialog.append(message,actions);
}
function renderFitnessSetLog(card,date,partKey,exercise){
  const wrapper=planningNode('div','fitness-set-log'),stats=LifeFitnessSets.stats(exercise);
  wrapper.dataset.exerciseId=exercise.id;
  if(stats.mode==='unrecognized'){
    const message=planningNode('p','fitness-set-message','This set log needs a newer version or review. Its original data is retained; editing is paused.');message.setAttribute('role','alert');wrapper.append(message);return wrapper;
  }
  const ref={boardId:state.activeBoardId,cardId:card.id,date,partKey,exerciseId:exercise.id,logId:exercise.setLog.id};
  const prefix='fitness-sets-'+encodeURIComponent(JSON.stringify([ref.boardId,ref.cardId,date,partKey,ref.exerciseId,ref.logId]));
  const message=planningNode('p','fitness-set-message');message.setAttribute('role','status');
  wrapper.append(planningNode('p','fitness-set-progress',stats.completed+'/'+stats.rows.length+' sets completed'));
  if(lastDeviceSaveError)message.textContent='Not saved on this device yet. Keep this tab open and retry saving.';
  const effort=fitnessSetDisclosure(prefix+'-effort','Effort (optional)'),effortFields=planningNode('div','fitness-set-effort-fields');effort.append(effortFields);
  const rerender=()=>renderCardsOnly({force:true});
  stats.rows.forEach((source,index)=>{
    const number=exercise.setLog.rows.findIndex(row=>row.id===source.id)+1;
    let expected=LifeFitnessSets.copy(source);
    const row=planningNode('div','fitness-set-row');row.dataset.setId=source.id;
    const ordinal=planningNode('span','fitness-set-ordinal','Set '+number);
    const tickLabel=planningNode('label','fitness-set-tick'),tick=document.createElement('input');tick.type='checkbox';tick.id=prefix+'-tick-'+encodeURIComponent(source.id);tick.checked=source.done;tick.setAttribute('aria-label','Set '+number+' completed');
    const completed=source.history.filter(event=>event.action==='completed').at(-1);if(source.done && completed)tick.title='Recorded '+new Date(completed.at).toISOString();
    tick.addEventListener('change',()=>{const after=applyFitnessSetChange(ref,{type:tick.checked?'completed':'reopened',rowId:source.id,expected},message);if(after)rerender();else tick.checked=expected.done;});tickLabel.append(ordinal,tick);
    const field=(label,key,options)=>{
      const node=createFitnessNumberField(label,source[key],value=>{
        const after=applyFitnessSetChange(ref,{type:'edit',rowId:source.id,expected,values:{[key]:value}},message);
        if(after)expected=LifeFitnessSets.copy(after.setLog.rows.find(item=>item.id===source.id));
      },options);node.querySelector('input').disabled=source.done;return node;
    };
    const remove=planningButton('',()=>{
      if(applyFitnessSetChange(ref,{type:'removed',rowId:source.id,expected},message)){rerender();document.getElementById(prefix+'-add')?.focus({preventScroll:true});}
    },'trash-2');remove.className='fitness-set-remove';remove.title='Remove set '+number;remove.setAttribute('aria-label',remove.title);remove.disabled=source.done;
    row.append(tickLabel,field('Kg','weightKg',{step:'0.01',min:0,max:100000}),field('Reps','reps',{step:'1',min:0,max:100000}),remove);wrapper.append(row);
    effortFields.append(field('Set '+number+' RPE','rpe',{step:'0.5',min:1,max:10,help:'Rate of perceived exertion (optional)'}));
  });
  const add=planningButton('Add set',()=>{if(applyFitnessSetChange(ref,{type:'add'},message))rerender();},'plus');add.id=prefix+'-add';add.disabled=exercise.setLog.rows.length>=200;
  const actions=planningNode('div','fitness-set-actions');actions.append(add);
  const lastChecked=stats.rows.filter(row=>row.done).at(-1);
  if(lastChecked){
    const expected=LifeFitnessSets.copy(lastChecked);
    const repeat=planningButton('Repeat checked set',()=>{if(applyFitnessSetChange(ref,{type:'repeat',rowId:expected.id,expected},message))rerender();},'rotate-ccw');
    repeat.id=prefix+'-repeat';repeat.title='New unchecked draft: last checked weight and reps; effort left blank';repeat.disabled=exercise.setLog.rows.length>=200;actions.append(repeat);
  }
  wrapper.append(actions,effort);
  const removed=exercise.setLog.rows.filter(row=>row.removedAt);
  if(removed.length){
    const details=fitnessSetDisclosure(prefix+'-removed','Removed sets ('+removed.length+')');
    removed.forEach((row,index)=>{
      const number=exercise.setLog.rows.findIndex(item=>item.id===row.id)+1;
      const restore=planningButton('Restore set '+number,()=>{if(applyFitnessSetChange(ref,{type:'restored',rowId:row.id,expected:row},message))rerender();},'rotate-ccw');restore.classList.add('fitness-set-restore');restore.id=prefix+'-restore-'+encodeURIComponent(row.id);details.append(restore);
    });wrapper.append(details);
  }
  const summary=fitnessSetDisclosure(prefix+'-summary','Summary entry (preserved)');summary.append(planningNode('p','',fitnessExerciseSummary(exercise)));wrapper.append(summary,message);return wrapper;
}
function fitnessExerciseSummary(exercise){
  return [exercise.sets!==''?exercise.sets+' sets':'',exercise.reps?exercise.reps+' reps':'',exercise.weightKg!==''?exercise.weightKg+' kg':'',exercise.rpe!==''?'RPE '+exercise.rpe:''].filter(Boolean).join(' · ') || 'No summary measurements recorded';
}
window.LifeFitnessSetsUI=Object.freeze({ready:true});
