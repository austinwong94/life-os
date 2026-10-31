(function(root) {
  'use strict';
  const sets=typeof module==='object' && module.exports?require('./fitness-sets.js'):root.LifeFitnessSets;
  const parts=['chest','back','shoulders','arms','abs','legs'];
  const object=value=>value && typeof value==='object' && !Array.isArray(value);
  const nameKey=value=>typeof value==='string'?value.trim().toLocaleLowerCase():'';
  const validDay=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  function entries(card) {
    if(card?.type!=='fitness' || card.archivedAt || !object(card.fitnessEntries))return [];
    return Object.entries(card.fitnessEntries).filter(([date,entry])=>validDay(date) && object(entry?.parts)).sort(([a],[b])=>b.localeCompare(a));
  }
  function choices(card) {
    const found=new Map();
    for(const [,entry] of entries(card))for(const partKey of parts) {
      const part=entry.parts[partKey];if(part?.active!==true || !Array.isArray(part.exercises))continue;
      for(const exercise of part.exercises) {
        const name=nameKey(exercise?.name);if(!name)continue;
        const key=JSON.stringify([partKey,name]);if(!found.has(key))found.set(key,{key,partKey,name,label:exercise.name.trim()});
      }
    }
    return [...found.values()].sort((a,b)=>parts.indexOf(a.partKey)-parts.indexOf(b.partKey) || a.name.localeCompare(b.name));
  }
  function history(card,selection,{through,reviewPending=false}={}) {
    if(!validDay(through))throw new Error('A valid comparison date is required.');
    const rows=[];
    if(parts.includes(selection?.partKey) && nameKey(selection?.name))for(const [date,entry] of entries(card)) {
      const part=entry.parts[selection.partKey];if(part?.active!==true || !Array.isArray(part.exercises))continue;
      const matches=part.exercises.filter(exercise=>nameKey(exercise?.name)===nameKey(selection.name));if(!matches.length)continue;
      const row={date,future:date>through,mode:'ambiguous',sets:[],completed:0,active:0};
      const exercise=matches[0];
      if(matches.length===1 && typeof exercise.id==='string' && exercise.id.trim() && part.exercises.filter(item=>item?.id===exercise.id).length===1) {
        const stats=sets.stats(exercise);row.mode=stats.mode;
        if(stats.mode==='summary') {
          const fields=['sets','reps','weightKg','rpe'];
          if(fields.every(key=>exercise[key]==null || typeof exercise[key]==='string' || typeof exercise[key]==='number' && Number.isFinite(exercise[key])))row.summary=Object.fromEntries(fields.map(key=>[key,exercise[key]]));
          else row.mode='unrecognized';
        }
        if(stats.mode==='sets') {
          row.sets=exercise.setLog.rows.map((set,index)=>({id:set.id,number:index+1,reps:set.reps,weightKg:set.weightKg,rpe:set.rpe,done:set.done,removedAt:set.removedAt}));
          row.completed=stats.completed;row.active=stats.rows.length;
          const latest=row.sets.filter(set=>set.done && !set.removedAt).at(-1);if(latest)row.latest={...latest};
        }
      }
      rows.push(row);
    }
    const measured=rows.filter(row=>row.mode==='sets' && !row.future && row.completed>0);
    return {rows,reviewPending:Boolean(reviewPending),completedDays:reviewPending?null:measured.length,
      completedSets:reviewPending?null:measured.reduce((sum,row)=>sum+row.completed,0),
      latest:reviewPending?[]:measured.slice(0,2).map(row=>({date:row.date,set:{...row.latest}}))};
  }
  const api=Object.freeze({choices,history,validDay});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeExerciseHistory=api;
})(typeof globalThis==='undefined'?window:globalThis);
