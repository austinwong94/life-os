const RESTORE_GUARD_KEY = LifeStorageScope.key('life-os-restore-guard-v1');

function readRestoreGuard() {
  try {
    const raw = localStorage.getItem(RESTORE_GUARD_KEY);
    if (!raw) return {};
    const guard = JSON.parse(raw);
    if (!guard || typeof guard !== 'object' || typeof guard.id !== 'string') throw new Error('Invalid restore guard');
    return guard;
  } catch { return {syncPaused: true, unavailable: true}; }
}

function isRestoreSyncPaused() { return Boolean(readRestoreGuard().syncPaused); }

function hasUnfinishedRestoreEditor() {
  return Boolean(editingCardId || editingPlannerTaskKey || plannerTaskEditDraft ||
    (!elements.cardComposerPanel.hidden && draftTouched) || document.getElementById('noteTaskDialog') || document.querySelector('.conflict-custom:not([hidden])'));
}

function clearRestoreSyncPause() {
  const guard = readRestoreGuard();
  if (!guard.syncPaused) return true;
  if (guard.unavailable) return false;
  return writeLocalJson(RESTORE_GUARD_KEY, {...guard, syncPaused: false}, {silent: true});
}

function restoreComparable(raw) {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw);
    return {boards: snapshot.boards, cards: snapshot.boards ? undefined : snapshot.cards,
      deletedBoardIds: snapshot.deletedBoardIds, cloudOwnerId: snapshot.cloudOwnerId,
      syncConflicts: snapshot.syncConflicts, conflictResolutions: snapshot.conflictResolutions};
  } catch { return raw; }
}

async function readBackupFile(file) {
  const workspaceLimit=25000000, fileLimit=128*1024*1024;
  if(!Number.isSafeInteger(file?.size) || file.size<=0)throw new Error('The backup file is empty or unreadable. Nothing was replaced.');
  if(file.size>fileLimit)throw new Error('This backup exceeds the 128 MiB file limit. Keep the original file unchanged. Nothing was replaced.');
  let parsed;
  try{parsed=JSON.parse(await file.text());}
  catch{throw new Error('This backup could not be read as JSON. Keep the original file unchanged. Nothing was replaced.');}
  if(!isValidBackup(parsed))throw new Error('This backup has invalid or duplicate records, or unsupported card types. Nothing was replaced. Keep the original file for review.');
  const fullBackup=parsed.app==='Life OS' && parsed.format==='life-os-full-backup-v2' && parsed.state && typeof parsed.state==='object';
  // Recovery history can make a supported full export much larger than its workspace.
  if(file.size>workspaceLimit && !fullBackup)throw new Error('Only a Life OS full-backup-v2 file can exceed 25 MB. Keep the original file unchanged. Nothing was replaced.');
  const workspace=parsed.state || parsed;
  if(new Blob([JSON.stringify(workspace)]).size>workspaceLimit)throw new Error('The main workspace exceeds the 25 MB import limit. Keep the complete original backup; nothing was replaced.');
  return parsed;
}

function summarizeBackupFile(parsed) {
  const data=parsed.state || parsed;
  const boards=Array.isArray(data.boards) && data.boards.length?data.boards:[{name:data.board?.name || 'Legacy board',cards:data.cards,archivedCards:data.archivedCards || []}];
  const cards=boards.flatMap(board=>[...board.cards,...(board.archivedCards || [])]);
  const recordFields=['diaryEntries','sideNoteEntries','plannerEntries','fitnessEntries','foodEntries'];
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  const unfamiliar=cards.some(card=>recordFields.some(key=>card[key]!=null && !object(card[key])) ||
    object(card.sideNoteEntries) && Object.values(card.sideNoteEntries).some(entry=>entry!=null && (!object(entry) || entry.notes!=null && !Array.isArray(entry.notes))));
  const warnings=[];
  let counts;
  if(unfamiliar){
    counts={boards:boards.length,activeCards:boards.reduce((sum,b)=>sum+b.cards.length,0),archivedCards:boards.reduce((sum,b)=>sum+(b.archivedCards || []).length,0),diaryPages:null,sideNotes:null,plannerDates:null,fitnessDays:null,foodDays:null};
    warnings.push('Some record sections have an unfamiliar structure. Their counts are unavailable; the original file is unchanged.');
  }else counts=getBackupDataCounts({boards});
  if(boards.some(board=>board.name!==undefined && typeof board.name!=='string'))warnings.push('Some board names have an unfamiliar structure. The original values were not changed.');
  if(parsed.counts!==undefined && !object(parsed.counts))warnings.push('Saved count metadata has an unfamiliar structure and was not compared.');
  if(object(parsed.counts) && Object.keys(counts).some(key=>Object.hasOwn(parsed.counts,key) && counts[key]!==null && parsed.counts[key]!==counts[key]))warnings.push('Saved count metadata differs from the file contents. Review the original file before restoring.');
  const recovery=object(parsed.localRecovery)?parsed.localRecovery:null;
  if(recovery?.pendingDeviceWritesUnavailable || recovery?.recoveryArchiveError || Array.isArray(recovery?.unreadablePendingDeviceWrites) && recovery.unreadablePendingDeviceWrites.length)warnings.push('Some recovery copies were unavailable or unreadable when exported. Keep the original browser and complete backup file.');
  if(recovery && recovery.pendingDeviceWrites!==undefined && !Array.isArray(recovery.pendingDeviceWrites))warnings.push('Pending-copy metadata has an unfamiliar structure and was not counted.');
  const pendingCopies=Array.isArray(recovery?.pendingDeviceWrites)?recovery.pendingDeviceWrites.length:null;
  if(pendingCopies)warnings.push('Pending write copies are included separately. These counts describe the main workspace, not a replay or merge of those versions.');
  const full=parsed.app==='Life OS' && parsed.format==='life-os-full-backup-v2';
  if(full && !recovery)warnings.push('This full-backup file has no readable recovery section. Only its main workspace was counted.');
  return {boards,counts,warnings,pendingCopies,full,exportedAt:typeof parsed.exportedAt==='string' && Number.isFinite(Date.parse(parsed.exportedAt))?parsed.exportedAt:null};
}

