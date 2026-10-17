/* A per-tab write-ahead copy is durable before a shared snapshot is replaced.
   Web Locks serialize shared writes; an interrupted commit can be replayed. */
(function(root) {
  'use strict';
  const prefix = LifeStorageScope.key('life-os-pending-v3:');
  const legacyPrefix = LifeStorageScope.key('life-os-pending-v2:');
  const tabId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Date.now() + '-' + Math.random();
  let sequence = 0;
  let previousSequence = 0;
  let lastSavedAt = 0;
  let flushing = null;
  let flushRequested = false;
  let commitHandler = null;
  let readCommittedSnapshot=null,checkpoint=null;
  let lastStageSize = null;
  const isPendingKey = key => typeof key==='string' && (key.startsWith(prefix) || key.startsWith(legacyPrefix));
  function checksum(text) {
    let hash=2166136261;
    for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
    return (hash>>>0).toString(16);
  }
  function decode(raw, key) {
    const parsed=JSON.parse(raw);
    if(!key.startsWith(prefix))return parsed;
    if(parsed?.format!=='life-os-wal-lz-v1' || typeof parsed.payload!=='string' || !Number.isSafeInteger(parsed.length) || parsed.length<0)throw new Error('A pending device copy needs recovery. It has not been removed.');
    const text=LZString.decompressFromUTF16(parsed.payload);
    if(typeof text!=='string' || text.length!==parsed.length || checksum(text)!==parsed.checksum)throw new Error('A pending device copy failed its integrity check. It has not been removed.');
    return JSON.parse(text);
  }
  function pending() {
    return Object.keys(localStorage).filter(isPendingKey).map(key => ({key,raw:localStorage.getItem(key)}))
      .map(item => ({...item,entry:decode(item.raw,item.key)})).sort((a,b)=>a.entry.savedAt-b.entry.savedAt);
  }
  function inspectPending() {
    // Recovery/export inspection must not let one damaged packet hide the rest.
    // Commits still use pending(), which fails closed on any damaged packet.
    const entries=[],failures=[];
    let keys;
    try{keys=Object.keys(localStorage).filter(isPendingKey);}catch{return {entries,failures,unavailable:true};}
    for(const key of keys){
      let raw=null;
      try{
        raw=localStorage.getItem(key);
        if(raw===null)continue; // Another tab may have finished committing it.
        const entry=decode(raw,key);
        if(!entry || typeof entry!=='object' || !entry.state || !entry.base)throw new Error('Invalid pending copy');
        entries.push({key,raw,entry});
      }catch{failures.push({key,raw});}
    }
    return {entries,failures,unavailable:false};
  }
  function replay(snapshot) {
    let current = snapshot;
    const conflicts = [];
    let resolutions={...(snapshot?.conflictResolutions || {})};
    let retained=LifeStateMerge.registerConflicts(snapshot?.syncConflicts || [],resolutions);
    const plan=order(snapshot,pending());
    for (const item of plan.ready) {
      if (isApplied(current,item)) continue;
      const {entry}=item;
      const merged = LifeStateMerge.merge(entry.base, entry.state, current || entry.base);
      const comparisons=merged.conflicts.map(record=>({...record,source:'device',recordedAt:entry.savedAt}));
      resolutions={...resolutions,...(entry.state.conflictResolutions || {})};
      retained=LifeStateMerge.registerConflicts([...retained,...(entry.state.syncConflicts || []),...comparisons],resolutions);
      current = {...(current || entry.state),boards:merged.boards,deletedBoardIds:merged.deletedBoardIds,deviceWriteHeads:appliedHeads(current,item),syncConflicts:retained,conflictResolutions:resolutions};
      conflicts.push(...comparisons);
    }
    return {state:current,conflicts,blocked:plan.blocked};
  }
  function order(snapshot,entries,observed) {
    // Receipt dependencies, not wall-clock timestamps, establish save order.
    let heads={...(snapshot?.deviceWriteHeads || {})};
    const ready=[],remaining=[...entries],required={...(observed?.deviceWriteHeads || {})};
    if(observed && previousSequence)required[tabId]=Math.max(Number(required[tabId]) || 0,previousSequence);
    const covers=dependencies=>Object.entries(dependencies).every(([writer,n])=>{
      const expected=Number(n);return Number.isSafeInteger(expected) && expected>=0 && (expected===0 || Number(heads[writer] || 0)>=expected);
    });
    while(remaining.length){
      const index=remaining.findIndex(item=>{
        if(isApplied({deviceWriteHeads:heads},item))return true;
        const entry=item.entry,dependencies={...(entry.base?.deviceWriteHeads || {})};
        if(!covers(dependencies))return false;
        if(typeof entry.writerId==='string' && Number.isSafeInteger(entry.sequence)){
          // Old journals lack an explicit parent; still keep their queued
          // same-writer predecessors ahead of them, regardless of clock skew.
          const earlier=remaining.filter(row=>row!==item && row.entry.writerId===entry.writerId && row.entry.sequence<entry.sequence).map(row=>row.entry.sequence);
          dependencies[entry.writerId]=Math.max(Number(dependencies[entry.writerId]) || 0,Number.isSafeInteger(entry.previousSequence)?entry.previousSequence:0,...earlier);
        }
        return covers(dependencies);
      });
      if(index<0)break;
      const [item]=remaining.splice(index,1);ready.push(item);heads=appliedHeads({deviceWriteHeads:heads},item);
    }
    return {ready,blocked:remaining,observedMissing:!covers(required)};
  }
  function requireOrder(snapshot,entries,observed) {
    const plan=order(snapshot,entries,observed);
    if(plan.blocked.length || plan.observedMissing){
      const error=new Error('Waiting for another tab\'s saved copy. Your pending writing is kept; keep this tab open and retry saving.');
      error.name='DeviceCommitPendingError';throw error;
    }
    return plan.ready;
  }
  function stage(base, state) {
    // Immutable entries preserve each edit's parent, even if another tab has
    // already captured the preceding edit for a commit.
    lastSavedAt = Math.max(Date.now(), lastSavedAt + 1);
    const entry = {base,state,savedAt:lastSavedAt,writerId:tabId,sequence:++sequence,previousSequence};
    // Only the immutable journal is compressed. Existing shared snapshots and
    // recovery copies remain readable by already-open older tabs.
    const text=JSON.stringify(entry),raw=JSON.stringify({format:'life-os-wal-lz-v1',length:text.length,checksum:checksum(text),payload:LZString.compressToUTF16(text)});
    lastStageSize={originalBytes:text.length*2,storedBytes:raw.length*2};
    localStorage.setItem(prefix + tabId + ':' + sequence,raw);
    const retained=localStorage.getItem(prefix + tabId + ':' + sequence);
    if(retained!==raw){
      const saved=retained===null && readCommittedSnapshot?readCommittedSnapshot():null;
      const receipt=saved?.deviceWriteHeads && Object.hasOwn(saved.deviceWriteHeads,tabId)?saved.deviceWriteHeads[tabId]:null;
      if(!Number.isSafeInteger(receipt) || receipt<sequence)throw new Error('The browser did not retain the pending device copy.');
    }
    previousSequence=sequence;
  }
  function diagnostics() {
    let totalBytes=0,pendingBytes=0,legacyCopies=0;
    for(const key of Object.keys(localStorage)){
      const bytes=(key.length+(localStorage.getItem(key)?.length || 0))*2;totalBytes+=bytes;
      if(isPendingKey(key))pendingBytes+=bytes;
      if(key.startsWith(legacyPrefix))legacyCopies++;
    }
    return {totalBytes,pendingBytes,legacyCopies,lastStageSize};
  }
  function isApplied(snapshot,item) {
    const {writerId,sequence}=item.entry;
    return typeof writerId==='string' && Number.isSafeInteger(sequence) && sequence>0 &&
      Number(snapshot?.deviceWriteHeads?.[writerId] || 0)>=sequence;
  }
  function appliedHeads(snapshot,item) {
    const heads=snapshot?.deviceWriteHeads || {};
    const {writerId,sequence}=item.entry;
    return typeof writerId==='string' && Number.isSafeInteger(sequence) && sequence>0
      ? {...heads,[writerId]:Math.max(Number(heads[writerId]) || 0,sequence)} : {...heads};
  }
  function configure(handler,options={}) {
    commitHandler=handler;
    if(options.readSnapshot)readCommittedSnapshot=options.readSnapshot;
    if(options.checkpoint)checkpoint=options.checkpoint;
  }
  function checkpointSnapshot(){return checkpoint?.snapshot() || null;}
  async function readCheckpoint(){return checkpoint?await checkpoint.read():null;}
  function acceptRestoredSnapshot(snapshot) {
    // Only after a reviewed restore is persisted under the device lock.
    const receipt=Number(snapshot?.deviceWriteHeads?.[tabId] || 0);
    previousSequence=Number.isSafeInteger(receipt) && receipt>=0?receipt:0;
  }
  async function locked(action,options={}) {
    if (!navigator.locks?.request) throw new Error('This browser cannot coordinate safe multi-tab saves. Your pending copy is kept. Use an up-to-date browser over HTTPS.');
    return navigator.locks.request(LifeStorageScope.key('life-os-device-snapshot-v2'),async()=>{
      const previous=checkpoint?await checkpoint.check(readCommittedSnapshot,options):null;
      const result=await action({checkpoint:previous});
      if(checkpoint)await checkpoint.confirm(readCommittedSnapshot);
      if(options.afterConfirmed)options.afterConfirmed();
      return result;
    });
  }
  async function cloudLocked(action) {
    if (!navigator.locks?.request) throw new Error('This browser cannot coordinate cloud saving and restoration safely. Use an up-to-date browser over HTTPS.');
    return navigator.locks.request(LifeStorageScope.key('life-os-cloud-and-restore-v1'),action);
  }
  async function flush() {
    flushRequested = true;
    if (flushing) return flushing;
    flushing = (async()=> {
      let accepted,deferrals=0;
      do {
        flushRequested = false;
        try{
          let acknowledged=[];
          accepted = await locked(()=> {
            const entries=pending();
            if (!commitHandler) return false;
            // Other tabs can stage a newer copy while this lock holder commits.
            const accepted=commitHandler(entries);
            if(accepted)acknowledged=entries;
            return accepted;
          },{afterConfirmed:()=>{
            for(const item of acknowledged)if(localStorage.getItem(item.key)===item.raw)localStorage.removeItem(item.key);
          }});
        }
        catch(error){
          if(error.name!=='DeviceCommitPendingError' || ++deferrals>8)throw error;
          // Release the lock before yielding so storage notifications and the
          // prerequisite writer can progress. Correctness never depends on delay.
          await new Promise(resolve=>setTimeout(resolve,Math.min(150,2**deferrals)));
          accepted=true;flushRequested=true;
        }
      // Honour a new explicit request even when the preceding attempt refused.
      // A refusal with no new request still stops without draining its packets.
      } while (flushRequested || (accepted && pending().length));
      return accepted;
    })().finally(()=>{flushing=null;});
    return flushing;
  }
  root.LifeDeviceStore={stage,replay,order,requireOrder,configure,checkpointSnapshot,readCheckpoint,acceptRestoredSnapshot,flush,locked,cloudLocked,prefix,legacyPrefix,isPendingKey,pending,inspectPending,isApplied,appliedHeads,diagnostics};
})(globalThis);
