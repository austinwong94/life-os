const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../planner-store.js');
const W=require('../planning.js');
const M=require('../state-merge.js');
const draft={title:'Culturely meeting',area:'Culturely',startDate:'2026-09-10',endDate:'2026-09-10',startTime:'14:00',endTime:'15:00',allDay:false,notes:'Private notes\nSecond line'};
test('undated capture is not fabricated as an overdue task and completion history stays visible',()=>{
  const card={id:'source',plannerEntries:{}},task=P.add(card,'','Idea','id');
  assert.ok(task);assert.equal(P.forDay(card,'2026-09-10').length,0);
  P.complete(card,'id','2026-09-10',new Date('2026-09-10T16:00:00').getTime());
  assert.equal(P.forDay(card,'2026-09-10').length,1);assert.equal(P.forDay(card,'2026-09-11').length,0);
  P.project(card);assert.equal(card.plannerTasks.length,1);assert.equal(Object.hasOwn(card.plannerEntries,''),false);
});
test('impossible calendar dates cannot create planner tasks',()=>{
  assert.equal(P.validDate('2026-02-30'),false);assert.equal(P.validDate('2024-02-29'),true);
  assert.equal(P.add({id:'a'},'2026-13-10','Task','id'),null);
});
test('task metadata, original date and completion timestamps survive rename and projections',()=>{
  const card={id:'source'},now=new Date('2026-09-10T16:00:00').getTime();
  P.add(card,'2026-09-09','Task','id',now);P.change(card,'id',{area:'MascotRun',project:'Launch',notes:'Multiline\nNotes',deadline:'2026-09-20',status:'waiting'},now);
  P.complete(card,'id','2026-09-09',now);P.change(card,'id',{title:'Renamed'},now);P.project(card);
  const task=card.plannerTasks[0];assert.equal(task.area,'MascotRun');assert.equal(task.notes,'Multiline\nNotes');assert.equal(task.completedOn,'2026-09-09');assert.equal(task.completionRecordedAt,now);assert.equal(P.forDay(card,'2026-09-10').length,0);
});
test('activity dates, overnight intervals and exclusive timed endpoints are consistent',()=>{
  const event=W.activityFromDraft({...draft,startTime:'23:00',endDate:'2026-09-11',endTime:'00:00'});
  assert.ok(W.occursOn(event,'2026-09-10'));assert.equal(W.occursOn(event,'2026-09-11'),false);
  const overnight=W.activityFromDraft({...draft,startTime:'23:00',endDate:'2026-09-11',endTime:'01:00'});
  assert.ok(W.occursOn(overnight,'2026-09-11'));
  assert.throws(()=>W.activityFromDraft({...draft,endTime:'13:00'}),/after/);
  assert.throws(()=>W.activityFromDraft({...draft,startDate:'2026-02-30'}),/valid/);
});
test('multi-day all-day Google export includes the final day without shifting time zones',()=>{
  const event=W.activityFromDraft({...draft,allDay:true,startDate:'2026-12-28',endDate:'2027-01-02'});
  assert.ok(W.occursOn(event,'2027-01-02'));assert.equal(W.occursOn(event,'2027-01-03'),false);
  const url=new URL(W.googleLink(event));assert.equal(url.searchParams.get('dates'),'20261228/20270103');assert.equal(url.searchParams.get('details'),draft.notes);
});
test('unsafe links are rejected and Google link data stays in encoded parameters',()=>{
  for(const url of ['javascript:alert(1)','http://example.com','https://user:password@example.com'])assert.throws(()=>W.activityFromDraft({...draft,url}));
  const event=W.activityFromDraft({...draft,title:'A & B #1',url:'https://meet.google.com/abc'});
  const url=new URL(W.googleLink(event));assert.equal(url.origin,'https://calendar.google.com');assert.equal(url.searchParams.get('text'),'A & B #1');assert.match(url.searchParams.get('dates'),/Z\/.+Z$/);
});
test('conflicting activity edits preserve complete versions, independent boards still merge',()=>{
  const activity=W.activityFromDraft(draft),base={boards:[{id:'a',cards:[{id:'event',type:'event',activity}]},{id:'b',cards:[]}]};
  const local=M.copy(base),remote=M.copy(base);local.boards[0].cards[0].activity.startAt='2026-09-11T06:00:00Z';remote.boards[0].cards[0].activity.endAt='2026-09-12T07:00:00Z';remote.boards[1].cards.push({id:'other',title:'Private diary'});
  const merged=M.merge(base,local,remote);assert.equal(merged.conflicts[0].kind,'activity');assert.deepEqual(merged.boards[0].cards[0].activity,local.boards[0].cards[0].activity);assert.equal(merged.boards[1].cards.length,1);
});
test('an undated task remains reviewable with all new task metadata',()=>{
  const card={id:'source',type:'planner'};P.add(card,'','Task','id');
  const base={boards:[{id:'board',cards:[card]}]},local=M.copy(base),remote=M.copy(base);
  P.change(local.boards[0].cards[0],'id',{area:'Fitness',notes:'A'});P.change(remote.boards[0].cards[0],'id',{area:'Personal',notes:'B'});
  const merged=M.merge(base,local,remote),snapshot={...local,syncConflicts:M.registerConflicts(merged.conflicts,{},()=> 'conflict')};
  assert.equal(M.inspectPlannerTaskConflict(snapshot,snapshot.syncConflicts[0]).editable,true);
});
test('activity conflict review keeps a complete version, refuses stale choices and binds cloud receipts',()=>{
  const activity=W.activityFromDraft(draft),base={boards:[{id:'a',cards:[{id:'event',type:'event',activity}]}]};
  const local=M.copy(base),remote=M.copy(base);local.boards[0].cards[0].activity.notes='Local';remote.boards[0].cards[0].activity.notes='Remote';
  const conflicts=M.registerConflicts(M.merge(base,local,remote).conflicts.map(c=>({...c,source:'cloud',ownerId:'user',baseDigest:'digest'})),{},()=> 'conflict');
  const snapshot={...local,syncConflicts:conflicts},conflict=conflicts[0],expected=M.copy(local.boards[0].cards[0].activity);
  assert.ok(M.inspectActivityConflict(snapshot,conflict).editable);
  const next=M.resolveActivityConflict(snapshot,conflict,expected,conflict.remote,1000);assert.equal(next.boards[0].cards[0].activity.notes,'Remote');assert.equal(snapshot.boards[0].cards[0].activity.notes,'Local');assert.equal(next.syncConflicts.length,0);
  const wrong=M.reviewedCloudBaseline(base,next.conflictResolutions,'other','digest');assert.equal(wrong.boards[0].cards[0].activity.notes,draft.notes);
  assert.equal(M.reviewedCloudBaseline(base,next.conflictResolutions,'user','digest').boards[0].cards[0].activity.notes,'Remote');
  snapshot.boards[0].cards[0].activity.location='Newer';assert.throws(()=>M.resolveActivityConflict(snapshot,conflict,expected,conflict.remote),/changed/);
});
