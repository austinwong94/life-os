const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../momentum.js');
const base={start:'2026-10-12',today:'2026-10-16'};
test('momentum validates dates, crosses month/year boundaries, and handles leap days',()=>{
  assert.equal(M.valid('2026-02-30'),false);assert.equal(M.shift('2026-12-31',1),'2027-01-01');assert.equal(M.shift('2028-02-28',1),'2028-02-29');
  assert.throws(()=>M.summarize({...base,start:'bad'}));
});
test('missing focus choices are unreported, not an invented zero performance percentage',()=>{
  const r=M.summarize(base);assert.equal(r.percent,null);assert.equal(r.total,0);assert.equal(r.plannedDays,0);assert.equal(r.days.length,7);assert.equal(r.days[5].future,true);
});
test('only the selected period and recorded dates count, duplicate projections are not double counted',()=>{
  const r=M.summarize({...base,completions:[{reportKey:'a',completedOn:'2026-10-12',area:'Personal'},{reportKey:'a',completedOn:'2026-10-12'},
    {reportKey:'b',completedOn:'2026-10-16',card:{category:'Culturely'}},{reportKey:'past',completedOn:'2026-10-11'},{reportKey:'future',completedOn:'2026-10-17'},{reportKey:'x',completedOn:'bad'}]});
  assert.equal(r.total,2);assert.deepEqual(r.areas,[{name:'Culturely',count:1},{name:'Personal',count:1}]);assert.equal(r.days[0].count,1);assert.equal(r.days[4].count,1);assert.equal(r.days[5].count,0);
});
test('original choices form the denominator; empty plans and future dates do not inflate follow-through',()=>{
  const r=M.summarize({...base,plans:[{date:'2026-10-12',total:3,done:1},{date:'2026-10-13',total:0,done:0},{date:'2026-10-14',total:1,done:1},{date:'2026-10-17',total:2,done:2}]});
  assert.equal(r.chosen,4);assert.equal(r.followed,2);assert.equal(r.percent,50);assert.equal(r.plannedDays,2);
});
test('writing coverage counts distinct days, includes archived writing, excludes quotes and future dates',()=>{
  const r=M.summarize({...base,writing:[{type:'diary',dateKey:'2026-10-12',body:'Original writing',archived:true},{type:'sidenote',dateKey:'2026-10-12',body:'A note'},
    {type:'diary',dateKey:'2026-10-14',sentence:'A thought'},{type:'quote',dateKey:'2026-10-15',body:'A quote'},{type:'diary',dateKey:'2026-10-17',body:'Future text'},
    {type:'diary',dateKey:'2026-10-16',feeling:'calm',body:'  '}]});assert.equal(r.writingDays,2);
});
test('summary is a read-only projection over immutable source records',()=>{
  const source={...base,completions:[{reportKey:'a',title:'Original title',completedOn:'2026-10-12',area:'Personal'}],plans:[{date:'2026-10-12',total:1,done:1}],writing:[]},before=JSON.stringify(source);
  Object.freeze(source.completions[0]);Object.freeze(source.plans[0]);M.summarize(source);assert.equal(JSON.stringify(source),before);
});
test('malformed old area values and invalid plan counts cannot crash or create negative performance',()=>{
  const r=M.summarize({...base,completions:[{reportKey:'a',completedOn:base.today,area:{old:'value'},group:'Personal'}],plans:[{date:base.today,total:-1,done:2}]});
  assert.equal(r.percent,null);assert.equal(r.followed,0);assert.deepEqual(r.areas,[{name:'Personal',count:1}]);
});
test('suggestions prefer explicitly planned work, then deadlines and marked importance',()=>{
  const rows=[{key:'undated'},{key:'past',dateKey:'2026-10-01'},{key:'important',priority:'high'},{key:'due',deadline:base.today},{key:'today',dateKey:base.today}];
  assert.deepEqual(M.suggest(rows,{today:base.today}).map(row=>row.key),['today','due','important']);
  assert.equal(M.suggest(rows,{today:base.today})[0].reason,'Planned for today');
});
test('suggestions exclude future, waiting, parked, completed, ambiguous and conflicted tasks',()=>{
  const rows=[{key:'future',dateKey:'2026-10-17',priority:'high'},{key:'done',done:true},{key:'waiting',status:'waiting'},{key:'parked',status:'parked'},
    {key:'duplicate'},{key:'duplicate'},{key:'blocked',blocked:true},{key:'unsafe',editable:false},{key:'invalid',dateKey:'2026-02-30'},{key:'usable'}];
  assert.deepEqual(M.suggest(rows,{today:base.today}).map(row=>row.key),['usable']);
});
test('suggestions keep separate same-title identities, honor the chosen set, and never mutate records',()=>{
  const rows=[{key:'a',title:'Same title'},{key:'b',title:'Same title'},{key:'c'},{key:'d'}],before=JSON.stringify(rows);
  assert.deepEqual(M.suggest(rows,{today:base.today,selected:['a'],limit:1}).map(row=>row.key),['b']);assert.equal(JSON.stringify(rows),before);
  assert.equal(M.suggest(rows,{today:base.today,limit:10}).length,3);assert.equal(M.suggest(rows,{today:base.today,limit:-1}).length,0);
});
test('suggestions explain existing in-progress and goal links without inventing task dates or urgency',()=>{
  const rows=[{key:'normal'},{key:'goal',coachingProgramId:'goal-a'},{key:'doing',status:'doing'}];
  assert.deepEqual(M.suggest(rows,{today:base.today}).map(row=>[row.key,row.reason]),[['doing','Already in progress'],['goal','Linked to your priorities'],['normal','Undated task']]);
  assert.throws(()=>M.suggest(rows,{today:'bad'}));
  assert.deepEqual(M.suggest([{key:'bad-deadline',deadline:{original:'legacy'}},{key:'good-deadline',deadline:'2026-11-01'}],{today:base.today}).map(row=>row.key),['good-deadline','bad-deadline']);
});
