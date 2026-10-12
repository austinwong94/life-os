(function (root) {
  "use strict";
  const kinds = {checklist:"Project", daily:"To-Do", single:"Task"};
  const copy = value => JSON.parse(JSON.stringify(value));
  const equal = (a,b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length && keys.every(key=>Object.hasOwn(b,key) && equal(a[key],b[key]));
  };
  const eligible = (card,includeArchived=false) => card && Object.hasOwn(kinds,card.type) && (includeArchived || !card.archivedAt) && !card.dailyWorkspaceStore && !card.coachingStore && !card.plannerSourceOnly;
  const usableId = id => typeof id === "string" && id.trim().length>0;
  const completionKeys=['taskCompletion','taskCompletionEvents','subtasks'];
  const snapshot = (card,item) => card.type === "single" ? {...{title:card.title,done:Boolean(card.done)},...Object.fromEntries(completionKeys.filter(key=>Object.hasOwn(card,key)).map(key=>[key,copy(card[key])]))} : copy(item);
  const validDate = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && Number.isFinite(Date.parse(day+'T00:00:00Z')) && new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
  const dateOf = now => {const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  function complete(target,done,day=dateOf(Date.now()),now=Date.now()) {
    if(typeof done!=='boolean' || !validDate(day) || !Number.isFinite(now) || now<=0)throw new Error('Choose a valid completion date.');
    if(Object.hasOwn(target,'taskCompletionEvents') && !Array.isArray(target.taskCompletionEvents))throw new Error('Completion history needs review. The original record was kept.');
    const on=day>dateOf(now)?dateOf(now):day,date=new Date(on+'T00:00:00'),clock=new Date(now);
    date.setHours(clock.getHours(),clock.getMinutes(),clock.getSeconds(),clock.getMilliseconds());
    const record={id:crypto.randomUUID(),done,on:done?on:'',at:done?date.getTime():0,recordedAt:now};
    const events=Array.isArray(target.taskCompletionEvents)?target.taskCompletionEvents.slice():[],previous=knownCompletion(target);
    if(previous && !events.some(e=>e && e.done===true && e.on===previous.on && e.at===previous.at))events.push({id:crypto.randomUUID(),...previous});
    target.done=done;target.taskCompletion={done:record.done,on:record.on,at:record.at,recordedAt:now};
    target.taskCompletionEvents=[...events,record];
    return record;
  }
  function knownCompletion(target) {
    const c=target.taskCompletion;
    return target.done && c?.done===true && validDate(c.on) && Number.isFinite(c.at) && c.at>0 && Number.isFinite(new Date(c.at).getTime()) ? c : null;
  }
  function cards(board) {return Array.isArray(board?.cards) ? board.cards : [];}
  function collect(board,{includeArchived=false}={}) {
    return cards(board).filter(card=>eligible(card,includeArchived)).flatMap(card=>{
      const uniqueCard=usableId(card.id) && cards(board).filter(other=>other.id===card.id).length===1;
      const items=card.type==="single" ? [null] : (Array.isArray(card.items) ? card.items : []).filter(item=>item && typeof item==="object");
      return items.map((item,index)=>{
        const editable=Boolean(uniqueCard && (card.type==="single" || (usableId(item.id) && items.filter(other=>other.id===item.id).length===1)));
        const ref={boardId:board.id,cardId:card.id,kind:card.type,itemId:item?.id ?? null};
        const completion=knownCompletion(item || card);
        return {sourceKind:"card",ref,base:snapshot(card,item),editable,card,
          taskId:JSON.stringify(["card-task",card.type,editable ? item?.id ?? null : index]),
          title:String(item ? item.text || "" : card.title || ""),done:Boolean(item ? item.done : card.done),
          group:card.category || "",sourceLabel:kinds[card.type],sourceTitle:card.title || kinds[card.type],
          dateKey:"",completedOn:completion?.on || "",completedAt:completion?.at || 0,priority:card.priority || "normal"};
      });
    });
  }
  function resolve(board,ref) {
    if (!ref || ref.boardId!==board?.id) throw new Error("This task belongs to a different board. Your draft is kept.");
    const matches=cards(board).filter(card=>card.id===ref.cardId);
    if(matches.length!==1 || !eligible(matches[0]) || matches[0].type!==ref.kind) throw new Error("The source card changed, moved or was archived. Your draft is kept.");
    const card=matches[0];
    if(!usableId(card.id)) throw new Error("This card has no stable identity. Edit the source card instead.");
    if(card.type==="single") return {card,item:null};
    const items=(Array.isArray(card.items)?card.items:[]).filter(item=>item && item.id===ref.itemId);
    if(!usableId(ref.itemId) || items.length!==1) throw new Error("This task cannot be identified safely. Edit the source card instead.");
    return {card,item:items[0]};
  }
  function change(board,ref,expected,updates,{day=dateOf(Date.now()),now=Date.now()}={}) {
    const {card,item}=resolve(board,ref),before=snapshot(card,item);
    if(!equal(before,expected)) throw new Error("This task changed elsewhere. Your draft is kept; review the source card before saving.");
    if(!updates || Object.keys(updates).some(key=>!['title','done','completedOn'].includes(key))) throw new Error("Unsupported task change.");
    if(Object.hasOwn(updates,'title') && (typeof updates.title!=="string" || !updates.title.trim())) throw new Error("Enter a task name.");
    if(Object.hasOwn(updates,'done') && typeof updates.done!=="boolean") throw new Error("Invalid completion state.");
    if(Object.hasOwn(updates,'completedOn') && (!validDate(updates.completedOn) || updates.completedOn>dateOf(now) || !(updates.done ?? (item || card).done)))throw new Error('Choose a past or current completion date for a completed task.');
    if(Object.hasOwn(updates,'done') && !validDate(day))throw new Error('Choose a valid completion date.');
    const target=item || card;
    const changesCompletion=Object.hasOwn(updates,'completedOn') && knownCompletion(target)?.on!==updates.completedOn || Object.hasOwn(updates,'done') && updates.done!==Boolean(target.done);
    if(changesCompletion && (!Number.isFinite(now) || now<=0 || Object.hasOwn(target,'taskCompletionEvents') && !Array.isArray(target.taskCompletionEvents)))throw new Error('Completion history needs review. The original record was kept.');
    if(Object.hasOwn(updates,'title')) target[item?'text':'title']=updates.title.trim();
    if(Object.hasOwn(updates,'completedOn') && knownCompletion(target)?.on!==updates.completedOn)complete(target,updates.done ?? target.done,updates.completedOn,now);
    else if(Object.hasOwn(updates,'done') && updates.done!==Boolean(target.done))complete(target,updates.done,day,now);
    return {ref:copy(ref),before,after:snapshot(card,item)};
  }
  function restore(board,transaction) {
    const {card,item}=resolve(board,transaction.ref);
    if(!equal(snapshot(card,item),transaction.after)) throw new Error("This task changed again. Undo was not applied.");
    if(item){for(const key of Object.keys(item))delete item[key];Object.assign(item,copy(transaction.before));}
    else {card.title=transaction.before.title;card.done=transaction.before.done;for(const key of completionKeys){delete card[key];if(Object.hasOwn(transaction.before,key))card[key]=copy(transaction.before[key]);}}
    return {ref:transaction.ref,before:transaction.after,after:transaction.before};
  }
  const api={collect,resolve,change,restore,complete,knownCompletion,validDate};
  root.LifeTaskRepository=api;
  if(typeof module!=="undefined" && module.exports)module.exports=api;
})(typeof globalThis!=="undefined" ? globalThis : this);
