(function(root){
  'use strict';
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const safe=id=>typeof id==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(id) && !['__proto__','constructor','prototype'].includes(id);
  const day=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const time=value=>typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const stamp=value=>Number.isSafeInteger(value) && value>=0 && Number.isFinite(new Date(value).getTime());
  const keys=['calories','protein','carbs','fat','fiber'];
  function validItems(items){
    return Array.isArray(items) && items.length>0 && new Set(items.map(i=>i?.id)).size===items.length && items.every(i=>i && safe(i.id) && typeof i.foodId==='string' && i.foodId.trim() && typeof i.name==='string' && i.name.trim() && typeof i.servingUnit==='string' && i.servingUnit.trim() && Number.isFinite(i.servingGrams) && i.servingGrams>0 && typeof i.source==='string' && Number.isFinite(i.amount) && i.amount>0 && ['g','serving'].includes(i.unit) && keys.every(k=>Number.isFinite(i[k]) && i[k]>=0) && (keys.some(k=>i[k]>0) || i.zeroNutritionConfirmed===true));
  }
  function validTiming(value){
    return value && typeof value==='object' && !Array.isArray(value) && (value.eatenTime==='' || time(value.eatenTime)) && (value.plannedTime==='' || time(value.plannedTime)) && Number.isInteger(value.windowMinutes) && value.windowMinutes>=15 && value.windowMinutes<=180 && stamp(value.recordedAt);
  }
  function validRoutine(value){
    return value && safe(value.id) && typeof value.name==='string' && value.name.trim().length>0 && value.name.length<=64 && (!value.kind || ['meal','snack','drink'].includes(value.kind)) && (!value.origin || day(value.origin.date) && typeof value.origin.mealId==='string' && value.origin.mealId.trim()) && validItems(value.items) && (value.plannedTime==='' || time(value.plannedTime)) && Number.isInteger(value.windowMinutes) && value.windowMinutes>=15 && value.windowMinutes<=180 && stamp(value.createdAt) && stamp(value.updatedAt) && stamp(value.archivedAt);
  }
  function resolve(board,cardId,type='food',conflicts=[]){
    const matches=(board?.cards || []).filter(c=>c.id===cardId);
    if(matches.length!==1 || matches[0].type!==type || matches[0].archivedAt)throw Error('This log changed, moved or was archived. Reopen it before saving.');
    if(conflicts.some(c=>{const p=c.segments || [];return p[0]==='boards' && p[1]===board.id && ['cards','archivedCards'].includes(p[2]) && p[3]===cardId;}))throw Error('Review this log\'s conflicting changes before saving.');
    return matches[0];
  }
  function routines(card){return Object.values(card?.foodRoutines || {}).filter(r=>validRoutine(r) && !r.archivedAt);}
  function saveRoutine(board,cardId,expected,routine,{now=Date.now(),conflicts=[]}={}){
    const card=resolve(board,cardId,'food',conflicts);
    if(!validRoutine(routine) || !stamp(now) || !now)throw Error('Add foods with positive portions and a valid nutrition basis.');
    if(card.foodRoutines && (typeof card.foodRoutines!=='object' || Array.isArray(card.foodRoutines)))throw Error('The usual meals need review. Nothing was changed.');
    const before=card.foodRoutines?.[routine.id] ?? null;
    if(!equal(before,expected))throw Error('This usual meal changed. Reopen it before saving.');
    const after={...copy(routine),updatedAt:now};
    const hadContainer=Boolean(card.foodRoutines);card.foodRoutines ||= {};card.foodRoutines[routine.id]=after;
    return {kind:'routine',boardId:board.id,cardId,key:routine.id,before:copy(before),after:copy(after),hadContainer};
  }
  function log(board,cardId,expected,date,today,eatenTime,{now=Date.now(),conflicts=[]}={}){
    const card=resolve(board,cardId,'food',conflicts),routine=card.foodRoutines?.[expected?.id];
    if(!validRoutine(routine) || routine.archivedAt || !equal(routine,expected))throw Error('This usual meal changed. Reopen it before logging.');
    if(!day(date) || !day(today) || date>today || !stamp(now) || !now || eatenTime!=='' && !time(eatenTime))throw Error('Choose today or a past date and a valid meal time.');
    if(date!==today && eatenTime!=='')throw Error('For a past meal, enter its actual time after logging.');
    const before=card.foodEntries?.[date] ?? null;
    if(before && !Array.isArray(before.meals))throw Error('This food day needs review. Nothing was logged.');
    const id='usual-'+date+'-'+routine.id;
    if((before?.meals || []).some(m=>m.routineId===routine.id || m.id===id || routine.origin?.date===date && m.id===routine.origin.mealId))throw Error('Already logged for this day. Open the recorded meal to edit it.');
    const items=copy(routine.items).map((item,i)=>({...item,id:id+'-'+i}));
    const ids=new Set(Object.values(card.foodEntries || {}).flatMap(e=>(e.meals || []).flatMap(m=>[m.id,...(m.items || []).map(i=>i.id)])));
    if([id,...items.map(i=>i.id)].some(key=>ids.has(key)))throw Error('This meal identity needs review. Nothing was logged.');
    const meal={id,name:routine.name,kind:routine.kind || 'meal',items,routineId:routine.id,timing:{plannedTime:routine.plannedTime,eatenTime,windowMinutes:routine.windowMinutes,recordedAt:now}};
    const after={...copy(before || {}),meals:[...copy(before?.meals || []),meal],updatedAt:now};
    const hadContainer=Boolean(card.foodEntries);card.foodEntries ||= {};card.foodEntries[date]=after;
    return {kind:'day',boardId:board.id,cardId,key:date,before:copy(before),after:copy(after),mealId:id,hadContainer};
  }
  function setTiming(board,cardId,date,mealId,expected,timing,{now=Date.now(),conflicts=[],kind}={}){
    const card=resolve(board,cardId,'food',conflicts),entry=card.foodEntries?.[date],matches=(entry?.meals || []).filter(m=>m.id===mealId);
    if(!day(date) || !validTiming(timing) || !stamp(now) || !now || kind!==undefined && !['meal','snack','drink'].includes(kind) || matches.length!==1 || !equal(matches[0],expected))throw Error('This meal changed or the time is invalid. Reopen it before saving.');
    const before=copy(entry);matches[0].timing=copy(timing);if(kind!==undefined)matches[0].kind=kind;entry.updatedAt=now;
    return {kind:'day',boardId:board.id,cardId,key:date,before,after:copy(entry)};
  }
  function restore(board,tx,{conflicts=[]}={}){
    if(board?.id!==tx.boardId)throw Error('The board changed. Undo was not applied.');
    if(tx.kind==='routine'?!safe(tx.key):tx.kind==='day'?!day(tx.key):true)throw Error('Invalid undo target. Nothing was changed.');
    const card=resolve(board,tx.cardId,'food',conflicts),key=tx.kind==='routine'?'foodRoutines':tx.kind==='day'?'foodEntries':'';
    if(!key || !equal(card[key]?.[tx.key] ?? null,tx.after))throw Error('This record changed again. Undo was not applied.');
    const hadContainer=Boolean(card[key]);
    if(tx.before===null){if(card[key])delete card[key][tx.key];if(tx.hadContainer===false && Object.keys(card[key] || {}).length===0)delete card[key];}
    else {card[key] ||= {};card[key][tx.key]=copy(tx.before);}
    return {...copy(tx),before:copy(tx.after),after:copy(tx.before),hadContainer};
  }
  function timingStatus(timing){
    if(!validTiming(timing) || !timing.eatenTime)return 'Time not recorded';
    if(!timing.plannedTime)return 'No time target';
    const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
    const difference=minutes(timing.eatenTime)-minutes(timing.plannedTime);
    return Math.abs(difference)<=timing.windowMinutes?'Within your window':difference>0?'Later than planned':'Earlier than planned';
  }
  function progress(card,end){
    if(!day(end))return [];
    const start=new Date(end+'T12:00:00Z');
    return Array.from({length:7},(_,i)=>{
      const date=new Date(start);date.setUTCDate(date.getUTCDate()-6+i);const key=date.toISOString().slice(0,10);
      const source=card.foodEntries?.[key]?.meals;
      const meals=(Array.isArray(source)?source:[]).filter(m=>Array.isArray(m?.items) && m.items.some(item=>Number(item?.amount)>0));
      return {date:key,entries:meals.length,meals:meals.filter(m=>!m.kind || m.kind==='meal').length,snacks:meals.filter(m=>m.kind==='snack').length,drinks:meals.filter(m=>m.kind==='drink').length,timed:meals.filter(m=>validTiming(m.timing) && m.timing.eatenTime).length,onTime:meals.filter(m=>timingStatus(m.timing)==='Within your window').length};
    });
  }
  const api=Object.freeze({copy,equal,day,time,validItems,validTiming,validRoutine,resolve,routines,saveRoutine,log,setTiming,restore,timingStatus,progress});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeFoodDaily=api;
})(typeof globalThis==='undefined'?window:globalThis);
