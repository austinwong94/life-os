(function(root){
  'use strict';
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>{
    if(a===b)return true;
    if(!a || !b || typeof a!=='object' || typeof b!=='object')return false;
    return Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(key=>Object.hasOwn(b,key) && equal(a[key],b[key]));
  };
  const validDay=day=>typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day+'T12:00:00Z')) && new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
  const id=value=>typeof value==='string' && value.trim().length>0;
  const nutrients=['calories','protein','carbs','fat','fiber'];
  function validMeal(meal){
    return meal && id(meal.id) && typeof meal.name==='string' && meal.name.trim() && Array.isArray(meal.items) && meal.items.length>0 &&
      new Set(meal.items.map(item=>item?.id)).size===meal.items.length && meal.items.every(item=>item && id(item.id) && id(item.foodId) &&
        typeof item.name==='string' && item.name.trim() && typeof item.servingUnit==='string' && item.servingUnit.trim() &&
        ['g','serving'].includes(item.unit) && Number.isFinite(item.amount) && item.amount>=0 && Number.isFinite(item.servingGrams) && item.servingGrams>0 &&
        nutrients.every(key=>Number.isFinite(item[key]) && item[key]>=0) && nutrients.some(key=>item[key]>0));
  }
  function sources(card){
    if(card?.type!=='food' || card.archivedAt)return [];
    return Object.entries(card.foodEntries || {}).filter(([day])=>validDay(day)).sort(([a],[b])=>b.localeCompare(a)).flatMap(([date,entry])=>
      (Array.isArray(entry?.meals)?entry.meals:[]).filter(meal=>meal?.items?.length).map(meal=>({date,meal:copy(meal),usable:Boolean(validMeal(meal) && entry.meals.filter(other=>other?.id===meal.id).length===1)})));
  }
  function resolve(board,cardId,conflicts=[]){
    const cards=(board?.cards || []).filter(card=>card.id===cardId);
    if(cards.length!==1 || cards[0].type!=='food' || cards[0].archivedAt)throw new Error('This food card changed or moved. Reopen meal reuse.');
    if(conflicts.some(row=>{const p=row.segments || [];return p[0]==='boards' && p[1]===board.id && p[2]==='cards' && p[3]===cardId;}))throw new Error('Review this food card\'s conflicting changes before reusing a meal.');
    return cards[0];
  }
  function create(board,cardId,sourceDate,mealId,targetDate,createId=()=>crypto.randomUUID()){
    const card=resolve(board,cardId);
    if(!validDay(sourceDate) || !validDay(targetDate))throw new Error('Choose a valid meal date.');
    const source=sources(card).find(row=>row.date===sourceDate && row.meal.id===mealId);
    if(!source?.usable)throw new Error('This meal needs its portions or nutrition basis reviewed. The original is unchanged.');
    const before=card.foodEntries?.[targetDate] ?? null;
    if(before && !Array.isArray(before.meals))throw new Error('The destination day needs review. Nothing was changed.');
    const meal=copy(source.meal);meal.id=createId();meal.items=meal.items.map(item=>({...item,id:createId()}));
    const names=new Set((before?.meals || []).map(row=>String(row.name || '').toLowerCase())),base=meal.name;
    for(let n=2;names.has(meal.name.toLowerCase());n++)meal.name=base+' '+n;
    return {boardId:board.id,cardId,sourceDate,source:source.meal,targetDate,before:copy(before),meal};
  }
  function apply(board,command,{now=Date.now(),conflicts=[]}={}){
    if(board?.id!==command.boardId)throw new Error('The board changed. Reopen meal reuse on the original board.');
    const card=resolve(board,command.cardId,conflicts);
    if(!validDay(command.targetDate) || !validDay(command.sourceDate) || !Number.isFinite(now) || now<=0)throw new Error('Choose a valid meal date.');
    const current=sources(card).find(row=>row.date===command.sourceDate && row.meal.id===command.source.id);
    if(!current?.usable || !equal(current.meal,command.source) || !equal(card.foodEntries?.[command.targetDate] ?? null,command.before))throw new Error('The source meal or destination day changed. Reopen the preview before adding it.');
    const original=copy(command.source),meal=command.meal;
    if(!validMeal(meal) || meal.items.length!==original.items.length || !id(meal.name))throw new Error('The meal preview is invalid. Nothing was added.');
    original.id=meal.id;original.name=meal.name;original.items.forEach((item,i)=>item.id=meal.items[i].id);
    if(!equal(original,meal))throw new Error('The meal preview changed. Nothing was added.');
    const existing=new Set(Object.values(card.foodEntries || {}).flatMap(entry=>(entry.meals || []).flatMap(row=>[row.id,...(row.items || []).map(item=>item.id)])));
    const added=[meal.id,...meal.items.map(item=>item.id)];
    if(added.some(key=>!id(key) || existing.has(key)) || new Set(added).size!==added.length)throw new Error('The new meal identity is not unique. Reopen meal reuse.');
    const after={...(copy(command.before) || {}),meals:[...(copy(command.before?.meals) || []),copy(meal)],updatedAt:now};
    card.foodEntries ||= {};card.foodEntries[command.targetDate]=after;
    return {boardId:board.id,cardId:card.id,date:command.targetDate,before:copy(command.before),after:copy(after)};
  }
  function restore(board,transaction,{conflicts=[]}={}){
    if(board?.id!==transaction.boardId)throw new Error('The board changed. Undo was not applied.');
    const card=resolve(board,transaction.cardId,conflicts);
    if(!equal(card.foodEntries?.[transaction.date] ?? null,transaction.after))throw new Error('This food day changed again. Undo was not applied.');
    if(transaction.before===null)delete card.foodEntries[transaction.date];else card.foodEntries[transaction.date]=copy(transaction.before);
    return {...transaction,before:copy(transaction.after),after:copy(transaction.before)};
  }
  const api=Object.freeze({sources,create,apply,restore});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeMealReuse=api;
})(typeof globalThis==='undefined'?window:globalThis);
