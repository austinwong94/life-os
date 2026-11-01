(() => {
  'use strict';
  const D=LifeFoodDaily,weightSources=new Map(),detailStates=new Map();
  const board=()=>({id:state.activeBoardId,cards:state.cards});
  const message=error=>setSaveStatus(error.message || String(error),'error');
  function reveal(node){for(let parent=node;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'){parent.open=true;if(parent.dataset.dailyDetailsKey)detailStates.set(parent.dataset.dailyDetailsKey,true);}}
  function bindDetails(card,date,node){
    const key=JSON.stringify([state.activeBoardId,card.id,date]);node.dataset.dailyDetailsKey=key;node.open=detailStates.get(key) ?? !D.routines(card).length;let known=node.open;
    node.addEventListener('click',event=>{const summary=event.target.closest?.('summary');if(summary?.parentElement!==node)return;event.preventDefault();node.open=!node.open;known=node.open;detailStates.set(key,node.open);});
    node.addEventListener('toggle',()=>{if(node.isConnected && node.open!==known){known=node.open;detailStates.set(key,node.open);}});
  }
  function context(card,date,node){
    const boardId=state.activeBoardId,cardId=card.id;
    return ()=>{
      if(state.activeBoardId!==boardId || node && !node.isConnected)throw Error('This view changed. Reopen the original food day.');
      const live=D.resolve(board(),cardId,'food',state.syncConflicts);
      if(live.activeFoodDate!==date)throw Error('The selected food day changed. Reopen it before saving.');
      return live;
    };
  }
  function commit(tx){
    if(saveState({quiet:true}))return;
    D.restore(board(),tx);syncActiveBoard({touchBoard:false});
    throw Error('Not saved. Your existing records are unchanged. Keep this form open and retry.');
  }
  function undo(tx,label='Meal recorded.'){
    showUndoToast({message:label,onUndo:()=>{
      try{const reverse=D.restore(board(),tx,{conflicts:state.syncConflicts});if(!saveState({quiet:true})){D.restore(board(),reverse);syncActiveBoard({touchBoard:false});throw Error('Undo was not saved. Your meal is kept.');}clearUndoToast();renderCardsOnly({force:true});}catch(error){clearUndoToast();message(error);}
    }});
  }
  function library(card){
    const root=[...elements.boardGrid.querySelectorAll('.task-card')].find(n=>n.dataset.id===card.id),details=root?.querySelector('.food-library-panel');
    if(details){reveal(details);details.scrollIntoView({block:'start'});details.querySelector('summary')?.focus({preventScroll:true});}
  }
  function openDetails(card,mealId){
    card.activeFoodMealId=mealId;renderCardsOnly({force:true});
    const target=elements.boardGrid.querySelector('.task-card[data-id="'+CSS.escape(card.id)+'"] .food-time-panel');
    if(target){reveal(target);target.scrollIntoView({block:'center'});target.querySelector('input')?.focus();}
  }
  function render(card,date){
    const section=planningNode('section','food-daily');section.setAttribute('aria-label','Daily eating');
    const live=context(card,date,section),head=planningNode('div','food-daily-head'),title=planningNode('h3','','Usual meals'),notice=planningNode('p','food-daily-message daily-message');notice.setAttribute('role','status');
    const create=planningButton('Add usual meal',()=>{try{openRoutine(live(),date);}catch(e){message(e);}},'plus');head.append(title,create);section.append(head);
    const end=date>getTodayKey()?getTodayKey():date,days=D.progress(card,end),logged=days.filter(d=>d.entries>0).length;
    const currentDay=D.progress(card,date).at(-1),counts=currentDay?[currentDay.meals+' meal'+(currentDay.meals===1?'':'s'),...(currentDay.snacks?[currentDay.snacks+' snack'+(currentDay.snacks===1?'':'s')]:[]),...(currentDay.drinks?[currentDay.drinks+' drink'+(currentDay.drinks===1?'':'s')]:[])].join(' · '):'0 meals';
    const progress=planningNode('p','food-daily-progress',counts+' recorded · '+logged+' of the last 7 days logged');
    section.append(progress);
    const week=planningNode('div','food-daily-week');week.setAttribute('aria-label','Food recording in the seven days ending '+end);
    for(const row of days){const item=planningNode('span',row.entries?'is-recorded':'');item.textContent=dateKeyToLocalDate(row.date).toLocaleDateString(undefined,{weekday:'narrow'});item.title=formatReadableDateKey(row.date)+' · '+row.entries+' entries recorded';item.setAttribute('aria-label',item.title);week.append(item);}section.append(week);
    const list=planningNode('div','food-usual-list'),routines=D.routines(card);
    if(!routines.length)list.append(planningNode('p','food-daily-empty','No active usual meals.'));
    for(const routine of routines){
      const row=planningNode('div','food-usual-row'),label=planningNode('label','food-usual-check'),checkbox=document.createElement('input');checkbox.type='checkbox';
      const records=(card.foodEntries?.[date]?.meals || []).filter(m=>m.routineId===routine.id || routine.origin?.date===date && m.id===routine.origin.mealId),record=records[0];
      checkbox.checked=Boolean(record);checkbox.disabled=Boolean(record) || date>getTodayKey();checkbox.setAttribute('aria-label','Log '+routine.name);
      const content=planningNode('span','food-usual-copy');content.append(planningNode('strong','',record?.name || routine.name),planningNode('small','',(record?.items || routine.items).map(i=>i.name+' '+i.amount+' '+(i.unit==='g'?'g':i.servingUnit)).join(' · ')));
      const status=record?(record.timing?.eatenTime?'Recorded '+record.timing.eatenTime+' · '+D.timingStatus(record.timing):'Recorded · time not set'):routine.plannedTime?'Planned '+routine.plannedTime+' · ±'+routine.windowMinutes+' min':'No time target';
      content.append(planningNode('small','food-usual-status',records.length>1?'Multiple records need review':status));label.append(checkbox,content);
      checkbox.onchange=()=>{
        try{
          const current=live(),now=new Date(),time=date===getTodayKey()?String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'):'';
          const tx=D.log(board(),current.id,routine,date,getTodayKey(),time,{conflicts:state.syncConflicts});
          commit(tx);current.activeFoodMealId=tx.mealId;renderCardsOnly({force:true});undo(tx);
        }catch(error){checkbox.checked=Boolean(record);notice.textContent=error.message;message(error);}
      };
      const edit=planningButton('',()=>{try{openRoutine(live(),date,routine);}catch(e){message(e);}},'pencil');edit.title='Edit usual meal '+routine.name;edit.setAttribute('aria-label',edit.title);
      row.append(label,edit);if(record){const timeButton=planningButton('',()=>{try{openRecorded(live(),date,record);}catch(e){message(e);}},'chevron-right');timeButton.title='Open recorded meal '+routine.name;timeButton.setAttribute('aria-label',timeButton.title);row.append(timeButton);}list.append(row);
    }
    section.append(list,notice);
    if(date>getTodayKey())notice.textContent='Future date. Usual meals have not been recorded as eaten.';
    else if(Object.values(card.foodRoutines || {}).some(r=>!D.validRoutine(r)))notice.textContent='Some usual meals need review. Their original records are kept.';
    const actions=planningNode('div','food-daily-actions');actions.append(planningButton('Weight',()=>{try{openWeight(live(),date);}catch(e){message(e);}},'bar-chart'),planningButton('Food library',()=>{try{library(live());}catch(e){message(e);}},'utensils'));
    const entry=card.foodEntries?.[date],active=entry?.meals?.find(m=>m.id===card.activeFoodMealId);
    if(active?.items?.length && !active.routineId && !D.routines(card).some(r=>r.origin?.date===date && r.origin.mealId===active.id))actions.append(planningButton('Save current meal as usual',()=>{try{openRoutine(live(),date,null,active);}catch(e){message(e);}},'plus'));
    section.append(actions);
    const archived=Object.values(card.foodRoutines || {}).filter(r=>D.validRoutine(r) && r.archivedAt);
    if(archived.length){const details=planningNode('details','food-usual-archive');details.append(planningNode('summary','','Archived usual meals ('+archived.length+')'));for(const routine of archived)details.append(planningButton('Restore '+routine.name,()=>{try{const current=live(),tx=D.saveRoutine(board(),current.id,routine,{...D.copy(routine),archivedAt:0},{conflicts:state.syncConflicts});commit(tx);renderCardsOnly({force:true});}catch(error){notice.textContent=error.message;message(error);}},'rotate-ccw'));section.append(details);}
    const fitness=state.cards.filter(c=>c.type==='fitness' && !c.archivedAt),selected=fitness.length===1?fitness[0]:fitness.find(c=>c.id===weightSources.get(JSON.stringify([state.activeBoardId,card.id])));
    if(selected && state.cards.filter(c=>c.id===selected.id).length===1){const weights=Object.entries(selected.fitnessEntries || {}).filter(([d,e])=>D.day(d) && d<=date && Number(e?.metrics?.weightKg)>0).sort(([a],[b])=>b.localeCompare(a));if(weights.length){let text='Weight: '+weights[0][1].metrics.weightKg+' kg · '+formatReadableDateKey(weights[0][0]);if(weights.length>1){const change=Number(weights[0][1].metrics.weightKg)-Number(weights[1][1].metrics.weightKg);text+=' · '+(change>0?'+':'')+change.toFixed(2)+' kg since '+formatReadableDateKey(weights[1][0]);}section.append(planningNode('p','food-weight-recent',text));}}
    return section;
  }
  function openRoutine(card,date,original=null,source=null){
    const dialog=dailyDialog(original?'Edit usual meal':'Add usual meal');dialog.classList.add('food-routine-dialog');
    const live=context(card,date,dialog),before=D.copy(original),now=Date.now(),draft=original?D.copy(original):{id:createId(),name:source?.name || '',kind:source?.kind || 'meal',items:D.copy(source?.items || []),plannedTime:source?.timing?.plannedTime || '',windowMinutes:source?.timing?.windowMinutes || 60,createdAt:now,updatedAt:now,archivedAt:0};
    if(source && !original)draft.origin={date,mealId:source.id};
    const form=planningNode('form','daily-form'),status=planningNode('p','daily-message');status.setAttribute('role','status');
    const name=document.createElement('input');name.type='text';name.maxLength=64;name.required=true;name.value=draft.name;
    const kind=planningSelect([['meal','Meal'],['snack','Snack'],['drink','Drink']],draft.kind || 'meal',()=>{});
    const planned=document.createElement('input');planned.type='time';planned.value=draft.plannedTime;
    const windowSelect=planningSelect([15,30,60,90,120,180].map(n=>[String(n),'± '+n+' min']),String(draft.windowMinutes),()=>{});
    const picker=planningSelect([['','Choose food'],...card.foodLibrary.map(f=>[f.id,f.name])],'',()=>{}),items=planningNode('div','food-routine-items');
    const draw=()=>{
      items.replaceChildren();
      for(const item of draft.items){
        const row=planningNode('div','food-routine-item'),heading=planningNode('div','food-routine-item-name');
        heading.append(planningNode('strong','',item.name),planningNode('small','',item.calories+' kcal per '+item.servingUnit+' ('+item.servingGrams+' g)'),planningNode('small','',item.source));
        const quantity=document.createElement('input');quantity.type='number';quantity.min='0';quantity.step='any';quantity.inputMode='decimal';quantity.value=item.amount;quantity.required=true;quantity.setAttribute('aria-label',item.name+' portion');quantity.oninput=()=>{item.amount=quantity.value===''?'':Number(quantity.value);};
        const unit=planningSelect([['g','g'],['serving',item.servingUnit]],item.unit,value=>{try{const amount=D.convertPortion(item.amount,item.unit,value,item.servingGrams);item.amount=amount;item.unit=value;quantity.value=amount;status.textContent='';}catch(error){unit.value=item.unit;status.textContent=error.message;}});unit.setAttribute('aria-label',item.name+' unit');
        const remove=planningButton('',()=>{draft.items=draft.items.filter(i=>i!==item);draw();},'trash-2');remove.title='Remove '+item.name+' from usual meal';remove.setAttribute('aria-label',remove.title);
        row.append(heading,quantity,unit,remove);items.append(row);
        if(FOOD_NUTRIENT_KEYS.every(key=>item[key]===0)){const label=planningNode('label','food-zero-confirm'),check=document.createElement('input');check.type='checkbox';check.checked=item.zeroNutritionConfirmed===true;check.onchange=()=>item.zeroNutritionConfirmed=check.checked;label.append(check,planningNode('span','','Zero nutrition checked for '+item.name));row.append(label);}
      }
    };
    const add=planningButton('Add food',()=>{
      try{const current=live(),food=current.foodLibrary.find(f=>f.id===picker.value);if(!food)throw Error('Choose a food first.');draft.items.push({id:createId(),foodId:food.id,amount:food.servingUnit==='100g'?100:1,unit:food.servingUnit==='100g'?'g':'serving',...createFoodItemSnapshot(food)});draw();status.textContent='';}catch(error){status.textContent=error.message;}
    },'plus');
    const foodPick=planningNode('div','food-routine-pick');foodPick.append(planningField('Food',picker),add);
    const save=planningButton('Save usual meal',null,'check');save.type='submit';save.classList.add('is-primary');
    const buttons=planningNode('div','daily-actions');buttons.append(planningButton('Cancel',()=>dialog.close()),save);
    form.append(planningField('Meal name',name),planningField('Entry type',kind),planningField('Planned time (optional)',planned),planningField('Your timing window',windowSelect),foodPick,items,status,buttons);
    if(original){
      const confirm=planningNode('div','food-routine-archive');confirm.hidden=true;confirm.append(planningNode('p','','Archive this usual meal? Its recorded meals stay unchanged.'));
      const archive=planningButton('Archive usual meal',()=>confirm.hidden=false,'archive');
      confirm.append(planningButton('Keep meal',()=>confirm.hidden=true),planningButton('Confirm archive',()=>{
        try{const current=live(),tx=D.saveRoutine(board(),current.id,before,{...D.copy(original),archivedAt:Date.now()},{conflicts:state.syncConflicts});commit(tx);dialog.close();renderCardsOnly({force:true});}catch(error){status.textContent=error.message;}
      },'archive'));form.append(archive,confirm);
    }
    form.onsubmit=event=>{
      event.preventDefault();try{const current=live(),tx=D.saveRoutine(board(),current.id,before,{...draft,name:name.value.trim(),kind:kind.value,plannedTime:planned.value,windowMinutes:Number(windowSelect.value)},{conflicts:state.syncConflicts});commit(tx);dialog.close();renderCardsOnly({force:true});}catch(error){status.textContent=error.message;}
    };
    dialog.append(form);draw();name.focus();
  }
  function openRecorded(card,date,meal){
    const dialog=dailyDialog('Edit recorded meal');dialog.classList.add('food-recorded-dialog');
    const live=context(card,date,dialog),expected=D.copy(meal),draft=D.copy(meal),form=planningNode('form','daily-form'),status=planningNode('p','daily-message');status.setAttribute('role','status');
    const heading=planningNode('div','food-recorded-heading');heading.append(planningNode('h3','',meal.name),planningNode('p','',formatReadableDateKey(date)));
    const totals=planningNode('div','food-recorded-totals');totals.setAttribute('aria-live','polite');
    const updateTotals=()=>{totals.replaceChildren(renderFoodMealSummary(getFoodMealTotals(card,draft)));};
    const items=planningNode('div','food-recorded-items');
    for(const item of draft.items || []){
      const row=planningNode('div','food-recorded-item'),label=planningNode('label','food-recorded-portion');label.append(planningNode('span','',item.name));
      const input=document.createElement('input');input.type='number';input.inputMode='decimal';input.min='0';input.step='any';input.required=true;input.value=item.amount;input.setAttribute('aria-label',item.name+' portion');
      input.oninput=()=>{item.amount=input.value===''?'':Number(input.value);updateTotals();};label.append(input);
      const unit=planningSelect([['g','g'],['serving',item.servingUnit]],item.unit,value=>{try{const amount=D.convertPortion(item.amount,item.unit,value,item.servingGrams);item.amount=amount;item.unit=value;input.value=amount;status.textContent='';updateTotals();}catch(error){unit.value=item.unit;status.textContent=error.message;}});unit.setAttribute('aria-label',item.name+' unit');
      row.append(label,planningField('Unit',unit));unit.setAttribute('aria-label',item.name+' unit');items.append(row);
    }
    const eaten=document.createElement('input');eaten.type='time';eaten.value=meal.timing?.eatenTime || '';
    const kind=planningSelect([['meal','Meal'],['snack','Snack'],['drink','Drink']],meal.kind || 'meal',()=>{});
    const timing=planningNode('div','food-recorded-time');timing.append(planningField('Eaten at',eaten),planningField('Entry type',kind));
    const save=planningButton('Save recorded meal',null,'check');save.type='submit';save.classList.add('is-primary');
    const actions=planningNode('div','daily-actions');actions.append(planningButton('Cancel',()=>dialog.close()),save);
    const more=planningButton('Meal details',()=>{try{const current=live();if(!D.equal(draft.items,expected.items) || eaten.value!==(expected.timing?.eatenTime || '') || kind.value!==(expected.kind || 'meal'))throw Error('Save or cancel these changes before opening meal details.');dialog.close();openDetails(current,meal.id);}catch(error){status.textContent=error.message;}},'utensils');
    const basis=planningNode('details','food-recorded-basis');basis.append(planningNode('summary','','Nutrition basis'));for(const item of meal.items || [])basis.append(planningNode('p','',item.name+' · '+item.calories+' kcal per '+item.servingUnit+' ('+item.servingGrams+' g) · '+item.source));
    form.append(heading,totals,items,timing,status,actions,more,basis);form.onsubmit=event=>{
      event.preventDefault();try{const current=live(),tx=D.editMeal(board(),current.id,date,meal.id,expected,draft.items.map(i=>({id:i.id,amount:i.amount,unit:i.unit})),{today:getTodayKey(),conflicts:state.syncConflicts,eatenTime:eaten.value,kind:kind.value});if(tx)commit(tx);dialog.close();if(tx){renderCardsOnly({force:true});undo(tx,'Recorded meal updated.');}}catch(error){status.textContent=error.message;}
    };
    dialog.append(form);updateTotals();form.querySelector('input')?.focus();
  }
  function times(card,date,meal){
    const details=planningNode('details','food-time-panel'),summary=planningNode('summary');
    const current=meal.timing;
    summary.textContent=current?.eatenTime?'Eaten '+current.eatenTime+' · '+D.timingStatus(current):'Meal time · not recorded';details.append(summary);
    const live=context(card,date,details),expected=D.copy(meal),form=planningNode('form','food-time-form'),status=planningNode('p','daily-message');status.setAttribute('role','status');
    const eaten=document.createElement('input');eaten.type='time';eaten.value=current?.eatenTime || '';
    const planned=document.createElement('input');planned.type='time';planned.value=current?.plannedTime || '';
    const windowSelect=planningSelect([15,30,60,90,120,180].map(n=>[String(n),'± '+n+' min']),String(current?.windowMinutes || 60),()=>{});
    const kind=planningSelect([['meal','Meal'],['snack','Snack'],['drink','Drink']],meal.kind || 'meal',()=>{});
    const save=planningButton('Save time',null,'check');save.type='submit';
    form.append(planningField('Eaten at',eaten),planningField('Planned time',planned),planningField('Timing window',windowSelect),planningField('Entry type',kind),save,status);
    form.onsubmit=event=>{
      event.preventDefault();try{const current=live();if(date>getTodayKey())throw Error('Record eating on today or a past date.');const tx=D.setTiming(board(),current.id,date,meal.id,expected,{...(meal.timing || {}),eatenTime:eaten.value,plannedTime:planned.value,windowMinutes:Number(windowSelect.value),recordedAt:Date.now()},{conflicts:state.syncConflicts,kind:kind.value});commit(tx);renderCardsOnly({force:true});}catch(error){status.textContent=error.message;}
    };
    details.append(form);return details;
  }
  function openWeight(card,date){
    const dialog=dailyDialog('Record weight');dialog.classList.add('food-weight-dialog');const live=context(card,date,dialog);
    const logs=state.cards.filter(c=>c.type==='fitness' && !c.archivedAt),form=planningNode('form','daily-form'),status=planningNode('p','daily-message');status.setAttribute('role','status');
    if(!logs.length){dialog.append(planningNode('p','','No Fitness Log on this board yet.'),planningButton('Add Fitness Log',()=>{dialog.close();openHealthLogComposer('fitness');},'plus'));return;}
    const key=JSON.stringify([state.activeBoardId,card.id]),selection=logs.length===1?logs[0].id:weightSources.get(key) || '';
    const input=document.createElement('input');input.type='number';input.inputMode='decimal';input.step='0.01';input.min='0.01';input.required=true;
    let expected=null,sourceId='',dirty=false;
    const source=planningSelect([['','Choose Fitness Log'],...logs.map(c=>[c.id,c.title])],selection,()=>{
      if(dirty){source.value=sourceId;status.textContent='Save or cancel this weight before changing logs.';return;}choose();
    });
    const choose=()=>{
      sourceId=source.value;status.textContent='';const log=logs.find(c=>c.id===sourceId);expected=D.copy(log?.fitnessEntries?.[date] ?? null);input.value=expected?.metrics?.weightKg ?? '';weightSources.set(key,sourceId);
      const records=Object.entries(log?.fitnessEntries || {}).filter(([d,e])=>D.day(d) && d<=date && Number(e?.metrics?.weightKg)>0).sort(([a],[b])=>b.localeCompare(a));
      recent.textContent=records.slice(0,2).map(([d,e],i)=>(i?'Previous: ':'Latest: ')+e.metrics.weightKg+' kg · '+formatReadableDateKey(d)).join(' · ') || 'No weight recorded in this log yet.';
    };
    const recent=planningNode('p','food-weight-recent');input.oninput=()=>dirty=true;
    const save=planningButton('Save weight',null,'check');save.type='submit';save.classList.add('is-primary');
    form.append(planningNode('p','daily-muted',formatReadableDateKey(date)),planningField('Fitness Log',source),recent,planningField('Weight (kg)',input),status,save);
    form.onsubmit=event=>{
      event.preventDefault();try{
        live();if(date>getTodayKey() || !/^(?:\d+)(?:\.\d{1,2})?$/.test(input.value) || !(Number(input.value)>0) || !Number.isFinite(Number(input.value)))throw Error('Enter a positive weight with up to two decimal places for today or a past date.');
        const log=D.resolve(board(),sourceId,'fitness',state.syncConflicts),before=log.fitnessEntries?.[date] ?? null;
        if(!D.equal(before,expected))throw Error('This weight entry changed. Reopen it before saving.');
        const next=normalizeFitnessEntry({...D.copy(before || {}),metrics:{...D.copy(before?.metrics || {}),weightKg:Number(input.value)},updatedAt:Date.now()});log.fitnessEntries ||= {};log.fitnessEntries[date]=next;
        if(!saveState({quiet:true})){if(before===null)delete log.fitnessEntries[date];else log.fitnessEntries[date]=before;syncActiveBoard({touchBoard:false});throw Error('Not saved. Your previous weight is unchanged. Keep this form open and retry.');}
        dialog.close();renderCardsOnly({force:true});
      }catch(error){status.textContent=error.message;}
    };
    dialog.append(form);choose();if(sourceId)input.focus();else source.focus();
  }
  window.LifeFoodDailyUI=Object.freeze({render,times,bindDetails});
})();
