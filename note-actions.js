function findNoteActionSource(boardId, cardId, dateKey, noteId) {
  if (state.activeBoardId !== boardId) return null;
  const card = state.cards.find(card => card.id === cardId && card.type === 'sidenote');
  const note = card?.sideNoteEntries?.[dateKey]?.notes?.find(note => note.id === noteId);
  return note ? {card, note} : null;
}

function renderSideNoteActions(card, dateKey, note) {
  const boardId = state.activeBoardId;
  const shell = document.createElement('div'); shell.className = 'card-menu-shell side-note-actions';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'card-menu-toggle icon-button';
  toggle.innerHTML = ICONS['more-vertical']; toggle.title = 'Note options';
  toggle.setAttribute('aria-label', 'Note options'); toggle.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div'); menu.className = 'card-menu note-action-menu'; menu.hidden = true;
  const add = document.createElement('button'); add.type = 'button';
  add.innerHTML = `${ICONS.plus}<span>Add to planner</span>`;
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'is-danger';
  remove.innerHTML = `${ICONS['trash-2']}<span>Delete note</span>`;
  add.onclick = event => {
    event.stopPropagation(); closeCardActionMenus();
    openNoteTaskDialog(boardId, card.id, dateKey, note.id, toggle);
  };
  remove.onclick = event => {
    event.stopPropagation(); closeCardActionMenus();
    const live = findNoteActionSource(boardId, card.id, dateKey, note.id);
    if (live) deleteSideNote(live.card, dateKey, note.id);
  };
  menu.append(add, remove);
  toggle.onclick = event => {
    event.stopPropagation();
    const opening = !shell.classList.contains('is-open'); closeCardActionMenus();
    if (opening) {
      shell.classList.add('is-open'); openFloatingPlannerTaskMenu(shell, menu, toggle);
      toggle.setAttribute('aria-expanded', 'true'); add.focus({preventScroll: true});
    }
  };
  menu.onkeydown = event => {
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const buttons = [add, remove], index = buttons.indexOf(document.activeElement);
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + 1) % 2].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault(); closeCardActionMenus(); toggle.focus({preventScroll: true});
    } else if (event.key === 'Tab') {
      closeCardActionMenus(); toggle.focus({preventScroll: true});
    }
  };
  shell.append(toggle, menu);
  return shell;
}

function findCreatedNoteTask(receipt) {
  const board = state.boards.find(board => board.id === receipt.boardId);
  if (!board || (state.cloudOwnerId || '') !== receipt.ownerId || (readRestoreGuard().id || '') !== receipt.restoreId) return null;
  const cards = state.activeBoardId === receipt.boardId
    ? [...state.cards, ...getArchivedCards()]
    : [...board.cards, ...board.archivedCards];
  const source = cards.find(card => card.id === receipt.sourceId && card.type === 'planner');
  const task = source?.plannerTasks?.find(task => task.id === receipt.task.id);
  return task ? {board, source, task} : null;
}

async function undoNoteTask(receipt) {
  clearUndoToast();
  if (!await flushDeviceWrites()) return;
  const live = findCreatedNoteTask(receipt);
  // An undo is a task-specific change, never restoration of an older board.
  if (!live || !LifeStateMerge.equal(live.task, receipt.task)) {
    window.alert('This task or its board has changed. Undo did not remove anything. Review the task in its planner.');
    return;
  }
  LifePlanner.change(live.source, live.task.id, {deletedAt: Date.now()});
  LifePlanner.project(live.source); live.source.updatedAt = Date.now(); live.board.updatedAt = Date.now();
  saveState(); await flushDeviceWrites(); renderCardsOnly({force: true});
}

