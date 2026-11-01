(function(root){
  'use strict';
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const safe=id=>typeof id==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(id) && !['__proto__','constructor','prototype'].includes(id);
  const day=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const time=value=>typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const stamp=value=>Number.isSafeInteger(value) && value>=0 && Number.isFinite(new Date(value).getTime());
  const keys=['calories','protein','carbs','fat','fiber'];
  function portionChoices(item){
    if(!item || typeof item.servingUnit!=='string' || !item.servingUnit.trim() || !Number.isFinite(item.servingGrams) || item.servingGrams<1)return [];
    const label=item.servingUnit.trim(),grams=/^100\s*g$/i.test(label);
    const plurals={egg:'eggs',scoop:'scoops',can:'cans',cup:'cups',portion:'portions',serving:'servings'};
    return (grams?[50,100,150]:[1,2,3]).map(amount=>({amount,unit:grams?'g':'serving',label:grams?amount+' g':amount===1?'1 '+label:plurals[label.toLowerCase()]?amount+' '+plurals[label.toLowerCase()]:amount+' × '+label}));
  }
  function validWater(record){return record && safe(record.id) && Number.isFinite(record.amountMl) && record.amountMl>0 && record.amountMl<=100000 && (record.drankTime==='' || time(record.drankTime)) && stamp(record.recordedAt) && record.recordedAt>0 && stamp(record.removedAt);}
  function waterSummary(entry){
    const water=entry?.water;
    if(water===undefined)return {records:[],totalMl:0,needsReview:false};
    if(!water || typeof water!=='object' || Array.isArray(water))return {records:[],totalMl:0,needsReview:true};
    const entries=Object.entries(water),needsReview=entries.some(([id,record])=>!validWater(record) || record.id!==id);
    const records=entries.filter(([id,record])=>validWater(record) && record.id===id && !record.removedAt).map(([,record])=>copy(record)).sort((a,b)=>a.recordedAt-b.recordedAt || a.id.localeCompare(b.id));
    const totalMl=records.reduce((sum,record)=>sum+record.amountMl,0);
    return {records,totalMl,needsReview:needsReview || !Number.isFinite(totalMl)};
  }
  function logWater(board,cardId,date,record,{today,conflicts=[]}={}){
    const card=resolve(board,cardId,'food',conflicts),before=card.foodEntries?.[date] ?? null;
    if(!day(date) || !day(today) || date>today || !validWater(record) || record.removedAt || before && !Array.isArray(before.meals) || waterSummary(before).needsReview)throw Error('Choose today or a past date, a positive amount up to 100,000 mL and a valid time. Existing water records are kept.');
    for(const entry of Object.values(card.foodEntries || {}))if(entry?.water && Object.hasOwn(entry.water,record.id)){if(entry===before && equal(entry.water[record.id],record))return null;throw Error('This drink identity already exists. Reopen the current day.');}
    const after={...copy(before || {}),meals:copy(before?.meals || []),water:{...copy(before?.water || {}),[record.id]:copy(record)},updatedAt:record.recordedAt};
    const hadContainer=Boolean(card.foodEntries);card.foodEntries ||= {};card.foodEntries[date]=after;
    return {kind:'day',boardId:board.id,cardId,key:date,before:copy(before),after:copy(after),hadContainer};
  }
  function removeWater(board,cardId,date,expected,{now=Date.now(),conflicts=[]}={}){
    const card=resolve(board,cardId,'food',conflicts),entry=card.foodEntries?.[date];
    if(!day(date) || !validWater(expected) || expected.removedAt || !stamp(now) || !now || waterSummary(entry).needsReview || !equal(entry?.water?.[expected.id],expected))throw Error('This drink changed or was removed. Reopen its current record.');
    const before=copy(entry),after={...copy(entry),water:{...copy(entry.water),[expected.id]:{...copy(expected),removedAt:now}},updatedAt:now};card.foodEntries[date]=after;
    return {kind:'day',boardId:board.id,cardId,key:date,before,after:copy(after)};
  }
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
  function convertPortion(amount,from,to,servingGrams){
    if(!Number.isFinite(amount) || amount<=0 || !['g','serving'].includes(from) || !['g','serving'].includes(to) || !Number.isFinite(servingGrams) || servingGrams<=0)throw Error('Enter a positive portion before changing units.');
    if(servingGrams<1)throw Error('This serving basis needs review. Keep its original unit.');
    const result=from===to?amount:from==='g'?amount/servingGrams:amount*servingGrams;
    if(!Number.isFinite(result) || result<=0)throw Error('This portion is too large or too small. Keep its original unit.');
    return result;
  }
  function editMeal(board,cardId,date,mealId,expected,portions,{today,now=Date.now(),conflicts=[],eatenTime,kind}={}){
    const card=resolve(board,cardId,'food',conflicts),entry=card.foodEntries?.[date],matches=(entry?.meals || []).filter(m=>m.id===mealId);
    if(!day(date) || !day(today) || date>today || !stamp(now) || !now || matches.length!==1 || !equal(matches[0],expected))throw Error('This recorded meal changed or the date is invalid. Reopen it before saving.');
    if(!Array.isArray(expected.items) || !Array.isArray(portions) || portions.length!==expected.items.length || !portions.length || new Set(expected.items.map(i=>i?.id)).size!==expected.items.length || new Set(portions.map(i=>i?.id)).size!==portions.length || portions.some(p=>!p || Object.keys(p).some(k=>!['id','amount','unit'].includes(k)) || !expected.items.some(i=>i.id===p.id)))throw Error('The recorded foods changed. Reopen this meal before saving.');
    const next=copy(expected);next.items=next.items.map(item=>{const portion=portions.find(p=>p.id===item.id);return {...item,amount:portion.amount,unit:portion.unit};});
    if(!validItems(next.items) || kind!==undefined && !['meal','snack','drink'].includes(kind) || eatenTime!==undefined && eatenTime!=='' && !time(eatenTime))throw Error('Enter positive portions and a valid meal time.');
    if(kind!==undefined && kind!==(next.kind || 'meal'))next.kind=kind;
    if(eatenTime!==undefined && eatenTime!==(next.timing?.eatenTime || '')){
      if(next.timing && !validTiming(next.timing))throw Error('This meal time needs review. Its original record is unchanged.');
      next.timing={...(next.timing || {plannedTime:'',windowMinutes:60}),eatenTime,recordedAt:next.timing?.recordedAt || now};
    }
    if(equal(next,expected))return null;
    const before=copy(entry),after={...copy(entry),meals:entry.meals.map(meal=>meal.id===mealId?next:copy(meal)),updatedAt:now};
    card.foodEntries[date]=after;
    return {kind:'day',boardId:board.id,cardId,key:date,before,after:copy(after),mealId};
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
  const api=Object.freeze({copy,equal,day,time,portionChoices,validWater,waterSummary,logWater,removeWater,validItems,validTiming,validRoutine,resolve,routines,saveRoutine,log,setTiming,convertPortion,editMeal,restore,timingStatus,progress});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeFoodDaily=api;
})(typeof globalThis==='undefined'?window:globalThis);
