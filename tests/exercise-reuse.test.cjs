const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../exercise-reuse.js'),M=require('../state-merge.js');
const exercise=(id,name)=>({id,name,sets:3,reps:'10-12',weightKg:25.75,rpe:8,notes:'A private note from that workout'});
const fixture=()=>({id:'health',cards:[{id:'fitness',type:'fitness',fitnessEntries:{
  '2026-10-14':{parts:{chest:{active:true,notes:'Original chest note',exercises:[exercise('old-bench','Bench press'),exercise('old-fly','Cable fly')]}},metrics:{weightKg:72.35},notes:'My older thoughts',updatedAt:1},
  '2026-10-16':{parts:{chest:{active:true,exercises:[exercise('current','Bench press')],notes:'Today\'s own notes'},running:{active:true,distanceKm:4,durationMinutes:30}},metrics:{weightKg:71.25},notes:'Today is independent',updatedAt:2}
},fitnessMetricsOpen:false}]});
const command=b=>R.create(b,'fitness','chest','2026-10-14','2026-10-16');
test('preview is read-only; already listed names start unchecked and every new measurement stays blank',()=>{
  const board=fixture(),before=structuredClone(board),c=command(board);assert.deepEqual(board,before);assert.deepEqual(c.selectedIds,['old-fly']);
  for(const row of c.exercises){assert.equal(row.sets,'');assert.equal(row.reps,'');assert.equal(row.weightKg,'');assert.equal(row.rpe,'');assert.equal(row.notes,'');assert(!['old-bench','old-fly'].includes(row.id));}
});
test('apply adds only selected names; old entries, body metrics, other parts, notes and existing exercises remain intact',()=>{
  const board=fixture(),before=structuredClone(board),c=command(board),tx=R.apply(board,c,{now:123});
  const expected=structuredClone(before);expected.cards[0].fitnessEntries['2026-10-16'].parts.chest.exercises.push(c.exercises[1]);expected.cards[0].fitnessEntries['2026-10-16'].updatedAt=123;
  assert.deepEqual(board,expected);R.restore(board,tx);assert.deepEqual(board,before);
});
test('names only are copied even if an already listed name is explicitly selected',()=>{
  const b=fixture(),c=command(b);c.selectedIds=['old-bench'];R.apply(b,c);const rows=b.cards[0].fitnessEntries['2026-10-16'].parts.chest.exercises;
  assert.equal(rows.length,2);assert.equal(rows[1].name,'Bench press');assert.notEqual(rows[0].id,rows[1].id);assert.equal(rows[0].sets,3);assert.equal(rows[1].sets,'');
});
test('same command cannot be applied twice, and refused saves can roll back and retry without new IDs',()=>{
  const b=fixture(),before=structuredClone(b),c=command(b),tx=R.apply(b,c,{now:123});assert.throws(()=>R.apply(b,c),/changed/);R.restore(b,tx);assert.deepEqual(b,before);R.apply(b,c,{now:123});assert.deepEqual(b.cards[0].fitnessEntries['2026-10-16'],tx.after);
});
test('board, card, archive, source and destination changes are refused before mutation',()=>{
  for(const mutate of [b=>b.id='other',b=>b.cards[0].id='moved',b=>b.cards[0].archivedAt=1,b=>b.cards.push(structuredClone(b.cards[0])),b=>b.cards[0].fitnessEntries['2026-10-14'].parts.chest.exercises[1].name='A newer name',b=>b.cards[0].fitnessEntries['2026-10-16'].metrics.weightKg=70]){
    const b=fixture(),c=command(b);mutate(b);const before=structuredClone(b);assert.throws(()=>R.apply(b,c));assert.deepEqual(b,before);
  }
  const b=fixture(),c=command(b),before=structuredClone(b);assert.throws(()=>R.apply(b,c,{conflicts:[{segments:['boards','health','cards','fitness','fitnessEntries']}]}),/conflicting/);assert.deepEqual(b,before);
});
test('malformed names, ambiguous identities, invalid dates and inactive or non-strength sections are not guessed',()=>{
  for(const mutate of [b=>b.cards[0].fitnessEntries['2026-10-14'].parts.chest.exercises[0].name='',b=>b.cards[0].fitnessEntries['2026-10-14'].parts.chest.exercises[1].id='old-bench',b=>b.cards[0].fitnessEntries['2026-10-16'].parts.chest.active=false]){
    const b=fixture();mutate(b);const before=structuredClone(b);assert.throws(()=>command(b));assert.deepEqual(b,before);
  }
  for(const args of [['running','2026-10-14','2026-10-16'],['chest','2026-10-16','2026-10-16'],['chest','2026-02-31','2026-10-16']])assert.throws(()=>R.create(fixture(),'fitness',...args));
});
test('empty selections, modified performance values, repeated selections and ID collisions cannot write',()=>{
  for(const mutate of [c=>c.selectedIds=[],c=>c.selectedIds=['wrong'],c=>c.selectedIds=['old-fly','old-fly'],c=>c.exercises[1].sets=3,c=>c.exercises[1].weightKg=25.75,c=>c.exercises[1].id='current',c=>c.exercises[1].id=c.exercises[0].id]){
    const b=fixture(),c=command(b);mutate(c);const before=structuredClone(b);assert.throws(()=>R.apply(b,c));assert.deepEqual(b,before);
  }
});
test('Undo refuses later day edits and can restore its inverse after a failed Undo save',()=>{
  const b=fixture(),c=command(b),tx=R.apply(b,c),inverse=R.restore(b,tx);R.restore(b,inverse);assert.deepEqual(b.cards[0].fitnessEntries['2026-10-16'],tx.after);
  b.cards[0].fitnessEntries['2026-10-16'].parts.chest.exercises[0].reps='15';const before=structuredClone(b);assert.throws(()=>R.restore(b,tx),/changed again/);assert.deepEqual(b,before);
});
test('independent simultaneous additions retain separate identities without copying old performance',()=>{
  const base={boards:[fixture()]},left=structuredClone(base),right=structuredClone(base);R.apply(left.boards[0],command(left.boards[0]));R.apply(right.boards[0],command(right.boards[0]));
  const merged=M.merge(base,left,right);assert.deepEqual(merged.conflicts,[]);const rows=merged.boards[0].cards[0].fitnessEntries['2026-10-16'].parts.chest.exercises;assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.id)).size,3);assert(rows.slice(1).every(r=>r.sets==='' && r.weightKg===''));
});
