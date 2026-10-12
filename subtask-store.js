(function(root) {
  "use strict";
  const repository = typeof module !== 'undefined' && module.exports ? require('./task-repository.js') : root.LifeTaskRepository;
  const copy = value => JSON.parse(JSON.stringify(value));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function records(target) {
    if (!Object.hasOwn(target,'subtasks')) return [];
    const list=target.subtasks;
    if (!Array.isArray(list) || list.some(child=>!child || typeof child.id!=='string' || !child.id.trim() || typeof child.title!=='string' || typeof child.done!=='boolean') || new Set(list.map(child=>child.id)).size!==list.length) {
      throw new Error('This checklist needs review. Its original data was kept.');
    }
    return list;
  }
  function active(target) { return records(target).filter(child=>!child.deletedAt); }
  function change(target,command,expected,{now=Date.now(),day}={}) {
    const list=records(target),hadList=Object.hasOwn(target,'subtasks');
    if (!command || !['add','rename','complete','remove'].includes(command.type) || typeof command.id!=='string' || !command.id.trim() || !Number.isFinite(now) || now<=0) throw new Error('Invalid checklist change.');
    const current=list.find(child=>child.id===command.id);
    if (command.type==='add' ? Boolean(current) : !current || current.deletedAt || !equal(current,expected)) throw new Error('This subtask changed elsewhere. Your draft was kept.');
    if (['add','rename'].includes(command.type) && (typeof command.title!=='string' || !command.title.trim())) throw new Error('Enter a subtask name.');
    const before=current ? copy(current) : null;
    const after=current ? copy(current) : {id:command.id,title:command.title.trim(),done:false,createdAt:now,updatedAt:now};
    if (command.type==='rename') after.title=command.title.trim();
    if (command.type==='complete') repository.complete(after,!after.done,day,now);
    if (command.type==='remove') after.deletedAt=now;
    after.updatedAt=now;
    target.subtasks=current ? list.map(child=>child.id===after.id ? after : child) : [...list,after];
    return {id:after.id,before,after:copy(after),hadList};
  }
  function restore(target,transaction) {
    const list=records(target),current=list.find(child=>child.id===transaction.id);
    if (!current || !equal(current,transaction.after)) throw new Error('This subtask changed again. Undo was not applied.');
    target.subtasks=transaction.before ? list.map(child=>child.id===transaction.id ? copy(transaction.before) : child) : list.filter(child=>child.id!==transaction.id);
    if(!transaction.hadList && !target.subtasks.length)delete target.subtasks;
  }
  const api={records,active,change,restore};
  root.LifeSubtasks=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof globalThis!=='undefined' ? globalThis : this);
