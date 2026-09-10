(function (root) {
  "use strict";
  const clone = value => JSON.parse(JSON.stringify(value));
  const lines = text => String(text || "").split("\n").map(line => line.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean);
  const key = text => String(text || "").trim().replace(/\s+/g, " ").toLowerCase();
  const validDate = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return false;
    const parsed = new Date(date + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  const dateOf = timestamp => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const active = task => !task.deletedAt && !task.archivedAt;

  // Legacy text and completion maps remain available verbatim for recovery.
  // Only an explicit date/title link with one source can join a carried copy.
  function ensure(card) {
    if (card.plannerSchemaVersion === 2 && Array.isArray(card.plannerTasks)) return card.plannerTasks;
    const entries = card.plannerEntries || {};
    card.plannerLegacyEntries = card.plannerLegacyEntries || clone(entries);
    const tasks = [];
    const carried = [];
    const add = (dateKey, entry, title, index) => {
      const k = key(title);
      const check = (entry.checkedItems || entry.doneItems || {})[k] || (entry.checkedItems || entry.doneItems || {})[title];
      const completedAt = Number(check?.completedAt) || 0;
      const carry = (entry.carryoverItems || {})[k] || (entry.carryoverItems || {})[title];
      const fromDate = carry?.fromDate || carry;
      const task = {
        id: `legacy:${encodeURIComponent(card.id)}:${dateKey}:${index}`,
        title, dateKey, originalDateKey: validDate(fromDate) ? fromDate : dateKey,
        done: Boolean(check), completedAt, completedOn: completedAt ? dateOf(completedAt) : "",
        createdAt: Number(entry.itemRecords?.[k]?.createdAt) || Number(entry.updatedAt) || 0,
        updatedAt: Number(entry.updatedAt) || 0, completionRecordedAt: 0,
        archivedAt: 0, deletedAt: 0
      };
      if (validDate(fromDate) && fromDate !== dateKey) carried.push({task, fromDate});
      else tasks.push(task);
    };
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)).forEach(([dateKey, entry]) => {
      if (validDate(dateKey) && entry && typeof entry === "object") lines(entry.note || entry.text).forEach((title, index) => add(dateKey, entry, title, index));
    });
    carried.forEach(({task, fromDate}) => {
      const candidates = tasks.filter(source => source.dateKey === fromDate && key(source.title) === key(task.title));
      if (candidates.length === 1) {
        const source = candidates[0];
        if (task.done && !source.done) {
          Object.assign(source, {done: true, completedAt: task.completedAt, completedOn: task.completedOn});
        }
      } else {
        task.dateKey = fromDate;
        task.legacyNeedsReview = true;
        tasks.push(task);
      }
    });
    (card.plannerArchivedTasks || []).forEach((task, index) => tasks.push({
      ...task, id: task.id || `legacy-archive:${encodeURIComponent(card.id)}:${index}`,
      dateKey: task.sourceDate || task.dateKey, originalDateKey: task.sourceDate || task.dateKey,
      done: Boolean(task.wasDone), completedOn: task.completedAt ? dateOf(task.completedAt) : "",
      updatedAt: task.archivedAt || 0, deletedAt: 0
    }));
    card.plannerTasks = tasks;
    card.plannerSchemaVersion = 2;
    return tasks;
  }

  function add(card, dateKey, title, id, now = Date.now()) {
    if ((dateKey !== "" && !validDate(dateKey)) || !String(title || "").trim()) return null;
    const task = {id, title: String(title).trim(), dateKey, originalDateKey: dateKey, done: false, completedOn: "", completedAt: 0, completionRecordedAt: 0, createdAt: now, updatedAt: now, archivedAt: 0, deletedAt: 0};
    ensure(card).push(task);
    return task;
  }

  function change(card, id, updates, now = Date.now()) {
    const task = ensure(card).find(task => task.id === id);
    if (!task) return null;
    Object.assign(task, updates, {id, updatedAt: now});
    return task;
  }

  function complete(card, id, dayKey, now = Date.now()) {
    const task = ensure(card).find(task => task.id === id);
    if (!task || !validDate(dayKey)) return null;
    const done = !task.done;
    const today = dateOf(now);
    const completedOn = dayKey > today ? today : dayKey;
    const recorded = new Date(now);
    const completion = new Date(`${completedOn}T00:00:00`);
    completion.setHours(recorded.getHours(), recorded.getMinutes(), recorded.getSeconds(), recorded.getMilliseconds());
    return change(card, id, {done, completedOn: done ? completedOn : "", completedAt: done ? completion.getTime() : 0, completionRecordedAt: done ? now : 0}, now);
  }

  function forDay(card, dayKey) {
    return ensure(card).filter(active).filter(task => {
      if (task.dateKey === dayKey || (task.done && task.completedOn === dayKey)) return true;
      return validDate(task.dateKey) && task.dateKey < dayKey && (!task.done || (task.completedOn && task.completedOn >= dayKey));
    }).map(task => ({
      ...task, taskId: task.id, scheduledDate: task.dateKey, dateKey: dayKey,
      done: Boolean(task.done),
      isCarryover: Boolean(task.dateKey && task.dateKey < dayKey), carryoverFrom: task.dateKey && task.dateKey < dayKey ? task.dateKey : ""
    }));
  }

  // Explicit editing of a day's text keeps identity by occurrence. A renamed
  // row can reuse its own unused position, never an unrelated date's task.
  function replaceDay(card, dateKey, text, createId, now = Date.now()) {
    const current = ensure(card).filter(task => active(task) && task.dateKey === dateKey);
    const wanted = lines(text);
    const used = new Set();
    const matches = wanted.map(title => {
      const match = current.find(task => !used.has(task.id) && task.title === title);
      if (match) used.add(match.id);
      return match;
    });
    wanted.forEach((title, index) => {
      let match = matches[index];
      if (!match && current[index] && !used.has(current[index].id)) {
        match = current[index]; used.add(match.id);
      }
      if (match) { if (match.title !== title) change(card, match.id, {title}, now); }
      else add(card, dateKey, title, createId(), now);
    });
    current.filter(task => !used.has(task.id)).forEach(task => change(card, task.id, {archivedAt: now}, now));
  }

  function entry(card, dateKey) {
    const tasks = ensure(card).filter(task => active(task) && task.dateKey === dateKey);
    const checkedItems = Object.create(null);
    const itemRecords = Object.create(null);
    tasks.forEach(task => {
      if (task.done) checkedItems[key(task.title)] = {completedAt: task.completedAt};
      itemRecords[key(task.title)] = {createdAt: task.createdAt};
    });
    return {note: tasks.map(task => `- ${task.title}`).join("\n"), checkedItems, itemRecords, carryoverItems: {}, updatedAt: Math.max(0, ...tasks.map(task => task.updatedAt || 0))};
  }

  function project(card) {
    const tasks = ensure(card);
    const dates = new Set([...Object.keys(card.plannerEntries || {}), ...tasks.map(task => task.dateKey)]);
    card.plannerEntries = Object.fromEntries([...dates].filter(validDate).map(date => [date, entry(card, date)]));
    card.plannerArchivedTasks = tasks.filter(task => task.archivedAt && !task.deletedAt).map(task => ({...task, sourceDate: task.dateKey, wasDone: task.done}));
  }

  const api = {ensure, add, change, complete, forDay, replaceDay, entry, project, active, validDate};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LifePlanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
