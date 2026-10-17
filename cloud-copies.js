(function(root) {
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function checksum(text) {
    let hash=2166136261;
    for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
    return (hash>>>0).toString(16);
  }
  function encodeBase(base,codec) {
    const text=JSON.stringify(base),payload=codec.compressToUTF16(text);
    const encoded={format:'life-os-cloud-base-lz-v1',length:text.length,checksum:checksum(text),payload};
    if(JSON.stringify(decodeBase(encoded,codec))!==text)throw new Error('Sync history compression failed its integrity check.');
    return encoded;
  }
  function decodeBase(value,codec) {
    if(!value)return null;
    if(value.format!=='life-os-cloud-base-lz-v1')return value;
    if(typeof value.payload!=='string' || !Number.isSafeInteger(value.length) || value.length<0)throw new Error('Saved sync history needs recovery. It has not been removed.');
    const text=codec.decompressFromUTF16(value.payload);
    if(typeof text!=='string' || text.length!==value.length || checksum(text)!==value.checksum)throw new Error('Saved sync history failed its integrity check. It has not been removed.');
    const base=JSON.parse(text);
    if(typeof base?.ownerId!=='string' || !base.ownerId || !Array.isArray(base.state?.boards))throw new Error('Saved sync history is invalid. It has not been removed.');
    return base;
  }
  function canonical(value) {
    if(Array.isArray(value))return value.map(canonical);
    if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    return value;
  }
  const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const cards=board=>[...(board.cards || []),...(board.archivedCards || [])];
  function records(snapshot) {
    const boards=copy(snapshot?.boards || []);
    for(const board of boards)for(const card of cards(board)) {
      // Automatic daily clocks advance during review, including archived cards.
      // Exclude only valid derived clocks; writing, history and ticks stay exact.
      if((card.type==='routine' || card.timerMode==='daily') && card.timerMode==='daily' && typeof card.targetAt==='string' && Number.isFinite(Date.parse(card.targetAt)) && ['duration','remaining'].every(k=>Number.isFinite(card[k]) && card[k]>=0) && (card.runningSince===null || Number.isFinite(card.runningSince) && card.runningSince>=0)) {
        for(const key of ['targetAt','duration','remaining','runningSince'])delete card[key];
      }
    }
    return {boards,deletedBoardIds:snapshot?.deletedBoardIds || {},cloudOwnerId:snapshot?.cloudOwnerId || '',syncConflicts:snapshot?.syncConflicts || [],conflictResolutions:snapshot?.conflictResolutions || {}};
  }
  function changedBoardIds(current,baseline) {
    const index=snapshot=>{
      if(!Array.isArray(snapshot?.boards) || snapshot.deletedBoardIds!==undefined && (!snapshot.deletedBoardIds || typeof snapshot.deletedBoardIds!=='object' || Array.isArray(snapshot.deletedBoardIds)))throw new Error('Board records cannot be compared safely.');
      const rows=new Map();
      for(const board of snapshot.boards){
        if(!board || typeof board.id!=='string' || !board.id || rows.has(board.id))throw new Error('Board identities cannot be compared safely.');
        rows.set(board.id,board);
      }
      const normalized=records(snapshot);
      return {boards:new Map(normalized.boards.map(board=>[board.id,board])),deleted:normalized.deletedBoardIds};
    };
    const local=index(current),base=index(baseline);
    const ids=new Set([...local.boards.keys(),...base.boards.keys(),...Object.keys(local.deleted),...Object.keys(base.deleted)]);
    const receipt=(map,id)=>Object.hasOwn(map,id)?{value:map[id]}:null;
    return [...ids].filter(id=>!equal(local.boards.get(id),base.boards.get(id)) || !equal(receipt(local.deleted,id),receipt(base.deleted,id)));
  }
  function retained(snapshot) {
    return (snapshot.boards || []).flatMap(board=>cards(board).filter(card=>card.preservedCloudSnapshot?.format==='life-os-preserved-cloud-v1').map(card=>card.preservedCloudSnapshot));
  }
  function counts(snapshot) {
    const records=(snapshot.boards || []).flatMap(cards).filter(card=>!card.preservedCloudSnapshot);
    return {boards:(snapshot.boards || []).length,diary:records.reduce((n,c)=>n+Object.keys(c.diaryEntries || {}).length,0),notes:records.reduce((n,c)=>n+Object.values(c.sideNoteEntries || {}).reduce((m,e)=>m+(e.notes || []).length,0),0),tasks:records.reduce((n,c)=>n+(c.plannerTasks || c.items || []).length,0)};
  }
  function preserve(current,remote,{ownerId,cloudUpdatedAt,digest,now}) {
    if(!ownerId || !digest || !cloudUpdatedAt || !Number.isSafeInteger(now) || !current.boards?.length || !remote.boards?.length)throw new Error('Both complete copies and their owner must be verified first.');
    if([current,remote].some(s=>s.cloudOwnerId && s.cloudOwnerId!==ownerId))throw new Error('The copies belong to different accounts. Nothing was replaced.');
    const next=copy(current),id='preserved-cloud:'+ownerId+':'+digest;
    const existing=next.boards.flatMap(cards).find(card=>card.id===id);
    if(existing && !equal(existing.preservedCloudSnapshot?.state,remote))throw new Error('The preserved copy changed. Nothing was replaced.');
    if(!existing) {
      const board=next.boards.find(b=>b.id===next.activeBoardId) || next.boards[0];
      board.archivedCards=[...(board.archivedCards || []),{id,type:'quote',title:'Preserved cloud copy',description:'Historical cloud records. Open Settings > Recovery copies to read or download them. This copy is not an active planner or diary.',category:'Recovery',timerMode:'none',theme:'leaf',background:'clean',createdAt:now,updatedAt:now,archivedAt:now,order:0,preservedCloudSnapshot:{format:'life-os-preserved-cloud-v1',ownerId,cloudUpdatedAt,preservedAt:now,digest,state:copy(remote)}}];
      if(board.id===next.activeBoardId)next.archivedCards=copy(board.archivedCards);
    }
    next.cloudOwnerId=ownerId;
    return next;
  }
  const api={canonical,equal,records,changedBoardIds,counts,retained,preserve,encodeBase,decodeBase};
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.LifeCloudCopies=api;
})(typeof window==='object'?window:globalThis);

