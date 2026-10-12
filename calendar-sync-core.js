(function(root) {
  "use strict";
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
  function nextDay(day) { if(!validDate(day))throw new Error("Invalid calendar date.");return new Date(Date.parse(day+"T00:00:00Z")+86400000).toISOString().slice(0,10); }
  function managed(event) {
    // Do not include notes, guests, reminders or unrelated Google properties.
    const time = value => value?.date?{date:value.date}:value?.dateTime?{dateTime:new Date(value.dateTime).toISOString()}:null;
    const p=event.extendedProperties?.private || {};
    return {summary:event.summary || "",location:event.location || "",start:time(event.start),end:time(event.end),
      extendedProperties:{private:Object.fromEntries(["lifeos","board","kind","source","record"].filter(key=>Object.hasOwn(p,key)).map(key=>[key,p[key]]))}};
  }
  const equal = (a,b) => JSON.stringify(managed(a))===JSON.stringify(managed(b));
  function resume(events,lastId="") {
    const ordered=events.slice().sort((a,b)=>a.id.localeCompare(b.id));
    const index=ordered.findIndex(event=>event.id>lastId);
    return index>0?[...ordered.slice(index),...ordered.slice(0,index)]:ordered;
  }
  async function eventId(owner,board,kind,source,id) {
    const bytes=new TextEncoder().encode(JSON.stringify([owner,board,kind,source,id]));
    return "10"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
  }
  async function collect(owner,board,planner) {
    if(!board?.id || !Array.isArray(board.cards))throw new Error("Board data needs review before syncing.");
    const result=[],ids=new Set(),sources=new Set();
    for(const card of [...board.cards,...(board.archivedCards || [])]) {
      if(card?.type!=="planner" || card.coachingStore || card.dailyWorkspaceStore || sources.has(card.id))continue;
      if(!card.id)throw new Error("A planner source has no stable ID.");sources.add(card.id);
      // Migration happens only on a private copy; the cloud source is never changed.
      const tasks=planner.ensure(JSON.parse(JSON.stringify(card)));
      for(const task of tasks) {
        if(!planner.active(task) || task.status==="parked" || !validDate(task.dateKey))continue;
        if(!task.id || !String(task.title || "").trim())throw new Error("A task needs review before syncing.");
        const id=await eventId(owner,board.id,"task",card.id,task.id);
        if(ids.has(id))throw new Error("Duplicate task IDs need review before syncing.");ids.add(id);
        result.push({id,summary:(task.done?"Completed: ":"")+task.title,start:{date:task.dateKey},end:{date:nextDay(task.dateKey)},
          extendedProperties:{private:{lifeos:"1",board:board.id,kind:"task",source:card.id,record:task.id}}});
      }
    }
    for(const card of board.cards) {
      if(card?.type!=="event" || !card.activity)continue;
      const a=card.activity;
      if(!card.id || !String(a.title || "").trim())throw new Error("An activity needs review before syncing.");
      let start,end;
      if(a.allDay) {
        if(!validDate(a.startDate) || !validDate(a.endDate) || a.endDate<a.startDate)throw new Error("Invalid activity dates.");
        start={date:a.startDate};end={date:nextDay(a.endDate)};
      } else {
        if(!Number.isFinite(Date.parse(a.startAt)) || !Number.isFinite(Date.parse(a.endAt)) || Date.parse(a.endAt)<=Date.parse(a.startAt))throw new Error("Invalid activity times.");
        start={dateTime:new Date(a.startAt).toISOString()};end={dateTime:new Date(a.endAt).toISOString()};
      }
      const id=await eventId(owner,board.id,"activity",card.id,card.id);
      if(ids.has(id))throw new Error("Duplicate activity IDs need review before syncing.");ids.add(id);
      result.push({id,summary:a.title,location:a.location || "",start,end,
        extendedProperties:{private:{lifeos:"1",board:board.id,kind:"activity",source:card.id,record:card.id}}});
    }
    return result;
  }
  async function syncOne(desired,receipt,api,save) {
    let previous=receipt;
    const current=await api.get(desired.id);
    if(current?.status==="cancelled" || (!current && previous && (!previous.pending || previous.body)))return {status:"conflict",reason:"Removed in Google"};
    if(current && !current.etag)return {status:"conflict",reason:"Google version could not be verified"};
    if(current && current.extendedProperties?.private?.lifeos!=="1")return {status:"conflict",reason:"Unrecognised Google event"};
    // A request may have succeeded even if its response/receipt was lost.
    if(previous?.pending && current && equal(current,previous.pending)) {
      previous={body:managed(current),etag:current.etag};await save(previous);
    }
    if(current && !previous && !equal(current,desired))return {status:"conflict",reason:"Google version needs review"};
    if(current && previous?.body && !equal(current,previous.body))return {status:"conflict",reason:"Edited in Google"};
    if(current && equal(current,desired)) {
      if(!previous?.body || previous.pending || previous.etag!==current.etag)await save({body:managed(current),etag:current.etag});
      return {status:"unchanged"};
    }
    await save({...previous,pending:managed(desired)});
    let updated;
    try { updated=current?await api.patch(desired.id,managed(desired),current.etag):await api.insert(desired); }
    catch(error) {
      if(error.status===412)return {status:"conflict",reason:"Changed during sync"};
      if(error.status!==409)throw error;
      updated=await api.get(desired.id);
      if(!updated || !equal(updated,desired))return {status:"conflict",reason:"Google version needs review"};
    }
    await save({body:managed(updated),etag:updated.etag});return {status:current?"updated":"created"};
  }
  const api={validDate,nextDay,eventId,collect,managed,equal,resume,syncOne};root.LifeCalendarSync=api;
  if(typeof module!=="undefined" && module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