function openBackupCheck() {
  const dialog=dailyDialog('Check a backup');dialog.classList.add('backup-check-dialog');
  const scope=planningNode('p','backup-check-scope','Local file check only. Nothing is restored or uploaded. Properties data is separate and is not checked here.');
  const label=planningNode('label','field');label.append(planningNode('span','','Backup JSON file'));
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';label.append(input);
  const status=planningNode('p','backup-check-status','Choose a backup to read its main-workspace contents.');status.setAttribute('role','status');
  const result=planningNode('div','backup-check-result');let selection=0;
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
  dialog.addEventListener('close',()=>{selection++;},{once:true});
  input.addEventListener('change',async()=>{
    const token=++selection,file=input.files?.[0];result.replaceChildren();result.removeAttribute('aria-busy');
    if(!file){status.textContent='No file selected. Nothing was changed.';return;}
    status.textContent='Reading the file on this device...';result.setAttribute('aria-busy','true');
    const current=()=>dialog.isConnected && dialog.open && token===selection;
    try{
      const parsed=await readBackupFile(file);if(!current())return;
      const summary=summarizeBackupFile(parsed),list=planningNode('dl','backup-check-summary');
      const row=(name,value)=>list.append(planningNode('dt','',name),planningNode('dd','',String(value)));
      row('File',file.name);row('Format',summary.full?'Life OS full backup v2':'Legacy workspace');
      row('Export date',summary.exportedAt?new Date(summary.exportedAt).toLocaleString():'Not recorded');
      for(const [key,name] of [['boards','Boards'],['activeCards','Active cards'],['archivedCards','Archived cards'],['diaryPages','Diary entries'],['sideNotes','Side notes'],['plannerDates','Planner dates'],['fitnessDays','Fitness days'],['foodDays','Food days']])row(name,summary.counts[key]===null?'Unavailable':summary.counts[key]);
      row('Pending write copies',summary.pendingCopies===null?'Not recorded':summary.pendingCopies);
      result.append(list);
      for(const warning of summary.warnings)result.append(planningNode('p','backup-check-warning',warning));
      const details=planningNode('details','backup-check-boards');details.append(planningNode('summary','','Boards in file'));
      const names=planningNode('ul','');for(const board of summary.boards)names.append(planningNode('li','',typeof board.name==='string' && board.name?board.name:'Untitled board'));details.append(names);result.append(details);
      status.textContent=summary.warnings.length?'File read with warnings. Nothing was restored.':'File read successfully. No restore, replay or cloud verification was performed.';
    }catch(error){if(current()){result.replaceChildren();status.textContent=error.message || 'This file could not be checked. Nothing was changed.';}}
    finally{if(current())result.removeAttribute('aria-busy');}
  });
  dialog.append(scope,label,status,result);
}

