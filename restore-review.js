const RESTORE_GUARD_KEY = 'life-os-restore-guard-v1';

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

function summarizeRestoreBoard(board) {
  const cards = [...(board.cards || []), ...(board.archivedCards || [])];
  const diaryEntries = cards.filter(card => card.type === 'diary').reduce((sum, card) => sum +
    Object.values(card.diaryEntries || {}).filter(entry => entry.thoughts || entry.sentence || entry.feeling).length, 0);
  const tasks = cards.reduce((sum, card) => sum + (card.plannerTasks?.length || 0), 0);
  const count = (number, singular, plural = singular + 's') => `${number} ${number === 1 ? singular : plural}`;
  return `${count(board.cards.length, 'card')}, ${(board.archivedCards || []).length} archived, ${count(diaryEntries, 'diary entry', 'diary entries')}, ${count(tasks, 'planner task')}`;
}

function reviewBackupRestore(restored, filename) {
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
    header.append(title, close); body.append(file, warning, boards, message, consent); footer.append(download, refresh, apply); dialog.append(header, body, footer);
    document.body.append(dialog); dialog.showModal(); syncModalOpenState(); close.focus();
    compare().catch(error => { message.textContent = error.message; checkbox.disabled = true; });
  });
}

async function applyReviewedRestore(restored, expected, source) {
  await LifeDeviceStore.cloudLocked(async () => {
    if (hasUnfinishedRestoreEditor()) throw new Error('Finish or close the current editor before restoring. Your unfinished writing has not been replaced.');
    if (!corruptLocalStateDetected && (!lastLocalSaveOk || !await flushDeviceWrites())) throw new Error('Saving needs attention. Download your writing before restoring.');
    await LifeDeviceStore.locked(() => {
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
      next.deviceWriteHeads = readStoredStateSnapshot()?.deviceWriteHeads || {};
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
      state = next; restoreTabBoardSelection();
      localMergeBase = getStateForStorage(); corruptLocalStateDetected = false; lastLocalSaveOk = true; localStateSource = 'stored';
      cloudConflictPending = Boolean(state.syncConflicts?.length); cloudSaveEnabled = source === 'cloud' && Boolean(cloudSession?.access_token);
      window.clearTimeout(cloudSaveTimer); cloudPushAgain = false;
    });
  });
  resetFormState(); render();
  setSaveStatus(source === 'cloud' ? 'Cloud copy saved on device' : 'Restored on device - cloud paused', 'local');
  renderCloudStatus(source === 'cloud' ? 'Cloud copy loaded.' : 'Backup restored on this device. Automatic cloud sync stays paused across tabs and reloads. Choose Save cloud to review syncing, or Load cloud to replace this device with the cloud copy.');
}
