(function(root){
  'use strict';
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>a===b || Boolean(a && b && typeof a==='object' && typeof b==='object' &&
    Array.isArray(a)===Array.isArray(b) && Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(key=>Object.hasOwn(b,key) && equal(a[key],b[key])));
  const object=value=>value && typeof value==='object' && !Array.isArray(value);
  const safe=value=>object(value) && !Object.keys(value).some(key=>['__proto__','prototype','constructor'].includes(key));
  const id=value=>typeof value==='string' && value.trim().length>0 && !['__proto__','prototype','constructor'].includes(value);
  const time=value=>Number.isSafeInteger(value) && value>0 && Number.isFinite(new Date(value).getTime());
  const day=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const parts=['chest','back','shoulders','arms','abs','legs'];
  const measures=value=>safe(value) && (value.reps==='' || Number.isSafeInteger(value.reps) && value.reps>=0 && value.reps<=100000) &&
    (value.weightKg==='' || typeof value.weightKg==='number' && Number.isFinite(value.weightKg) && value.weightKg>=0 && value.weightKg<=100000 && Math.round(value.weightKg*100)/100===value.weightKg) &&
    (value.rpe==='' || typeof value.rpe==='number' && Number.isFinite(value.rpe) && value.rpe>=1 && value.rpe<=10);
  const complete=value=>measures(value) && value.reps!=='' && value.reps>0 && value.weightKg!=='';
  const draft=value=>safe(value) && ['reps','weightKg','rpe'].every(key=>typeof value[key]==='string' && value[key].length<=64 && (value[key]==='' || /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value[key])) || typeof value[key]==='number' && Number.isFinite(value[key]));
  function validRow(row){
    if(!safe(row) || !id(row.id) || !draft(row) || typeof row.done!=='boolean' || !(row.removedAt===0 || time(row.removedAt)) || !Array.isArray(row.history))return false;
    let done=false,removedAt=0,lastComplete=null;const ids=new Set();
    for(const event of row.history){
      if(!safe(event) || !id(event.id) || ids.has(event.id) || !time(event.at) || !draft(event))return false;ids.add(event.id);
      if(event.action==='completed' && !done && !removedAt && complete(event)){done=true;lastComplete=event;}
      else if(event.action==='reopened' && done && !removedAt)done=false;
      else if(event.action==='removed' && !done && !removedAt)removedAt=event.at;
      else if(event.action==='restored' && removedAt)removedAt=0;
      else return false;
    }
    return done===row.done && removedAt===row.removedAt && (!done || ['reps','weightKg','rpe'].every(key=>row[key]===lastComplete[key]));
  }
  function validLog(log){
    return Boolean(safe(log) && log.version===1 && id(log.id) && time(log.createdAt) && time(log.updatedAt) && Array.isArray(log.rows) && log.rows.length<=200 &&
      log.rows.every(validRow) && new Set(log.rows.map(row=>row.id)).size===log.rows.length);
  }
  const emptyDraft=row=>validRow(row) && !row.done && !row.removedAt && !row.history.length && ['reps','weightKg','rpe'].every(key=>row[key]==='');
  function summaryDraft(exercise){
    if(!safe(exercise) || Object.hasOwn(exercise,'setLog'))return null;
    const number=value=>typeof value==='number'?value:typeof value==='string' && /^(?:\d+(?:\.\d+)?)$/.test(value)?Number(value):NaN;
    const values={reps:number(exercise.reps),weightKg:number(exercise.weightKg),rpe:''};
    return complete(values)?{reps:values.reps,weightKg:values.weightKg}:null;
  }
  function stats(exercise){
    if(!Object.hasOwn(exercise || {},'setLog'))return {mode:'summary',completed:0,summary:Number(exercise?.sets)||0,rows:[]};
    if(!validLog(exercise.setLog))return {mode:'unrecognized',completed:0,summary:0,rows:[]};
    const rows=exercise.setLog.rows.filter(row=>!row.removedAt);
    return {mode:'sets',completed:rows.filter(row=>row.done).length,summary:0,rows};
  }
  function resolve(board,ref,conflicts=[]){
    if(!ref || board?.id!==ref.boardId || !id(ref.cardId) || !id(ref.exerciseId) || !day(ref.date) || !parts.includes(ref.partKey))throw new Error('Reopen this workout on its original board and day.');
    const cards=(board.cards || []).filter(card=>card.id===ref.cardId);
    if(cards.length!==1 || cards[0].type!=='fitness' || cards[0].archivedAt)throw new Error('This workout changed or moved. Reopen it before editing.');
    if(conflicts.some(conflict=>{const p=conflict.segments || [];return p[0]==='boards' && p[1]===board.id && ['cards','archivedCards'].includes(p[2]) && p[3]===ref.cardId;}))throw new Error('Review this workout\'s conflicting versions before editing its sets.');
    const part=cards[0].fitnessEntries?.[ref.date]?.parts?.[ref.partKey];
    if(part?.active!==true || !Array.isArray(part.exercises))throw new Error('This workout section is no longer active.');
    const matches=part.exercises.filter(exercise=>exercise?.id===ref.exerciseId);
    if(matches.length!==1)throw new Error('This exercise is missing or has a duplicate identity.');
    return matches[0];
  }
  function nextId(createId,used){const value=createId();if(!id(value) || used.has(value))throw new Error('A unique set identity could not be created. Retry.');used.add(value);return value;}
  function change(board,ref,command,{now=Date.now(),createId=()=>crypto.randomUUID(),conflicts=[],today}={}){
    if(!time(now))throw new Error('The recording time is not valid. Nothing was changed.');
    const live=resolve(board,ref,conflicts),after=copy(live);
    if(command.type==='enable'){
      if(Object.hasOwn(live,'setLog') || !equal(live,command.expected))throw new Error('This exercise changed. Reopen individual-set logging.');
      const used=new Set([live.id]);
      after.setLog={version:1,id:nextId(createId,used),createdAt:now,updatedAt:now,rows:[{id:nextId(createId,used),reps:'',weightKg:'',rpe:'',done:false,removedAt:0,history:[]}]};
      return after;
    }
    if(!validLog(live.setLog) || live.setLog.id!==ref.logId)throw new Error('This set log changed or is not supported. Its original data is retained.');
    const log=after.setLog,used=new Set([live.id,log.id,...log.rows.map(row=>row.id),...log.rows.flatMap(row=>row.history.map(event=>event.id))]);
    if(command.type==='add' || command.type==='repeat'){
      if(log.rows.length>=200)throw new Error('This exercise has reached 200 retained sets. Start another exercise entry.');
      let reps='',weightKg='';
      if(command.type==='repeat'){
        const source=log.rows.filter(row=>row.done && !row.removedAt).at(-1);
        if(!source || source.id!==command.rowId || !equal(source,command.expected))throw new Error('The last checked set changed. Reopen the workout before repeating it.');
        reps=source.reps;weightKg=source.weightKg;
      }
      log.rows.push({id:nextId(createId,used),reps,weightKg,rpe:'',done:false,removedAt:0,history:[]});
    }else{
      const row=log.rows.find(row=>row.id===command.rowId);
      if(!row || !equal(row,command.expected))throw new Error('This set changed elsewhere. Reopen the workout before updating it.');
      if(command.type==='copy-previous'){
        const source=command.source;
        if(!emptyDraft(row) || !day(today) || ref.date>today || !safe(source) || Object.keys(source).some(key=>!['date','exerciseId','setId','expectedExercise'].includes(key)) || !day(source.date) || source.date>=ref.date || source.date>today || !id(source.exerciseId) || !id(source.setId) || typeof live.name!=='string' || !live.name.trim() || live.name!==command.expectedName)throw new Error('Choose a blank new set and an earlier recorded workout. Existing measurements are kept.');
        const previous=resolve(board,{...ref,date:source.date,exerciseId:source.exerciseId},conflicts);
        const name=value=>typeof value==='string'?value.trim().toLocaleLowerCase():'';
        const named=board.cards.find(card=>card.id===ref.cardId).fitnessEntries[source.date].parts[ref.partKey].exercises.filter(exercise=>name(exercise?.name)===name(live.name));
        if(named.length!==1 || named[0].id!==source.exerciseId || name(previous.name)!==name(live.name) || !equal(previous,source.expectedExercise))throw new Error('The past workout changed or needs review. Reopen its current record.');
        let values;
        if(Object.hasOwn(previous,'setLog')){
          if(!validLog(previous.setLog))throw new Error('The past workout changed or needs review. Reopen its current record.');
          const checked=previous.setLog.rows.find(set=>set.id===source.setId);
          if(!checked?.done || checked.removedAt || !complete(checked))throw new Error('Choose a checked set from the earlier workout. Nothing was copied.');
          values=checked;
        }else {values=source.setId==='summary'?summaryDraft(previous):null;if(!values)throw new Error('This summary has no exact weight and reps to copy. Enter your actual values.');}
        row.weightKg=values.weightKg;row.reps=values.reps;
      }else if(command.type==='edit'){
        if(row.done || row.removedAt || !safe(command.values) || Object.keys(command.values).some(key=>!['reps','weightKg','rpe'].includes(key)))throw new Error('Uncheck this set before editing its measurements.');
        Object.assign(row,copy(command.values));if(!draft(row))throw new Error('This draft is not a supported numeric entry. Nothing was changed.');
      }else{
        const action=command.type;
        if(action==='completed'){
          const values=Object.fromEntries(['reps','weightKg','rpe'].map(key=>[key,typeof row[key]==='string' && !row[key].trim()?'':Number(row[key])]));
          if(row.done || row.removedAt || !complete(values))throw new Error('Enter whole reps, weight with up to two decimals, and optional RPE 1 to 10. Use 0 kg for no external load.');
          Object.assign(row,values);row.done=true;
        }
        else if(action==='reopened'){if(!row.done || row.removedAt)throw new Error('This set is not completed.');row.done=false;}
        else if(action==='removed'){if(row.done || row.removedAt)throw new Error('Uncheck this set before removing it.');row.removedAt=now;}
        else if(action==='restored'){if(!row.removedAt)throw new Error('This set is not removed.');row.removedAt=0;}
        else throw new Error('Unsupported set change.');
        row.history.push({id:nextId(createId,used),action,at:now,reps:row.reps,weightKg:row.weightKg,rpe:row.rpe});
      }
    }
    log.updatedAt=now;
    if(!validLog(log))throw new Error('The updated set log is not valid. Nothing was changed.');
    return after;
  }
  const api=Object.freeze({validLog,stats,emptyDraft,summaryDraft,change,copy});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeFitnessSets=api;
})(typeof globalThis==='undefined'?window:globalThis);
