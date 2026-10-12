/* A per-tab write-ahead copy is durable before a shared snapshot is replaced.
   Web Locks serialize shared writes; an interrupted commit can be replayed. */
(function(root) {
  'use strict';
  const prefix = LifeStorageScope.key('life-os-pending-v3:');
  const legacyPrefix = LifeStorageScope.key('life-os-pending-v2:');
  const tabId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Date.now() + '-' + Math.random();
  let sequence = 0;
  let lastSavedAt = 0;
  let flushing = null;
  let flushRequested = false;
  let commitHandler = null;
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
  function replay(snapshot) {
    let current = snapshot;
    const conflicts = [];
    let resolutions={...(snapshot?.conflictResolutions || {})};
    let retained=LifeStateMerge.registerConflicts(snapshot?.syncConflicts || [],resolutions);
    for (const item of pending()) {
      if (isApplied(current,item)) continue;
      const {entry}=item;
      const merged = LifeStateMerge.merge(entry.base, entry.state, current || entry.base);
      const comparisons=merged.conflicts.map(record=>({...record,source:'device',recordedAt:entry.savedAt}));
      resolutions={...resolutions,...(entry.state.conflictResolutions || {})};
      retained=LifeStateMerge.registerConflicts([...retained,...(entry.state.syncConflicts || []),...comparisons],resolutions);
      current = {...(current || entry.state),boards:merged.boards,deletedBoardIds:merged.deletedBoardIds,deviceWriteHeads:appliedHeads(current,item),syncConflicts:retained,conflictResolutions:resolutions};
      conflicts.push(...comparisons);
    }
    return {state:current,conflicts};
  }
  function stage(base, state) {
    // Immutable entries preserve each edit's parent, even if another tab has
    // already captured the preceding edit for a commit.
    lastSavedAt = Math.max(Date.now(), lastSavedAt + 1);
    const entry = {base,state,savedAt:lastSavedAt,writerId:tabId,sequence:++sequence};
    // Only the immutable journal is compressed. Existing shared snapshots and
    // recovery copies remain readable by already-open older tabs.
    const text=JSON.stringify(entry),raw=JSON.stringify({format:'life-os-wal-lz-v1',length:text.length,checksum:checksum(text),payload:LZString.compressToUTF16(text)});
    lastStageSize={originalBytes:text.length*2,storedBytes:raw.length*2};
    localStorage.setItem(prefix + tabId + ':' + sequence,raw);
    if(localStorage.getItem(prefix + tabId + ':' + sequence)!==raw)throw new Error('The browser did not retain the pending device copy.');
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
  function configure(handler) {commitHandler=handler;}
  async function locked(action) {
    if (!navigator.locks?.request) throw new Error('This browser cannot coordinate safe multi-tab saves. Your pending copy is kept. Use an up-to-date browser over HTTPS.');
    return navigator.locks.request(LifeStorageScope.key('life-os-device-snapshot-v2'),action);
  }
  async function cloudLocked(action) {
    if (!navigator.locks?.request) throw new Error('This browser cannot coordinate cloud saving and restoration safely. Use an up-to-date browser over HTTPS.');
    return navigator.locks.request(LifeStorageScope.key('life-os-cloud-and-restore-v1'),action);
  }
  async function flush() {
    flushRequested = true;
    if (flushing) return flushing;
    flushing = (async()=> {
      let accepted;
      do {
        flushRequested = false;
        accepted = await locked(()=> {
          const entries=pending();
          if (!commitHandler) return false;
          // Other tabs can stage a newer copy while this lock holder commits.
          const accepted=commitHandler(entries);
          if (accepted) for(const item of entries) {
            if(localStorage.getItem(item.key)===item.raw)localStorage.removeItem(item.key);
          }
          return accepted;
        });
      } while (accepted && (flushRequested || pending().length));
      return accepted;
    })().finally(()=>{flushing=null;});
    return flushing;
  }
  root.LifeDeviceStore={stage,replay,configure,flush,locked,cloudLocked,prefix,legacyPrefix,isPendingKey,pending,isApplied,appliedHeads,diagnostics};
})(globalThis);