function openNoteTaskDialog(boardId, cardId, noteDate, noteId, returnFocus) {
  if (document.getElementById('noteTaskDialog')) return;
  const original = findNoteActionSource(boardId, cardId, noteDate, noteId);
  if (!original) return;
  const snapshot = JSON.stringify(original.note), group = getPlannerGroup(original.card);
  const boardName = state.board.name, ownerId = state.cloudOwnerId || '', restoreId = readRestoreGuard().id || '';
  const previousFocus = returnFocus || document.activeElement;
  let busy = false, receipt = null;
  const dialog = document.createElement('dialog'); dialog.id = 'noteTaskDialog'; dialog.className = 'note-task-dialog';
  dialog.setAttribute('aria-labelledby', 'noteTaskTitle');
  const form = document.createElement('form');
  const header = document.createElement('header');
  const heading = document.createElement('h2'); heading.id = 'noteTaskTitle'; heading.textContent = 'Add to planner';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'icon-button';
  close.innerHTML = ICONS.x; close.setAttribute('aria-label', 'Cancel adding task');
  header.append(heading, close);
  const body = document.createElement('div'); body.className = 'note-task-body';
  const destination = document.createElement('dl'); destination.className = 'note-task-destination';
  for (const [label, value] of [['Board', boardName], ['Area', group]]) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value; destination.append(dt, dd);
  }
  const taskLabel = document.createElement('label'); taskLabel.textContent = 'Task';
  const taskInput = document.createElement('textarea'); taskInput.id = 'noteTaskText'; taskInput.rows = 3; taskInput.required = true;
  taskInput.value = original.note.text.replace(/\s+/g, ' ').trim(); taskLabel.append(taskInput);
  const dateLabel = document.createElement('label'); dateLabel.textContent = 'Planned date';
  const dateInput = document.createElement('input'); dateInput.id = 'noteTaskDate'; dateInput.type = 'date'; dateInput.required = true;
  dateInput.value = getTodayKey(); dateLabel.append(dateInput);
  const originalDetails = document.createElement('details'); originalDetails.className = 'note-task-original';
  const summary = document.createElement('summary'); summary.textContent = `Original note · ${formatDiaryDate(noteDate)}`;
  const originalText = document.createElement('p'); originalText.textContent = original.note.text;
  originalDetails.append(summary, originalText);
  const retained = document.createElement('p'); retained.className = 'note-task-retained'; retained.textContent = 'Your original note stays unchanged.';
  const message = document.createElement('p'); message.id = 'noteTaskMessage'; message.setAttribute('role', 'status'); message.hidden = true;
  const footer = document.createElement('footer');
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'primary-action'; submit.textContent = 'Add task';
  footer.append(cancel, submit); body.append(destination, message, taskLabel, dateLabel, originalDetails, retained);
  form.append(header, body, footer); dialog.append(form);
  const cancelDialog = () => {
    if (busy) return;
    if (receipt && !window.confirm('Device saving needs attention. Keep this tab open and use the save status to retry or export. Close this panel?')) return;
    dialog.close();
  };
  cancel.onclick = close.onclick = cancelDialog;
  dialog.addEventListener('cancel', event => {event.preventDefault(); cancelDialog();});
  dialog.addEventListener('close', () => {
    dialog.remove(); syncModalOpenState();
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    else document.querySelector('.side-note-actions button')?.focus({preventScroll: true});
  });
  const validateContext = () => {
    const live = findNoteActionSource(boardId, cardId, noteDate, noteId);
    if (!live || JSON.stringify(live.note) !== snapshot || getPlannerGroup(live.card) !== group || state.board.name !== boardName ||
        (state.cloudOwnerId || '') !== ownerId || (readRestoreGuard().id || '') !== restoreId) {
      throw new Error('The note, board or account changed. Nothing new was added. Close this panel and review the note again.');
    }
    return live;
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    const title = taskInput.value.trim(), date = normalizeDateKey(dateInput.value);
    if (!title || !date) {message.hidden = false; message.textContent = 'Enter a task and a valid planned date.'; return;}
    busy = true; submit.disabled = cancel.disabled = close.disabled = true; message.hidden = true;
    try {
      validateContext();
      if (receipt && !lastLocalSaveOk) saveState();
      if (!await flushDeviceWrites()) throw new Error(receipt
        ? 'Task added in this tab, but device saving failed. Keep this tab open and retry saving.'
        : 'Device saving needs attention. No new task was added. Keep this tab open and retry.');
      const live = validateContext();
      if (!receipt) {
        const source = getPlannerWriteSourceCard(live.card, date);
        const task = LifePlanner.add(source, date, title, createId());
        LifePlanner.project(source); source.updatedAt = Date.now();
        receipt = {boardId, sourceId: source.id, task: {...task}, ownerId, restoreId};
        taskInput.disabled = dateInput.disabled = true;
      } else {
        const current = findCreatedNoteTask(receipt);
        if (!current || !LifeStateMerge.equal(current.task, receipt.task)) throw new Error('The task changed while saving. No duplicate was added. Close this panel and review the planner.');
      }
      const staged = saveState(), saved = await flushDeviceWrites();
      if (!staged || !saved) throw new Error('Task added in this tab, but device saving failed. Keep this tab open and retry saving.');
      dialog.close(); renderCardsOnly({force: true});
      showUndoToast({message: `Task added for ${formatDiaryDate(date)}. Note kept.`, onUndo: () => undoNoteTask(receipt)});
    } catch (error) {
      message.hidden = false; message.textContent = error.message || 'Could not add the task. Your original note is unchanged.';
      message.scrollIntoView({block: 'nearest', behavior: 'instant'});
      submit.textContent = receipt ? 'Retry save' : 'Try again';
    } finally {busy = false; submit.disabled = cancel.disabled = close.disabled = false;}
  };
  closeCardActionMenus(); closeOtherOverlays(); document.body.append(dialog); dialog.showModal(); syncModalOpenState();
  taskInput.focus({preventScroll: true});
}