function summarizeRestoreBoard(board) {
  const cards = [...(board.cards || []), ...(board.archivedCards || [])];
  const diaryEntries = cards.filter(card => card.type === 'diary').reduce((sum, card) => sum +
    Object.values(card.diaryEntries || {}).filter(entry => entry.thoughts || entry.sentence || entry.feeling).length, 0);
  const tasks = cards.reduce((sum, card) => sum + (card.plannerTasks?.length || 0), 0);
  const count = (number, singular, plural = singular + 's') => `${number} ${number === 1 ? singular : plural}`;
  return `${count(board.cards.length, 'card')}, ${(board.archivedCards || []).length} archived, ${count(diaryEntries, 'diary entry', 'diary entries')}, ${count(tasks, 'planner task')}`;
}

function reviewBackupRestore(restored, filename, {hasRecoveryHistory=false}={}) {
  if (document.getElementById('restoreReviewModal')) return Promise.resolve(false);
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.id = 'restoreReviewModal'; dialog.className = 'restore-review-dialog';
    dialog.setAttribute('aria-labelledby', 'restoreReviewTitle');
    const header = document.createElement('header'); header.className = 'restore-review-header';
    const title = document.createElement('h2'); title.id = 'restoreReviewTitle'; title.textContent = 'Review backup restore';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'icon-button'; close.innerHTML = ICONS.x; close.setAttribute('aria-label', 'Cancel restore');
    const body = document.createElement('div'); body.className = 'restore-review-body';
    const file = document.createElement('p'); file.className = 'restore-file'; file.textContent = filename;
    const warning = document.createElement('p'); warning.className = 'restore-warning';
    warning.textContent = 'This replaces all boards on this device. Boards absent from the backup will leave this device. A recovery copy is required first. Cloud sync will stay paused until you explicitly choose Save cloud or Load cloud.';
    const boards = document.createElement('div'); boards.className = 'restore-board-list';
    const message = document.createElement('p'); message.className = 'conflict-message'; message.setAttribute('role', 'status');
    const consent = document.createElement('label'); consent.className = 'restore-consent';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    consent.append(checkbox, document.createTextNode('I want to replace all boards on this device with this backup.'));
    const footer = document.createElement('footer'); footer.className = 'restore-review-actions';
    const download = document.createElement('button'); download.type = 'button'; download.className = 'secondary-action'; download.textContent = 'Download current backup';
    download.onclick = () => corruptLocalStateDetected ? downloadTextFile('life-os-original-storage.txt', localStorage.getItem(STORAGE_KEY) || '', 'text/plain') : exportBoardBackup();
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'secondary-action'; refresh.textContent = 'Refresh comparison';
    const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'primary-action'; apply.textContent = 'Restore on this device'; apply.disabled = true;
    let expected, busy = false, applied = false;
    const compare = async () => {
      checkbox.disabled = true; checkbox.checked = false; apply.disabled = true;
      if (!corruptLocalStateDetected && !await flushDeviceWrites()) throw new Error('Saving needs attention. Download your writing before restoring.');
      const raw = localStorage.getItem(STORAGE_KEY); expected = restoreComparable(raw);
      const current = typeof expected === 'object' && expected ? expected.boards || [] : [];
      boards.replaceChildren();
      for (const id of new Set([...current.map(board => board.id), ...restored.boards.map(board => board.id)])) {
        const before = current.find(board => board.id === id), after = restored.boards.find(board => board.id === id);
        const row = document.createElement('article'); row.className = 'restore-board-row';
        const name = document.createElement('h3'); name.textContent = after?.name || before?.name || 'Untitled board';
        const old = document.createElement('p'); old.textContent = 'Current: ' + (before ? summarizeRestoreBoard(before) : 'Not on this device');
        const next = document.createElement('p'); next.textContent = 'Backup: ' + (after ? summarizeRestoreBoard(after) : 'Not included; retained in the recovery copy');
        row.append(name, old, next); boards.append(row);
      }
      if (typeof expected === 'string') message.textContent = 'The current storage is unreadable. Its untouched contents must be backed up before replacement.';
      checkbox.disabled = false;
    };
    checkbox.onchange = () => { apply.disabled = !checkbox.checked; };
    close.onclick = () => { if (!busy) dialog.close(); };
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => {
      dialog.remove(); syncModalOpenState();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(applied);
    });
    refresh.onclick = async () => {
      try { await compare(); message.textContent = 'Comparison refreshed. Check the boards before confirming again.'; }
      catch (error) { message.textContent = error.message; }
    };
    apply.onclick = async () => {
      if (busy || !checkbox.checked) return;
      busy = true; [apply, refresh, close, download, checkbox].forEach(node => { node.disabled = true; });
      try { await applyReviewedRestore(restored, expected, 'backup'); applied = true; dialog.close(); }
      catch (error) { message.textContent = error.message; }
      finally { busy = false; [refresh, close, download, checkbox].forEach(node => { node.disabled = false; }); checkbox.checked = false; apply.disabled = true; }
    };
    header.append(title, close); body.append(file, warning);
    if(hasRecoveryHistory){
      const note=document.createElement('p');note.className='restore-recovery-note';
      note.textContent='This restores the main workspace only. Pending, checkpoint and historical recovery versions remain in your original backup file; they are not automatically merged or restored. Keep that complete file.';
      body.append(note);
    }
    body.append(boards, message, consent); footer.append(download, refresh, apply); dialog.append(header, body, footer);
    document.body.append(dialog); dialog.showModal(); syncModalOpenState(); close.focus();
    compare().catch(error => { message.textContent = error.message; checkbox.disabled = true; });
  });
}

