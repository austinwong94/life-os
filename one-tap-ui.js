(() => {
  'use strict';
  if(window.LifeStartupBlocked)return;
  const T=LifeOneTap,sessions=new Map(),order=['mood','step','water','food','movement'];
  const names={mood:'How are you feeling?',step:'One small step',water:'Water',food:'Food',movement:'Movement'};
  const node=planningNode;
  const draftObject=v=>v && typeof v==='object' && !Array.isArray(v);
  const noteDraft=v=>draftObject(v) && typeof v.text==='string' && typeof v.time==='string' && typeof v.targetId==='string';
  function validDraft(v){
    return draftObject(v) && v.draftVersion===1 && (!v.notes || draftObject(v.notes) && Object.entries(v.notes).every(([day,d])=>T.day(day) && noteDraft(d))) &&
      (!v.foodDraft || draftObject(v.foodDraft) && typeof v.foodDraft.name==='string' && typeof v.foodDraft.amount==='string' && T.units.includes(v.foodDraft.unit) && typeof v.foodDraft.pin==='boolean') &&
      (!v.pending || draftObject(v.pending) && T.validEvent(v.pending.event) && T.day(v.pending.viewDay));
  }
  function session(boardId=state.activeBoardId){
    if(!sessions.has(boardId)){
      let saved={},raw='',sessionError=false;try{raw=sessionStorage.getItem(LifeStorageScope.key('life-os-one-tap:'+boardId)) || '';if(raw){saved=JSON.parse(raw);sessionError=!validDraft(saved);}}catch{sessionError=Boolean(raw);}
      sessions.set(boardId,{...(sessionError?{}:saved),draftVersion:1,busy:false,message:'',error:false,...(sessionError?{sessionError:true,originalDraft:raw}:{})});
    }
    return sessions.get(boardId);
  }
  function keep(boardId,s){
    if(s.sessionError)return;
    try{const {busy,message,error,...draft}=s;sessionStorage.setItem(LifeStorageScope.key('life-os-one-tap:'+boardId),JSON.stringify(draft));}
    catch{s.message='This local draft is only in memory. Keep this tab open.';const status=document.querySelector('.one-tap-workspace .trial-result [role=status]');if(state.activeBoardId===boardId && status)status.textContent=s.message;}
  }
  function disclosure(details,key,boardId,s){
    const summary=details.querySelector('summary');details.open=Boolean(s[key]);
    summary.addEventListener('click',e=>{e.preventDefault();if(!details.isConnected)return;details.open=!details.open;s[key]=details.open;keep(boardId,s);});
    details.ontoggle=()=>{if(details.isConnected){s[key]=details.open;keep(boardId,s);}};
  }
  function original(boardId){
    const matches=state.boards.filter(b=>b.id===boardId);
    if(matches.length!==1)throw Error('The original board moved or needs review. Nothing was replaced.');
    if((state.syncConflicts || []).some(c=>{const p=c.segments || [];return p[0]==='boards' && p[1]===boardId && (p.length===2 || p[2]==='oneTapExperiment');}))throw Error('Experiment versions need review. Both copies are kept; no new check-in was added.');
    return matches[0];
  }
  function sameView(ref){return state.ui.workspaceMode==='oneTap' && state.activeBoardId===ref.boardId && session(ref.boardId).day===ref.day && getTodayKey()===ref.today;}
  function current(root,ref){return root.isConnected && sameView(ref);}
  function event(kind,data,date,today,boardId){
    const records=state.boards.find(b=>b.id===boardId)?.oneTapExperiment?.events || {};
    const sequence=Object.values(records).reduce((n,e)=>Math.max(n,Number.isSafeInteger(e?.sequence)?e.sequence:0),0)+1;
    return {version:1,id:createId(),kind,date,recordedDay:today,recordedAt:Date.now(),sequence,data:T.copy(data)};
  }
  function redraw(boardId){if(state.activeBoardId===boardId && state.ui.workspaceMode==='oneTap')renderCardsOnly({force:true});}
  async function save(root,ref,kind,data,{date=ref.day,clearDraft=null}={}){
    const s=session(ref.boardId);if(s.busy || !current(root,ref) || root.closest('dialog'))return;
    if(s.pending){s.error=true;s.message='An earlier check-in still needs saving. Retry it before adding another.';redraw(ref.boardId);return;}
    const captured=event(kind,data,date,ref.today,ref.boardId);
    try{
      if(!T.validEvent(captured))throw Error(date>ref.today?'Future check-ins are not enabled. Choose today or a past day.':kind==='note'?'Add a thought, or select an entry for an actual time.':'Enter a food name, a supported unit and a positive amount up to 100,000.');
      T.record(original(ref.boardId).oneTapExperiment,captured,{today:ref.today});
    }catch(error){s.error=true;s.message=error.message;const status=root.querySelector('.trial-result [role=status]');status.textContent=s.message;status.className='trial-error';return;}
    s.pending={event:captured,viewDay:ref.day,clearDraft:T.copy(clearDraft)};keep(ref.boardId,s);
    await publish(ref.boardId,root,ref);
  }
  async function publish(boardId,root,ref){
    const s=session(boardId),pending=s.pending;if(!pending || s.busy)return;
    s.busy=true;s.error=false;s.message='Recording...';root.querySelectorAll('[data-trial-write]').forEach(b=>b.disabled=true);
    const status=root.querySelector('.trial-result [role=status]');if(status){status.textContent=s.message;status.className='trial-status';}
    try{
      if(!lastLocalSaveOk){if(!await retryDeviceSave({recoverSpace:false}))throw Error('Device saving needs attention. Your tap is kept for retry.');}
      if(!await flushDeviceWrites())throw Error('Device saving is not confirmed. Your tap is kept for retry.');
      if(!sameView(ref))throw Error('The board or day changed. Your original tap is kept for retry.');
      const b=original(boardId),before=T.copy(b.oneTapExperiment),next=T.record(before,pending.event,{today:getTodayKey()});
      if(!T.equal(before,next)){
        b.oneTapExperiment=next;
        if(!saveState({quiet:true})){
          const live=state.boards.find(b=>b.id===boardId);if(live){if(before===undefined)delete live.oneTapExperiment;else live.oneTapExperiment=before;}
          syncActiveBoard({touchBoard:false});throw Error('Not saved. Your original records are kept; retry this same tap.');
        }
      }
      if(!await flushDeviceWrites())throw Error('This check-in is pending on this device. Keep this tab open and retry.');
      if(!T.equal(original(boardId).oneTapExperiment?.events?.[pending.event.id],pending.event))throw Error('The saved check-in needs verification. Its pending copy is kept.');
      s.lastId=pending.event.id;s.error=false;s.message='Recorded: '+(pending.event.kind==='note'?(pending.event.data.text.trim()?'Your thought':'Actual time'):T.describe(pending.event));delete s.pending;
      const clear=pending.clearDraft;
      if(clear?.kind==='food' && T.equal(s.foodDraft,clear.expected)){s.foodDraft={name:'',amount:'',unit:'g',pin:true};s.foodSetup=false;}
      if(clear?.kind==='note' && T.equal(s.notes?.[pending.viewDay],clear.expected)){s.notes[pending.viewDay]={text:'',time:'',targetId:''};s.thoughtOpen=false;}
      if(order.includes(pending.event.kind))s.next=order[(order.indexOf(pending.event.kind)+1)%order.length];
    }catch(error){s.error=true;s.message=error.message;}
    finally{s.busy=false;keep(boardId,s);}
    if(!sameView(ref))return;
    const editing=isDraftTextElement(document.activeElement);
    if(editing){const status=document.querySelector('.one-tap-workspace .trial-result [role=status]');if(status)status.textContent=s.message;renderCardsOnly();return;}
    redraw(boardId);
    const fresh=document.querySelector('.one-tap-workspace');
    if(!s.error && !editing && order.includes(pending.event.kind)){
      let guided=true;try{guided=T.summary(original(boardId).oneTapExperiment,ref.day).guided;}catch{}
      if(guided && !document.querySelector('dialog[open]')){
        const heading=fresh?.querySelector('[data-trial-kind="'+s.next+'"] h3');heading?.focus({preventScroll:true});
        if(innerWidth<=700)heading?.scrollIntoView({block:'center',behavior:'instant'});
      }
    }
  }
  function writeButton(root,ref,label,kind,data,icon,options){
    const button=planningButton(label,()=>save(root,ref,kind,data,options),icon);button.dataset.trialWrite='';button.disabled=ref.day>ref.today || session(ref.boardId).busy || Boolean(session(ref.boardId).pending);return button;
  }
  function readable(board,pending){
    if(board.oneTapExperiment===undefined && !pending)return '';
    let rows;try{rows=T.sorted(board.oneTapExperiment);}catch{return '<section><h2>One Tap experiment - original records need review</h2><pre>'+escapeHtml(JSON.stringify(board.oneTapExperiment,null,2))+'</pre></section>';}
    if(pending)rows=rows.filter(e=>e.id!==pending.event.id);
    const row=e=>'<tr><td>'+escapeHtml(e.date)+'</td><td>'+escapeHtml(e.kind)+'</td><td style="white-space:pre-wrap">'+escapeHtml(T.describe(e))+'</td><td>'+escapeHtml(new Date(e.recordedAt).toISOString())+'</td><td>'+escapeHtml(e.id)+'</td></tr>';
    return '<section><h2>One Tap experiment</h2><p>Separate trial journal. Not part of the main diary, nutrition totals, workout records or task completions.</p><table><thead><tr><th>Day</th><th>Entry</th><th>Recorded information</th><th>Recorded timestamp</th><th>Identity</th></tr></thead><tbody>'+rows.map(row).join('')+'</tbody></table>'+(pending?'<h3>Unconfirmed check-in - retained draft, not a saved result</h3><table>'+row(pending.event)+'</table>':'')+'<details><summary>Full restore information</summary><pre>'+escapeHtml(JSON.stringify(board.oneTapExperiment || T.inspect(),null,2))+'</pre></details></section>';
  }
  function download(boardId){
    const b=state.boards.find(b=>b.id===boardId);if(!b)return;
    const html='<!doctype html><meta charset="utf-8"><title>One Tap experiment</title><style>body{max-width:1100px;margin:32px auto;padding:20px;font:15px/1.5 system-ui;color:#182321}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:10px;border:1px solid #d9dfe4;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{margin-top:20px}@media print{details{display:none}}</style><h1>'+escapeHtml(b.name)+' - One Tap trial</h1>'+readable(b,session(boardId).pending);
    downloadTextFile('life-os-one-tap-'+getTodayKey()+'.html',html,'text/html;charset=utf-8');
  }
  function render(){
    const root=node('section','one-tap-workspace'),boardId=state.activeBoardId,s=session(boardId),today=getTodayKey();
    if(!s.manualDay || !T.day(s.day))s.day=today;
    const ref={boardId,day:s.day,today};root.setAttribute('aria-label','One Tap experiment');root.dataset.day=s.day;elements.boardGrid.append(root);
    const head=node('header','trial-head'),title=node('div');title.append(node('span','trial-eyebrow','OPTIONAL EXPERIMENT'),node('h2','','One Tap'),node('p','trial-scope','Separate trial journal - your main records stay unchanged.'));
    const tools=node('div','trial-tools');tools.append(planningIcon('Download experiment',()=>download(boardId),'download'),planningIcon('Return to Today',()=>setWorkspaceMode('today'),'chevron-left'));head.append(title,tools);root.append(head);
    if(s.sessionError){root.append(node('p','trial-error','This tab has an unrecognized experiment draft. The original copy is kept; other Life OS sections are unchanged.'),planningButton('Download original draft',()=>downloadTextFile('life-os-one-tap-retained-draft.txt',s.originalDraft,'text/plain;charset=utf-8'),'download'));return;}
    let b,model,progress;
    try{b=original(boardId);model=T.summary(b.oneTapExperiment,s.day);progress=T.progress(b.oneTapExperiment,today);}catch(error){root.append(node('p','trial-error',error.message),planningButton('Download original experiment',()=>download(boardId),'download'));return;}
    const dates=node('div','trial-date-row'),date=document.createElement('input');date.type='date';date.value=s.day;date.setAttribute('aria-label','Experiment day');date.onchange=()=>{const value=date.value;if(!T.day(value) || !current(root,ref))return;s.day=value;s.manualDay=value!==today;keep(boardId,s);redraw(boardId);};
    const changeDate=amount=>{if(!current(root,ref))return;s.day=LifePlanning.shift(s.day,amount);s.manualDay=true;keep(boardId,s);redraw(boardId);};
    dates.append(planningIcon('Previous experiment day',()=>changeDate(-1),'chevron-left'),date,planningIcon('Next experiment day',()=>changeDate(1),'chevron-right'));
    if(s.day!==today)dates.append(planningButton('Today',()=>{s.manualDay=false;keep(boardId,s);redraw(boardId);}));
    const prefs=node('details','trial-preferences'),ps=node('summary');ps.innerHTML=ICONS.settings;ps.setAttribute('aria-label','Experiment preferences');ps.title='Experiment preferences';prefs.append(ps);const prefOptions=node('div','trial-pref-options');prefs.append(prefOptions);disclosure(prefs,'preferencesOpen',boardId,s);
    for(const [key,label]of [['guided','Gently highlight the next card'],['rewards','Show recording milestones']]){
      const field=node('label','trial-toggle'),input=document.createElement('input');input.type='checkbox';input.checked=model[key];input.setAttribute('aria-label',label);input.dataset.trialWrite='';input.disabled=s.busy || Boolean(s.pending);
      input.onchange=()=>save(root,ref,'preference',{key,value:input.checked},{date:today});field.append(input,node('span','',label));prefOptions.append(field);
    }dates.append(prefs);root.append(dates);
    const result=node('div','trial-result'),status=node('p',s.error?'trial-error':'trial-status',s.message || (s.day>today?'Future day - check-ins are not enabled.':model.facts.length?'Your recorded check-ins are here.':'Nothing to catch up on. Begin with any card.'));status.setAttribute('role','status');result.append(status);
    if(s.pending){const retry=planningButton('Retry this check-in',()=>{if(!current(root,ref) || s.busy)return;s.day=s.pending.viewDay;s.manualDay=s.day!==today;keep(boardId,s);redraw(boardId);const next=document.querySelector('.one-tap-workspace');publish(boardId,next,{boardId,day:s.day,today:getTodayKey()});},'rotate-ccw');retry.disabled=s.busy;result.append(retry);}
    const last=model.rows.find(e=>e.id===s.lastId);
    if(last && last.kind!=='undo')result.append(writeButton(root,ref,'Undo last check-in','undo',{targetId:last.id},'rotate-ccw',{date:last.date}));root.append(result);
    if(s.pending){root.append(node('p','trial-empty','Pending check-in: '+T.describe(s.pending.event).slice(0,180)));return;}
    const recap=node('section','trial-recap');recap.setAttribute('aria-label','Recording progress');
    const copy=node('div');copy.append(node('strong','',model.areas.length+' of 5 check-in types recorded'),node('span','',progress.weekDays+' of the last 7 days recorded'));
    const week=node('div','trial-week');week.setAttribute('aria-label','Last seven recording days');for(const d of progress.days){const item=node('span',d.recorded?'is-recorded':'');item.textContent=new Date(d.date+'T12:00:00').toLocaleDateString(undefined,{weekday:'narrow'});item.title=d.date+(d.recorded?' - recorded':' - no record');item.setAttribute('aria-label',item.title);week.append(item);}recap.append(copy,week);
    if(model.rewards && progress.milestone)recap.append(node('span','trial-milestone',progress.milestone===1?'First check-in':progress.milestone+' days recorded'));
    root.append(recap);
    const grid=node('div','trial-grid');root.append(grid);
    const card=(kind,icon,summary)=>{
      const section=node('article','trial-card trial-'+kind);section.dataset.trialKind=kind;section.classList.toggle('is-next',model.guided && s.next===kind);
      const header=node('header'),heading=node('h3','',names[kind]);heading.tabIndex=-1;const symbol=node('span','trial-symbol');symbol.innerHTML=ICONS[icon] || '';symbol.setAttribute('aria-hidden','true');
      const skip=planningIcon('Skip '+names[kind],()=>{if(!current(root,ref))return;s.next=order[(order.indexOf(kind)+1)%order.length];keep(boardId,s);redraw(boardId);document.querySelector('[data-trial-kind="'+s.next+'"] h3')?.focus();},'chevron-right');
      header.append(symbol,heading,skip);section.append(header,node('p','trial-card-summary',summary));grid.append(section);return section;
    };
    const mood=card('mood','pencil',model.mood || 'No feeling recorded'),choices=node('div','trial-moods');choices.setAttribute('role','group');choices.setAttribute('aria-label','Experiment feeling');
    for(const value of T.moods){const button=writeButton(root,ref,value,'mood',{value});button.classList.add('trial-mood');button.setAttribute('aria-pressed',String(model.mood===value));if(model.mood===value)button.disabled=true;button.replaceChildren(node('span','trial-face',DIARY_MOOD_META[value].icon),node('span','',value));choices.append(button);}mood.append(choices);
    const step=card('step','check',model.finishes+' small step'+(model.finishes===1?'':'s')+' finished - '+model.starts+' start'+(model.starts===1?'':'s'));
    const stepActions=node('div','trial-actions');for(const value of ['Started something','Finished a small step'])stepActions.append(writeButton(root,ref,value,'step',{value},value==='Started something'?'play':'check'));step.append(stepActions);
    const water=card('water','plus',model.waterMl+' mL recorded'),waterActions=node('div','trial-actions');for(const ml of [250,350,500])waterActions.append(writeButton(root,ref,ml+' mL','water',{ml}));water.append(waterActions);
    const food=card('food','utensils',model.foodEntries+' food entr'+(model.foodEntries===1?'y':'ies')+' - no nutrition totals in this trial'),foods=node('div','trial-foods');
    for(const f of [...model.shortcuts.slice().reverse(),...T.foods()]){
      const button=writeButton(root,ref,f.name+' - '+f.amount+' '+f.unit+(f.amount!==1 && f.unit!=='g'?'s':''),'food',{name:f.name,amount:f.amount,unit:f.unit});button.replaceChildren(node('strong','',f.name),node('span','',f.amount+' '+f.unit+(f.amount!==1 && f.unit!=='g'?'s':'')));foods.append(button);
    }food.append(foods);
    const setup=node('details','trial-food-setup');setup.append(node('summary','','Custom food / shortcut'));disclosure(setup,'foodSetup',boardId,s);
    const foodDraft=s.foodDraft ||= {name:'',amount:'',unit:'g',pin:true},form=node('form','trial-form'),name=planningInput('text',foodDraft.name,v=>{foodDraft.name=v;keep(boardId,s);}),amount=planningInput('number',foodDraft.amount,v=>{foodDraft.amount=v;keep(boardId,s);}),unit=planningSelect(T.units.map(v=>[v,v]),foodDraft.unit,v=>{foodDraft.unit=v;keep(boardId,s);});amount.step='any';amount.min='0.01';amount.max='100000';name.required=true;name.maxLength=160;amount.required=true;
    form.append(planningField('Food name',name),planningField('Amount',amount),planningField('Unit',unit));
    const pin=node('label','trial-toggle'),pinInput=document.createElement('input');pinInput.type='checkbox';pinInput.checked=foodDraft.pin;pinInput.onchange=()=>{foodDraft.pin=pinInput.checked;keep(boardId,s);};pin.append(pinInput,node('span','','Save as a shortcut instead of logging food'));form.append(pin);
    const submit=planningButton('Keep food',null,'check');submit.type='submit';submit.dataset.trialWrite='';submit.disabled=s.busy || Boolean(s.pending) || ref.day>today;form.append(submit);
    form.onsubmit=e=>{e.preventDefault();if(!current(root,ref))return;save(root,ref,foodDraft.pin?'shortcut':'food',{name:foodDraft.name,amount:Number(foodDraft.amount),unit:foodDraft.unit},{clearDraft:{kind:'food',expected:T.copy(foodDraft)}});};setup.append(form);
    for(const custom of model.shortcuts){const row=node('div','trial-journal-row');row.append(node('span','',custom.name+' - '+custom.amount+' '+custom.unit),writeButton(root,ref,'Remove shortcut: '+custom.name,'undo',{targetId:custom.id},'trash-2',{date:custom.date}));setup.append(row);}food.append(setup);
    const movement=card('movement','dumbbell',model.movement.length?model.movement.join(', '):'No movement recorded'),moveActions=node('div','trial-actions');for(const value of ['Gym','Walk','Stretch'])moveActions.append(writeButton(root,ref,value,'movement',{value}));movement.append(moveActions);
    const reflection=node('details','trial-reflection');reflection.append(node('summary','','Add a thought or an actual time (optional)'));disclosure(reflection,'thoughtOpen',boardId,s);
    const noteDraft=(s.notes ||= {})[ref.day] ||= {text:'',time:'',targetId:''};
    const noteForm=node('form','trial-form'),thought=node('textarea');thought.rows=3;thought.value=noteDraft.text;thought.maxLength=12000;thought.id='oneTapThought';thought.oninput=()=>{noteDraft.text=thought.value;keep(boardId,s);};
    const options=[['','Day reflection'],...model.facts.slice().reverse().map(e=>[e.id,T.describe(e)])],target=planningSelect(options,noteDraft.targetId,v=>{noteDraft.targetId=v;keep(boardId,s);});
    const actual=planningInput('time',noteDraft.time,v=>{noteDraft.time=v;keep(boardId,s);});noteForm.append(planningField('About',target),planningField('Your thought',thought),planningField('Actual time (optional for an entry)',actual));
    const noteSave=planningButton('Keep thought',null,'check');noteSave.type='submit';noteSave.dataset.trialWrite='';noteSave.disabled=s.busy || Boolean(s.pending) || ref.day>today;noteForm.append(noteSave);
    noteForm.onsubmit=e=>{e.preventDefault();if(!current(root,ref))return;save(root,ref,'note',{text:thought.value,time:actual.value,targetId:target.value},{clearDraft:{kind:'note',expected:T.copy(noteDraft)}});};reflection.append(noteForm);root.append(reflection);
    const journal=node('details','trial-journal'),entryCount=model.rows.filter(e=>!['preference','shortcut'].includes(e.kind)).length;journal.append(node('summary','','Journal - '+entryCount+(entryCount===1?' entry':' entries')));disclosure(journal,'journalOpen',boardId,s);
    const rows=model.rows.filter(e=>!['preference','shortcut'].includes(e.kind)).slice().reverse(),limit=s.historyLimit || 20;
    if(!rows.length)journal.append(node('p','trial-empty','No trial entries on this day.'));
    for(const e of rows.slice(0,limit)){
      const row=node('div','trial-journal-row'),content=node('div');content.append(node('strong','',T.describe(e)),node('time','','Recorded '+formatRecordDateTime(e.recordedAt)));if(e.kind==='note' && e.data.targetId){const related=model.facts.find(f=>f.id===e.data.targetId);if(related)content.append(node('small','','About: '+T.describe(related)));}row.append(content,writeButton(root,ref,'Undo '+T.describe(e),'undo',{targetId:e.id},'rotate-ccw',{date:e.date}));journal.append(row);
    }if(rows.length>limit)journal.append(planningButton('Show more entries',()=>{if(!current(root,ref))return;s.historyLimit=limit+20;keep(boardId,s);redraw(boardId);},'plus'));root.append(journal);
    const feedback=node('section','trial-feedback');feedback.setAttribute('aria-label','Experiment feedback');feedback.append(node('h3','','How did recording feel?'));
    for(const value of ['Easier','About the same','More effort']){const button=writeButton(root,ref,value,'feedback',{value});button.setAttribute('aria-pressed',String(model.feedback===value));if(model.feedback===value)button.disabled=true;feedback.append(button);}root.append(feedback);
    root.querySelectorAll('[data-trial-write]').forEach(b=>{if(ref.day>today || s.pending || s.busy)b.disabled=true;});
  }
  window.LifeOneTapUI=Object.freeze({render,readable,download});
  if(state.ui.workspaceMode==='oneTap')renderCardsOnly({force:true});
})();
