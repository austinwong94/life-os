/* A per-tab write-ahead copy is durable before a shared snapshot is replaced.
   Web Locks serialize shared writes; an interrupted commit can be replayed. */
(function(root) {
  'use strict';
  const prefix = 'life-os-pending-v2:';
  const tabId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Date.now() + '-' + Math.random();
  let sequence = 0;
  let lastSavedAt = 0;
  let flushing = null;
  let flushRequested = false;
  let commitHandler = null;
  function pending() {
    return Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => ({key,raw:localStorage.getItem(key)}))
      .map(item => ({...item,entry:JSON.parse(item.raw)})).sort((a,b)=>a.entry.savedAt-b.entry.savedAt);
  }
  function replay(snapshot) {
    let current = snapshot;
    const conflicts = [];
    for (const item of pending()) {
      if (isApplied(current,item)) continue;
      const {entry}=item;
      const merged = LifeStateMerge.merge(entry.base, entry.state, current || entry.base);
      current = {...(current || entry.state),boards:merged.boards,deletedBoardIds:merged.deletedBoardIds,deviceWriteHeads:appliedHeads(current,item)};
      conflicts.push(...merged.conflicts);
    }
    return {state:current,conflicts};
  }
  function stage(base, state) {
    // Immutable entries preserve each edit's parent, even if another tab has
    // already captured the preceding edit for a commit.
    lastSavedAt = Math.max(Date.now(), lastSavedAt + 1);
    const entry = {base,state,savedAt:lastSavedAt,writerId:tabId,sequence:++sequence};
    localStorage.setItem(prefix + tabId + ':' + sequence,JSON.stringify(entry));
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
    return navigator.locks.request('life-os-device-snapshot-v2',action);
  }
  async function cloudLocked(action) {
    if (!navigator.locks?.request) throw new Error('This browser cannot coordinate cloud saving and restoration safely. Use an up-to-date browser over HTTPS.');
    return navigator.locks.request('life-os-cloud-and-restore-v1',action);
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
  root.LifeDeviceStore={stage,replay,configure,flush,locked,cloudLocked,prefix,pending,isApplied,appliedHeads};
})(globalThis);
