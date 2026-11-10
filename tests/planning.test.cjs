const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../planner-store.js');
const W=require('../planning.js');
const M=require('../state-merge.js');
const draft={title:'Culturely meeting',area:'Culturely',startDate:'2026-09-10',endDate:'2026-09-10',startTime:'14:00',endTime:'15:00',allDay:false,notes:'Private notes\nSecond line'};
function cardTaskEdit(kind='checklist'){
  return {version:1,key:JSON.stringify(['board','source',kind,kind==='single'?null:'task']),ref:{boardId:'board',cardId:'source',kind,itemId:kind==='single'?null:'task'},base:kind==='single'?{title:'Book appointment',done:false}:{id:'task',text:'Call partner',done:false,custom:{keep:'all fields'}},title:'My full draft',sourceTitle:'Original project',completedOn:''};
}
function activityEdit(){const id='activity',boardId='board';return {...draft,location:'',url:'',id,version:1,boardId,key:JSON.stringify([boardId,id]),newRecord:true,base:null,sourceBase:null,allDay:false};}
test('activity recovery validates board-scoped stable identity and preserves legacy draft formats',()=>{
  const d=activityEdit();assert(W.validActivityDraft(d,'board'));assert.equal(W.validActivityDraft(d,'other'),false);const legacy={...d,id:''};for(const key of ['version','boardId','key','newRecord','sourceBase'])delete legacy[key];const before=JSON.stringify(legacy);assert(W.validActivityDraft(legacy,'board'));assert.equal(JSON.stringify(legacy),before);
});
test('malformed activity drafts and partial save receipts cannot become editable records',()=>{
  const d=activityEdit();for(const bad of [null,false,[],{}, {...d,version:2},{...d,allDay:'true'},{...d,id:''},{...d,key:'wrong'},{...d,notes:[]},{...d,newRecord:false},{...d,receipt:{}},{...d,receipt:{status:'unknown',after:{id:d.id,type:'event',activity:{}},values:{}}}])assert.equal(W.validActivityDraft(bad,'board'),false);
});
test('activity field merging preserves unknown integration metadata and removes stale timed fields on all-day conversion',()=>{
  const previous={title:'Old',startAt:'2026-09-10T06:00:00Z',endAt:'2026-09-10T07:00:00Z',custom:{keep:'every field'},externalId:'external'};const normalized=W.activityFromDraft({...draft,allDay:true});const before=JSON.stringify(previous);const next=W.mergeActivityFields(previous,normalized);assert.deepEqual(next.custom,previous.custom);assert.equal(next.externalId,'external');assert.equal(Object.hasOwn(next,'startAt'),false);assert.equal(Object.hasOwn(next,'endAt'),false);assert.equal(next.title,draft.title);assert.equal(JSON.stringify(previous),before);
});
test('activity conflict snapshots cover owned fields but do not discard independent card metadata',()=>{
  const card={id:'activity',type:'event',title:'Original',category:'Personal',targetAt:'2026-09-10T06:00:00Z',description:'Keep',calendarOnly:true,activity:{title:'Original',custom:{keep:true}},custom:'outside editor',updatedAt:42};const before=JSON.stringify(card);assert.deepEqual(Object.keys(W.activityCardState(card)),['id','type','title','category','targetAt','description','calendarOnly','activity']);assert.equal(JSON.stringify(card),before);
});
test('prepared failed and saved activity receipts remain recoverable without changing recorded values',()=>{
  for(const status of ['prepared','failed','saved']){const d=activityEdit();d.receipt={status,after:{id:d.id,type:'event',activity:W.activityFromDraft(d)},values:W.activityFromDraft(d)};const before=JSON.stringify(d);assert(W.validActivityDraft(d,'board'));assert.equal(JSON.stringify(d),before);}
});
test('source-task drafts validate exact board and original task identity for Project To-Do and single cards',()=>{
  for(const kind of ['checklist','daily','single']){const d=cardTaskEdit(kind);assert(W.validCardTaskEditDraft(d,'board'));assert.equal(W.validCardTaskEditDraft(d,'another-board'),false);assert.equal(W.validCardTaskEditDraft(d,''),false);}
});
test('legacy source-task draft envelopes remain valid without changing canonical metadata',()=>{
  const d=cardTaskEdit();delete d.version;delete d.key;d.base.subtasks=[{id:'child',title:'Keep this step',done:true}];d.after={...d.base,text:d.title};const before=JSON.stringify(d);assert(W.validCardTaskEditDraft(d,'board'));assert.equal(JSON.stringify(d),before);
});
test('malformed and unsupported source-task drafts cannot be converted into editable empty drafts',()=>{
  const d=cardTaskEdit();for(const value of [null,[],false,0,'',{}, {...d,version:2},{...d,ref:null},{...d,ref:[]},{...d,ref:{...d.ref,cardId:' '}},{...d,ref:{...d.ref,kind:'planner'}},{...d,base:null},{...d,base:[]},{...d,title:3},{...d,sourceTitle:[]},{...d,completedOn:false}])assert.equal(W.validCardTaskEditDraft(value,'board'),false);
});
test('mismatched item IDs and ambiguous single-card identities cannot bind source-task drafts to another task',()=>{
  const d=cardTaskEdit();assert.equal(W.validCardTaskEditDraft({...d,ref:{...d.ref,itemId:'wrong'}},'board'),false);assert.equal(W.validCardTaskEditDraft({...d,base:{...d.base,id:'wrong'}},'board'),false);assert.equal(W.validCardTaskEditDraft({...d,key:JSON.stringify(['board','wrong-card','checklist','task'])},'board'),false);const single=cardTaskEdit('single');assert.equal(W.validCardTaskEditDraft({...single,ref:{...single.ref,itemId:'task'}},'board'),false);
});
test('invalid completion date wording remains recoverable for explicit repair instead of being guessed or cleared',()=>{
  const d=cardTaskEdit();d.completedOn='2026-02-30';const before=JSON.stringify(d);Object.freeze(d);Object.freeze(d.ref);Object.freeze(d.base);assert(W.validCardTaskEditDraft(d,'board'));assert.equal(JSON.stringify(d),before);
});
function taskEdit(){
  const values={title:'Original task',dateKey:'2026-11-11',area:'Personal',project:'Family',status:'waiting',deadline:'',notes:'Every original line\nStill kept',priority:'normal',goalLink:'',followUp:'2026-11-12',intent:'task',minutes:15,nextAction:'One step',startTime:''};
  return {version:1,key:JSON.stringify(['board','card','task']),ref:{boardId:'board',cardId:'card',kind:'planner',itemId:'task'},base:{id:'task',title:'Original task',custom:{kept:true}},...values,initial:W.taskEditValues(values)};
}
test('task edit recovery validates exact board/card/task identity without matching titles',()=>{
  const d=taskEdit();assert(W.validTaskEditDraft(d,'board'));assert.equal(W.validTaskEditDraft(d,'other-board'),false);
  for(const key of ['bad','[]',JSON.stringify(['board','wrong-card','task']),JSON.stringify(['board','card','wrong-task']),JSON.stringify(['board','card','task','extra'])])assert.equal(W.validTaskEditDraft({...d,key},'board'),false);
});
test('invalid task edit envelopes cannot become editable empty or wrong-version drafts',()=>{
  const d=taskEdit();for(const value of [null,[],{},false,{...d,version:2},{...d,ref:null},{...d,ref:{...d.ref,kind:'single'}},{...d,base:null},{...d,base:[]},{...d,initial:null},{...d,notes:{}},{...d,project:3},{...d,minutes:true}])assert.equal(W.validTaskEditDraft(value,'board'),false);
});
test('task edit dirty state compares every editable field and clears when changes are reverted',()=>{
  const d=taskEdit();assert.equal(W.taskEditChanged(d),false);for(const key of Object.keys(W.taskEditValues(d))){const next={...d,[key]:'A different value'};assert.equal(W.taskEditChanged(next),true,key);assert.equal(W.taskEditChanged({...next,[key]:d[key]}),false,key);}
});
test('invalid imported dates remain preserved for explicit repair rather than failing safe draft recovery',()=>{
  for(const followUp of ['2026-02-30',{legacy:'Do not remove'},false,0]){const d=taskEdit();d.followUp=followUp;d.initial.followUp=followUp;assert(W.validTaskEditDraft(d,'board'));assert.equal(W.taskEditChanged(d),false);}
});
test('task edit projection is read-only and excludes source snapshots and unknown metadata from editable fields',()=>{
  const d=taskEdit(),before=JSON.stringify(d);Object.freeze(d);Object.freeze(d.initial);Object.freeze(d.base);const values=W.taskEditValues(d);assert.equal(Object.hasOwn(values,'base'),false);assert.equal(Object.hasOwn(values,'custom'),false);assert.equal(Object.hasOwn(values,'initial'),false);assert(W.validTaskEditDraft(d,'board'));assert.equal(W.taskEditChanged(d),false);assert.equal(JSON.stringify(d),before);
});
test('capture date choices use explicit local calendar days and return independent choices',()=>{
  const expected=[['Today','2026-11-01'],['Tomorrow','2026-11-02'],['In 7 days','2026-11-08']];
  const result=W.captureDateChoices('2026-11-01');assert.deepEqual(result,expected);result[0][1]='Changed';result.push(['Other','']);assert.deepEqual(W.captureDateChoices('2026-11-01'),expected);
});
test('capture date choices cross month year and leap-day boundaries without guessed week starts',()=>{
  assert.deepEqual(W.captureDateChoices('2028-02-28'),[['Today','2028-02-28'],['Tomorrow','2028-02-29'],['In 7 days','2028-03-06']]);
  assert.deepEqual(W.captureDateChoices('2026-12-31'),[['Today','2026-12-31'],['Tomorrow','2027-01-01'],['In 7 days','2027-01-07']]);
});
test('invalid capture anchors are refused and dates outside the supported range are not offered',()=>{
  for(const day of ['',null,undefined,'2026-02-30','2026-13-01','2026-11-01T12:00:00Z',{}])assert.throws(()=>W.captureDateChoices(day),/valid local day/);
  assert.deepEqual(W.captureDateChoices('9999-12-31'),[['Today','9999-12-31']]);
});
test('capture date presets follow calendar days through daylight-saving transitions',()=>{
  const {execFileSync}=require('node:child_process');
  const script='require('+JSON.stringify(require.resolve('../planner-store.js'))+');const w=require('+JSON.stringify(require.resolve('../planning.js'))+');console.log(JSON.stringify([w.captureDateChoices("2026-03-07"),w.captureDateChoices("2026-10-31")]));';
  const rows=JSON.parse(execFileSync(process.execPath,['-e',script],{encoding:'utf8',env:{...process.env,TZ:'America/New_York'}}));
  assert.deepEqual(rows[0],[['Today','2026-03-07'],['Tomorrow','2026-03-08'],['In 7 days','2026-03-14']]);assert.deepEqual(rows[1],[['Today','2026-10-31'],['Tomorrow','2026-11-01'],['In 7 days','2026-11-07']]);
});
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
test('one-day end dates follow valid start changes through cleared input without mutating the original draft',()=>{
  const next=W.changeActivityStart(draft,'2028-02-29');assert.equal(next.endDate,'2028-02-29');assert.equal(draft.endDate,'2026-09-10');
  const cleared=W.changeActivityStart(next,'');assert.equal(cleared.endDate,'2028-02-29');assert.equal(cleared.endDateFollowsStart,true);
  const resumed=W.changeActivityStart(cleared,'2029-01-02');assert.equal(resumed.endDate,'2029-01-02');assert.equal(resumed.startTime,draft.startTime);assert.equal(resumed.notes,draft.notes);
  assert.equal(W.changeActivityStart(next,'2028-02-30').endDate,'2028-02-29');
  assert.equal(W.changeActivityStart({...draft,endDate:''},'2027-12-31').endDate,'2027-12-31');
});
test('explicit multi-day ends stay independent and draft date-link state is not stored in an activity',()=>{
  const next=W.changeActivityStart({...draft,endDate:'2026-09-15'},'2026-09-11');assert.equal(next.endDate,'2026-09-15');assert.equal(next.endDateFollowsStart,false);
  const later=W.changeActivityStart(next,'2026-09-17');assert.equal(later.endDate,'2026-09-15');assert.throws(()=>W.activityFromDraft(later),/after/);
  const activity=W.activityFromDraft(W.changeActivityStart({...draft,allDay:true},'2027-01-01'));assert.equal(activity.endDate,'2027-01-01');assert.equal(Object.hasOwn(activity,'endDateFollowsStart'),false);
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
