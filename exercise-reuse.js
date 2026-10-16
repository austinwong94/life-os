(function(root){
  'use strict';
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>{
    if(a===b)return true;
    if(!a || !b || typeof a!=='object' || typeof b!=='object')return false;
    return Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(key=>Object.hasOwn(b,key) && equal(a[key],b[key]));
  };
  const id=value=>typeof value==='string' && value.trim().length>0;
  const day=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const strength=['chest','back','shoulders','arms','abs','legs'];
  const names=exercises=>new Set(exercises.map(row=>row.name.trim().toLowerCase()));
  const validPart=part=>part?.active===true && Array.isArray(part.exercises) && part.exercises.every(row=>row && id(row.id) && id(row.name)) && new Set(part.exercises.map(row=>row.id)).size===part.exercises.length;
  function resolve(board,cardId,conflicts=[]){
    const cards=(board?.cards || []).filter(card=>card.id===cardId);
    if(!id(board?.id) || !id(cardId) || cards.length!==1 || cards[0].type!=='fitness' || cards[0].archivedAt)throw new Error('The workout card changed or moved. Reopen exercise reuse.');
    if(conflicts.some(row=>{const p=row.segments || [];return p[0]==='boards' && p[1]===board.id && p[2]==='cards' && p[3]===cardId;}))throw new Error('Review this workout card\'s conflicting changes before reusing exercises.');
    return cards[0];
  }
  function sources(card,partKey,targetDate){
    if(card?.type!=='fitness' || card.archivedAt || !strength.includes(partKey) || !day(targetDate))return [];
    return Object.entries(card.fitnessEntries || {}).filter(([date,entry])=>day(date) && date<targetDate && entry?.parts?.[partKey]?.active===true && entry.parts[partKey].exercises?.length)
      .sort(([a],[b])=>b.localeCompare(a)).map(([date,entry])=>({date,count:entry.parts[partKey].exercises.length,usable:Boolean(validPart(entry.parts[partKey]))}));
  }
  function create(board,cardId,partKey,sourceDate,targetDate,createId=()=>crypto.randomUUID()){
    const card=resolve(board,cardId);
    if(!strength.includes(partKey) || !day(sourceDate) || !day(targetDate) || sourceDate>=targetDate)throw new Error('Choose an earlier strength workout.');
    const source=card.fitnessEntries?.[sourceDate]?.parts?.[partKey],before=card.fitnessEntries?.[targetDate];
    if(!validPart(source) || !source.exercises.length || !validPart(before?.parts?.[partKey]))throw new Error('The source or current strength section needs review. Nothing was changed.');
    const listed=names(before.parts[partKey].exercises);
    return {boardId:board.id,cardId,partKey,sourceDate,targetDate,source:copy(source),before:copy(before),
      selectedIds:source.exercises.filter(row=>!listed.has(row.name.trim().toLowerCase())).map(row=>row.id),
      exercises:source.exercises.map(row=>({id:createId(),name:row.name,sets:'',reps:'',weightKg:'',rpe:'',notes:''}))};
  }
  function apply(board,command,{now=Date.now(),conflicts=[]}={}){
    if(board?.id!==command.boardId)throw new Error('The board changed. Reopen exercise reuse on the original board.');
    const card=resolve(board,command.cardId,conflicts),{partKey,sourceDate,targetDate}=command;
    if(!strength.includes(partKey) || !day(sourceDate) || !day(targetDate) || sourceDate>=targetDate || !Number.isFinite(now) || now<=0 || !Number.isFinite(new Date(now).getTime()))throw new Error('Choose a valid workout date.');
    const source=card.fitnessEntries?.[sourceDate]?.parts?.[partKey],before=card.fitnessEntries?.[targetDate];
    if(!validPart(source) || !validPart(before?.parts?.[partKey]) || !equal(source,command.source) || !equal(before,command.before))throw new Error('The source workout or destination day changed. Reopen the preview before adding exercises.');
    if(!Array.isArray(command.selectedIds) || !command.selectedIds.length || new Set(command.selectedIds).size!==command.selectedIds.length || command.selectedIds.some(key=>!source.exercises.some(row=>row.id===key)))throw new Error('Choose at least one exercise from this preview.');
    if(!Array.isArray(command.exercises) || command.exercises.length!==source.exercises.length || !command.exercises.every((row,i)=>row && id(row.id) && equal(row,{id:row.id,name:source.exercises[i].name,sets:'',reps:'',weightKg:'',rpe:'',notes:''})))throw new Error('The exercise preview changed. Nothing was added.');
    const existing=new Set();
    for(const entry of Object.values(card.fitnessEntries || {}))for(const part of Object.values(entry?.parts || {}))for(const row of Array.isArray(part?.exercises)?part.exercises:[])existing.add(row?.id);
    const added=command.exercises.map(row=>row.id);
    if(new Set(added).size!==added.length || added.some(key=>existing.has(key)))throw new Error('The new exercise identities are not unique. Reopen exercise reuse.');
    const after=copy(before);
    after.parts[partKey].exercises.push(...command.exercises.filter((row,i)=>command.selectedIds.includes(source.exercises[i].id)).map(copy));after.updatedAt=now;
    card.fitnessEntries[targetDate]=after;
    return {boardId:board.id,cardId:card.id,date:targetDate,before:copy(before),after:copy(after)};
  }
  function restore(board,transaction,{conflicts=[]}={}){
    if(board?.id!==transaction.boardId)throw new Error('The board changed. Undo was not applied.');
    const card=resolve(board,transaction.cardId,conflicts);
    if(!equal(card.fitnessEntries?.[transaction.date],transaction.after))throw new Error('This workout day changed again. Undo was not applied.');
    card.fitnessEntries[transaction.date]=copy(transaction.before);
    return {...transaction,before:copy(transaction.after),after:copy(transaction.before)};
  }
  const api=Object.freeze({sources,create,apply,restore});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeExerciseReuse=api;
})(typeof globalThis==='undefined'?window:globalThis);
