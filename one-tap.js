(function(root){
  'use strict';
  const merge=typeof module==='object' && module.exports?require('./state-merge.js'):root.LifeStateMerge;
  const copy=merge.copy,equal=merge.equal,unsafe=['__proto__','prototype','constructor'];
  const object=v=>v && typeof v==='object' && !Array.isArray(v);
  const safe=v=>object(v) && !Object.keys(v).some(k=>unsafe.includes(k));
  const id=v=>typeof v==='string' && v.trim().length>0 && v.length<=200 && !unsafe.includes(v);
  const day=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const stamp=v=>Number.isSafeInteger(v) && v>0 && Number.isFinite(new Date(v).getTime());
  const text=(v,max=160)=>typeof v==='string' && Boolean(v.trim()) && v.length<=max;
  const quantity=v=>typeof v==='number' && Number.isFinite(v) && v>0 && v<=100000;
  const time=v=>v==='' || typeof v==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const moods=['Happy','Okay','Calm','Meh','Sad','Anxious','Angry'];
  const units=['g','egg','scoop','cup','portion'];
  const types=['mood','step','water','food','movement'];
  const foodChoices=[
    {id:'egg-1',name:'Egg',amount:1,unit:'egg'}, {id:'egg-2',name:'Eggs',amount:2,unit:'egg'},
    {id:'protein-1',name:'Protein powder',amount:1,unit:'scoop'}, {id:'rice-100',name:'Rice, cooked',amount:100,unit:'g'},
    {id:'chicken-100',name:'Chicken breast, cooked',amount:100,unit:'g'}, {id:'edamame-100',name:'Edamame, cooked',amount:100,unit:'g'},
    {id:'corn-100',name:'Corn, cooked',amount:100,unit:'g'}, {id:'coffee-1',name:'Coffee',amount:1,unit:'cup'}
  ];
  function json(v,depth=0){
    if(depth>24)return false;
    if(v===null || typeof v==='boolean' || typeof v==='string')return true;
    if(typeof v==='number')return Number.isFinite(v);
    if(Array.isArray(v))return v.every(x=>json(x,depth+1));
    return safe(v) && Object.values(v).every(x=>json(x,depth+1));
  }
  function validEvent(e){
    if(!safe(e) || !json(e) || e.version!==1 || !id(e.id) || !day(e.date) || !day(e.recordedDay) || e.date>e.recordedDay || !stamp(e.recordedAt) || !safe(e.data) || e.sequence!==undefined && (!Number.isSafeInteger(e.sequence) || e.sequence<1))return false;
    const p=e.data;
    if(e.kind==='mood')return moods.includes(p.value);
    if(e.kind==='step')return ['Started something','Finished a small step'].includes(p.value);
    if(e.kind==='water')return quantity(p.ml);
    if(e.kind==='food' || e.kind==='shortcut')return text(p.name) && quantity(p.amount) && units.includes(p.unit);
    if(e.kind==='movement')return ['Gym','Walk','Stretch'].includes(p.value);
    if(e.kind==='note')return (p.targetId==='' || id(p.targetId)) && typeof p.text==='string' && p.text.length<=12000 && time(p.time) && (Boolean(p.text.trim()) || p.targetId!=='' && p.time!=='');
    if(e.kind==='feedback')return ['Easier','About the same','More effort'].includes(p.value);
    if(e.kind==='preference')return ['guided','rewards'].includes(p.key) && typeof p.value==='boolean';
    if(e.kind==='undo')return id(p.targetId) && p.targetId!==e.id;
    return false;
  }
  function inspect(value){
    if(value===undefined)return {version:1,events:{}};
    if(!safe(value) || !json(value) || value.version!==1 || !safe(value.events))throw Error('These experiment records need review. Their original copy is kept.');
    for(const [key,e] of Object.entries(value.events)){
      if(!id(key) || key!==e?.id || !validEvent(e))throw Error('An experiment entry needs review. Nothing was replaced.');
      if(e.kind==='undo' || e.kind==='note' && e.data.targetId){
        const target=value.events[e.data.targetId];
        if(!target || target.kind==='undo' || target.date!==e.date || e.kind==='note' && !types.includes(target.kind))throw Error('An experiment reference needs review. Original entries are kept.');
      }
    }
    return copy(value);
  }
  const sorted=value=>Object.values(inspect(value).events).sort((a,b)=>(a.sequence || 0)-(b.sequence || 0) || a.recordedAt-b.recordedAt || a.id.localeCompare(b.id));
  function active(value){
    const rows=sorted(value),removed=new Set(rows.filter(e=>e.kind==='undo').map(e=>e.data.targetId));
    return rows.filter(e=>e.kind!=='undo' && !removed.has(e.id) && !(e.kind==='note' && e.data.targetId && removed.has(e.data.targetId)));
  }
  function record(value,event,{today}={}){
    const after=inspect(value);
    if(!day(today) || !validEvent(event) || event.recordedDay>today)throw Error('Choose today or a past day and a complete entry. Nothing was recorded.');
    if(Object.hasOwn(after.events,event.id)){
      if(equal(after.events[event.id],event))return after;
      throw Error('This entry identity already has another version. Both copies need review.');
    }
    if(event.kind==='undo' || event.kind==='note' && event.data.targetId){
      const target=after.events[event.data.targetId];
      if(!target || target.kind==='undo' || target.date!==event.date || !active(after).some(e=>e.id===target.id) || event.kind==='note' && !types.includes(target.kind))throw Error('The original entry changed or was undone. Reopen its current record.');
    }
    after.events[event.id]=copy(event);inspect(after);return after;
  }
  function summary(value,date){
    if(!day(date))throw Error('Choose a valid experiment day.');
    const live=active(value),rows=live.filter(e=>e.date===date),facts=rows.filter(e=>types.includes(e.kind));
    const latest=kind=>rows.filter(e=>e.kind===kind).at(-1) || null;
    return {rows,facts,areas:types.filter(k=>facts.some(e=>e.kind===k)),mood:latest('mood')?.data.value || '',
      waterMl:rows.filter(e=>e.kind==='water').reduce((sum,e)=>sum+e.data.ml,0),foodEntries:rows.filter(e=>e.kind==='food').length,
      movement:rows.filter(e=>e.kind==='movement').map(e=>e.data.value),starts:rows.filter(e=>e.kind==='step' && e.data.value==='Started something').length,
      finishes:rows.filter(e=>e.kind==='step' && e.data.value==='Finished a small step').length,feedback:latest('feedback')?.data.value || '',
      guided:live.filter(e=>e.kind==='preference' && e.data.key==='guided').at(-1)?.data.value ?? true,
      rewards:live.filter(e=>e.kind==='preference' && e.data.key==='rewards').at(-1)?.data.value ?? true,
      shortcuts:live.filter(e=>e.kind==='shortcut').map(e=>({id:e.id,date:e.date,...copy(e.data)}))};
  }
  function progress(value,today){
    if(!day(today))throw Error('Choose a valid comparison day.');
    const facts=active(value).filter(e=>types.includes(e.kind) && e.recordedDay<=today),dates=[...new Set(facts.map(e=>e.recordedDay))].sort();
    const days=Array.from({length:7},(_,i)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6+i);const date=d.toISOString().slice(0,10);return {date,recorded:dates.includes(date)};});
    return {days,recordedDays:dates.length,weekDays:days.filter(d=>d.recorded).length,milestone:[14,7,3,1].find(n=>dates.length>=n) || 0};
  }
  function recentFoods(value,date){
    if(!day(date))throw Error('Choose a valid experiment day.');
    const seen=new Set(),result=[];
    for(const e of active(value).slice().reverse()){
      if(e.kind!=='food' || e.date>date)continue;
      const portion={name:e.data.name,amount:e.data.amount,unit:e.data.unit},key=JSON.stringify([portion.name,portion.amount,portion.unit]);
      if(!seen.has(key)){seen.add(key);result.push(portion);}
    }
    return result;
  }
  const portions=unit=>units.includes(unit)?(unit==='g'?[50,100,150,200]:[1,2,3]):[];
  function recentWater(value,date){
    if(!day(date))throw Error('Choose a valid experiment day.');
    return [...new Set(active(value).slice().reverse().filter(e=>e.kind==='water' && e.date<=date).map(e=>e.data.ml))];
  }
  function describe(e){
    if(e.kind==='water')return e.data.ml+' mL water';
    if(e.kind==='food' || e.kind==='shortcut')return e.data.name+' - '+e.data.amount+' '+e.data.unit+(e.data.amount!==1 && e.data.unit!=='g'?'s':'');
    if(e.kind==='note')return e.data.text+(e.data.time?'\nActual time: '+e.data.time:'');
    if(e.kind==='preference')return e.data.key+': '+(e.data.value?'on':'off');
    if(e.kind==='undo')return 'Undid '+e.data.targetId;
    return e.data.value;
  }
  const api=Object.freeze({copy,equal,day,validEvent,inspect,record,active,sorted,summary,progress,recentFoods,recentWater,portions,describe,moods:Object.freeze([...moods]),types:Object.freeze([...types]),units:Object.freeze([...units]),foods:()=>copy(foodChoices)});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeOneTap=api;
})(typeof globalThis==='undefined'?window:globalThis);