async function applyReviewedRestore(restored, expected, source) {
  await LifeDeviceStore.cloudLocked(async () => {
    if (hasUnfinishedRestoreEditor()) throw new Error('Finish or close the current editor before restoring. Your unfinished writing has not been replaced.');
    if (!corruptLocalStateDetected && (!lastLocalSaveOk || !await flushDeviceWrites())) throw new Error('Saving needs attention. Download your writing before restoring.');
    await LifeDeviceStore.locked(({checkpoint}={}) => {
      if (LifeDeviceStore.pending().length) throw new Error('Another edit is still saving. Refresh the comparison and try again.');
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!LifeStateMerge.equal(restoreComparable(raw), expected)) throw new Error('Records changed while this review was open. Refresh the comparison before restoring.');
      if (corruptLocalStateDetected) {
        const copies = readLocalJsonValue(CLOUD_RECOVERY_KEY, []);
        const backup = {id: createId(), reason: 'before-restore-unreadable', savedAt: new Date().toISOString(), rawState: raw};
        if (!writeLocalJson(CLOUD_RECOVERY_KEY, [backup, ...(Array.isArray(copies) ? copies : [])].slice(0, 5), {silent: true})) throw new Error('The original storage could not be backed up. Nothing was replaced.');
      } else if (!saveCloudRecoveryPoint('before-' + source + '-restore', raw ? JSON.parse(raw) : getStateForStorage())) {
        throw new Error('The recovery copy could not be saved. Nothing was replaced.');
      }
      const next = LifeStateMerge.copy(restored);
      next.deviceWriteHeads = {...(checkpoint?.deviceWriteHeads || {}),...(readStoredStateSnapshot()?.deviceWriteHeads || {})};
      if(corruptLocalStateDetected && checkpoint && !saveCloudRecoveryPoint('before-restore-verified-checkpoint',checkpoint))throw new Error('The verified checkpoint could not be backed up. Nothing was replaced.');
      next.updatedAt = Date.now();
      const previousGuard = localStorage.getItem(RESTORE_GUARD_KEY);
      // Write the fail-closed guard first. It also keeps older diary safety
      // copies available without silently replaying them into this restore.
      const guard = {id: createId(), restoredAt: Date.now(), source, syncPaused: source !== 'cloud'};
      if (!writeLocalJson(RESTORE_GUARD_KEY, guard, {silent: true})) throw new Error('The restore safety setting could not be saved. Nothing was replaced.');
      if (!writeLocalJson(STORAGE_KEY, next, {silent: true})) {
        try { if (previousGuard === null) localStorage.removeItem(RESTORE_GUARD_KEY); else localStorage.setItem(RESTORE_GUARD_KEY, previousGuard); } catch {}
        throw new Error('Restore could not be saved. The original records remain unchanged.');
      }
      LifeDeviceStore.acceptRestoredSnapshot(next);
      state = next; restoreTabBoardSelection();
      localMergeBase = getStateForStorage(); corruptLocalStateDetected = false; lastLocalSaveOk = true; localStateSource = 'stored';
      cloudConflictPending = Boolean(state.syncConflicts?.length); cloudSaveEnabled = source === 'cloud' && Boolean(cloudSession?.access_token);
      window.clearTimeout(cloudSaveTimer); cloudPushAgain = false;
      cloudSyncRetry.reset();unverifiedCloudWrite=null;
    },{recover:corruptLocalStateDetected});
  });
  resetFormState(); render();
  setSaveStatus(source === 'cloud' ? 'Cloud copy saved on device' : 'Restored on device - cloud paused', 'local');
  renderCloudStatus(source === 'cloud' ? 'Cloud copy loaded.' : 'Backup restored on this device. Automatic cloud sync stays paused across tabs and reloads. Choose Save cloud to review syncing, or Load cloud to replace this device with the cloud copy.');
}
