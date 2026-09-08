(function(root) {
  "use strict";
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const keyed = value => Array.isArray(value) && value.every(item => object(item) && typeof item.id === "string") && new Set(value.map(item => item.id)).size === value.length;
  const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
  const plannerPath = path => Array.isArray(path) && path.length === 6 && path[0] === 'boards' &&
    ['cards','archivedCards'].includes(path[2]) && path[4] === 'plannerTasks' &&
    path.every(key => typeof key === 'string' && key && !unsafeKeys.has(key));
  const taskContent = task => object(task) ? Object.fromEntries(Object.entries(task).filter(([key]) => key !== 'updatedAt')) : task;
  const taskStructure = task => object(task) ? Object.fromEntries(Object.entries(taskContent(task)).filter(([key]) => key !== 'title')) : task;
  function healthRecordType(path) {
    if (!Array.isArray(path) || path[0]!=='boards' || !['cards','archivedCards'].includes(path[2]) ||
        path.some(key=>typeof key!=='string' || !key || unsafeKeys.has(key))) return null;
    if (path.length===6 && path[4]==='foodLibrary') return 'food-definition';
    if (path.length===6 && path[4]==='foodTargets' && (path[5]==='default' || /^\d{4}-(0[1-9]|1[0-2])$/.test(path[5]))) return 'food-target';
    if (!validTaskDate(path[5])) return null;
    if (path.length===10 && path[4]==='foodEntries' && path[6]==='meals' && path[8]==='items') return 'food-item';
    if (path[4]!=='fitnessEntries') return null;
    if (path.length===7 && path[6]==='metrics') return 'body-metrics';
    if (path.length===8 && path[6]==='parts' && ['running','mobility','other'].includes(path[7])) return 'fitness-part';
    if (path.length===10 && path[6]==='parts' && ['chest','back','shoulders','arms','abs','legs'].includes(path[7]) && path[8]==='exercises') return 'fitness-exercise';
    return null;
  }
  function merge(base, local, remote) {
    const conflicts = [];
    function value(b, l, r, path) {
      if (equal(l, r) || equal(b, r)) return copy(l);
      if (equal(b, l)) return copy(r);
      const field = path.at(-1);
      if (["updatedAt", "savedAt", "movedAt"].includes(field)) return Math.max(Number(l) || 0, Number(r) || 0);
      if (["updatedBy", "activeDate", "activePlannerDate", "plannerViewDate", "activeFoodDate", "activeFitnessDate", "activeSideNoteDate", "activeFoodMealId"].includes(field)) return copy(l);
      const recordType=healthRecordType(path);
      if (recordType && object(l) && object(r)) {
        // Quantity and unit, nutrition basis, and a measured workout must never
        // turn into an unrecorded combination of two device versions.
        conflicts.push({kind:'health-record',recordType,path:path.join('.'),segments:path,base:copy(b),local:copy(l),remote:copy(r)});
        return copy(l);
      }
      if (plannerPath(path) && object(l) && object(r)) {
        const bc=taskContent(b),lc=taskContent(l),rc=taskContent(r);
        if (equal(lc,rc) || equal(bc,rc) || equal(bc,lc)) {
          return {...copy(equal(bc,lc)?r:l),updatedAt:Math.max(Number(l.updatedAt)||0,Number(r.updatedAt)||0)};
        }
        // Dates, completion and lifecycle belong to one task decision. Never
        // synthesize a third history from two independently edited versions.
        if (!equal(taskStructure(b),taskStructure(l)) || !equal(taskStructure(b),taskStructure(r))) {
          conflicts.push({kind:'planner-task',path:path.join('.'),segments:path,base:copy(b),local:copy(l),remote:copy(r)});
          return copy(l);
        }
      }
      if (keyed(l) && keyed(r) && (b === undefined || keyed(b))) {
        const bm = new Map((b || []).map(item => [item.id, item]));
        const lm = new Map(l.map(item => [item.id, item]));
        const rm = new Map(r.map(item => [item.id, item]));
        return [...new Set([...lm.keys(), ...rm.keys()])].map(id => value(bm.get(id), lm.get(id), rm.get(id), [...path,id])).filter(item => item !== undefined);
      }
      if (object(l) && object(r) && (b === undefined || object(b))) {
        const result = {};
        for (const k of new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)])) {
          if (unsafeKeys.has(k)) continue;
          // These are compatibility projections, not a second task database.
          if (l.plannerSchemaVersion === 2 && r.plannerSchemaVersion === 2 && ["plannerEntries", "plannerArchivedTasks"].includes(k)) { result[k] = copy(l[k]); continue; }
          const merged = value(b?.[k], l[k], r[k], [...path,k]);
          if (merged !== undefined) result[k] = merged;
        }
        return result;
      }
      conflicts.push({path:path.join('.'),segments:path,base:copy(b),local:copy(l),remote:copy(r)});
      return copy(l);
    }
    const boards = value(base?.boards, local.boards, remote.boards, ["boards"]) || [];
    const deletedBoardIds = {...(remote.deletedBoardIds || {}), ...(local.deletedBoardIds || {})};
    return {boards: boards.filter(board => !deletedBoardIds[board.id]), deletedBoardIds, conflicts};
  }
  function registerConflicts(records, resolutions = {}, createId = () => crypto.randomUUID()) {
    resolutions=object(resolutions)?resolutions:{};
    const result=[];
    for (const record of Array.isArray(records)?records:[]) {
      if (!object(record) || (record.id && Object.hasOwn(resolutions,record.id))) continue;
      if (result.some(item=>equal(item.segments || item.path,record.segments || record.path) && equal(item.local,record.local) && equal(item.remote,record.remote) && item.source===record.source && item.baseDigest===record.baseDigest)) continue;
      const id=record.id && !result.some(item=>item.id===record.id)?record.id:createId();
      result.push({...copy(record),id});
    }
    return result;
  }

  function locate(snapshot, segments) {
    if (!Array.isArray(segments) || segments.length<3 || segments[0]!=='boards' || segments.some(key=>typeof key!=='string' || unsafeKeys.has(key))) return null;
    let node=snapshot;
    for (let index=0;index<segments.length;index++) {
      const key=segments[index];
      if (Array.isArray(node)) {
        const matches=node.filter(item=>object(item) && item.id===key);
        if (matches.length!==1 || index===segments.length-1) return null;
        node=matches[0];
      } else if (object(node) && Object.hasOwn(node,key)) {
        if (index===segments.length-1) return {parent:node,key,value:node[key]};
        node=node[key];
      } else return null;
    }
    return null;
  }

  const textFields=new Set(['name','title','description','thoughts','sentence','text','note','quoteAuthor']);
  function inspectTextConflict(snapshot,conflict) {
    const field=locate(snapshot,conflict?.segments);
    const editable=Boolean(field && textFields.has(field.key) && typeof field.value==='string' && typeof conflict.local==='string' && typeof conflict.remote==='string');
    return {editable,current:field?.value};
  }

  function resolveTextConflict(snapshot,conflict,expected,text,now=Date.now()) {
    const live=(snapshot.syncConflicts || []).find(item=>item.id===conflict.id);
    if (!live || !equal(live,conflict)) throw new Error('This comparison has changed. Refresh the comparison before saving.');
    if (!inspectTextConflict(snapshot,live).editable || typeof text!=='string') throw new Error('This change needs a recovery copy; it cannot be applied as text.');
    if (!equal(locate(snapshot,live.segments).value,expected)) throw new Error('This entry changed after you opened it. Refresh the comparison before saving.');
    const next=copy(snapshot),field=locate(next,live.segments);
    field.parent[field.key]=text;
    field.parent.updatedAt=now;
    next.boards.find(board=>board.id===live.segments[1]).updatedAt=now;
    next.updatedAt=now;next.hasUserChanges=true;
    next.syncConflicts=next.syncConflicts.filter(item=>item.id!==live.id);
    next.conflictResolutions={...(next.conflictResolutions || {}),[live.id]:{
      resolvedAt:now,source:live.source || 'device',ownerId:live.ownerId,
      segments:live.segments,base:live.base,remote:live.remote,baseDigest:live.baseDigest
    }};
    return next;
  }

  function locatePlannerTask(snapshot,segments) {
    if (!plannerPath(segments)) return null;
    const collection=locate(snapshot,segments.slice(0,-1));
    if (!collection || collection.parent.type!=='planner' || collection.parent.plannerSchemaVersion!==2 || !keyed(collection.value)) return null;
    const index=collection.value.findIndex(task=>task.id===segments[5]);
    return index<0?null:{...collection,index,task:collection.value[index]};
  }

  function validTaskDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date=new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
  }

  function reviewableTask(task,id) {
    if (!object(task) || task.id!==id || typeof task.title!=='string' || !task.title.trim() || task.legacyNeedsReview ||
        Object.keys(task).some(key=>unsafeKeys.has(key)) || !validTaskDate(task.dateKey) || !validTaskDate(task.originalDateKey) || typeof task.done!=='boolean') return false;
    if (!['createdAt','updatedAt','completedAt','completionRecordedAt','archivedAt','deletedAt'].every(key=>Number.isSafeInteger(task[key]) && task[key]>=0 && Number.isFinite(new Date(task[key]).getTime()))) return false;
    return task.done ? validTaskDate(task.completedOn) && task.completedAt>0
      : task.completedOn==='' && task.completedAt===0 && task.completionRecordedAt===0;
  }

  function inspectPlannerTaskConflict(snapshot,conflict) {
    const location=locatePlannerTask(snapshot,conflict?.segments);
    const editable=Boolean(conflict?.kind==='planner-task' && location &&
      [location.task,conflict.local,conflict.remote].every(task=>reviewableTask(task,conflict.segments[5])));
    return {editable,current:copy(location?.task)};
  }

  function locateHealthRecord(snapshot,segments) {
    const recordType=healthRecordType(segments);
    if (!recordType) return null;
    const cardCollection=locate(snapshot,segments.slice(0,3));
    if (!cardCollection || !keyed(cardCollection.value)) return null;
    const card=cardCollection.value.find(card=>card.id===segments[3]);
    if (!card || card.type!==(recordType.startsWith('food-')?'food':'fitness')) return null;
    const parent=locate(snapshot,segments.slice(0,-1));
    if (!parent) return null;
    const key=segments.at(-1);
    let location;
    if (Array.isArray(parent.value)) {
      if (!keyed(parent.value)) return null;
      const index=parent.value.findIndex(record=>record.id===key);
      if (index<0) return null;
      location={parent:parent.value,key:index,value:parent.value[index]};
    } else location=locate(snapshot,segments);
    if (!location) return null;
    return {...location,card,recordType};
  }

  function reviewableHealthRecord(record,segments) {
    const type=healthRecordType(segments);
    if (!object(record) || Object.keys(record).some(key=>unsafeKeys.has(key))) return false;
    const number=(key,optional=false)=>optional && record[key]==='' || typeof record[key]==='number' && Number.isFinite(record[key]) && record[key]>=0;
    const strings=keys=>keys.every(key=>typeof record[key]==='string');
    const nutrition=()=>['calories','protein','carbs','fat','fiber'].every(key=>number(key));
    if (type==='food-target') return nutrition();
    if (type==='food-item' || type==='food-definition') {
      if (record.id!==segments.at(-1) || !strings(['name','servingUnit','source']) || !record.name.trim() || !record.servingUnit.trim() ||
          !number('servingGrams') || record.servingGrams<1 || !nutrition()) return false;
      return type==='food-definition' || strings(['foodId']) && record.foodId && number('amount') && ['g','serving'].includes(record.unit);
    }
    if (type==='fitness-exercise') return record.id===segments.at(-1) && strings(['name','reps','notes']) && record.name.trim() &&
      ['sets','weightKg','rpe'].every(key=>number(key,true));
    if (type==='fitness-part') return typeof record.active==='boolean' && strings(['notes']) && number('durationMinutes',true) &&
      (segments[7]==='running' ? number('distanceKm',true) && ['Easy','Moderate','Hard','Max'].includes(record.intensity) : strings(['area']));
    if (type==='body-metrics') {
      if (!['weightKg','heightCm','bmi','bodyFatPercent','chestCm','waistCm','leftArmCm','rightArmCm','restingHr','sleepHours','energy'].every(key=>number(key,true))) return false;
      if (record.bodyFatPercent!=='' && record.bodyFatPercent>100 || record.energy!=='' && (record.energy<1 || record.energy>5)) return false;
      return !(record.weightKg>0 && record.heightCm>0) || record.bmi===Number((record.weightKg/(record.heightCm/100)**2).toFixed(1));
    }
    return false;
  }

  function inspectHealthConflict(snapshot,conflict) {
    const location=locateHealthRecord(snapshot,conflict?.segments);
    const editable=Boolean(conflict?.kind==='health-record' && location && conflict.recordType===location.recordType &&
      [location.value,conflict.local,conflict.remote].every(record=>reviewableHealthRecord(record,conflict.segments)));
    return {editable,current:copy(location?.value)};
  }

  function resolveHealthConflict(snapshot,conflict,expected,selected,now=Date.now()) {
    const live=(snapshot.syncConflicts || []).find(item=>item.id===conflict.id);
    if (!live || !equal(live,conflict)) throw new Error('This comparison has changed. Refresh the comparison before saving.');
    const inspection=inspectHealthConflict(snapshot,live);
    if (!inspection.editable) throw new Error('This health record is missing, moved or incomplete. Keep the recovery copy; no values were guessed.');
    if (!equal(inspection.current,expected)) throw new Error('This health record changed after you opened it. Refresh the comparison before saving.');
    if (![expected,live.local,live.remote].some(record=>equal(record,selected))) throw new Error('Choose one of the displayed health versions.');
    const next=copy(snapshot),location=locateHealthRecord(next,live.segments);
    location.parent[location.key]=copy(selected);
    location.card.updatedAt=now;
    const entry=location.card[live.segments[4]]?.[live.segments[5]];
    if (['foodEntries','fitnessEntries'].includes(live.segments[4])) entry.updatedAt=now;
    next.boards.find(board=>board.id===live.segments[1]).updatedAt=now;
    next.updatedAt=now;next.hasUserChanges=true;
    next.syncConflicts=next.syncConflicts.filter(item=>item.id!==live.id);
    next.conflictResolutions={...(next.conflictResolutions || {}),[live.id]:{
      kind:'health-record',recordType:live.recordType,resolvedAt:now,source:live.source || 'device',ownerId:live.ownerId,
      segments:live.segments,base:live.base,remote:live.remote,baseDigest:live.baseDigest
    }};
    return next;
  }

  function resolvePlannerTaskConflict(snapshot,conflict,expected,selected,now=Date.now()) {
    const live=(snapshot.syncConflicts || []).find(item=>item.id===conflict.id);
    if (!live || !equal(live,conflict)) throw new Error('This comparison has changed. Refresh the comparison before saving.');
    const inspection=inspectPlannerTaskConflict(snapshot,live);
    if (!inspection.editable) throw new Error('This task history needs a recovery copy; it cannot be safely chosen here.');
    if (!equal(inspection.current,expected)) throw new Error('This task changed after you opened it. Refresh the comparison before saving.');
    if (![expected,live.local,live.remote].some(task=>equal(task,selected))) throw new Error('Choose one of the displayed task versions.');
    const next=copy(snapshot),location=locatePlannerTask(next,live.segments);
    location.value[location.index]={...copy(selected),updatedAt:now};
    location.parent.updatedAt=now;
    next.boards.find(board=>board.id===live.segments[1]).updatedAt=now;
    next.updatedAt=now;next.hasUserChanges=true;
    next.syncConflicts=next.syncConflicts.filter(item=>item.id!==live.id);
    next.conflictResolutions={...(next.conflictResolutions || {}),[live.id]:{
      kind:'planner-task',resolvedAt:now,source:live.source || 'device',ownerId:live.ownerId,
      segments:live.segments,base:live.base,remote:live.remote,baseDigest:live.baseDigest
    }};
    return next;
  }

  function reviewedCloudBaseline(snapshot,resolutions,ownerId,baseDigest) {
    const next=copy(snapshot);
    for(const receipt of Object.values(object(resolutions)?resolutions:{}).filter(object).sort((a,b)=>a.resolvedAt-b.resolvedAt)) {
      if (receipt?.source!=='cloud' || receipt.ownerId!==ownerId || !baseDigest || receipt.baseDigest!==baseDigest) continue;
      if (receipt.kind==='health-record') {
        const location=locateHealthRecord(next,receipt.segments);
        if (location && location.recordType===receipt.recordType && reviewableHealthRecord(receipt.remote,receipt.segments) && equal(location.value,receipt.base)) {
          location.parent[location.key]=copy(receipt.remote);
        }
        continue;
      }
      if (receipt.kind==='planner-task') {
        const location=locatePlannerTask(next,receipt.segments);
        if (location && reviewableTask(receipt.remote,receipt.segments[5]) && equal(location.task,receipt.base)) {
          location.value[location.index]=copy(receipt.remote);
        }
        continue;
      }
      const field=locate(next,receipt.segments);
      if (field && textFields.has(field.key) && typeof receipt.remote==='string' && equal(field.value,receipt.base)) field.parent[field.key]=receipt.remote;
    }
    return next;
  }

  async function fingerprint(value) {
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  const api = {merge,copy,equal,registerConflicts,inspectTextConflict,resolveTextConflict,inspectPlannerTaskConflict,resolvePlannerTaskConflict,inspectHealthConflict,resolveHealthConflict,reviewedCloudBaseline,fingerprint};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LifeStateMerge = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
