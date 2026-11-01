(() => {
  'use strict';
  const D=LifeFoodDaily,weightSources=new Map(),detailStates=new Map(),reviewStates=new Map();
  const board=()=>({id:state.activeBoardId,cards:state.cards});
  const message=error=>setSaveStatus(error.message || String(error),'error');
  function reveal(node){for(let parent=node;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'){parent.open=true;if(parent.dataset.dailyDetailsKey)detailStates.set(parent.dataset.dailyDetailsKey,true);}}
  function bindDetails(card,date,node,options={}){
    const boardId=state.activeBoardId,mode=state.ui.workspaceMode,key=JSON.stringify(options.detailId?[boardId,card.id,date,options.detailId]:[boardId,card.id,date]);
    const current=()=>node.isConnected && state.activeBoardId===boardId && state.ui.workspaceMode===mode;
    node.dataset.dailyDetailsKey=key;node.open=detailStates.get(key) ?? (options.defaultOpen ?? !D.routines(card).length);let known=node.open;
    node.addEventListener('click',event=>{const summary=event.target.closest?.('summary');if(summary?.parentElement!==node)return;event.preventDefault();if(!current())return;node.open=!node.open;known=node.open;detailStates.set(key,node.open);});
    node.addEventListener('toggle',()=>{if(current() && node.open!==known){known=node.open;detailStates.set(key,node.open);}});
  }
  function context(card,date,node){
    const boardId=state.activeBoardId,cardId=card.id;
    return ()=>{
      if(state.activeBoardId!==boardId || node && (!node.isConnected || node.closest('dialog')?.open===false))throw Error('This view changed. Reopen the original food day.');
      const live=D.resolve(board(),cardId,'food',state.syncConflicts);
      if(live.activeFoodDate!==date)throw Error('The selected food day changed. Reopen it before saving.');
      return live;
    };
  }
  function commit(tx){
    try{if(saveState({quiet:true}))return;}catch{}
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
  function requireRecordedMeal(card,date,expected){
    const matches=(card.foodEntries?.[date]?.meals || []).filter(meal=>meal?.id===expected.id);
    if(matches.length!==1 || !D.equal(matches[0],expected))throw Error('This recorded meal changed or was removed. Reopen its current record.');
  }
  function portions(item,{input,unit,onApply,onError=message}){
    const root=planningNode('div','food-tap-portions');root.setAttribute('role','group');root.setAttribute('aria-label',item.name+' quick portions');
    const choices=D.portionChoices(item),buttons=[];
    const apply=(amount,nextUnit)=>{
      if(!root.isConnected)return;
      try{onApply(amount,nextUnit);input.value=amount;unit.value=nextUnit;refresh();}catch(error){onError(error);}
    };
    const minus=planningButton('-',()=>{const amount=Number(input.value),step=unit.value==='g'?25:1;if(amount>step)apply(amount-step,unit.value);});minus.classList.add('food-portion-decrease');minus.setAttribute('aria-label','Decrease '+item.name+' portion');minus.title=minus.getAttribute('aria-label');
    const plus=planningButton('',()=>{const amount=Number(input.value),step=unit.value==='g'?25:1;if(input.value!=='' && Number.isFinite(amount) && amount>0 && Number.isFinite(amount+step))apply(amount+step,unit.value);},'plus');plus.setAttribute('aria-label','Increase '+item.name+' portion');plus.title=plus.getAttribute('aria-label');
    for(const choice of choices){const button=planningButton(choice.label,()=>apply(choice.amount,choice.unit));button.setAttribute('aria-label',item.name+': '+choice.label);buttons.push([button,choice]);root.append(button);}
    if(choices.length){const steps=planningNode('div','food-tap-steps');steps.append(minus,plus);root.append(steps);}
    function refresh(){const amount=Number(input.value),valid=input.value!=='' && Number.isFinite(amount) && amount>0;for(const [button,choice] of buttons)button.setAttribute('aria-pressed',String(valid && unit.value===choice.unit && amount===choice.amount));minus.disabled=!valid || amount<=(unit.value==='g'?25:1);plus.disabled=!valid || !Number.isFinite(amount+(unit.value==='g'?25:1));}
    input.addEventListener('input',refresh);unit.addEventListener('change',refresh);refresh();
    return root;
  }
  function portionBasis(item){const basis=/^100\s*g$/i.test(item.servingUnit)?item.servingUnit+' food':'1 '+item.servingUnit+' = '+item.servingGrams+' g '+(/^scoop$/i.test(item.servingUnit)?'powder':'food');return 'Saved basis: '+basis+' · '+item.protein+' g protein · '+item.calories+' kcal'+(/default|generic/i.test(item.source || '')?' · Estimate: check your product label.':'');}
  function itemPortions(card,date,meal,item,input,unit,node){
    const live=context(card,date,node);let expected=D.copy(meal);
    // Manual typing uses the existing editor; refresh only after its own input handler.
    input.addEventListener('input',()=>{try{const current=live();expected=D.copy(current.foodEntries?.[date]?.meals?.find(m=>m.id===meal.id));}catch{}});
    return portions(item,{input,unit,onApply:(amount,nextUnit)=>{
      const current=live();requireRecordedMeal(current,date,expected);
      const tx=D.editMeal(board(),current.id,date,meal.id,expected,expected.items.map(i=>({id:i.id,amount:i.id===item.id?amount:i.amount,unit:i.id===item.id?nextUnit:i.unit})),{today:getTodayKey(),conflicts:state.syncConflicts});
      if(tx){commit(tx);renderCardsOnly({force:true});undo(tx,'Portion updated.');}
    }});
  }
  function water(card,date){
    const section=planningNode('section','food-water');section.setAttribute('aria-label','Water check-ins');const live=context(card,date,section),summary=D.waterSummary(card.foodEntries?.[date]),notice=planningNode('p','daily-message');notice.setAttribute('role','status');
    const head=planningNode('div','food-daily-head');head.append(planningNode('h3','','Water'),planningNode('span','food-water-total',summary.needsReview?'Records need review':summary.totalMl+' mL · '+summary.records.length+' drink'+(summary.records.length===1?'':'s')));section.append(head);
    const add=(amountMl,drankTime)=>{
      const current=live(),now=new Date(),record={id:createId(),amountMl,drankTime:drankTime ?? (date===getTodayKey()?String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'):''),recordedAt:now.getTime(),removedAt:0};
      const tx=D.logWater(board(),current.id,date,record,{today:getTodayKey(),conflicts:state.syncConflicts});if(tx){commit(tx);renderCardsOnly({force:true});undo(tx,'Water recorded.');}return tx;
    };
    const actions=planningNode('div','food-water-actions'),amounts=[250,350,500],last=summary.records.at(-1)?.amountMl;if(last && !amounts.includes(last))amounts.push(last);
    for(const amount of amounts){const button=planningButton(amount+' mL',()=>{try{add(amount);}catch(error){notice.textContent=error.message;message(error);}},'plus');button.setAttribute('aria-label','Log '+amount+' mL water');button.disabled=date>getTodayKey() || summary.needsReview;actions.append(button);}
    const custom=planningButton('Custom',()=>{
      try{live();const dialog=dailyDialog('Record water');dialog.classList.add('food-water-dialog');const check=context(card,date,dialog),form=planningNode('form','daily-form'),status=planningNode('p','daily-message');status.setAttribute('role','status');
        const amount=document.createElement('input');amount.type='number';amount.inputMode='decimal';amount.min='0.01';amount.max='100000';amount.step='any';amount.required=true;
        const drank=document.createElement('input');drank.type='time';const now=new Date();drank.value=date===getTodayKey()?String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'):'';
        const save=planningButton('Record drink',null,'check');save.type='submit';save.classList.add('is-primary');const buttons=planningNode('div','daily-actions');buttons.append(planningButton('Cancel',()=>dialog.close()),save);
        form.append(planningNode('p','daily-muted',formatReadableDateKey(date)),planningField('Water (mL)',amount),planningField('Drank at (optional)',drank),status,buttons);form.onsubmit=event=>{event.preventDefault();try{check();add(Number(amount.value),drank.value);dialog.close();}catch(error){status.textContent=error.message;}};dialog.append(form);amount.focus();
      }catch(error){notice.textContent=error.message;}
    });custom.disabled=date>getTodayKey() || summary.needsReview;actions.append(custom);section.append(actions,notice);
    if(summary.needsReview)notice.textContent='Original water records are kept. Review their format before adding more.';
    if(summary.records.length){const history=planningNode('details','food-water-history');history.append(planningNode('summary','','Drink history ('+summary.records.length+')'));for(const record of summary.records){
      const row=planningNode('div','food-water-record');row.append(planningNode('span','',record.amountMl+' mL · '+(record.drankTime || 'Time not recorded')));
      const remove=planningButton('',()=>{
        try{live();const dialog=dailyDialog('Remove water entry'),check=context(card,date,dialog),status=planningNode('p','daily-message');status.setAttribute('role','status');dialog.append(planningNode('p','',record.amountMl+' mL · '+(record.drankTime || 'Time not recorded')+' · '+formatReadableDateKey(date)),status,planningButton('Keep drink',()=>dialog.close()),planningButton('Remove drink',()=>{try{check();const current=live(),tx=D.removeWater(board(),current.id,date,record,{conflicts:state.syncConflicts});commit(tx);dialog.close();renderCardsOnly({force:true});undo(tx,'Drink removed.');}catch(error){status.textContent=error.message;}},'trash-2'));
        }catch(error){notice.textContent=error.message;}
      },'trash-2');remove.setAttribute('aria-label','Remove '+record.amountMl+' mL water at '+(record.drankTime || 'unknown time'));remove.title=remove.getAttribute('aria-label');row.append(remove);history.append(row);
    }section.append(history);}
    return section;
  }
  function weekReview(card,days){
    const details=planningNode('details','food-week-review'),summary=planningNode('summary'),boardId=state.activeBoardId;
    const key=JSON.stringify([boardId,card.id,days.at(-1)?.date]);details.open=reviewStates.get(key)===true;
    summary.append(planningNode('span','','Last 7 days'),planningNode('small','',days.length?formatReadableDateKey(days[0].date)+' – '+formatReadableDateKey(days.at(-1).date):''));details.append(summary);
    summary.addEventListener('click',event=>{event.preventDefault();if(!details.isConnected || state.activeBoardId!==boardId)return;details.open=!details.open;reviewStates.set(key,details.open);if(details.open)fill();});
    const content=planningNode('section','food-week-days');content.setAttribute('aria-label','Seven-day food review');details.append(content);
    function fill(){
      content.replaceChildren();let current;
      try{current=D.resolve(board(),card.id,'food',state.syncConflicts);}catch{content.append(planningNode('p','','This log needs review. Nutrition comparisons are paused; original records are kept.'));return;}
      for(const day of [...days].reverse()){
        const row=planningNode('article','food-week-day');row.dataset.date=day.date;row.setAttribute('aria-label',formatReadableDateKey(day.date));
        const heading=planningNode('div','food-week-day-heading');heading.append(planningNode('h4','',formatReadableDateKey(day.date)));row.append(heading);
        const entry=current.foodEntries?.[day.date],meals=Array.isArray(entry?.meals)?entry.meals:[],recorded=meals.filter(meal=>!Array.isArray(meal?.items) || meal.items.length);
        // Never substitute an edited library value or sum ambiguous snapshots.
        const review=entry!==undefined && (!entry || typeof entry!=='object' || Array.isArray(entry) || !Array.isArray(entry.meals)) || new Set(meals.map(meal=>meal?.id)).size!==meals.length || recorded.some(meal=>!meal || typeof meal.id!=='string' || !meal.id.trim() || !D.validItems(meal.items) || meal.items.some(item=>item.servingGrams<1));
        const totals=!review && recorded.length?getFoodEntryTotals(current,{meals:recorded}):null;
        if(review || totals && !FOOD_NUTRIENT_KEYS.every(name=>Number.isFinite(totals[name])))row.append(planningNode('p','food-week-notice','Food records need review.'));
        else if(totals){
          heading.append(planningNode('span','',recorded.length+' food entr'+(recorded.length===1?'y':'ies')));row.append(renderFoodMealSummary(totals));
          const timed=recorded.filter(meal=>D.validTiming(meal.timing) && meal.timing.eatenTime).length;
          row.append(planningNode('p','food-week-timing',timed+' of '+recorded.length+' with meal time'));
          if(recorded.some(meal=>meal.items.some(item=>/default|generic/i.test(item.source))))row.append(planningNode('p','food-week-notice','Saved nutrition · includes estimates'));
        }else row.append(planningNode('p','food-week-notice','No food logged.'));
        const water=D.waterSummary(entry);row.append(planningNode('p','food-week-water',water.needsReview?'Water records need review.':water.records.length?'Water · '+water.totalMl+' mL · '+water.records.length+' drink'+(water.records.length===1?'':'s'):'Water not recorded.'));
        content.append(row);
      }
    }
    if(details.open)fill();
    return details;
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
    for(const row of days){const item=planningNode('span',row.entries?'is-recorded':'');item.textContent=dateKeyToLocalDate(row.date).toLocaleDateString(undefined,{weekday:'narrow'});item.title=formatReadableDateKey(row.date)+' · '+row.entries+' entries recorded';item.setAttribute('aria-label',item.title);week.append(item);}section.append(week,weekReview(card,days));
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
    section.append(list,notice,water(card,date));
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
    const preview=planningNode('section','food-routine-preview'),totals=planningNode('div'),basis=planningNode('p','food-routine-preview-basis');preview.setAttribute('aria-label','Usual meal nutrition preview');totals.setAttribute('aria-live','polite');totals.setAttribute('aria-atomic','true');preview.append(planningNode('h3','','Per meal'),totals,basis);
    const updateTotals=()=>{
      totals.replaceChildren();delete preview.dataset.ready;
      if(!draft.items.length){basis.textContent='No foods selected.';return false;}
      if(!D.validItems(draft.items) || draft.items.some(item=>item.servingGrams<1)){basis.textContent='Nutrition basis or portions need review.';return false;}
      const values=getFoodMealTotals(card,{items:draft.items});
      if(!FOOD_NUTRIENT_KEYS.every(key=>Number.isFinite(values[key]) && values[key]>=0)){basis.textContent='Nutrition totals need review.';return false;}
      totals.append(renderFoodMealSummary(values));preview.dataset.ready='true';basis.textContent=draft.items.some(item=>/default|generic/i.test(item.source))?'Saved nutrition · includes estimates':'Saved nutrition';return true;
    };
    items.addEventListener('input',updateTotals);items.addEventListener('change',updateTotals);
    const draw=()=>{
      items.replaceChildren();
      for(const item of draft.items){
        const row=planningNode('div','food-routine-item'),heading=planningNode('div','food-routine-item-name');
        heading.append(planningNode('strong','',item.name),planningNode('small','',portionBasis(item)),planningNode('small','',item.source));
        const quantity=document.createElement('input');quantity.type='number';quantity.min='0';quantity.step='any';quantity.inputMode='decimal';quantity.value=item.amount;quantity.required=true;quantity.setAttribute('aria-label',item.name+' portion');quantity.oninput=()=>{item.amount=quantity.value===''?'':Number(quantity.value);};
        const unit=planningSelect([['g','g'],['serving',item.servingUnit]],item.unit,value=>{try{const amount=D.convertPortion(item.amount,item.unit,value,item.servingGrams);item.amount=amount;item.unit=value;quantity.value=amount;status.textContent='';}catch(error){unit.value=item.unit;status.textContent=error.message;}});unit.setAttribute('aria-label',item.name+' unit');
        const remove=planningButton('',()=>{draft.items=draft.items.filter(i=>i!==item);draw();},'trash-2');remove.title='Remove '+item.name+' from usual meal';remove.setAttribute('aria-label',remove.title);
        row.append(heading,quantity,unit,remove,portions(item,{input:quantity,unit,onApply:(amount,nextUnit)=>{live();item.amount=amount;item.unit=nextUnit;status.textContent='';updateTotals();},onError:error=>status.textContent=error.message}));items.append(row);
        if(FOOD_NUTRIENT_KEYS.every(key=>item[key]===0)){const label=planningNode('label','food-zero-confirm'),check=document.createElement('input');check.type='checkbox';check.checked=item.zeroNutritionConfirmed===true;check.onchange=()=>item.zeroNutritionConfirmed=check.checked;label.append(check,planningNode('span','','Zero nutrition checked for '+item.name));row.append(label);}
      }updateTotals();if(!draft.items.length)addFoods.open=true;
    };
    const addFoods=planningNode('details','food-routine-add-foods');addFoods.open=draft.items.length===0;addFoods.append(planningNode('summary','','Add foods'));
    const addFood=id=>{
      try{const current=live();if(!addFoods.open)throw Error('Open Add foods before choosing a food.');const food=current.foodLibrary.find(f=>f.id===id);if(!food)throw Error('Choose a food first.');const index=draft.items.findIndex(item=>item.foodId===id);if(index>=0){items.children[index]?.querySelector('.food-tap-portions button')?.focus();return;}draft.items.push({id:createId(),foodId:food.id,amount:food.servingUnit==='100g'?100:1,unit:food.servingUnit==='100g'?'g':'serving',...createFoodItemSnapshot(food)});draw();status.textContent='';}catch(error){status.textContent=error.message;}
    };
    const add=planningButton('Add food',()=>addFood(picker.value),'plus');
    const foodPick=planningNode('div','food-routine-pick');foodPick.append(planningField('Food',picker),add);
    const quickFoods=planningNode('div','food-quick-choices');quickFoods.setAttribute('role','group');quickFoods.setAttribute('aria-label','Quick add foods');for(const food of card.foodLibrary.slice(0,9)){const button=planningButton(food.name,()=>addFood(food.id),'plus');button.setAttribute('aria-label','Quick add '+food.name);quickFoods.append(button);}
    const names=planningNode('div','food-quick-choices');names.setAttribute('role','group');names.setAttribute('aria-label','Usual meal names');for(const label of ['Breakfast','Lunch','Dinner','Snack','Protein shake','Coffee'])names.append(planningButton(label,()=>{name.value=label;}));
    const save=planningButton('Save usual meal',null,'check');save.type='submit';save.classList.add('is-primary');
    const buttons=planningNode('div','daily-actions');buttons.append(planningButton('Cancel',()=>dialog.close()),save);
    addFoods.append(quickFoods,foodPick);form.append(planningField('Meal name',name),names,preview,addFoods,items,planningField('Entry type',kind),planningField('Planned time (optional)',planned),planningField('Your timing window',windowSelect),status,buttons);
    if(original){
      const confirm=planningNode('div','food-routine-archive');confirm.hidden=true;confirm.append(planningNode('p','','Archive this usual meal? Its recorded meals stay unchanged.'));
      const archive=planningButton('Archive usual meal',()=>confirm.hidden=false,'archive');
      confirm.append(planningButton('Keep meal',()=>confirm.hidden=true),planningButton('Confirm archive',()=>{
        try{const current=live(),tx=D.saveRoutine(board(),current.id,before,{...D.copy(original),archivedAt:Date.now()},{conflicts:state.syncConflicts});commit(tx);dialog.close();renderCardsOnly({force:true});}catch(error){status.textContent=error.message;}
      },'archive'));form.append(archive,confirm);
    }
    form.onsubmit=event=>{
      event.preventDefault();try{const current=live();if(!updateTotals())throw Error('Review the portions and saved nutrition basis before saving.');const tx=D.saveRoutine(board(),current.id,before,{...draft,name:name.value.trim(),kind:kind.value,plannedTime:planned.value,windowMinutes:Number(windowSelect.value)},{conflicts:state.syncConflicts});commit(tx);dialog.close();renderCardsOnly({force:true});}catch(error){status.textContent=error.message;}
    };
    dialog.append(form);draw();names.querySelector('button')?.focus();
  }
  function openRecorded(card,date,meal){
    requireRecordedMeal(card,date,meal);
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
      row.append(label,planningField('Unit',unit),portions(item,{input,unit,onApply:(amount,nextUnit)=>{item.amount=amount;item.unit=nextUnit;status.textContent='';updateTotals();},onError:error=>status.textContent=error.message}),planningNode('small','food-portion-basis',portionBasis(item)));unit.setAttribute('aria-label',item.name+' unit');items.append(row);
    }
    const eaten=document.createElement('input');eaten.type='time';eaten.value=meal.timing?.eatenTime || '';
    const kind=planningSelect([['meal','Meal'],['snack','Snack'],['drink','Drink']],meal.kind || 'meal',()=>{});
    const timing=planningNode('div','food-recorded-time');timing.append(planningField('Eaten at',eaten),planningField('Entry type',kind));
    const save=planningButton('Save recorded meal',null,'check');save.type='submit';save.classList.add('is-primary');
    const actions=planningNode('div','daily-actions');actions.append(planningButton('Cancel',()=>dialog.close()),save);
    const more=planningButton('Meal details',()=>{try{const current=live();if(!D.equal(draft.items,expected.items) || eaten.value!==(expected.timing?.eatenTime || '') || kind.value!==(expected.kind || 'meal'))throw Error('Save or cancel these changes before opening meal details.');requireRecordedMeal(current,date,expected);dialog.close();openDetails(current,meal.id);}catch(error){status.textContent=error.message;}},'utensils');
    const basis=planningNode('details','food-recorded-basis');basis.append(planningNode('summary','','Nutrition basis'));for(const item of meal.items || [])basis.append(planningNode('p','',item.name+' · '+item.calories+' kcal per '+item.servingUnit+' ('+item.servingGrams+' g) · '+item.source));
    form.append(heading,totals,items,timing,status,actions,more,basis);form.onsubmit=event=>{
      event.preventDefault();try{const current=live(),tx=D.editMeal(board(),current.id,date,meal.id,expected,draft.items.map(i=>({id:i.id,amount:i.amount,unit:i.unit})),{today:getTodayKey(),conflicts:state.syncConflicts,eatenTime:eaten.value,kind:kind.value});if(tx)commit(tx);dialog.close();if(tx){renderCardsOnly({force:true});undo(tx,'Recorded meal updated.');}}catch(error){status.textContent=error.message;}
    };
    dialog.append(form);updateTotals();items.querySelector('.food-tap-portions button')?.focus();
  }
  function times(card,date,meal){
    const details=planningNode('details','food-time-panel'),summary=planningNode('summary');
    const current=meal.timing;
    summary.textContent=current?.eatenTime?'Eaten '+current.eatenTime+' · '+D.timingStatus(current):'Meal time · not recorded';details.append(summary);
    const live=context(card,date,details),form=planningNode('form','food-time-form'),status=planningNode('p','daily-message');let expected=D.copy(meal);status.setAttribute('role','status');
    const eaten=document.createElement('input');eaten.type='time';eaten.value=current?.eatenTime || '';
    const planned=document.createElement('input');planned.type='time';planned.value=current?.plannedTime || '';
    const windowSelect=planningSelect([15,30,60,90,120,180].map(n=>[String(n),'± '+n+' min']),String(current?.windowMinutes || 60),()=>{});
    const kind=planningSelect([['meal','Meal'],['snack','Snack'],['drink','Drink']],meal.kind || 'meal',()=>{});
    const save=planningButton('Save time',null,'check');save.type='submit';
    const initial={eaten:eaten.value,planned:planned.value,window:windowSelect.value,kind:kind.value};
    const changed=()=>eaten.validity.badInput || planned.validity.badInput || eaten.value!==initial.eaten || planned.value!==initial.planned || windowSelect.value!==initial.window || kind.value!==initial.kind;
    healthDateDrafts.set(form,{boardId:state.activeBoardId,mode:state.ui.workspaceMode,changed});
    const draftNotice=planningNode('p','food-time-draft');draftNotice.setAttribute('aria-live','polite');
    const updateDraft=()=>{draftNotice.textContent=changed()?'Meal-time changes not saved.':'';if(!changed()){const notice=details.closest('.food-tracker')?.querySelector('.health-date-message');if(notice?.textContent===HEALTH_DATE_DRAFT_NOTICE)notice.textContent='';}};
    form.addEventListener('input',updateDraft);form.addEventListener('change',updateDraft);form.addEventListener('keyup',updateDraft);form.addEventListener('focusout',updateDraft);
    const formBoardId=state.activeBoardId;
    const cancel=planningButton('',()=>{if(!form.isConnected || !details.open || !form.getClientRects().length || state.activeBoardId!==formBoardId)return;form.reset();eaten.value=initial.eaten;planned.value=initial.planned;windowSelect.value=initial.window;kind.value=initial.kind;status.textContent='';draftNotice.textContent='';const notice=details.closest('.food-tracker')?.querySelector('.health-date-message');if(notice?.textContent===HEALTH_DATE_DRAFT_NOTICE){notice.textContent='';if(lastLocalSaveOk!==false)setSaveStatus('Meal-time changes cancelled.','notice');}},'x');cancel.title='Cancel meal-time changes';cancel.setAttribute('aria-label',cancel.title);
    const actions=planningNode('div','food-time-actions');actions.append(save,cancel);
    form.append(planningField('Eaten at',eaten),planningField('Planned time',planned),planningField('Timing window',windowSelect),planningField('Entry type',kind),draftNotice,actions,status);
    form.onsubmit=event=>{
      event.preventDefault();try{const current=live();if(date>getTodayKey())throw Error('Record eating on today or a past date.');const tx=D.setTiming(board(),current.id,date,meal.id,expected,{...(expected.timing || {}),eatenTime:eaten.value,plannedTime:planned.value,windowMinutes:Number(windowSelect.value),recordedAt:Date.now()},{conflicts:state.syncConflicts,kind:kind.value});commit(tx);expected=D.copy(tx.after.meals.find(item=>item.id===meal.id));Object.assign(initial,{eaten:eaten.value,planned:planned.value,window:windowSelect.value,kind:kind.value});updateDraft();status.textContent='Meal time saved.';renderCardsOnly({force:true});}catch(error){status.textContent=error.message;}
    };
    details.append(form);bindDetails(card,date,details,{detailId:['meal-time',meal.id],defaultOpen:false});summary.id='food-time-summary-'+encodeURIComponent(details.dataset.dailyDetailsKey);return details;
  }
  function openWeight(card,date){
    const dialog=dailyDialog('Record weight');dialog.classList.add('food-weight-dialog');const live=context(card,date,dialog);
    const logs=state.cards.filter(c=>c.type==='fitness' && !c.archivedAt),form=planningNode('form','daily-form'),status=planningNode('p','daily-message');status.setAttribute('role','status');
    if(!logs.length){dialog.append(planningNode('p','','No Fitness Log on this board yet.'),planningButton('Add Fitness Log',()=>{dialog.close();openHealthLogComposer('fitness');},'plus'));return;}
    const key=JSON.stringify([state.activeBoardId,card.id]),selection=logs.length===1?logs[0].id:weightSources.get(key) || '';
    const input=document.createElement('input');input.type='number';input.inputMode='decimal';input.step='0.01';input.min='0.01';input.required=true;
    const validWeight=value=>/^(?:\d+)(?:\.\d{1,2})?$/.test(String(value)) && Number(value)>0 && Number.isFinite(Number(value));
    const checkedLog=()=>{
      live();if(date>getTodayKey())throw Error('Record weight on today or a past date.');
      const log=D.resolve(board(),sourceId,'fitness',state.syncConflicts),entries=log.fitnessEntries,entry=entries?.[date];
      if(entries!==undefined && (!entries || typeof entries!=='object' || Array.isArray(entries)) || entry!==undefined && (!entry || typeof entry!=='object' || Array.isArray(entry) || entry.metrics!==undefined && (!entry.metrics || typeof entry.metrics!=='object' || Array.isArray(entry.metrics))))throw Error('This weight history needs review. Original records are kept.');
      return log;
    };
    const weights=log=>Object.entries(log?.fitnessEntries || {}).filter(([d,e])=>D.day(d) && d<=date && validWeight(e?.metrics?.weightKg)).sort(([a],[b])=>b.localeCompare(a));
    let expected=null,sourceId='',dirty=false,previous=null;
    const source=planningSelect([['','Choose Fitness Log'],...logs.map(c=>[c.id,c.title])],selection,()=>{
      if(dirty || input.validity.badInput){source.value=sourceId;status.textContent='Save or cancel this weight before changing logs.';return;}choose();
    });
    const refresh=()=>{
      const cents=Math.round(Number(input.value)*100),valid=validWeight(input.value) && !input.validity.badInput && Number.isSafeInteger(cents),available=Boolean(sourceId) && date<=getTodayKey();
      decrease.disabled=!available || !valid || cents<=10;increase.disabled=!available || !valid || !Number.isSafeInteger(cents+10);usePrevious.disabled=!available || !previous;save.disabled=!available;
    };
    const adjust=delta=>{
      try{checkedLog();const cents=Math.round(Number(input.value)*100);if(!validWeight(input.value) || input.validity.badInput || !Number.isSafeInteger(cents) || !Number.isSafeInteger(cents+delta) || cents+delta<=0)throw Error('Enter a positive weight with up to two decimal places.');input.value=String((cents+delta)/100);dirty=true;status.textContent='';refresh();}catch(error){status.textContent=error.message;}
    };
    const decrease=planningButton('',()=>adjust(-10),'minus'),increase=planningButton('',()=>adjust(10),'plus');
    for(const [button,label] of [[decrease,'Decrease weight by 0.1 kg'],[increase,'Increase weight by 0.1 kg']]){button.setAttribute('aria-label',label);button.title=label;}
    const usePrevious=planningButton('',()=>{
      try{const log=checkedLog(),latest=weights(log).find(([d])=>d<date);if(!previous || latest?.[0]!==previous.date || !D.equal(latest?.[1],previous.entry))throw Error('The previous weight changed. Reopen this form before using it.');input.value=String(previous.entry.metrics.weightKg);dirty=true;status.textContent='';refresh();}catch(error){status.textContent=error.message;}
    },'rotate-ccw');usePrevious.title='Use previous weight as an unsaved starting value';
    const choose=()=>{
      sourceId=source.value;status.textContent='';const log=logs.find(c=>c.id===sourceId);expected=D.copy(log?.fitnessEntries?.[date] ?? null);input.value=expected?.metrics?.weightKg ?? '';weightSources.set(key,sourceId);
      const records=weights(log),prior=records.find(([d])=>d<date);previous=prior?{date:prior[0],entry:D.copy(prior[1])}:null;
      usePrevious.hidden=!previous;usePrevious.querySelector('span').textContent=previous?'Use '+previous.entry.metrics.weightKg+' kg':'';usePrevious.setAttribute('aria-label',previous?'Use '+previous.entry.metrics.weightKg+' kg as starting weight':'Use previous weight');
      recent.textContent=records.slice(0,2).map(([d,e],i)=>(i?'Previous: ':'Latest: ')+e.metrics.weightKg+' kg · '+formatReadableDateKey(d)).join(' · ') || 'No weight recorded in this log yet.';
      refresh();
    };
    const recent=planningNode('p','food-weight-recent');input.oninput=()=>{dirty=true;refresh();};input.addEventListener('keyup',refresh);input.addEventListener('focusout',refresh);
    const save=planningButton('Save weight',null,'check');save.type='submit';save.classList.add('is-primary');
    const field=planningNode('div','food-weight-stepper');field.append(decrease,planningField('Weight (kg)',input),increase);
    const actions=planningNode('div','daily-actions');actions.append(planningButton('Cancel',()=>dialog.close()),save);
    form.append(planningNode('p','daily-muted',formatReadableDateKey(date)),planningField('Fitness Log',source),recent,usePrevious,field,status,actions);
    form.onsubmit=event=>{
      event.preventDefault();try{
        live();if(date>getTodayKey() || !validWeight(input.value) || input.validity.badInput)throw Error('Enter a positive weight with up to two decimal places for today or a past date.');
        const log=checkedLog(),before=log.fitnessEntries?.[date] ?? null,hadEntries=Object.hasOwn(log,'fitnessEntries');
        if(!D.equal(before,expected))throw Error('This weight entry changed. Reopen it before saving.');
        const next=normalizeFitnessEntry({...D.copy(before || {}),metrics:{...D.copy(before?.metrics || {}),weightKg:Number(input.value)},updatedAt:Date.now()});log.fitnessEntries ||= {};log.fitnessEntries[date]=next;
        let saved=false;try{saved=saveState({quiet:true});}catch{}
        if(!saved){if(before===null)delete log.fitnessEntries[date];else log.fitnessEntries[date]=before;if(!hadEntries)delete log.fitnessEntries;syncActiveBoard({touchBoard:false});throw Error('Not saved. Your previous weight is unchanged. Keep this form open and retry.');}
        dialog.close();renderCardsOnly({force:true});
      }catch(error){status.textContent=error.message;}
    };
    dialog.append(form);choose();if(!sourceId)source.focus();else if(previous && !input.value)usePrevious.focus();else input.focus();
  }
  window.LifeFoodDailyUI=Object.freeze({render,times,bindDetails,portions,itemPortions});
})();