async function reviewCloudCopies(session,row) {
  if(PREVIEW_MODE)throw new Error('Cloud access is disabled in this preview.');
  if(!await flushDeviceWrites())return {allowed:false};
  const current=getStateForStorage(),ownerId=session.user.id;
  const digest=await LifeStateMerge.fingerprint(LifeCloudCopies.canonical(row.state));
  const modal=document.createElement('div');modal.className='modal-backdrop';modal.id='cloudCopiesReview';
  const dialog=document.createElement('section');dialog.className='recovery-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','cloudCopiesTitle');
  const header=document.createElement('header');header.className='modal-header';
  const title=document.createElement('h2');title.id='cloudCopiesTitle';title.textContent='Compare device and cloud';header.append(title);
  const body=document.createElement('div');body.className='recovery-body';
  const explanation=document.createElement('p');explanation.textContent='No shared sync history is available. Keep your current device records active and preserve the entire older cloud copy in Recovery. Old tasks and deleted boards will not be reopened. If this is not your latest device, cancel and open the device with your newest writing.';body.append(explanation);
  for(const [label,snapshot] of [['This device',current],['Cloud copy',row.state]]) {
    const line=document.createElement('p'),n=LifeCloudCopies.counts(snapshot);
    line.textContent=label+': '+n.boards+' boards, '+n.diary+' diary dates. Last record change: '+formatRecordDateTime(snapshot.updatedAt)+'.';body.append(line);
  }
  const downloads=document.createElement('div');downloads.className='recovery-row';
  for(const [label,snapshot] of [['Download device backup',current],['Download cloud backup',row.state]]) {
    const button=document.createElement('button');button.type='button';button.className='secondary-action';button.textContent=label;
    button.onclick=()=>downloadTextFile('life-os-'+(snapshot===current?'device':'cloud')+'-before-sync.json',JSON.stringify(snapshot,null,2),'application/json');downloads.append(button);
  }
  body.append(downloads);
  const message=document.createElement('p');message.className='conflict-message';message.setAttribute('role','status');body.append(message);
  const actions=document.createElement('div');actions.className='recovery-row';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary-action';cancel.textContent='Cancel comparison';
  const keep=document.createElement('button');keep.type='button';keep.className='primary-action';keep.textContent='Keep device + preserve cloud';actions.append(cancel,keep);body.append(actions);dialog.append(header,body);modal.append(dialog);document.body.append(modal);syncModalOpenState();cancel.focus();
  return new Promise(resolve=>{
    const finish=result=>{modal.remove();syncModalOpenState();resolve(result);};
    cancel.onclick=()=>finish({allowed:false,conflict:true});
    modal.addEventListener('keydown',event=>{
      if(event.key==='Escape' && !keep.disabled){event.stopPropagation();cancel.click();}
      if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}
    });
    keep.onclick=async()=>{
      keep.disabled=true;cancel.disabled=true;
      try {
        const verifiedSession=await ensureCloudSession();
        if(verifiedSession.user.id!==ownerId || cloudSession?.user.id!==ownerId)throw new Error('The signed-in account changed. Cancel and compare again.');
        const fresh=await fetchCloudStateRow(verifiedSession);
        if(!fresh || fresh.updated_at!==row.updated_at || !LifeCloudCopies.equal(fresh.state,row.state))throw new Error('Cloud records changed during review. Cancel and compare again.');
        if(!await flushDeviceWrites())throw new Error('Device saving needs attention. No cloud records were replaced.');
        await LifeDeviceStore.locked(async()=>{
          const stored=readStoredStateSnapshot();
          if(cloudSession?.user.id!==ownerId)throw new Error('The signed-in account changed. Cancel and compare again.');
          if(state.syncConflicts?.length || !LifeCloudCopies.equal(LifeCloudCopies.records(current),LifeCloudCopies.records(getStateForStorage())) || !LifeCloudCopies.equal(LifeCloudCopies.records(current),LifeCloudCopies.records(stored)))throw new Error('Device records changed during review. Cancel and compare again.');
          const latest=getStateForStorage();
          if(!saveCloudRecoveryPoint('before-cloud-reconciliation',latest))throw new Error('The device backup could not be saved. No cloud records were replaced.');
          const candidate=LifeCloudCopies.preserve(latest,row.state,{ownerId,cloudUpdatedAt:row.updated_at,digest,now:Date.now()});
          state.boards=candidate.boards.map(createBoardRecord);state.cloudOwnerId=ownerId;reconcileActiveBoard();
          if(!saveState({skipCloud:true,touch:false}))throw new Error('The preserved copy could not be staged. No cloud records were replaced.');
        });
        if(!await flushDeviceWrites())throw new Error('The preserved copy could not be saved. No cloud records were replaced.');
        const preserved=LifeCloudCopies.retained(getStateForStorage()).find(c=>c.digest===digest && c.ownerId===ownerId);
        if(!preserved || !LifeCloudCopies.equal(preserved.state,row.state))throw new Error('The preserved cloud copy could not be verified. No cloud records were replaced.');
        cloudConflictPending=false;
        finish({allowed:true,expectedUpdatedAt:row.updated_at});
      } catch(error){message.textContent=error.message || 'Comparison could not be saved. Both copies remain available.';keep.disabled=false;cancel.disabled=false;}
    };
  });
}

function appendPreservedCloudCopies(body) {
  const copies=LifeCloudCopies.retained(state);
  if(!copies.length)return;
  const title=document.createElement('h3');title.textContent='Preserved cloud history';body.append(title);
  copies.forEach(copy=>{
    const row=document.createElement('div');row.className='recovery-row';
    const label=document.createElement('strong');label.textContent='Cloud copy '+formatRecordDateTime(copy.cloudUpdatedAt);
    const read=document.createElement('button');read.type='button';read.className='secondary-action';read.textContent='Read preserved cloud history';read.onclick=()=>downloadTextFile('life-os-preserved-cloud.html',buildReadableDataArchive(copy.state),'text/html;charset=utf-8');
    const download=document.createElement('button');download.type='button';download.className='secondary-action';download.textContent='Download preserved cloud backup';download.onclick=()=>downloadTextFile('life-os-preserved-cloud.json',JSON.stringify(copy.state,null,2),'application/json');row.append(label,read,download);body.append(row);
  });
}
